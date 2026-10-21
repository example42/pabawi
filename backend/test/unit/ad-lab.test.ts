import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { Client, Entry } from 'ldapts';
import { OwnedAdFixtures, validateAdBoundary } from '../fixtures/ldap/ad-lab';
import type { AdLabConfig } from '../fixtures/ldap/ad-lab';

const parent = 'ou=Acceptance,dc=example,dc=test';
function fixture() {
  const entries = new Map<string, Entry>();
  const client = {
    add: vi.fn(async (dn: string, attributes: Record<string, string | string[]>) => {
      if (entries.has(dn)) throw new Error('Already exists');
      entries.set(dn, { dn, ...attributes, objectGUID: randomBytes(16) });
    }),
    search: vi.fn(async (dn: string) => ({ searchEntries: entries.has(dn) ? [entries.get(dn)!] : [], searchReferences: [] })),
    modify: vi.fn(async () => undefined),
    modifyDN: vi.fn(async (dn: string, next: string) => { entries.set(next, { ...entries.get(dn)!, dn: next }); entries.delete(dn); }),
    del: vi.fn(async (dn: string) => { entries.delete(dn); }),
  };
  return { entries, client, owned: new OwnedAdFixtures(client as unknown as Client, parent) };
}

describe('AD lab mutation boundaries, synthetic local verification only', () => {
  it('requires a child OU under a domain DN and parses escaped locators', () => {
    const config = { baseDn: 'dc=example,dc=test', parentOu: parent, fixtureBindDn: 'cn=writer,' + parent, lookupBindDn: 'cn=reader,' + parent } as AdLabConfig;
    expect(() => validateAdBoundary(config)).not.toThrow();
    for (const parentOu of [config.baseDn, 'ou=Acceptance,dc=elsewhere,dc=test', 'cn=Acceptance,dc=example,dc=test', 'ou=bad,']) {
      expect(() => validateAdBoundary({ ...config, parentOu })).toThrow();
    }
  });
  it('refuses mutation outside its exact generated children and refuses arbitrary attributes', async () => {
    const { client, owned } = fixture();
    for (const dn of [parent, 'cn=external,' + parent, 'cn=bad\\,cn=other,' + owned.ou]) {
      await expect(owned.add(dn, { objectClass: 'user' })).rejects.toThrow();
      await expect(owned.replace(dn, 'member', [])).rejects.toThrow();
      await expect(owned.remove(dn)).rejects.toThrow();
    }
    expect(client.add).not.toHaveBeenCalled();
    expect(client.modify).not.toHaveBeenCalled();
    expect(client.del).not.toHaveBeenCalled();
    const dn = owned.dn('user');
    await owned.add(dn, { objectClass: 'user' });
    await expect(owned.replace(dn, 'description', ['stolen'])).rejects.toThrow();
    expect(client.modify).not.toHaveBeenCalled();
  });
  it('preserves unowned, renamed and replaced objects while cleaning only its own ledger', async () => {
    const { client, entries, owned } = fixture();
    await owned.add(owned.ou, { objectClass: 'organizationalUnit' });
    const dn = owned.dn('user');
    const guid = await owned.add(dn, { objectClass: 'user' });
    await owned.rename(dn, owned.dn('renamed'));
    expect(entries.get(owned.dn('renamed'))!.objectGUID).toEqual(guid);
    entries.get(owned.dn('renamed'))!.objectGUID = randomBytes(16);
    entries.set('cn=external,' + parent, { dn: 'cn=external,' + parent, description: owned.marker });
    expect(await owned.cleanup()).toEqual({ status: 'failed', remaining: 1 });
    expect(client.del).toHaveBeenCalledTimes(1);
    expect(entries.has(owned.dn('renamed'))).toBe(true);
    expect(entries.has('cn=external,' + parent)).toBe(true);
  });
  it('retains ambiguous failed creations and refuses cleanup after marker changes', async () => {
    const { client, entries, owned } = fixture();
    const dn = owned.dn('user');
    await owned.add(dn, { objectClass: 'user' });
    entries.get(dn)!.description = 'foreign';
    expect(await owned.cleanup()).toEqual({ status: 'failed', remaining: 1 });
    expect(client.del).not.toHaveBeenCalled();
  });
  it('blocks further writes after cancellation while allowing bounded owned cleanup', async () => {
    const { client, entries } = fixture();
    let cancelled = false;
    const owned = new OwnedAdFixtures(client as unknown as Client, parent, () => undefined,
      () => { if (cancelled) throw new Error('Cancelled'); });
    await owned.add(owned.dn('user'), { objectClass: 'user' });
    cancelled = true;
    await expect(owned.replace(owned.dn('user'), 'member', [])).rejects.toThrow('Cancelled');
    await expect(owned.add(owned.dn('later'), { objectClass: 'user' })).rejects.toThrow('Cancelled');
    expect(client.modify).not.toHaveBeenCalled();
    expect(await owned.cleanup()).toEqual({ status: 'passed', remaining: 0 });
    expect(entries.size).toBe(0);
    expect(owned.snapshot().objects).toEqual([]);
  });
  it('cleans a creation even when the successful server write loses its response', async () => {
    const { client, owned } = fixture();
    const add = client.add.getMockImplementation()!;
    client.add.mockImplementationOnce(async (dn, attributes) => { await add(dn, attributes); throw new Error('Lost reply'); });
    await expect(owned.add(owned.dn('user'), { objectClass: 'user' })).rejects.toThrow();
    expect(await owned.cleanup()).toEqual({ status: 'passed', remaining: 0 });
    expect(client.del).toHaveBeenCalledTimes(1);
  });
});
