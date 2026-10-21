import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { parseLdapConfig } from '../../src/config/ldap';
import type { LdapConfig } from '../../src/config/ldap';
import { LdapDirectoryService } from '../../src/services/LdapDirectoryService';
import { LoggerService } from '../../src/services/LoggerService';
import { openLdapConnection } from '../../src/services/ldap/transport';

const fixturePassword = 'fixture-user'; // pragma: allowlist secret
const ready = !!(process.env.TEST_LDAP_LDAPS_PORT && process.env.TEST_LDAP_STARTTLS_PORT && process.env.TEST_LDAP_CA_FILE);
const logger = new LoggerService('error');
function fixtureConfig(mode: 'ldaps' | 'starttls' = 'ldaps'): LdapConfig {
  return parseLdapConfig({
    LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'fixture', LDAP_DIRECTORY_TYPE: 'openldap',
    LDAP_HOSTNAME: 'localhost.localdomain', LDAP_TLS_MODE: mode,
    LDAP_PORT: mode === 'ldaps' ? process.env.TEST_LDAP_LDAPS_PORT : process.env.TEST_LDAP_STARTTLS_PORT,
    LDAP_CA_FILE: process.env.TEST_LDAP_CA_FILE, LDAP_BASE_DN: 'dc=example,dc=test',
    LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
    LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test',
    LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
    LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
  })!;
}
afterEach(() => vi.restoreAllMocks());

