import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, connect, type Socket } from 'node:net';
import { Attribute, Change, Client } from 'ldapts';
import { DatabaseService } from '../../src/database/DatabaseService';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { parseLdapConfig } from '../../src/config/ldap';
import { LdapDirectoryService } from '../../src/services/LdapDirectoryService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { LdapAuthenticationService } from '../../src/services/LdapAuthenticationService';
import { createLdapTestContext, ldapPassword } from './ldapAuthentication';

export const liveDirectoryReady = !!(process.env.TEST_LDAP_LDAPS_PORT && process.env.TEST_LDAP_STARTTLS_PORT && process.env.TEST_LDAP_CA_FILE);
export type DirectoryMode = 'synthetic' | 'ldaps' | 'starttls';

export async function createLdapTransportContext(mode: DirectoryMode, dialect: 'sqlite' | 'postgres' = 'sqlite') {
  let database: DatabaseService | undefined;
  let control: PostgresAdapter | undefined;
  const schema = 'ldaptransport_' + randomUUID().replaceAll('-', '');
  if (dialect === 'postgres') {
    control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
    await control.initialize();
    await control.execute('CREATE SCHEMA ' + schema);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', '-csearch_path=' + schema);
    database = new DatabaseService(':memory:', 'postgres', url.toString());
  }
  const releaseDatabase = async () => {
    if (control) {
      await control.execute('DROP SCHEMA ' + schema + ' CASCADE');
      await control.close();
    }
  };
  const ctx = await createLdapTestContext(database);
  if (mode === 'synthetic') return { ...ctx, releaseDatabase, live: undefined, loginName: 'a', loginPassword: ldapPassword };
  const loginName = 'transport-' + randomUUID();
  const userDn = 'uid=' + loginName + ',ou=people,dc=example,dc=test';
  const groupDn = 'cn=' + loginName + ',ou=groups,dc=example,dc=test';
  const targetPort = Number(mode === 'ldaps' ? process.env.TEST_LDAP_LDAPS_PORT : process.env.TEST_LDAP_STARTTLS_PORT);
  const sockets = new Set<Socket>();
  let unavailable = false;
  let paused = false;
  const relay = createServer(client => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    client.on('error', () => client.destroy());
    if (unavailable) { client.destroy(); return; }
    const upstream = connect({ host: 'localhost.localdomain', port: targetPort });
    sockets.add(upstream);
    upstream.once('close', () => { sockets.delete(upstream); client.destroy(); });
    upstream.on('error', () => { upstream.destroy(); client.destroy(); });
    client.once('close', () => upstream.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
    if (paused) { client.pause(); upstream.pause(); }
  });
  await new Promise<void>((resolve, reject) => {
    relay.once('error', reject);
    relay.listen(0, '127.0.0.1', () => { relay.removeListener('error', reject); resolve(); });
  });
  const address = relay.address();
  if (!address || typeof address === 'string') throw new Error('Missing LDAP relay address');
  const config = parseLdapConfig({
    LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
    LDAP_HOSTNAME: 'localhost.localdomain', LDAP_PORT: String(address.port), LDAP_TLS_MODE: mode,
    LDAP_CA_FILE: process.env.TEST_LDAP_CA_FILE, LDAP_BASE_DN: 'dc=example,dc=test',
    LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
    LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test', LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
    LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
  })!;
  const tlsOptions = { ca: [readFileSync(config.caFile)], rejectUnauthorized: true,
    minVersion: 'TLSv1.2' as const, servername: config.hostname };
  const admin = new Client({
    url: (mode === 'ldaps' ? 'ldaps://' : 'ldap://') + config.hostname + ':' + targetPort,
    timeout: 5000, connectTimeout: 5000, autoRebind: false, ...(mode === 'ldaps' ? { tlsOptions } : {}),
  });
  const owned: string[] = [];
  const live = {
    pause: () => { paused = true; },
    outage: (value: boolean) => {
      unavailable = value;
      paused = false;
      for (const socket of sockets) socket.destroy();
    },
    setEligible: async (value: boolean) => {
      await admin.modify(userDn, new Change({ operation: 'replace',
        modification: new Attribute({ type: 'employeeType', values: [value ? 'active' : 'inactive'] }) }));
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => relay.close(error => error ? reject(error) : resolve()));
      try { for (const dn of owned.reverse()) await admin.del(dn); }
      finally { await admin.unbind(); }
    },
  };
  try {
    if (mode === 'starttls') await admin.startTLS(tlsOptions);
    await admin.bind('cn=admin,dc=example,dc=test', 'fixture-admin'); // pragma: allowlist secret
    await admin.add(userDn, { objectClass: 'inetOrgPerson', uid: loginName, cn: 'Transport Fixture',
      sn: 'Fixture', employeeType: 'active', userPassword: ldapPassword }); // pragma: allowlist secret
    owned.push(userDn);
    await admin.add(groupDn, { objectClass: 'groupOfUniqueNames', cn: loginName, uniqueMember: userDn });
    owned.push(groupDn);
    for (const mapping of await ctx.mappings.list()) await ctx.mappings.remove(mapping.id, { userId: ctx.administrator.id });
    const directory = new LdapDirectoryService(config, ctx.container.resolve('logger'));
    const calls = { authenticate: vi.spyOn(directory, 'authenticate'), revalidate: vi.spyOn(directory, 'revalidate') };
    const mappings = new LdapMappingService(ctx.db, config.directoryId, directory);
    await mappings.create((await directory.searchGroups(loginName))[0].subject, 'role-viewer-001', { userId: ctx.administrator.id });
    const ldap = new LdapAuthenticationService(ctx.db, config, directory, mappings, ctx.users);
    await ldap.initialize();
    ctx.container.register('ldapAuthentication', ldap);
    vi.mocked(ctx.container.resolve('config').getLdapConfig).mockReturnValue(config);
    return { ...ctx, config, ldap, mappings, directory: calls, live, releaseDatabase, loginName, loginPassword: ldapPassword };
  } catch (error) {
    await live.close();
    await ctx.database.close();
    await releaseDatabase();
    throw error;
  }
}
