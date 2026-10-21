import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../src/database/DatabaseService';
import { UserService } from '../../src/services/UserService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { createAuthRouter } from '../../src/routes/auth';
import { createLdapAdministrationRouter } from '../../src/routes/ldapAdministration';
import { DIContainer } from '../../src/container/DIContainer';
import { ConfigService } from '../../src/config/ConfigService';
import { parseLdapConfig } from '../../src/config/ldap';
import { LoggerService } from '../../src/services/LoggerService';
import { LdapDirectoryService, LdapDirectoryError } from '../../src/services/LdapDirectoryService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const fixtureSecret = 'ldap-administration-fixture-jwt-secret-for-tests'; // pragma: allowlist secret
const fixturePassword = 'ValidPass123!'; // pragma: allowlist secret
const groupSubject = '10112233-4455-6677-8899-aabbccddeeff';
const group = { subject: groupSubject, dn: 'cn=operators,ou=groups,dc=example,dc=test', name: 'Operators' };
const roleId = 'role-viewer-001';
const prefix = '/api/auth/ldap';
let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('restricted LDAP administration HTTP contract', () => {
  let database: DatabaseService;
  let container: DIContainer;
  let directory: LdapDirectoryService;
  let mappings: LdapMappingService;
  let app: express.Express;
  let adminToken: string;
  let viewerToken: string;
  let managerToken: string;

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', fixtureSecret);
    vi.stubEnv('LDAP_ENABLED', 'false');
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    const auth = new AuthenticationService(db, fixtureSecret, undefined, 4);
    const users = new UserService(db, auth);
    container = new DIContainer();
    const logger = new LoggerService('error');
    container.register('logger', logger);
    container.register('config', new ConfigService());
    directory = new LdapDirectoryService(parseLdapConfig({
      LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
      LDAP_HOSTNAME: 'ldap.example.test', LDAP_BASE_DN: 'dc=example,dc=test',
      LDAP_ANONYMOUS_LOOKUP: 'true', LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
    })!, logger);
    vi.spyOn(directory, 'resolveGroup').mockResolvedValue(group);
    vi.spyOn(directory, 'searchGroups').mockResolvedValue([group]);
    vi.spyOn(directory, 'diagnose').mockResolvedValue({ authenticated: false, stages: [
      { stage: 'tls', status: 'passed', durationMs: 1 }, { stage: 'lookup', status: 'passed', durationMs: 1 },
    ] });
    mappings = new LdapMappingService(db, 'directory', directory);
    container.register('ldapDirectory', directory);
    container.register('ldapMappings', mappings);
    app = express();
    app.use(express.json({ limit: '16kb' }));
    app.use(prefix, createLdapAdministrationRouter(database, container));
    app.use('/api/auth', createAuthRouter(database, container));
    for (const name of ['administrator', 'viewer', 'manager']) {
      const user = await users.createUser({ username: name, email: `${name}@example.test`,
        password: fixturePassword, firstName: '', lastName: '', isAdmin: name === 'administrator' });
      if (name === 'manager') {
        await db.execute("INSERT INTO roles VALUES ('manager', 'Manager', '', 0, 'now', 'now')");
        await db.execute(`INSERT INTO role_permissions (role_id, permission_id, assigned_at)
          SELECT 'manager', id, 'now' FROM permissions WHERE resource = 'rbac' AND "action" = 'admin'`);
        await users.assignRoleToUser(user.id, 'manager');
      }
      const token = await auth.generateToken(user);
      if (name === 'administrator') adminToken = token;
      if (name === 'viewer') viewerToken = token;
      if (name === 'manager') managerToken = token;
    }
  });
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await database.close(); });

  it.each([
    ['get', '/groups?query=op'], ['get', '/mappings'], ['post', '/mappings'],
    ['put', '/mappings/absent'], ['delete', '/mappings/absent'], ['post', '/test'],
  ] as const)('%s %s independently enforces authentication and rbac:admin before directory work', async (method, path) => {
    await request(harness.use(app))[method](prefix + path).send({}).expect(401);
    await request(harness.use(app))[method](prefix + path).set('Authorization', `Bearer ${viewerToken}`).send({}).expect(403);
    expect(directory.searchGroups).not.toHaveBeenCalled();
    expect(directory.resolveGroup).not.toHaveBeenCalled();
    expect(directory.diagnose).not.toHaveBeenCalled();
    expect(await mappings.list()).toEqual([]);
  });

  it('accepts delegated rbac administration and records authoritative labels and role provenance', async () => {
    const result = await request(harness.use(app)).post(prefix + '/mappings').set('Authorization', `Bearer ${managerToken}`)
      .send({ groupSubject, roleId }).expect(201);
    expect(result.body).toMatchObject({ source: 'ldap', directoryId: 'directory', groupSubject,
      groupName: group.name, groupDn: group.dn, roleName: 'Viewer', enabled: true });
    const listed = await request(harness.use(app)).get(prefix + '/mappings').set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(listed.body.items).toEqual([result.body]);
    expect(listed.headers['cache-control']).toBe('no-store');
    await request(harness.use(app)).put(prefix + '/mappings/' + result.body.id).set('Authorization', `Bearer ${managerToken}`)
      .send({ roleId: 'role-operator-001' }).expect(200);
    await request(harness.use(app)).delete(prefix + '/mappings/' + result.body.id).set('Authorization', `Bearer ${managerToken}`).expect(204);
    const audits = await database.getAdapter().query<{ action: string }>('SELECT "action" FROM audit_logs ORDER BY timestamp, id');
    expect(audits.map(row => row.action)).toEqual(['createLdapMapping', 'updateLdapMapping', 'deleteLdapMapping']);
    expect(await database.getAdapter().query('SELECT * FROM federated_user_roles')).toEqual([]);
  });

  it('returns conflicts, missing roles, scoped IDs and fabricated directory subjects safely', async () => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    await request(harness.use(app)).post(prefix + '/mappings').set(headers).send({ groupSubject, roleId }).expect(201);
    await request(harness.use(app)).post(prefix + '/mappings').set(headers).send({ groupSubject, roleId }).expect(409);
    await request(harness.use(app)).post(prefix + '/mappings').set(headers).send({ groupSubject, roleId: 'absent' }).expect(404);
    await request(harness.use(app)).put(prefix + '/mappings/absent').set(headers).send({ enabled: true }).expect(404);
    vi.mocked(directory.resolveGroup).mockRejectedValue(new LdapDirectoryError('INVALID_IDENTITY'));
    const fabricated = await request(harness.use(app)).post(prefix + '/mappings').set(headers)
      .send({ groupSubject: randomUUID(), roleId }).expect(422);
    expect(fabricated.body.error.code).toBe('INVALID_IDENTITY');
  });

  it('rejects raw filters, browser labels, credentials and connection overrides before directory calls', async () => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    for (const body of [ { groupSubject, roleId, groupDn: 'cn=forged' }, { groupSubject: 'cn=operators', roleId }, { groupSubject, roleId, directoryId: 'other' } ]) {
      await request(harness.use(app)).post(prefix + '/mappings').set(headers).send(body).expect(400);
    }
    for (const body of [{ username: 'alice', password: fixturePassword }, { hostname: 'evil.example' },
      { filter: '(uid=*)' }, { groupSubjects: [groupSubject] }, { username: 'alice', groupSubjects: [groupSubject] }]) {
      const result = await request(harness.use(app)).post(prefix + '/test').set(headers).send(body).expect(400);
      expect(JSON.stringify(result.body)).not.toContain(fixturePassword);
    }
    await request(harness.use(app)).get(prefix + '/groups?query=op&filter=raw').set(headers).expect(400);
    await request(harness.use(app)).get(prefix + '/groups?query=' + 'a'.repeat(1025)).set(headers).expect(400);
    expect(directory.resolveGroup).not.toHaveBeenCalled();
    expect(directory.diagnose).not.toHaveBeenCalled();
    expect(directory.searchGroups).not.toHaveBeenCalled();
  });

  it('keeps listing and withdrawal available during outages while directory errors return safe status codes', async () => {
    const mapping = await mappings.create(groupSubject, roleId, { userId: (await database.getAdapter().queryOne<{ id: string }>("SELECT id FROM users WHERE username = 'administrator'"))!.id });
    vi.mocked(directory.resolveGroup).mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    const headers = { Authorization: `Bearer ${adminToken}` };
    await request(harness.use(app)).get(prefix + '/mappings').set(headers).expect(200);
    await request(harness.use(app)).post(prefix + '/mappings').set(headers).send({ groupSubject, roleId }).expect(503);
    await request(harness.use(app)).put(prefix + '/mappings/' + mapping.id).set(headers).send({ enabled: false }).expect(200);
    await request(harness.use(app)).delete(prefix + '/mappings/' + mapping.id).set(headers).expect(204);
    for (const [code, status] of [['BUSY', 429], ['TIMEOUT', 503], ['INCOMPLETE_RESULT', 503], ['LIMIT_EXCEEDED', 503]] as const) {
      vi.mocked(directory.searchGroups).mockRejectedValue(new LdapDirectoryError(code));
      const result = await request(harness.use(app)).get(prefix + '/groups?query=op').set(headers).expect(status);
      expect(result.body.error.code).toBe(code);
    }
    vi.mocked(directory.searchGroups).mockRejectedValue(new Error('unsafe password host DN diagnostic'));
    const result = await request(harness.use(app)).get(prefix + '/groups?query=op').set(headers).expect(500);
    expect(JSON.stringify(result.body)).not.toMatch(/unsafe|password|host|stack|diagnostic/);
  });

  it('pages a bounded snapshot with opaque cursors bound to actor, query, lifetime and configured router', async () => {
    vi.mocked(directory.searchGroups).mockResolvedValue(Array.from({ length: 53 }, (_, i) => ({ ...group, subject: randomUUID(), name: `Group ${i}` })));
    const headers = { Authorization: `Bearer ${adminToken}` };
    const first = await request(harness.use(app)).get(prefix + '/groups?query=op').set(headers).expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toMatch(/^[a-f0-9]{64}$/);
    const url = prefix + '/groups?query=op&cursor=' + first.body.nextCursor;
    const second = await request(harness.use(app)).get(url).set(headers).expect(200);
    expect(second.body.items).toHaveLength(3);
    expect(second.body.nextCursor).toBeNull();
    expect(directory.searchGroups).toHaveBeenCalledTimes(1);
    await request(harness.use(app)).get(url.replace('query=op', 'query=admin')).set(headers).expect(400);
    await request(harness.use(app)).get(url).set('Authorization', `Bearer ${managerToken}`).expect(400);
    const changed = express();
    changed.use(prefix, createLdapAdministrationRouter(database, container));
    await request(harness.use(changed)).get(url).set(headers).expect(400);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60_001);
    await request(harness.use(app)).get(url).set(headers).expect(400);
  });

  it('returns staged diagnostics, selects only enabled mappings and rate limits before more directory work', async () => {
    const admin = (await database.getAdapter().queryOne<{ id: string }>("SELECT id FROM users WHERE username = 'administrator'"))!.id;
    const mapping = await mappings.create(groupSubject, roleId, { userId: admin });
    const headers = { Authorization: `Bearer ${adminToken}` };
    await request(harness.use(app)).post(prefix + '/test').set(headers).send({ username: 'alice', groupSubjects: [groupSubject] }).expect(200);
    expect(directory.diagnose).toHaveBeenLastCalledWith({ username: 'alice', groupSubjects: [groupSubject] });
    await mappings.update(mapping.id, { enabled: false }, { userId: admin });
    await request(harness.use(app)).post(prefix + '/test').set(headers).send({ username: 'alice', groupSubjects: [groupSubject] }).expect(400);
    for (const [code, status] of [['INELIGIBLE', 422], ['POLICY_UNREADABLE', 503], ['UNAVAILABLE', 503], ['BUSY', 429]] as const) {
      vi.mocked(directory.diagnose).mockResolvedValue({ authenticated: false, stages: [{ stage: 'eligibility', status: 'failed', durationMs: 2, code }] });
      const result = await request(harness.use(app)).post(prefix + '/test').set(headers).send({ username: 'alice' }).expect(status);
      expect(result.body).toMatchObject({ authenticated: false, stages: [{ code }] });
    }
    for (let i = 0; i < 4; i++) await request(harness.use(app)).post(prefix + '/test').set(headers).send({}).expect(429);
    expect(directory.diagnose).toHaveBeenCalledTimes(9);
    await request(harness.use(app)).post(prefix + '/test').set(headers).send({}).expect(429);
    expect(directory.diagnose).toHaveBeenCalledTimes(9);
  });

  it('keeps public LDAP discovery and login unavailable and returns 404 when directory support is disabled', async () => {
    const result = await request(harness.use(app)).get('/api/auth/providers').expect(200);
    expect(result.body).toEqual({ local: true });
    await request(harness.use(app)).post(prefix + '/login').send({ username: 'alice', password: fixturePassword }).expect(404);
    const disabled = new DIContainer();
    disabled.register('config', container.resolve('config'));
    disabled.register('logger', container.resolve('logger'));
    const other = express();
    other.use(prefix, createLdapAdministrationRouter(database, disabled));
    await request(harness.use(other)).get(prefix + '/mappings').set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it.skipIf(!process.env.TEST_LDAP_LDAPS_PORT || !process.env.TEST_LDAP_CA_FILE)('searches, maps and diagnoses through real verified LDAP without authenticating or importing a user', async () => {
    const config = parseLdapConfig({
      LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
      LDAP_HOSTNAME: 'localhost.localdomain', LDAP_PORT: process.env.TEST_LDAP_LDAPS_PORT,
      LDAP_CA_FILE: process.env.TEST_LDAP_CA_FILE, LDAP_BASE_DN: 'dc=example,dc=test',
      LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
      LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test',
      LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
      LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
    })!;
    const live = new LdapDirectoryService(config, container.resolve('logger'));
    container.register('ldapDirectory', live);
    container.register('ldapMappings', new LdapMappingService(database.getAdapter(), config.directoryId, live));
    const headers = { Authorization: `Bearer ${adminToken}` };
    const before = await database.getAdapter().query('SELECT id FROM users ORDER BY id');
    const groups = await request(harness.use(app)).get(prefix + '/groups?query=operators').set(headers).expect(200);
    const subject = groups.body.items[0].subject;
    await request(harness.use(app)).post(prefix + '/mappings').set(headers).send({ groupSubject: subject, roleId }).expect(201);
    const diagnostic = await request(harness.use(app)).post(prefix + '/test').set(headers).send({ username: 'alice', groupSubjects: [subject] }).expect(200);
    expect(diagnostic.body.authenticated).toBe(false);
    expect(diagnostic.body.groupSubjects).toEqual([subject]);
    expect(diagnostic.body.stages.map((stage: { status: string }) => stage.status)).toEqual(Array(5).fill('passed'));
    const inactive = await request(harness.use(app)).post(prefix + '/test').set(headers).send({ username: 'inactive' }).expect(422);
    expect(inactive.body.stages.at(-1)).toMatchObject({ stage: 'eligibility', code: 'INELIGIBLE' });
    expect(await database.getAdapter().query('SELECT id FROM users ORDER BY id')).toEqual(before);
    expect(await database.getAdapter().query('SELECT * FROM federated_user_roles')).toEqual([]);
    expect(await database.getAdapter().query('SELECT * FROM federated_identities')).toEqual([]);
    expect(await database.getAdapter().query('SELECT * FROM oauth_auth_codes')).toEqual([]);
    expect(JSON.stringify(diagnostic.body)).not.toMatch(/alice|fixture-reader|ldap:\/\/|ldaps:\/\//);
  });
});
