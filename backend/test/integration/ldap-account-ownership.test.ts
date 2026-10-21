import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { UserService, type User } from '../../src/services/UserService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { createAuthRouter } from '../../src/routes/auth';
import { createUsersRouter } from '../../src/routes/users';
import { DIContainer } from '../../src/container/DIContainer';
import { ConfigService } from '../../src/config/ConfigService';
import { LoggerService } from '../../src/services/LoggerService';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const fixtureSecret = 'ldap-ownership-test-jwt-secret-for-fixtures'; // pragma: allowlist secret
const fixturePassword = 'ValidPass123!'; // pragma: allowlist secret
let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('LDAP account ownership at HTTP boundaries', () => {
  let database: DatabaseService;
  let users: UserService;
  let auth: AuthenticationService;
  let app: express.Express;
  let ldapUser: User;
  let adminToken: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', fixtureSecret);
    database = new DatabaseService(':memory:');
    await database.initialize();
    auth = new AuthenticationService(database.getAdapter(), fixtureSecret, undefined, 4);
    users = new UserService(database.getAdapter(), auth);
    const container = new DIContainer();
    container.register('logger', new LoggerService());
    container.register('config', new ConfigService());
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(database, container));
    app.use('/api/users', createUsersRouter(database, container));
    const admin = await users.createUser({ username: 'admin', email: 'admin@example.test',
      password: fixturePassword, firstName: 'Admin', lastName: 'User', isAdmin: true });
    adminToken = await auth.generateToken(admin, { provider: 'local', identityId: null });
    ldapUser = await users.createFederatedUser({ provider: 'ldap', issuer: 'directory', subject: 'subject',
      loginName: 'alice', dn: 'uid=alice,dc=example', email: 'alice@example.test', displayName: 'Alice',
      firstName: 'Alice', lastName: 'User', defaultRole: 'none' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await database.close();
  });

  it('rejects administrator profile and password writes atomically', async () => {
    for (const body of [{ email: 'other@example.test' }, { firstName: 'Changed' },
      { lastName: 'Changed' }, { password: fixturePassword, isActive: false }]) {
      const result = await request(harness.use(app)).put(`/api/users/${ldapUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`).send(body).expect(403);
      expect(result.body.error.code).toBe('DIRECTORY_ACCOUNT_READ_ONLY');
    }
    expect(await users.getUserById(ldapUser.id)).toMatchObject({ email: ldapUser.email, isActive: 1, passwordHash: null });
  });

  it('allows administrative suspension, manual role assignment and admin status changes', async () => {
    await request(harness.use(app)).post(`/api/users/${ldapUser.id}/roles/role-viewer-001`)
      .set('Authorization', `Bearer ${adminToken}`).expect(204);
    await request(harness.use(app)).put(`/api/users/${ldapUser.id}/admin-status`)
      .set('Authorization', `Bearer ${adminToken}`).send({ isAdmin: true }).expect(200);
    await request(harness.use(app)).put(`/api/users/${ldapUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ isActive: false }).expect(200);
    expect(await users.getUserById(ldapUser.id)).toMatchObject({ isActive: 0, isAdmin: 1 });
    expect(await users.getUserRoles(ldapUser.id)).toHaveLength(1);
  });

  it('rejects authenticated password changes before password verification or lockout accounting', async () => {
    const verify = vi.spyOn(AuthenticationService.prototype, 'verifyPassword');
    // Exercise the server-side ownership guard for a legacy mixed account.
    await database.getAdapter().execute('UPDATE users SET local_auth_enabled = 1, password_hash = ? WHERE id = ?',
      [await auth.hashPassword(fixturePassword), ldapUser.id]);
    const token = await auth.generateToken(ldapUser, { provider: 'local', identityId: null });
    const response = await request(harness.use(app)).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`).send({ currentPassword: fixturePassword, newPassword: fixturePassword }).expect(403);
    expect(response.body.error.code).toBe('DIRECTORY_ACCOUNT_READ_ONLY');
    expect(verify).not.toHaveBeenCalled();
    expect(await database.getAdapter().query('SELECT * FROM login_attempt_counters')).toEqual([]);
  });

  it('exposes source and profile ownership only through protected administration DTOs', async () => {
    const detail = await request(harness.use(app)).get('/api/users/' + ldapUser.id)
      .set('Authorization', 'Bearer ' + adminToken).expect(200);
    expect(detail.body.authentication).toEqual({ profileReadOnly: true, sources: [
      { provider: 'ldap', name: 'LDAP', directoryId: 'directory', loginName: 'alice' },
    ] });
    expect(detail.body.roleSources).toEqual([]);
    expect(detail.body).not.toHaveProperty('passwordHash');
    expect(detail.body.authentication.sources[0]).not.toHaveProperty('dn');
    const list = await request(harness.use(app)).get('/api/users')
      .set('Authorization', 'Bearer ' + adminToken).expect(200);
    expect(list.body.users.find((user: { id: string }) => user.id === ldapUser.id).authentication)
      .toEqual(detail.body.authentication);
    await request(harness.use(app)).get('/api/users/' + ldapUser.id).expect(401);
    const local = list.body.users.find((user: { id: string }) => user.id !== ldapUser.id);
    expect(local.authentication).toEqual({ profileReadOnly: false, sources: [{ provider: 'local', name: 'Local' }] });
  });

  it('does not advertise LDAP or expose an authentication endpoint', async () => {
    const response = await request(harness.use(app)).get('/api/auth/providers').expect(200);
    expect(response.body).toEqual({ local: true });
    await request(harness.use(app)).post('/api/auth/ldap/login').send({ username: 'alice', password: fixturePassword }).expect(404);
  });
});
