import { BerWriter } from 'ldapts';
import { parseLdapFilter } from '../../src/config/ldapFilter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLdapConfig } from '../../src/config/ldap';
import { ConfigService } from '../../src/config/ConfigService';

const enabled = {
  LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory-1', LDAP_DIRECTORY_TYPE: 'openldap',
  LDAP_HOSTNAME: 'localhost.localdomain', LDAP_BASE_DN: 'dc=example,dc=test',
  LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test', LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
  LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
};
afterEach(() => vi.unstubAllEnvs());

describe('LDAP configuration', () => {
  it('ignores directory settings while disabled but rejects malformed enabled flags', () => {
    expect(parseLdapConfig({ LDAP_HOSTNAME: 'invalid' })).toBeUndefined();
    expect(parseLdapConfig({ LDAP_ENABLED: 'false', LDAP_PORT: 'no' })).toBeUndefined();
    expect(() => parseLdapConfig({ LDAP_ENABLED: 'yes' })).toThrow('LDAP_ENABLED');
  });

  it('selects OpenLDAP and AD presets and TLS ports', () => {
    expect(parseLdapConfig(enabled)).toMatchObject({
      directoryId: 'directory-1', directoryType: 'openldap', userObjectClass: 'inetOrgPerson',
      userIdAttr: 'entryUUID', groupObjectClass: 'groupOfUniqueNames', groupMemberAttr: 'uniqueMember',
      port: 636, maxConcurrentOperations: 10, requestTimeoutSeconds: 30,
    });
    expect(parseLdapConfig({ ...enabled, LDAP_DIRECTORY_TYPE: 'ad', LDAP_TLS_MODE: 'starttls',
      LDAP_USER_ELIGIBILITY_FILTER: '' })).toMatchObject({
      port: 389, userIdAttr: 'objectGUID', groupObjectClass: 'group', groupMemberAttr: 'member',
      userLookupAttr: 'sAMAccountName',
    });
  });

  it.each([
    ['LDAP_DIRECTORY_ID', 'bad/scope'], ['LDAP_DIRECTORY_TYPE', 'freeipa'],
    ['LDAP_HOSTNAME', 'ldap://host.example'], ['LDAP_HOSTNAME', '127.0.0.1'],
    ['LDAP_HOSTNAME', 'host'], ['LDAP_HOSTNAME', 'reader@host.example'],
    ['LDAP_HOSTNAME', 'host.example/path'], ['LDAP_HOSTNAME', 'a..test'],
    ['LDAP_PORT', '0'], ['LDAP_PORT', '65536'], ['LDAP_PORT', '389x'], ['LDAP_PORT', ''],
    ['LDAP_FAILOVER_ENDPOINTS', '{}'], ['LDAP_FAILOVER_ENDPOINTS', 'invalid'],
    ['LDAP_FAILOVER_ENDPOINTS', '[{"hostname":"other.example","port":636,"tlsMode":"plain"}]'],
    ['LDAP_FAILOVER_ENDPOINTS', JSON.stringify(Array.from({ length: 5 }, () => ({ hostname: 'other.example', port: 636 })))],
    ['LDAP_TLS_MODE', 'plain'], ['LDAP_CA_FILE', '/tmp/pabawi-missing-directory-ca.pem'],
    ['LDAP_BASE_DN', 'bad DN'], ['LDAP_BASE_DN', ''], ['LDAP_USER_RDN', 'bad'],
    ['LDAP_LOOKUP_USER', 'bad DN'], ['LDAP_LOOKUP_PASSWORD', ''],
    ['LDAP_ANONYMOUS_LOOKUP', 'true'], ['LDAP_ALLOW_WILDCARD_CERTIFICATES', '1'],
    ['LDAP_USER_ID_ATTR', 'uid)(objectClass=*'], ['LDAP_GROUP_LOOKUP_ATTR', 'cn;unsafe'],
    ['LDAP_USER_ELIGIBILITY_FILTER', ''], ['LDAP_USER_ELIGIBILITY_FILTER', '(&(uid=*)'],
    ['LDAP_GROUP_MEMBER_ATTR', 'memberUid'], ['LDAP_LOGIN_HELP_URL', 'javascript:alert(1)'],
    ['LDAP_LOGIN_HELP_URL', 'https://user:pass@example.test/'], // pragma: allowlist secret (synthetic invalid URL)
    ['LDAP_CONNECT_TIMEOUT_SECONDS', '31'], ['LDAP_OPERATION_TIMEOUT_SECONDS', '0'],
    ['LDAP_REQUEST_TIMEOUT_SECONDS', '61'], ['LDAP_NESTED_GROUP_MAX_DEPTH', '33'],
    ['LDAP_GROUP_SEARCH_LIMIT', '501'], ['LDAP_GROUP_TRAVERSAL_LIMIT', '10001'],
    ['LDAP_REVALIDATION_INTERVAL_SECONDS', '301'], ['LDAP_MAX_CONCURRENT_OPERATIONS', '101'],
  ])('rejects malformed %s', (name, value) => {
    expect(() => parseLdapConfig({ ...enabled, [name]: value })).toThrow();
  });

  it('requires consistent explicit anonymous configuration', () => {
    expect(parseLdapConfig({ ...enabled, LDAP_LOOKUP_USER: undefined, LDAP_LOOKUP_PASSWORD: undefined,
      LDAP_ANONYMOUS_LOOKUP: 'true' })).toMatchObject({ anonymousLookup: true, lookupUser: '', lookupPassword: '' });
  });

  it('accepts parsed escaped DNs, OID attributes and complete filters', () => {
    expect(parseLdapConfig({ ...enabled, LDAP_USER_RDN: 'ou=People\\, staff',
      LDAP_USER_ID_ATTR: '1.3.6.1.1.16.4', LDAP_USER_ELIGIBILITY_FILTER: '(&(employeeType=active)(uid=*))' })).toBeDefined();
  });

  it('preserves configured binary and UTF-8 filter assertion bytes', () => {
    for (const filter of ['(displayName=é)', '(displayName=\\c3\\a9)', '(displayName=*\\c3\\a9*)']) {
      const writer = new BerWriter();
      parseLdapFilter(filter).write(writer);
      expect(writer.buffer.includes(Buffer.from('é', 'utf8'))).toBe(true);
    }
    const writer = new BerWriter();
    parseLdapFilter('(objectGUID=\\ff\\00\\80)').write(writer);
    expect(writer.buffer.includes(Buffer.from([255, 0, 128]))).toBe(true);
  });

  it('validates enabled config at startup without attempting network access', () => {
    for (const [key, value] of Object.entries(enabled)) vi.stubEnv(key, value);
    vi.stubEnv('JWT_SECRET', 'pabawi-ldap-config-fixture-secret-long'); // pragma: allowlist secret
    vi.stubEnv('LDAP_HOSTNAME', 'unreachable.invalid');
    const service = new ConfigService();
    expect(service.getLdapConfig()).toMatchObject({ enabled: true, hostname: 'unreachable.invalid' });
    vi.stubEnv('LDAP_TLS_MODE', 'plain');
    expect(() => new ConfigService()).toThrow('tlsMode');
  });
});
