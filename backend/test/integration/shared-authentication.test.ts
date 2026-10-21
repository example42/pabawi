import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { DIContainer, createDefaultContainer, resolveAuthenticationService } from '../../src/container/DIContainer';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { ConsoleConfigSchema } from '../../src/config/schema';
import { ConsoleSessionManager } from '../../src/services/ConsoleSessionManager';
import { createAuthMiddleware } from '../../src/middleware/authMiddleware';
import { createMcpAuthMiddleware } from '../../src/middleware/mcpAuthMiddleware';
import { createAuthRouter } from '../../src/routes/auth';
import { createUsersRouter } from '../../src/routes/users';
import { createGroupsRouter } from '../../src/routes/groups';
import { createRolesRouter } from '../../src/routes/roles';
import { createPermissionsRouter } from '../../src/routes/permissions';
import { createJournalRouter } from '../../src/routes/journal';
import { createConsoleRouter } from '../../src/routes/console';
import { createLdapAdministrationRouter } from '../../src/routes/ldapAdministration';
import { createEntraIdAuthRouter } from '../../src/routes/entraIdAuth';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('configured authentication dependency boundary', () => {
  let database: DatabaseService;
  let container: DIContainer;
  let auth: AuthenticationService;
  let token: string;
  let app: express.Express;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'shared-authentication-fixture-secret-key');
    vi.stubEnv('LDAP_ENABLED', 'false');
    vi.stubEnv('ENTRA_ID_ENABLED', 'false');
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    container = createDefaultContainer();
    auth = resolveAuthenticationService(db, container);
    expect(resolveAuthenticationService(db, container)).toBe(auth);
    const user = await new UserService(db, auth).createUser({ username: 'admin', email: 'admin@example.test',
      password: 'SharedAuthTest123!', firstName: '', lastName: '', isAdmin: true }); // pragma: allowlist secret
    token = await auth.generateToken(user, { provider: 'local', identityId: null });
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(database, container));
    app.use('/api/users', createUsersRouter(database, container));
    app.use('/api/groups', createGroupsRouter(database, container));
    app.use('/api/roles', createRolesRouter(database, container));
    app.use('/api/permissions', createPermissionsRouter(database, container));
    app.use('/api/journal', createJournalRouter(database, {}, container));
    app.use('/api/auth/ldap', createLdapAdministrationRouter(database, container));
    app.use('/api/auth/entra-id', createEntraIdAuthRouter(database, container));
    const logger = new LoggerService();
    const manager = new ConsoleSessionManager(db, ConsoleConfigSchema.parse({}), logger, new AuditLoggingService(db), auth);
    app.use('/api/console', createConsoleRouter(container, new IntegrationManager({ logger }), manager, db));
    const middleware = createAuthMiddleware(auth);
    app.get('/mcp-auth', createMcpAuthMiddleware(undefined, 'machine', middleware, db), (_req, res) => { res.json({ ok: true }); });
  });

  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await database.close(); });

  it('all JWT route guards and MCP use the configured eligibility service', async () => {
    await request(harness.use(app)).get('/api/auth/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    const eligible = vi.spyOn(auth, 'assertSessionEligible').mockRejectedValue(new Error('Invalid token'));
    const paths = ['/api/auth/permissions', '/api/users', '/api/groups', '/api/roles', '/api/permissions',
      '/api/journal/search', '/api/console/sessions/anything', '/api/auth/ldap/mappings', '/mcp-auth'];
    for (const path of paths) {
      await request(harness.use(app)).get(path).set('Authorization', `Bearer ${token}`).expect(401);
    }
    await request(harness.use(app)).post('/api/auth/entra-id/enroll').set('Authorization', `Bearer ${token}`).send({}).expect(401);
    expect(eligible).toHaveBeenCalledTimes(paths.length + 1);
  });

  it('passes verified context and captures the same service for stream revalidation', async () => {
    let revalidate: (() => Promise<void>) | undefined;
    app.get('/stream-boundary', createAuthMiddleware(auth), (req, res) => {
      revalidate = req.revalidateAuth;
      res.json({ context: req.authContext });
    });
    const response = await request(harness.use(app)).get('/stream-boundary').set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body.context).toEqual({ provider: 'local', identityId: null });
    const eligible = vi.spyOn(auth, 'assertSessionEligible').mockRejectedValue(new Error('Invalid token'));
    expect(revalidate).toBeDefined();
    await expect(revalidate!()).rejects.toThrow('Invalid token');
    expect(eligible).toHaveBeenCalledOnce();
  });

  it('login and refresh reach the same configured issuance and eligibility boundary', async () => {
    const issued = vi.spyOn(auth, 'generateTokenPair');
    const login = await request(harness.use(app)).post('/api/auth/login').send({ username: 'admin', password: 'SharedAuthTest123!' }).expect(200); // pragma: allowlist secret
    expect(issued).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin' }), { provider: 'local', identityId: null }, expect.any(String));
    const eligible = vi.spyOn(auth, 'assertSessionEligible').mockRejectedValue(new Error('Invalid token'));
    await request(harness.use(app)).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
    expect(eligible).toHaveBeenCalledOnce();
    expect(issued).toHaveBeenCalledOnce();
  });
});
