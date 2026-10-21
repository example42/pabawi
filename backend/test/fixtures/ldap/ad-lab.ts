import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Attribute, Change, Client, EqualityFilter, ExtensibleFilter } from 'ldapts';
import type { Entry } from 'ldapts';
import { ldapDnEquals, ldapDnWithinScope, parseLdapDn } from '../../../src/config/ldapDn';
import { parseLdapConfig } from '../../../src/config/ldap';
import { LdapDirectoryService } from '../../../src/services/LdapDirectoryService';
import { LoggerService } from '../../../src/services/LoggerService';
import { guidToSubject } from '../../../src/services/ldap/identity';
import { attributeValues, textAttribute } from '../../../src/services/ldap/policy';

export interface AdLabConfig {
  implementation: string; disposableLab: boolean; baseDn: string; parentOu: string;
  controllers: { hostname: string; ldapsPort: number; starttlsPort: number }[];
  caFile: string; fixtureBindDn: string; fixturePasswordFile: string;
  lookupBindDn: string; lookupPasswordFile: string; userPasswordFile: string;
  largeMemberCount: number; maxLockoutAttempts: number; replicationTimeoutSeconds: number;
}
interface Report {
  status: string; adVerified: boolean; reason: string;
  cases: { name: string; status: string }[];
  cleanup?: { status: string; remaining: number }; platform?: string;
  fixtureOwnership?: { runId: string; objects: { relativeDn: string; guid?: string }[] }[];
}
type Writer = Pick<Client, 'add' | 'search' | 'modify' | 'modifyDN' | 'del'>;

export function validateAdBoundary(config: AdLabConfig): void {
  const base = parseLdapDn(config.baseDn);
  const parent = parseLdapDn(config.parentOu);
  assert(base.length >= 2 && base.every(rdn => rdn.length === 1 && (JSON.parse(rdn[0]) as string[])[0] === 'dc'));
  assert(parent[0].length === 1 && (JSON.parse(parent[0][0]) as string[])[0] === 'ou');
  assert(!ldapDnEquals(config.parentOu, config.baseDn) && ldapDnWithinScope(config.parentOu, config.baseDn));
  parseLdapDn(config.fixtureBindDn);
  parseLdapDn(config.lookupBindDn);
}

export function validateAdSettings(config: AdLabConfig, lookupPassword: string): void {
  validateAdBoundary(config);
  for (const endpoint of config.controllers) {
    for (const mode of ['ldaps', 'starttls'] as const) {
      parseLdapConfig({ LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'actual-ad-lab', LDAP_DIRECTORY_TYPE: 'ad',
        LDAP_HOSTNAME: endpoint.hostname, LDAP_PORT: String(mode === 'ldaps' ? endpoint.ldapsPort : endpoint.starttlsPort),
        LDAP_TLS_MODE: mode, LDAP_CA_FILE: config.caFile, LDAP_BASE_DN: config.parentOu,
        LDAP_LOOKUP_USER: config.lookupBindDn, LDAP_LOOKUP_PASSWORD: lookupPassword });
    }
  }
}