describe.skipIf(!ready)('real OpenLDAP directory interoperability', () => {
  for (const mode of ['ldaps', 'starttls'] as const) {
    it(mode + ' verifies TLS, isolates binds, checks status and resolves nested cyclic membership', async () => {
      const config = fixtureConfig(mode);
      const directory = new LdapDirectoryService(config, logger);
      const groups = await directory.searchGroups('operators');
      expect(groups).toHaveLength(1);
      const [operators] = groups;
      const [admins] = await directory.searchGroups('admins');
      const direct = await directory.authenticate('alice', fixturePassword, [operators.subject, admins.subject]);
      expect(direct.user).toMatchObject({ loginName: 'alice', displayName: 'Alice Fixture', email: 'alice@example.test' });
      expect(direct.groupSubjects).toEqual([operators.subject]);
      expect((await directory.resolveGroup(operators.subject)).dn).toBe(operators.dn);
      const diagnostic = await directory.diagnose({ username: 'alice', groupSubjects: [operators.subject] });
      expect(diagnostic.authenticated).toBe(false);
      expect(diagnostic.stages.map(stage => stage.status)).toEqual(Array(5).fill('passed'));
      expect(diagnostic.groupSubjects).toEqual([operators.subject]);
      expect(JSON.stringify(diagnostic)).not.toMatch(/Alice|alice@|uid=|fixture-reader/);
      expect((await directory.diagnose({ username: 'inactive' })).stages.at(-1))
        .toMatchObject({ stage: 'eligibility', status: 'failed', code: 'INELIGIBLE' });
      expect((await directory.diagnose({ username: 'absent' })).stages.at(-1))
        .toMatchObject({ stage: 'identity', status: 'failed', code: 'INVALID_IDENTITY' });
      const nested = new LdapDirectoryService({ ...config, searchNestedGroups: true }, logger);
      expect(new Set((await nested.authenticate('alice', fixturePassword, [operators.subject, admins.subject])).groupSubjects))
        .toEqual(new Set([operators.subject, admins.subject]));
      expect((await directory.revalidate(direct.user.subject, [operators.subject])).user.subject).toBe(direct.user.subject);
      for (const login of ['inactive', 'missing-policy', '*)(uid=*)', 'absent']) {
        await expect(directory.authenticate(login, fixturePassword)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      }
      await expect(directory.authenticate('alice', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(directory.authenticate('alice', '')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  }

  it('preserves Unicode login and absent contacts, rejects ambiguous login and missing IDs', async () => {
    const config = fixtureConfig();
    const directory = new LdapDirectoryService(config, logger);
    expect((await directory.authenticate('josé', fixturePassword)).user)
      .toMatchObject({ loginName: 'josé', displayName: 'josé', email: null, firstName: '', lastName: 'Example' });
    await expect(directory.authenticate('duplicate', fixturePassword)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(new LdapDirectoryService({ ...config, userIdAttr: 'description' }, logger)
      .authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
    await expect(directory.searchGroups('optionaluid')).rejects.toMatchObject({ code: 'INCOMPLETE_RESULT' });
  });

  it('supports groupOfNames/member as an explicit OpenLDAP schema override', async () => {
    const directory = new LdapDirectoryService({ ...fixtureConfig(), groupObjectClass: 'groupOfNames', groupMemberAttr: 'member' }, logger);
    const [ordinary] = await directory.searchGroups('ordinary');
    expect((await directory.authenticate('alice', fixturePassword, [ordinary.subject])).groupSubjects).toEqual([ordinary.subject]);
  });

  it('denies administrative search, traversal and depth truncation without partial grants', async () => {
    const config = fixtureConfig();
    const directory = new LdapDirectoryService(config, logger);
    const [operators] = await directory.searchGroups('operators');
    await expect(new LdapDirectoryService({ ...config, groupSearchLimit: 1 }, logger).searchGroups('s'))
      .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(new LdapDirectoryService({ ...config, searchNestedGroups: true, nestedGroupMaxDepth: 1 }, logger)
      .authenticate('alice', fixturePassword, [operators.subject])).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(new LdapDirectoryService({ ...config, searchNestedGroups: true, groupTraversalLimit: 1 }, logger)
      .authenticate('alice', fixturePassword, [operators.subject])).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  for (const mode of ['ldaps', 'starttls'] as const) {
    it(mode + ' rejects an untrusted CA and hostname mismatch', async () => {
      const config = fixtureConfig(mode);
      await expect(new LdapDirectoryService({ ...config, caFile: '' }, logger).searchGroups('op'))
        .rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await expect(new LdapDirectoryService({ ...config, hostname: 'localhost' }, logger).searchGroups('op'))
        .rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });
  }

  it('fails over only transport setup and authenticates on the selected endpoint', async () => {
    const config = fixtureConfig();
    const directory = new LdapDirectoryService({
      ...config, port: 1, failoverEndpoints: [{ hostname: config.hostname, port: config.port }],
    }, logger);
    expect((await directory.authenticate('alice', fixturePassword)).user.loginName).toBe('alice');
  });

  it('requires a successful StartTLS upgrade before sending any bind credentials', async () => {
    const chunks: Buffer[] = [];
    const server = createServer(socket => socket.on('data', data => { chunks.push(data); socket.destroy(); }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    try {
      const directory = new LdapDirectoryService({ ...fixtureConfig('starttls'), port: address.port }, logger);
      await expect(directory.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      const captured = Buffer.concat(chunks);
      expect(captured.toString()).toContain('1.3.6.1.4.1.1466.20037');
      expect(captured.toString()).not.toContain('fixture-reader');
      expect(captured.toString()).not.toContain(fixturePassword);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('closes sockets on the transaction deadline and rejects reconnect after explicit close', async () => {
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer(socket => { sockets.add(socket); socket.resume(); socket.once('close', () => sockets.delete(socket)); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    try {
      const directory = new LdapDirectoryService({ ...fixtureConfig('starttls'), port: address.port, requestTimeoutSeconds: 1 }, logger);
      await expect(directory.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'TIMEOUT' });
      for (let attempt = 0; attempt < 20 && sockets.size; attempt++) await delay(10);
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    const config = fixtureConfig();
    const connection = await openLdapConnection(config, { hostname: config.hostname, port: config.port }, new AbortController().signal);
    await connection.bind(config.lookupUser, config.lookupPassword);
    connection.close();
    await expect(connection.bind(config.lookupUser, config.lookupPassword)).rejects.toBeInstanceOf(Error);
  });
});
