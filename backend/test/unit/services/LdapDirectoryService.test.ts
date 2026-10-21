import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from 'ldapts';
import { BerWriter, InappropriateMatchingError, InvalidCredentialsError, SizeLimitExceededError } from 'ldapts';
import { parseLdapConfig } from '../../../src/config/ldap';
import { LdapDirectoryService } from '../../../src/services/LdapDirectoryService';
import { LoggerService } from '../../../src/services/LoggerService';
import type { LdapConnection, LdapConnector } from '../../../src/services/ldap/transport';
import { canonicalUuid, guidToSubject, subjectToGuid } from '../../../src/services/ldap/identity';
import { adPolicyAttributes, checkAdEligibility } from '../../../src/services/ldap/policy';
import { verifyLdapHostname } from '../../../src/services/ldap/transport';
import type { PeerCertificate } from 'node:tls';

const subject = '00112233-4455-6677-8899-aabbccddeeff';
const guidHex = '33221100554477668899aabbccddeeff'; // pragma: allowlist secret (GUID codec vector)
const groupId = '10112233-4455-6677-8899-aabbccddeeff';
const parentId = '20112233-4455-6677-8899-aabbccddeeff';
const replacement = '30112233-4455-6677-8899-aabbccddeeff';
const fixturePassword = 'fixture-user'; // pragma: allowlist secret
const config = parseLdapConfig({
  LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'test', LDAP_DIRECTORY_TYPE: 'openldap',
  LDAP_HOSTNAME: 'ldap.example.test', LDAP_BASE_DN: 'dc=example,dc=test',
  LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
  LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)', LDAP_ANONYMOUS_LOOKUP: 'true',
})!;
const user: Entry = { dn: 'uid=alice,ou=people,dc=example,dc=test', uid: 'alice', entryUUID: subject };
const group: Entry = { dn: 'cn=operators,ou=groups,dc=example,dc=test', cn: 'operators', entryUUID: groupId };
const parent: Entry = { dn: 'cn=admins,ou=groups,dc=example,dc=test', cn: 'admins', entryUUID: parentId };
const adUser: Entry = {
  ...user, objectGUID: subjectToGuid(subject), sAMAccountName: 'alice',
  userAccountControl: '512', 'msDS-User-Account-Control-Computed': '0',
  accountExpires: '0', pwdLastSet: '133000000000000000', 'msDS-UserPasswordExpiryTimeComputed': '9223372036854775807',
};