export class OwnedAdFixtures {
  public readonly marker = 'pabawi-acceptance-' + randomUUID();
  public readonly ou: string;
  private readonly owned = new Map<string, Buffer | undefined>();
  private cleaning = false;
  constructor(private readonly client: Writer, parentOu: string, private readonly checkpoint: () => void = () => undefined, private readonly check: () => void = () => undefined) {
    this.ou = 'ou=' + this.marker + ',' + parentOu;
  }
  public snapshot(): { runId: string; objects: { relativeDn: string; guid?: string }[] } {
    return { runId: this.marker, objects: [...this.owned].map(([dn, guid]) => ({
      relativeDn: dn === this.ou ? '' : dn.slice(0, -(this.ou.length + 1)), guid: guid?.toString('hex'),
    })) };
  }
  public dn(name: string): string {
    assert(/^[a-z][a-z0-9-]{0,60}$/.test(name));
    return 'cn=' + name + ',' + this.ou;
  }
  private boundary(dn: string): void {
    assert(ldapDnEquals(dn, this.ou) || ldapDnWithinScope(dn, this.ou));
    assert(this.owned.has(dn), 'Mutation requires a run-owned object');
  }
  public async read(dn: string): Promise<Entry | undefined> {
    this.boundary(dn);
    try {
      const result = await this.client.search(dn, { scope: 'base', filter: '(objectClass=*)',
        attributes: ['objectGUID', 'description'], explicitBufferAttributes: ['objectGUID'], sizeLimit: 1 });
      assert(result.searchReferences.length === 0 && result.searchEntries.length <= 1);
      return result.searchEntries[0];
    } catch (error) {
      if ((error as { code?: number }).code === 32) return undefined;
      throw error;
    }
  }
  private async prove(dn: string): Promise<Buffer> {
    const entry = await this.read(dn);
    assert(entry && textAttribute(entry, 'description', true) === this.marker, 'Ownership marker changed');
    const [guid] = attributeValues(entry, 'objectGUID');
    assert(Buffer.isBuffer(guid) && guid.length === 16, 'Binary ownership identity required');
    const previous = this.owned.get(dn);
    assert(!previous || previous.equals(guid), 'Ownership identity changed');
    this.owned.set(dn, guid);
    this.checkpoint();
    return guid;
  }
  private child(dn: string): boolean {
    const name = dn.slice(3, dn.indexOf(','));
    return /^[a-z][a-z0-9-]{0,60}$/.test(name) && dn === this.dn(name);
  }
  public async add(dn: string, attributes: Record<string, string | string[]>): Promise<Buffer> {
    assert((dn === this.ou || this.child(dn)) && !this.owned.has(dn));
    this.owned.set(dn, undefined);
    this.checkpoint();
    this.check();
    await this.client.add(dn, { ...attributes, description: this.marker });
    return this.prove(dn);
  }
  public async replace(dn: string, type: string, values: string[] | Buffer[]): Promise<void> {
    await this.prove(dn);
    assert(['unicodePwd', 'userAccountControl', 'accountExpires', 'pwdLastSet', 'lockoutTime', 'member'].includes(type));
    this.check();
    await this.client.modify(dn, new Change({ operation: 'replace', modification: new Attribute({ type, values }) }));
  }
  public async rename(dn: string, next: string): Promise<void> {
    assert(this.child(next) && !this.owned.has(next));
    const guid = await this.prove(dn);
    this.owned.set(next, guid);
    this.checkpoint();
    this.check();
    await this.client.modifyDN(dn, next);
    await this.prove(next);
    this.owned.delete(dn);
    this.checkpoint();
  }
  public async remove(dn: string): Promise<void> {
    await this.prove(dn);
    if (!this.cleaning) this.check();
    await this.client.del(dn);
    this.owned.delete(dn);
    this.checkpoint();
  }
  public async cleanup(): Promise<{ status: string; remaining: number }> {
    this.cleaning = true;
    for (const dn of [...this.owned.keys()].reverse()) {
      try {
        if (await this.read(dn)) await this.remove(dn);
        else { this.owned.delete(dn); this.checkpoint(); }
      } catch { /* Keep ownership evidence when an object changed or cleanup failed. */ }
    }
    return { status: this.owned.size ? 'failed' : 'passed', remaining: this.owned.size };
  }
}

