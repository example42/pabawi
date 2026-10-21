import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createLdapTestContext, ldapPassword, ldapResult } from '../helpers/ldapAuthentication';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';
import { LdapDirectoryError, LdapDirectoryService } from '../../src/services/LdapDirectoryService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { LdapAuthenticationService } from '../../src/services/LdapAuthenticationService';
import { parseLdapConfig } from '../../src/config/ldap';
import { createAuthRateLimitMiddleware } from '../../src/middleware/securityMiddleware';

describe('LDAP HTTP authentication and provider-bound tokens', () => {
  let harness: HttpHarness;
  let ctx: Awaited<ReturnType<typeof createLdapTestContext>>;
  beforeAll(async () => { harness = await createHttpHarness(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => { ctx = await createLdapTestContext(); harness.use(ctx.app); });
  afterEach(async () => { await ctx.database.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  async function login(username = 'a', password = ldapPassword) {
    return request(harness.use(ctx.app)).post('/api/auth/ldap/login').send({ username, password });
  }

  it('advertises only safe provider metadata even during an outage', async () => {
    ctx.directory.authenticate.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    const response = await request(harness.use(ctx.app)).get('/api/auth/providers').expect(200);
    expect(response.body).toEqual({ local: true, ldap: { enabled: true, name: 'LDAP', loginHelpUrl: '' } });
    expect(response.text).not.toMatch(/ldap.example|baseDn|directoryId|password/);
    expect((await login()).status).toBe(503);
    expect((await request(harness.use(ctx.app)).get('/api/auth/providers')).body).toEqual(response.body);
  });

  it('accepts short directory credentials unchanged and rotates exact provider context', async () => {
    const response = await login(' A ', ' p ');
    expect(response.status).toBe(200);
    expect(ctx.directory.authenticate).toHaveBeenCalledWith(' A ', ' p ', expect.any(Array));
    expect(response.body.user).toMatchObject({ email: null, displayName: 'Directory A' });
    const context = { provider: 'ldap', identityId: expect.any(String), directoryId: 'directory' };
    expect(jwt.decode(response.body.token)).toMatchObject({ authContext: context });
    expect(jwt.decode(response.body.refreshToken)).toMatchObject({ authContext: context });
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${response.body.token}`).expect(200);
    const rotated = await request(harness.use(ctx.app)).post('/api/auth/refresh').send({ refreshToken: response.body.refreshToken }).expect(200);
    expect(jwt.decode(rotated.body.token)).toMatchObject({ authContext: context });
    expect(ctx.directory.revalidate).toHaveBeenCalledOnce();
    expect(rotated.body.refreshToken).not.toBe(response.body.refreshToken);
  });

  it('rejects empty, oversized, nonstring or extra input before directory work', async () => {
    for (const body of [{ username: '', password: 'x' }, { username: 'a', password: '' }, { username: 'a', password: 1 },
      { username: 'a', password: 'x', hostname: 'evil.test' }, { username: 'ü'.repeat(1024), password: 'x' },
      { username: 'a', password: 'x'.repeat(4097) }]) {
      await request(harness.use(ctx.app)).post('/api/auth/ldap/login').send(body).expect(400);
    }
    expect(ctx.directory.authenticate).not.toHaveBeenCalled();
  });

  it('returns generic credentials, explicit denied access and safe temporary/capacity errors without provider fallthrough', async () => {
    const local = vi.spyOn(ctx.auth, 'authenticate');
    for (const [code, status] of [['INVALID_CREDENTIALS', 401], ['INELIGIBLE', 401], ['UNAVAILABLE', 503],
      ['INCOMPLETE_RESULT', 503], ['TIMEOUT', 503], ['BUSY', 429]] as const) {
      ctx.directory.authenticate.mockRejectedValueOnce(new LdapDirectoryError(code));
      const response = await login();
      expect(response.status).toBe(status);
      expect(response.text).not.toContain('ldap.example');
    }
    ctx.directory.authenticate.mockResolvedValueOnce({ ...ldapResult, groupSubjects: [] });
    expect((await login()).status).toBe(403);
    expect(local).not.toHaveBeenCalled();
    const failed = await request(harness.use(ctx.app)).post('/api/auth/login').send({ username: 'a', password: ldapPassword });
    expect(failed.status).toBe(401);
    expect(ctx.directory.authenticate).toHaveBeenCalledTimes(7);
  });

  it('scopes lockouts by provider, directory and submitted login while IP throttling covers LDAP', async () => {
    ctx.directory.authenticate.mockRejectedValue(new LdapDirectoryError('INVALID_CREDENTIALS'));
    for (let i = 0; i < 5; i++) expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(429);
    expect(ctx.directory.authenticate).toHaveBeenCalledTimes(5);
    expect(await ctx.auth.isLdapLoginLocked('other-directory', 'a')).toBe(false);
    expect(await ctx.auth.isLdapLoginLocked('directory', 'other')).toBe(false);
    const local = await request(harness.use(ctx.app)).post('/api/auth/login').send({ username: 'administrator', password: 'LocalTest123!' }); // pragma: allowlist secret
    expect(local.status).toBe(200);
    const limiter = createAuthRateLimitMiddleware();
    ctx.app.post('/ip-budget', limiter, (_req, res) => { res.json({ ok: true }); });
    for (let i = 0; i < 10; i++) await request(harness.use(ctx.app)).post('/ip-budget').expect(200);
    await request(harness.use(ctx.app)).post('/ip-budget').expect(429);
  });

  it('forces refresh during fresh state, preserves inbound refresh on outage, and never extends failed freshness', async () => {
    const pair = (await login()).body;
    const before = await ctx.db.queryOne('SELECT * FROM ldap_validation_state');
    ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('UNAVAILABLE'));
    await request(harness.use(ctx.app)).post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(503);
    expect(await ctx.db.queryOne('SELECT * FROM ldap_validation_state')).toEqual(before);
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${pair.token}`).expect(200);
    await request(harness.use(ctx.app)).post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(200);
  });

  it('blocks stale REST sessions during an outage and recovers without revoking otherwise valid tokens', async () => {
    const pair = (await login()).body;
    await ctx.db.execute('UPDATE ldap_validation_state SET last_validated_at = 1');
    ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('UNAVAILABLE'));
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${pair.token}`).expect(503);
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${pair.token}`).expect(200);
  });

  it('positive revocation remains terminal for access and refresh after a fresh login', async () => {
    const old = (await login()).body;
    await ctx.db.execute('UPDATE ldap_validation_state SET last_validated_at = 1');
    ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${old.token}`).expect(403);
    const fresh = (await login()).body;
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${old.token}`).expect(401);
    await request(harness.use(ctx.app)).post('/api/auth/refresh').send({ refreshToken: old.refreshToken }).expect(401);
    await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${fresh.token}`).expect(200);
  });

  it('keeps local and Entra token checks independent of an unavailable directory', async () => {
    const user = ctx.administrator;
    await ctx.users.linkFederatedIdentity(user.id, 'entra-id', 'subject', 'tenant', user.email);
    const identity = await ctx.db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [user.id]);
    ctx.directory.revalidate.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    for (const context of [{ provider: 'local', identityId: null }, { provider: 'entra-id', identityId: identity!.id }] as const) {
      const pair = await ctx.auth.generateTokenPair(user, context);
      await ctx.auth.verifyToken(pair.token);
      expect((await ctx.auth.refreshToken(pair.refreshToken)).success).toBe(true);
    }
    expect(ctx.directory.revalidate).not.toHaveBeenCalled();
  });

  it.skipIf(!process.env.TEST_LDAP_LDAPS_PORT || !process.env.TEST_LDAP_STARTTLS_PORT || !process.env.TEST_LDAP_CA_FILE)
    .each(['ldaps', 'starttls'] as const)('authenticates and refreshes real OpenLDAP credentials over %s through HTTP', async mode => {
      const config = parseLdapConfig({ LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
        LDAP_HOSTNAME: 'localhost.localdomain', LDAP_TLS_MODE: mode,
        LDAP_PORT: mode === 'ldaps' ? process.env.TEST_LDAP_LDAPS_PORT : process.env.TEST_LDAP_STARTTLS_PORT,
        LDAP_CA_FILE: process.env.TEST_LDAP_CA_FILE, LDAP_BASE_DN: 'dc=example,dc=test', LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
        LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test', LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
        LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
      })!;
      const directory = new LdapDirectoryService(config, ctx.container.resolve('logger'));
      for (const mapping of await ctx.mappings.list()) await ctx.mappings.remove(mapping.id, { userId: ctx.administrator.id });
      const mappings = new LdapMappingService(ctx.db, config.directoryId, directory);
      const group = (await directory.searchGroups('operators'))[0];
      await mappings.create(group.subject, 'role-viewer-001', { userId: ctx.administrator.id });
      const ldap = new LdapAuthenticationService(ctx.db, config, directory, mappings, ctx.users);
      await ldap.initialize();
      ctx.container.register('ldapAuthentication', ldap);
      vi.mocked(ctx.container.resolve('config').getLdapConfig).mockReturnValue(config);
      expect((await login('alice', 'incorrect')).status).toBe(401);
      expect(await ctx.db.query('SELECT * FROM federated_identities')).toEqual([]);
      const pair = await login('alice', 'fixture-user'); // pragma: allowlist secret
      expect(pair.status).toBe(200);
      expect(pair.body.user).toMatchObject({ displayName: 'Alice Fixture', email: 'alice@example.test' });
      await request(harness.use(ctx.app)).post('/api/auth/refresh').send({ refreshToken: pair.body.refreshToken }).expect(200);
      await ctx.db.execute('UPDATE ldap_validation_state SET last_validated_at = 1');
      await request(harness.use(ctx.app)).get('/protected').set('Authorization', `Bearer ${pair.body.token}`).expect(200);
      expect(ctx.directory.authenticate).not.toHaveBeenCalled();
    });
});
