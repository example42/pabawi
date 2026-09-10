import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { once } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService, type User } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { createAuthMiddleware } from '../../src/middleware/authMiddleware';
import { createRbacMiddleware } from '../../src/middleware/rbacMiddleware';
import { createMcpAuthMiddleware } from '../../src/middleware/mcpAuthMiddleware';
import { createUsersRouter } from '../../src/routes/users';
import { createAuthRouter } from '../../src/routes/auth';
import { StreamingExecutionManager } from '../../src/services/StreamingExecutionManager';
import { ConsoleSessionManager } from '../../src/services/ConsoleSessionManager';
import { ConsoleWebSocketProxy } from '../../src/services/ConsoleWebSocketProxy';
import { ConsoleConfigSchema } from '../../src/config/schema';
import { LoggerService } from '../../src/services/LoggerService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { EntraIdService } from '../../src/services/EntraIdService';
import { RoleService } from '../../src/services/RoleService';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const secret = 'session-revocation-test-secret-32-chars'; // pragma: allowlist secret
let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('A05: token purpose and durable revocation', () => {
  let database: DatabaseService;
  let auth: AuthenticationService;
  let users: UserService;
  let user: User;
  let access: string;
  let refresh: string;
  let adminAccess: string;
  let app: express.Express;
  let streaming: StreamingExecutionManager;

  beforeEach(async () => {
    process.env.JWT_SECRET = secret;
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    auth = new AuthenticationService(db, secret);
    users = new UserService(db, auth);
    await db.execute("UPDATE config SET value = '' WHERE key = 'default_new_user_role'");
    user = await users.createUser({ username: 'alice', email: 'alice@example.test', password: 'Password123!', firstName: 'Alice', lastName: 'Test' });
    await users.assignRoleToUser(user.id, 'role-viewer-001');
    const admin = await users.createUser({ username: 'admin', email: 'admin@example.test', password: 'Password123!', firstName: 'Admin', lastName: 'Test', isAdmin: true });
    access = await auth.generateToken(user);
    refresh = await auth.generateRefreshToken(user);
    adminAccess = await auth.generateToken(admin);
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(database));
    app.use('/api/auth', createAuthRouter(database));
    const authenticate = createAuthMiddleware(db, secret);
    const authorize = createRbacMiddleware(db);
    app.get('/read', authenticate, authorize('executions', 'read'), (_req, res) => { res.json({ ok: true }); });
    app.get('/mcp-auth', createMcpAuthMiddleware(undefined, 'machine', authenticate, db), (_req, res) => { res.json({ ok: true }); });
    app.get('/mcp-static', createMcpAuthMiddleware('machine-test-credential', user.id, authenticate, db), (_req, res) => { res.json({ ok: true }); });
    streaming = new StreamingExecutionManager();
    app.get('/events', authenticate, authorize('executions', 'read'), (_req, res) => { streaming.subscribe('execution', res); });
  });

  afterEach(async () => { streaming.cleanup(); await database.close(); });

  it('accepts refresh only at exchange, rejecting REST, SSE and MCP JWT authentication', async () => {
    for (const path of ['/read', '/events', '/mcp-auth']) {
      await request(harness.use(app)).get(path).set('Authorization', `Bearer ${refresh}`).expect(401);
    }
    const exchanged = await auth.refreshToken(refresh);
    expect(exchanged.success).toBe(true);
    await expect(auth.verifyToken(exchanged.token!)).resolves.toMatchObject({ userId: user.id, type: 'access' });
  });

  it('checks the static MCP account on each authentication', async () => {
    await request(harness.use(app)).get('/mcp-static').set('Authorization', 'Bearer machine-test-credential').expect(200);
    await users.deactivateUser(user.id);
    await request(harness.use(app)).get('/mcp-static').set('Authorization', 'Bearer machine-test-credential').expect(401);
  });

  it('cannot issue a fresh refresh token after revocation between pair issuance steps', async () => {
    const generateAccess = auth.generateToken.bind(auth);
    vi.spyOn(auth, 'generateToken').mockImplementationOnce(async (...args) => {
      const token = await generateAccess(...args);
      await auth.revokeAllUserTokens(user.id);
      return token;
    });
    await expect(auth.generateTokenPair(user)).rejects.toThrow('revoked');
  });

  it.each([
    { type: undefined }, { type: 'refresh' }, { userId: undefined }, { userId: 3 },
    { username: undefined }, { roles: undefined }, { roles: [3] }, { exp: undefined },
    { iat: undefined }, { jti: undefined }, { sessionVersion: undefined }, { sessionVersion: -1 },
  ])('rejects signed malformed access claims: %j', async (changes) => {
    const payload = { ...jwt.decode(access) as jwt.JwtPayload, ...changes };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    const token = jwt.sign(payload, secret, { algorithm: 'HS256', noTimestamp: changes.iat === undefined && 'iat' in changes });
    await expect(auth.verifyToken(token)).rejects.toThrow();
  });

  it('revokes warmed grants through the administrative role-removal route', async () => {
    await request(harness.use(app)).get('/read').set('Authorization', `Bearer ${access}`).expect(200);
    const independent = new PermissionService(database.getAdapter());
    expect(await independent.hasPermission(user.id, 'executions', 'read')).toBe(true);
    await request(harness.use(app)).delete(`/api/users/${user.id}/roles/role-viewer-001`).set('Authorization', `Bearer ${adminAccess}`).expect(204);
    await request(harness.use(app)).get('/read').set('Authorization', `Bearer ${access}`).expect(403);
    expect(await independent.checkMultiplePermissions(user.id, [{ resource: 'executions', action: 'read' }])).toEqual([{ resource: 'executions', action: 'read', allowed: false }]);
    expect((await auth.verifyToken(access)).roles).toEqual([]);
  });

  it.each([{ password: 'NewPassword456!' }, { isActive: false }])('invalidates access and refresh after administrative update %j', async (change) => {
    await request(harness.use(app)).get('/read').set('Authorization', `Bearer ${access}`).expect(200);
    await request(harness.use(app)).put(`/api/users/${user.id}`).set('Authorization', `Bearer ${adminAccess}`).send(change).expect(200);
    await request(harness.use(app)).get('/read').set('Authorization', `Bearer ${access}`).expect(401);
    expect((await auth.refreshToken(refresh)).success).toBe(false);
    await users.activateUser(user.id);
    await expect(auth.verifyToken(access)).rejects.toThrow();
    const login = await auth.authenticate('alice', change.password ?? 'Password123!');
    expect(login.success).toBe(true);
    await expect(auth.verifyToken(login.token!)).resolves.toMatchObject({ userId: user.id });
  });

  it('soft deletion invalidates tokens, including after reactivation', async () => {
    await users.deleteUser(user.id);
    await users.activateUser(user.id);
    await expect(auth.verifyToken(access)).rejects.toThrow('revoked');
    expect((await auth.refreshToken(refresh)).success).toBe(false);
  });

  it('revokes immediately while allowing a fresh login in the same second', async () => {
    await auth.revokeAllUserTokens(user.id);
    await expect(auth.verifyToken(access)).rejects.toThrow('revoked');
    const login = await auth.authenticate('alice', 'Password123!');
    expect(login.success).toBe(true);
    await expect(auth.verifyToken(login.token!)).resolves.toMatchObject({ userId: user.id });
  });

  it('rolls back account and permission revisions with their transaction', async () => {
    const db = database.getAdapter();
    const permissions = new PermissionService(db);
    expect(await permissions.hasPermission(user.id, 'executions', 'read')).toBe(true);
    await expect(db.withTransaction(async () => {
      await db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);
      await db.execute('DELETE FROM user_roles WHERE user_id = ?', [user.id]);
      throw new Error('rollback fixture');
    })).rejects.toThrow('rollback fixture');
    expect(await permissions.hasPermission(user.id, 'executions', 'read')).toBe(true);
    await expect(auth.verifyToken(access)).resolves.toMatchObject({ userId: user.id });
  });

  it('SSO rejects inactive identities and authorization codes containing revoked tokens', async () => {
    const db = database.getAdapter();
    const entra = new EntraIdService(db, { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: 'fixture', redirectUri: 'http://localhost/callback', scopes: ['openid'], groupMapping: null, jwksCacheTtlMs: 60000 }, auth, users, new RoleService(db), new AuditLoggingService(db), new LoggerService());
    await users.linkFederatedIdentity(user.id, 'entra-id', 'subject', 'https://issuer.test', user.email);
    await db.execute("INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, created_at, expires_at) VALUES ('fixture', ?, ?, ?, ?, ?)", [access, refresh, user.id, new Date().toISOString(), new Date(Date.now() + 60000).toISOString()]);
    await users.deactivateUser(user.id);
    await expect(entra.provisionUser({ sub: 'subject', iss: 'https://issuer.test', email: user.email } as Parameters<typeof entra.provisionUser>[0])).rejects.toThrow('inactive');
    await expect(entra.exchangeAuthCode('fixture')).rejects.toThrow('Authorization code invalid');
  });

  it('closes an established SSE subscription and suppresses output after revocation', async () => {
    harness.use(app);
    const response = await fetch(`http://127.0.0.1:${harness.port}/events`, { headers: { Authorization: `Bearer ${access}` } });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('Connected');
    await users.removeRoleFromUser(user.id, 'role-viewer-001');
    streaming.emit('execution', { type: 'stdout', data: { chunk: 'revoked-output-canary' } });
    expect((await reader.read()).done).toBe(true);
    await vi.waitFor(() => { expect(streaming.getSubscriberCount('execution')).toBe(0); });
  });

  it('closes both ends of a live console after account revocation', async () => {
    await users.updateUser(user.id, { isAdmin: true });
    const config = ConsoleConfigSchema.parse({});
    const manager = new ConsoleSessionManager(database.getAdapter(), config, new LoggerService(), new AuditLoggingService(database.getAdapter()));
    const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(upstream, 'listening');
    const upstreamAddress = upstream.address();
    if (typeof upstreamAddress === 'string') throw new Error('Unexpected socket address');
    const local = await createHttpHarness();
    const server = local.use(express());
    new ConsoleWebSocketProxy(server, manager, { allowedOrigins: ['http://localhost'], console: config }, new LoggerService());
    const token = manager.generateToken();
    await manager.createSession({ sessionId: 'console-fixture', userId: user.id, nodeId: 'node', provider: 'proxmox', transport: 'websocket-vnc', state: 'active', token, wsUrl: '', startedAt: new Date().toISOString() });
    await database.getAdapter().execute('UPDATE console_sessions SET upstream_url = ? WHERE id = ?', [`ws://127.0.0.1:${upstreamAddress.port}`, 'console-fixture']);
    const connected = once(upstream, 'connection');
    const client = new WebSocket(`ws://127.0.0.1:${local.port}/ws/console/vnc?token=${token}`, { origin: 'http://localhost' });
    try {
      await once(client, 'open');
      const [peer] = await connected as [WebSocket];
      const clientClosed = once(client, 'close');
      const peerClosed = once(peer, 'close');
      await users.deactivateUser(user.id);
      await Promise.all([clientClosed, peerClosed]);
      await expect(manager.validateTokenForUpgrade(token)).resolves.toBeNull();
    } finally {
      client.terminate();
      for (const peer of upstream.clients) peer.terminate();
      await new Promise<void>((resolve) => { upstream.close(() => { resolve(); }); });
      await local.close();
    }
  });
});