export async function runAdLab(config: AdLabConfig, report: Report, evidence: string, secrets: { fixturePassword: string; lookupPassword: string; userPassword: string }): Promise<void> {
  validateAdBoundary(config);
  const { fixturePassword, lookupPassword, userPassword } = secrets;
  const clients = new Set<Client>();
  const fixtures: OwnedAdFixtures[] = [];
  let interrupted = false;
  const cancel = (): void => {
    interrupted = true;
    // Let the bounded current operation settle; keep the writer bound for owned-object cleanup.
  };
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  const check = (): void => { assert(!interrupted, 'AD harness interrupted'); };
  const connect = async (mode: 'ldaps' | 'starttls', controller = 0): Promise<Client> => {
    check();
    const endpoint = config.controllers[controller];
    const tlsOptions = { ca: [readFileSync(config.caFile)], rejectUnauthorized: true, minVersion: 'TLSv1.2' as const,
      servername: endpoint.hostname };
    const client = new Client({ url: (mode === 'ldaps' ? 'ldaps' : 'ldap') + '://' + endpoint.hostname + ':' +
      (mode === 'ldaps' ? endpoint.ldapsPort : endpoint.starttlsPort),
      timeout: 10000, connectTimeout: 10000, autoRebind: false, ...(mode === 'ldaps' ? { tlsOptions } : {}) });
    clients.add(client);
    if (mode === 'starttls') await client.startTLS(tlsOptions);
    return client;
  };
  report.status = 'running';
  report.platform = 'operator-attested Microsoft AD DS; capabilities checked; no substitute establishes actual AD';
  try {
    for (const mode of ['ldaps', 'starttls'] as const) {
      check();
      const admin = await connect(mode);
      await admin.bind(config.fixtureBindDn, fixturePassword);
      const root = await admin.search('', { scope: 'base', attributes: ['supportedCapabilities', 'vendorName'], filter: '(objectClass=*)' });
      assert(root.searchEntries.length === 1 && root.searchReferences.length === 0);
      assert(attributeValues(root.searchEntries[0], 'supportedCapabilities').includes('1.2.840.113556.1.4.800'));
      assert(!JSON.stringify(root.searchEntries).toLowerCase().includes('samba'));
      const owned = new OwnedAdFixtures(admin, config.parentOu, () => {
        report.fixtureOwnership = fixtures.map(fixture => fixture.snapshot());
        writeFileSync(join(evidence, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
      }, check);
      fixtures.push(owned);
      await owned.add(owned.ou, { objectClass: 'organizationalUnit', ou: owned.marker });
      const sam = 'pa' + randomUUID().replaceAll('-', '').slice(0, 14);
      let userDn = owned.dn('user');
      const addUser = async (): Promise<Buffer> => {
        const guid = await owned.add(userDn, { objectClass: 'user', cn: userDn.slice(3, userDn.indexOf(',')),
          sAMAccountName: sam, sn: 'Synthetic', userAccountControl: '514' });
        await owned.replace(userDn, 'unicodePwd', [Buffer.from('"' + userPassword + '"', 'utf16le')]);
        await owned.replace(userDn, 'userAccountControl', ['512']);
        return guid;
      };
      const guid = await addUser();
      const subject = guidToSubject(guid);
      const baseConfig = parseLdapConfig({ LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'actual-ad-lab', LDAP_DIRECTORY_TYPE: 'ad',
        LDAP_HOSTNAME: config.controllers[0].hostname, LDAP_PORT: String(mode === 'ldaps' ? config.controllers[0].ldapsPort : config.controllers[0].starttlsPort),
        LDAP_TLS_MODE: mode, LDAP_CA_FILE: config.caFile, LDAP_BASE_DN: owned.ou,
        LDAP_LOOKUP_USER: config.lookupBindDn, LDAP_LOOKUP_PASSWORD: lookupPassword,
        LDAP_SEARCH_NESTED_GROUPS: 'true', LDAP_REQUEST_TIMEOUT_SECONDS: '60' })!;
      const directory = new LdapDirectoryService(baseConfig, new LoggerService('error'));
      const record = async (name: string, action: () => Promise<void>): Promise<void> => {
        check();
        const item = { name: mode + '/' + name, status: 'running' };
        report.cases.push(item);
        try { await action(); check(); item.status = 'passed'; }
        catch { item.status = 'failed'; throw new Error('AD acceptance case failed'); }
        finally { writeFileSync(join(evidence, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); }
      };
      await record('binary-guid-retrieval-filter', async () => {
        const result = await admin.search(owned.ou, { scope: 'sub', filter: new EqualityFilter({ attribute: 'objectGUID', value: guid }),
          attributes: ['objectGUID'], explicitBufferAttributes: ['objectGUID'] });
        assert(result.searchEntries.length === 1 && result.searchReferences.length === 0);
        assert((await directory.authenticate(sam, userPassword)).user.subject === subject);
        assert((await directory.revalidate(subject)).user.subject === subject);
      });
      await record('rename-recreation', async () => {
        const next = owned.dn('renamed-user');
        await owned.rename(userDn, next); userDn = next;
        assert(ldapDnEquals((await directory.revalidate(subject)).user.dn, next));
        await owned.remove(userDn);
        const replacement = await addUser();
        assert(!replacement.equals(guid));
        await assert.rejects(directory.revalidate(subject));
        assert((await directory.authenticate(sam, userPassword)).user.subject === guidToSubject(replacement));
      });
      const current = (await directory.authenticate(sam, userPassword)).user.subject;
      await record('account-states', async () => {
        await owned.replace(userDn, 'userAccountControl', ['514']);
        await assert.rejects(directory.revalidate(current), { code: 'INELIGIBLE' });
        await owned.replace(userDn, 'userAccountControl', ['512']);
        await owned.replace(userDn, 'accountExpires', ['1']);
        await assert.rejects(directory.revalidate(current), { code: 'INELIGIBLE' });
        await owned.replace(userDn, 'accountExpires', ['0']);
        await owned.replace(userDn, 'pwdLastSet', ['0']);
        await assert.rejects(directory.revalidate(current), { code: 'INELIGIBLE' });
        await owned.replace(userDn, 'pwdLastSet', ['-1']);
        await directory.revalidate(current);
        let locked = false;
        for (let attempt = 0; attempt < config.maxLockoutAttempts; attempt++) {
          check();
          const badBind = await connect(mode);
          try { await assert.rejects(badBind.bind(userDn, randomUUID())); }
          finally { await badBind.unbind(); clients.delete(badBind); }
          try { await directory.revalidate(current); }
          catch (error) { if ((error as { code?: string }).code === 'INELIGIBLE') {
            const policy = await admin.search(userDn, { scope: 'base', attributes: ['msDS-User-Account-Control-Computed'], filter: '(objectClass=*)' });
            const value = textAttribute(policy.searchEntries[0], 'msDS-User-Account-Control-Computed', true);
            assert(value && (BigInt(value) & 16n) !== 0n, 'Lockout must be observed, not inferred from denial');
            locked = true; break;
          } throw error; }
        }
        assert(locked, 'Lab must have observable bounded lockout policy');
        await owned.replace(userDn, 'lockoutTime', ['0']);
        assert((await directory.authenticate(sam, userPassword)).user.subject === current);
      });
      const directDn = owned.dn('direct-group');
      const parentDn = owned.dn('parent-group');
      let directSubject = '';
      let parentSubject = '';
      await record('nested-groups', async () => {
        directSubject = guidToSubject(await owned.add(directDn, { objectClass: 'group', cn: 'direct-group', sAMAccountName: sam + 'd', groupType: '-2147483646', member: [userDn] }));
        parentSubject = guidToSubject(await owned.add(parentDn, { objectClass: 'group', cn: 'parent-group', sAMAccountName: sam + 'p', groupType: '-2147483646', member: [directDn] }));
        const subjects = [directSubject, parentSubject];
        const chain = await admin.search(owned.ou, { scope: 'sub',
          filter: new ExtensibleFilter({ matchType: 'member', rule: '1.2.840.113556.1.4.1941', value: userDn }),
          attributes: ['objectGUID'], explicitBufferAttributes: ['objectGUID'], sizeLimit: 3 });
        assert(chain.searchReferences.length === 0);
        assert.deepEqual(new Set(chain.searchEntries.map(entry => {
          const [value] = attributeValues(entry, 'objectGUID'); assert(Buffer.isBuffer(value)); return guidToSubject(value);
        })), new Set(subjects));
        assert.deepEqual(new Set((await directory.authenticate(sam, userPassword, subjects)).groupSubjects), new Set(subjects));
        const traversal = new LdapDirectoryService({ ...baseConfig, disableMatchingRuleInChain: true }, new LoggerService('error'));
        assert.deepEqual(new Set((await traversal.revalidate(current, subjects)).groupSubjects), new Set(subjects));
        const bounded = new LdapDirectoryService({ ...baseConfig, nestedGroupMaxDepth: 1 }, new LoggerService('error'));
        await assert.rejects(bounded.revalidate(current, subjects), { code: 'LIMIT_EXCEEDED' });
        await owned.rename(parentDn, owned.dn('renamed-group'));
        assert(ldapDnEquals((await directory.resolveGroup(parentSubject)).dn, owned.dn('renamed-group')));
        await owned.remove(owned.dn('renamed-group'));
        const replacement = guidToSubject(await owned.add(parentDn, { objectClass: 'group', cn: 'parent-group', sAMAccountName: sam + 'p', groupType: '-2147483646', member: [directDn] }));
        assert(replacement !== parentSubject);
        assert(!(await directory.revalidate(current, subjects)).groupSubjects.includes(parentSubject));
      });
      await record('large-membership', async () => {
        const largeDn = owned.dn('large-group');
        const largeSubject = guidToSubject(await owned.add(largeDn, { objectClass: 'group', cn: 'large-group', sAMAccountName: sam + 'l', groupType: '8' }));
        const members = [userDn];
        for (let i = 1; i < config.largeMemberCount; i++) {
          check();
          const dn = owned.dn('member-' + i);
          await owned.add(dn, { objectClass: 'contact', cn: 'member-' + i, sn: 'Synthetic' });
          members.push(dn);
        }
        await owned.replace(largeDn, 'member', members);
        const ranged = await admin.search(largeDn, { scope: 'base', attributes: ['member'], filter: '(objectClass=*)' });
        assert(Object.keys(ranged.searchEntries[0]).some(key => /^member;range=0-\d+$/i.test(key)), 'Lab did not produce ranged membership');
        assert((await directory.revalidate(current, [largeSubject])).groupSubjects.includes(largeSubject));
        const bounded = new LdapDirectoryService({ ...baseConfig, groupTraversalLimit: 1 }, new LoggerService('error'));
        await assert.rejects(bounded.revalidate(current, [directSubject]), { code: 'LIMIT_EXCEEDED' });
      });
      await record('equivalent-controller-failover', async () => {
        const second = config.controllers[1];
        const alternate = { hostname: second.hostname, port: mode === 'ldaps' ? second.ldapsPort : second.starttlsPort };
        const secondDirectory = new LdapDirectoryService({ ...baseConfig, ...alternate }, new LoggerService('error'));
        const deadline = Date.now() + config.replicationTimeoutSeconds * 1000;
        while (true) {
          check();
          try { assert((await secondDirectory.revalidate(current, [directSubject])).groupSubjects.includes(directSubject)); break; }
          catch { if (Date.now() >= deadline) throw new Error('Equivalent controller replication unavailable'); await delay(500); }
        }
        // Refuse only primary connection establishment, keeping the real configured controller/TLS identity.
        const { openLdapConnection } = await import('../../../src/services/ldap/transport');
        const failover = new LdapDirectoryService({ ...baseConfig, failoverEndpoints: [alternate] }, new LoggerService('error'),
          async (settings, endpoint, signal) => {
            if (endpoint.hostname === baseConfig.hostname) throw Object.assign(new Error('Controlled primary transport outage'), { code: 'ECONNREFUSED' });
            return openLdapConnection(settings, endpoint, signal);
          });
        assert((await failover.authenticate(sam, userPassword, [directSubject])).user.subject === current);
      });
    }
    report.cases = report.cases.filter(item => item.status !== 'not-run');
    report.status = 'passed'; report.adVerified = true;
    report.reason = 'Operator-attested actual AD lab cases passed in LDAPS and StartTLS';
  } finally {
    let remaining = 0;
    for (const fixture of fixtures.reverse()) remaining += (await fixture.cleanup()).remaining;
    report.cleanup = { status: remaining ? 'failed' : 'passed', remaining };
    if (remaining || interrupted) { report.status = 'failed'; report.adVerified = false; }
    for (const client of clients) await client.unbind().catch(() => undefined);
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    assert(remaining === 0 && !interrupted, 'AD cleanup incomplete or interrupted');
  }
}