function fixture(entries: (Entry[] | Error)[] = [[user], [user]]) {
  const lookup: LdapConnection = {
    bind: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockImplementation(async () => {
      const next = entries.shift();
      if (next instanceof Error) throw next;
      return { searchEntries: next ?? [], searchReferences: [] };
    }), close: vi.fn(),
  };
  const userConnection: LdapConnection = { ...lookup, bind: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
  const connect = vi.fn<LdapConnector>().mockResolvedValueOnce(lookup).mockResolvedValue(userConnection);
  const logger = new LoggerService('error');
  const warn = vi.spyOn(logger, 'warn');
  return { lookup, userConnection, connect, logger, warn,
    service: new LdapDirectoryService(config, logger, connect) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('immutable LDAP identities and AD policy', () => {
  it('canonicalizes UUIDs and round-trips little-endian binary AD GUIDs', () => {
    expect(subjectToGuid(subject).toString('hex')).toBe(guidHex);
    expect(guidToSubject(Buffer.from(guidHex, 'hex'))).toBe(subject);
    expect(canonicalUuid(subject.toUpperCase())).toBe(subject);
    for (const input of ['', 'uid=alice', '00000000-0000-0000-0000-000000000000']) {
      expect(() => canonicalUuid(input)).toThrow();
    }
    expect(() => guidToSubject(Buffer.alloc(15))).toThrow();
  });

  it('uses FILETIME sentinel values and computed lockout/password-expiry bits', () => {
    expect(() => checkAdEligibility(adUser)).not.toThrow();
    expect(() => checkAdEligibility({ ...adUser, accountExpires: '9223372036854775807' })).not.toThrow();
    for (const change of [
      { userAccountControl: '514' }, { 'msDS-User-Account-Control-Computed': '16' },
      { 'msDS-User-Account-Control-Computed': '8388608' }, { accountExpires: '1' },
      { pwdLastSet: '0' }, { 'msDS-UserPasswordExpiryTimeComputed': '1' },
      { 'msDS-UserPasswordExpiryTimeComputed': '0' },
    ]) expect(() => checkAdEligibility({ ...adUser, ...change })).toThrow('INELIGIBLE');
    for (const name of adPolicyAttributes) {
      const incomplete = { ...adUser };
      delete incomplete[name];
      expect(() => checkAdEligibility(incomplete)).toThrow('POLICY_UNREADABLE');
    }
    expect(() => checkAdEligibility({ ...adUser, accountExpires: 'not-an-integer' })).toThrow('POLICY_UNREADABLE');
  });

  it('applies normal hostname validation and the additional wildcard restriction', () => {
    const cert = { subject: { CN: '*.example.test' }, subjectaltname: 'DNS:*.example.test' } as PeerCertificate;
    expect(verifyLdapHostname('ldap.example.test', cert, false)).toBeInstanceOf(Error);
    expect(verifyLdapHostname('ldap.example.test', cert, true)).toBeUndefined();
    expect(verifyLdapHostname('other.test', cert, true)).toBeInstanceOf(Error);
    expect(verifyLdapHostname('ldap.example.test', {
      subjectaltname: 'DNS:ldap.example.test, DNS:*.unrelated.test',
    } as PeerCertificate, false)).toBeUndefined();
  });
});

describe('read-only LDAP directory transactions', () => {
  it('diagnoses lookup, immutable identity, eligibility and selected membership without a user bind or personal fields', async () => {
    const f = fixture([[user], [user], [group], [group]]);
    const result = await f.service.diagnose({ username: 'alice', groupSubjects: [groupId] });
    expect(result.authenticated).toBe(false);
    expect(result.groupSubjects).toEqual([groupId]);
    expect(result.stages.map(stage => [stage.stage, stage.status])).toEqual([
      ['tls', 'passed'], ['lookup', 'passed'], ['identity', 'passed'], ['eligibility', 'passed'], ['groups', 'passed'],
    ]);
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.userConnection.bind).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/alice|uid=|email|fixture-user/);
    const filters = vi.mocked(f.lookup.search).mock.calls.map(call => String(call[1].filter));
    expect(filters[0]).not.toContain('employeeType');
    expect(filters[1]).toContain('employeeType');
    expect(f.lookup.close).toHaveBeenCalled();
  });

  it('distinguishes absent identity, ineligible policy and unreadable AD policy in restricted diagnostics', async () => {
    const absent = await fixture([[]]).service.diagnose({ username: 'absent' });
    expect(absent.stages.at(-1)).toMatchObject({ stage: 'identity', status: 'failed', code: 'INVALID_IDENTITY' });
    const inactive = await fixture([[user], []]).service.diagnose({ username: 'alice' });
    expect(inactive.stages.at(-1)).toMatchObject({ stage: 'eligibility', status: 'failed', code: 'INELIGIBLE' });
    const f = fixture([[adUser], [{ ...adUser, pwdLastSet: [] }]]);
    const ad = new LdapDirectoryService({ ...config, directoryType: 'ad', userIdAttr: 'objectGUID' }, f.logger, f.connect);
    const unreadable = await ad.diagnose({ username: 'alice' });
    expect(unreadable.stages.at(-1)).toMatchObject({ stage: 'eligibility', status: 'failed', code: 'POLICY_UNREADABLE' });
  });

  it('redacts raw TLS and lookup failures and returns no partial membership diagnostics', async () => {
    const f = fixture();
    f.connect.mockReset().mockRejectedValue(new Error('private endpoint and secret'));
    const tls = await f.service.diagnose({});
    expect(tls.stages).toEqual([{ stage: 'tls', status: 'failed', code: 'UNAVAILABLE', durationMs: expect.any(Number) }]);
    const bound = fixture();
    vi.mocked(bound.lookup.bind).mockRejectedValue(new InvalidCredentialsError('private lookup password'));
    const lookup = await bound.service.diagnose({});
    expect(lookup.stages.at(-1)).toMatchObject({ stage: 'lookup', status: 'failed', code: 'INVALID_CREDENTIALS' });
    const limited = fixture([[user], [user], [group], new SizeLimitExceededError('private server message')]);
    const result = await limited.service.diagnose({ username: 'alice', groupSubjects: [groupId] });
    expect(result.groupSubjects).toBeUndefined();
    expect(result.stages.at(-1)).toMatchObject({ stage: 'groups', status: 'failed' });
    expect(JSON.stringify([tls, lookup, result])).not.toContain('private');
  });

  it('bounds diagnostic deadlines and closes lookup sockets without granting authentication', async () => {
    vi.useFakeTimers();
    const f = fixture();
    vi.mocked(f.lookup.search).mockImplementation(() => new Promise(() => {}));
    const pending = f.service.diagnose({ username: 'alice' });
    await vi.advanceTimersByTimeAsync(config.requestTimeoutSeconds * 1000 + 1);
    const result = await pending;
    expect(result.stages.at(-1)).toMatchObject({ status: 'failed', code: 'TIMEOUT' });
    expect(result.authenticated).toBe(false);
    expect(f.lookup.close).toHaveBeenCalled();
  });

  it('isolates the user bind, rereads identity and returns explicit mapped direct membership', async () => {
    const f = fixture([[user], [user], [group]]);
    expect(await f.service.authenticate('alice', fixturePassword, [groupId, parentId])).toEqual({
      user: { subject, dn: user.dn, loginName: 'alice', displayName: 'alice', email: null, firstName: '', lastName: '' },
      groupSubjects: [groupId],
    });
    expect(f.lookup.bind).toHaveBeenCalledExactlyOnceWith('', '');
    expect(f.userConnection.bind).toHaveBeenCalledExactlyOnceWith(user.dn, fixturePassword);
    expect(f.connect).toHaveBeenCalledTimes(2);
    expect(f.userConnection.close).toHaveBeenCalled();
    expect(f.lookup.close).toHaveBeenCalled();
    const filters = vi.mocked(f.lookup.search).mock.calls.map(call => String(call[1].filter));
    expect(filters[0]).toContain('(employeeType=\\61\\63\\74\\69\\76\\65)');
    expect(filters[0]).toContain('(uid=alice)');
    expect(filters[2]).toContain('(uniqueMember=');
  });

  it('preserves UTF-8 runtime values in typed filters', async () => {
    const f = fixture();
    await f.service.authenticate('é-user', fixturePassword);
    const filter = vi.mocked(f.lookup.search).mock.calls[0][1].filter;
    if (!filter || typeof filter === 'string') throw new Error('Typed filter required');
    const writer = new BerWriter();
    filter.write(writer);
    expect(writer.buffer.includes(Buffer.from('é-user', 'utf8'))).toBe(true);
  });

  it('never opens connections for empty passwords or oversized credential payloads', async () => {
    const f = fixture();
    for (const [login, password] of [['alice', ''], ['', fixturePassword], ['a'.repeat(1025), fixturePassword], ['alice', 'p'.repeat(4097)]]) {
      await expect(f.service.authenticate(login, password)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('preserves whitespace and escapes filter injection without broadening searches', async () => {
    const f = fixture();
    await f.service.authenticate('*)(uid=*)', ' padded ');
    expect(f.userConnection.bind).toHaveBeenCalledWith(user.dn, ' padded ');
    expect(String(vi.mocked(f.lookup.search).mock.calls[0][1].filter)).toContain('\\2a\\29\\28uid=\\2a\\29');
  });

  it.each([[], [user, user], [{ ...user, entryUUID: [] }]])('rejects missing, ambiguous or malformed immutable identities', async entries => {
    const f = fixture([entries]);
    await expect(f.service.authenticate('alice', fixturePassword)).rejects.toBeInstanceOf(Error);
    expect(f.userConnection.bind).not.toHaveBeenCalled();
  });

  it('rejects replacement objects after a correct bind', async () => {
    const f = fixture([[user], [{ ...user, entryUUID: replacement }]]);
    await expect(f.service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' });
  });

  it('treats disappearance or a moved locator during bind as a retryable identity change', async () => {
    for (const after of [[], [{ ...user, dn: 'uid=moved,ou=people,dc=example,dc=test' }]]) {
      const f = fixture([[user], after]);
      await expect(f.service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'IDENTITY_CHANGED' });
    }
  });

  it('does not retry wrong user credentials on another endpoint or expose raw errors', async () => {
    const f = fixture();
    vi.mocked(f.userConnection.bind).mockRejectedValue(new InvalidCredentialsError('unsafe server message'));
    const service = new LdapDirectoryService({ ...config, failoverEndpoints: [{ hostname: 'other.test', port: 636 }] }, f.logger, f.connect);
    await expect(service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(f.connect).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.warn.mock.calls)).not.toContain('unsafe server message');
  });

  it('fails over connection establishment, but never retries lookup credentials', async () => {
    const f = fixture();
    const connect = vi.fn<LdapConnector>().mockRejectedValueOnce(new Error('TCP unavailable'))
      .mockResolvedValueOnce(f.lookup).mockResolvedValue(f.userConnection);
    const service = new LdapDirectoryService({ ...config, failoverEndpoints: [{ hostname: 'other.test', port: 636 }] }, f.logger, connect);
    await service.authenticate('alice', fixturePassword);
    expect(connect.mock.calls[1][1].hostname).toBe('other.test');
    expect(connect.mock.calls[2][1].hostname).toBe('other.test');
    vi.mocked(f.lookup.bind).mockRejectedValue(new InvalidCredentialsError());
    connect.mockClear().mockResolvedValue(f.lookup);
    await expect(service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('revalidates by immutable subject without a user password or user bind', async () => {
    const f = fixture([[{ ...user, uid: 'renamed', dn: 'uid=renamed,ou=people,dc=example,dc=test' }]]);
    expect((await f.service.revalidate(subject)).user.loginName).toBe('renamed');
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(f.lookup.search).mock.calls[0][1].filter)).toContain('(entryUUID=');
  });

  it('traverses nested group cycles once and enforces depth and visit limits', async () => {
    const f = fixture([[user], [user], [group], [parent], [group]]);
    const service = new LdapDirectoryService({ ...config, searchNestedGroups: true }, f.logger, f.connect);
    expect((await service.authenticate('alice', fixturePassword, [groupId, parentId])).groupSubjects).toEqual([groupId, parentId]);
    const limited = fixture([[user], [user], [group], [parent]]);
    await expect(new LdapDirectoryService({ ...config, searchNestedGroups: true, nestedGroupMaxDepth: 1 }, limited.logger, limited.connect)
      .authenticate('alice', fixturePassword, [parentId])).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const visited = fixture([[user], [user], [group, parent]]);
    await expect(new LdapDirectoryService({ ...config, groupTraversalLimit: 1 }, visited.logger, visited.connect)
      .authenticate('alice', fixturePassword, [groupId])).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('denies partial/referral and server-limited searches', async () => {
    const f = fixture();
    vi.mocked(f.lookup.search).mockResolvedValue({ searchEntries: [user], searchReferences: ['ldap://elsewhere.test'] });
    await expect(f.service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'INCOMPLETE_RESULT' });
    const limited = fixture([new SizeLimitExceededError()]);
    await expect(limited.service.authenticate('alice', fixturePassword)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('bounds group search and resolves immutable identities in the configured scope', async () => {
    const f = fixture([[group], [group]]);
    expect(await f.service.searchGroups('op*')).toEqual([{ subject: groupId, dn: group.dn, name: 'operators' }]);
    expect(vi.mocked(f.lookup.search).mock.calls[0][1]).toMatchObject({ sizeLimit: 100, paged: false, derefAliases: 'never' });
    expect(String(vi.mocked(f.lookup.search).mock.calls[0][1].filter)).toContain('*op\\2a*');
    // A second independent transaction requires a fresh lookup connection.
    const g = fixture([[group]]);
    expect(await g.service.resolveGroup(groupId)).toEqual({ subject: groupId, dn: group.dn, name: 'operators' });
    const outside = fixture([[{ ...group, dn: 'cn=operators,ou=outside,dc=example,dc=test' }]]);
    await expect(outside.service.searchGroups('op')).rejects.toMatchObject({ code: 'INCOMPLETE_RESULT' });
  });

  it('rejects unsupported optional UID suffixes in group membership', async () => {
    const f = fixture([[{ ...group, uniqueMember: user.dn + "#'0101'B" }]]);
    await expect(f.service.resolveGroup(groupId)).rejects.toMatchObject({ code: 'INCOMPLETE_RESULT' });
  });

  it('uses binary AD GUID filters and required account-policy attributes', async () => {
    const f = fixture([[adUser], [adUser]]);
    const ad = { ...config, directoryType: 'ad' as const, userIdAttr: 'objectGUID', groupIdAttr: 'objectGUID',
      userLookupAttr: 'sAMAccountName', userEligibilityFilter: '' };
    const service = new LdapDirectoryService(ad, f.logger, f.connect);
    expect((await service.revalidate(subject)).user.subject).toBe(subject);
    expect(vi.mocked(f.lookup.search).mock.calls[0][1]).toMatchObject({ explicitBufferAttributes: ['objectGUID', 'objectGUID'] });
    const filter = vi.mocked(f.lookup.search).mock.calls[0][1].filter;
    if (!filter || typeof filter === 'string') throw new Error('Typed filter required');
    const writer = new BerWriter();
    filter.write(writer);
    expect(writer.buffer.includes(subjectToGuid(subject))).toBe(true);
    const bad = fixture([[{ ...adUser, objectGUID: subject }]]);
    await expect(new LdapDirectoryService(ad, bad.logger, bad.connect).revalidate(subject)).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
  });

  it('falls back from the AD chain check only on a definitive unsupported-rule response', async () => {
    const adGroup = { ...group, objectGUID: subjectToGuid(groupId) };
    const f = fixture([[adUser], [adGroup], [], new InappropriateMatchingError()]);
    const service = new LdapDirectoryService({
      ...config, directoryType: 'ad', userIdAttr: 'objectGUID', groupIdAttr: 'objectGUID',
      userLookupAttr: 'sAMAccountName', groupMemberAttr: 'member', searchNestedGroups: true,
    }, f.logger, f.connect);
    expect((await service.revalidate(subject, [groupId])).groupSubjects).toEqual([groupId]);
    expect(String(vi.mocked(f.lookup.search).mock.calls[3][1].filter)).toContain('1.2.840.113556.1.4.1941');
  });

  it('rejects excess admission and aborts the entire transaction deadline', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release!: (value: LdapConnection) => void;
    const connect = vi.fn<LdapConnector>().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const service = new LdapDirectoryService({ ...config, maxConcurrentOperations: 1, requestTimeoutSeconds: 1 }, f.logger, connect);
    const first = service.revalidate(subject);
    const rejected = expect(first).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(service.revalidate(subject)).rejects.toMatchObject({ code: 'BUSY' });
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(connect.mock.calls[0][2].aborted).toBe(true);
    release(f.lookup);
    await Promise.resolve();
    expect(f.lookup.close).toHaveBeenCalled();
  });
});
