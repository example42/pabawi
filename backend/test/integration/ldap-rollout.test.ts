import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { Attribute, Change, Client } from 'ldapts';
import { DatabaseService } from '../../src/database/DatabaseService';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { createDefaultContainer, resolveAuthenticationService } from '../../src/container/DIContainer';
import { parseLdapConfig } from '../../src/config/ldap';
import { LdapDirectoryService } from '../../src/services/LdapDirectoryService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { LdapAuthenticationService } from '../../src/services/LdapAuthenticationService';
import { UserService } from '../../src/services/UserService';
import { createAuthRouter } from '../../src/routes/auth';
import { createAuthMiddleware } from '../../src/middleware/authMiddleware';
import { inputSanitizationMiddleware } from '../../src/middleware/securityMiddleware';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const ready = !!(process.env.TEST_LDAP_LDAPS_PORT && process.env.TEST_LDAP_STARTTLS_PORT && process.env.TEST_LDAP_CA_FILE);
const password = 'fixture-user'; // pragma: allowlist secret
const viewer = 'role-viewer-001';
const people = 'ou=people,dc=example,dc=test';
const groups = 'ou=groups,dc=example,dc=test';
interface Pair { token: string; refreshToken: string; user: { id: string; displayName: string; email: string | null } }

for (const dialect of ['sqlite', 'postgres'] as const) {
  for (const mode of ['ldaps', 'starttls'] as const) {
    describe.skipIf(!ready || (dialect === 'postgres' && !process.env.TEST_DATABASE_URL))(
      `real OpenLDAP rollout: ${dialect} / ${mode}`, () => {
        let database: DatabaseService;
        let control: PostgresAdapter | undefined;
        let schema: string;
        let harness: HttpHarness;
        let admin: Client;
        const owned = new Set<string>();

        beforeAll(async () => { harness = await createHttpHarness(); });
        afterAll(async () => { await harness.close(); });
        beforeEach(() => {
          vi.stubEnv('JWT_SECRET', 'ldap-rollout-fixture-signing-secret-key'); // pragma: allowlist secret
          vi.stubEnv('LDAP_ENABLED', 'false');
          vi.stubEnv('ENTRA_ID_ENABLED', 'false');
        });
        afterEach(async () => {
          try {
            // Only entries created by this case are removed; shared seed accounts stay intact.
            for (const dn of [...owned].reverse()) {
              await admin.del(dn);
              owned.delete(dn);
            }
          } finally {
            await admin?.unbind();
            await database?.close();
            if (control) {
              await control.execute(`DROP SCHEMA ${schema} CASCADE`);
              await control.close();
              control = undefined;
            }
            vi.restoreAllMocks();
            vi.unstubAllEnvs();
          }
        });

        it('preserves immutable identities through moves, withdraws recreated-group grants and makes observed policy revocation terminal', async () => {
          const key = 'rollout-' + randomUUID();
          const originalLogin = key;
          const movedLogin = key + '-moved';
          const branch = `ou=${key},${people}`;
          let userDn = `uid=${originalLogin},${people}`;
          let groupDn = `cn=${key},${groups}`;
          const config = parseLdapConfig({
            LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'rollout-fixture', LDAP_DIRECTORY_TYPE: 'openldap',
            LDAP_HOSTNAME: 'localhost.localdomain', LDAP_TLS_MODE: mode,
            LDAP_PORT: mode === 'ldaps' ? process.env.TEST_LDAP_LDAPS_PORT : process.env.TEST_LDAP_STARTTLS_PORT,
            LDAP_CA_FILE: process.env.TEST_LDAP_CA_FILE, LDAP_BASE_DN: 'dc=example,dc=test',
            LDAP_USER_RDN: 'ou=people', LDAP_GROUP_RDN: 'ou=groups',
            LDAP_LOOKUP_USER: 'cn=reader,dc=example,dc=test',
            LDAP_LOOKUP_PASSWORD: 'fixture-reader', // pragma: allowlist secret
            LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)',
          })!;
          const tlsOptions = { ca: [readFileSync(config.caFile)], minVersion: 'TLSv1.2' as const,
            rejectUnauthorized: true, servername: config.hostname };
          admin = new Client({
            url: `${mode === 'ldaps' ? 'ldaps' : 'ldap'}://${config.hostname}:${config.port}`,
            timeout: 5000, connectTimeout: 5000, autoRebind: false,
            ...(mode === 'ldaps' ? { tlsOptions } : {}),
          });
          if (mode === 'starttls') await admin.startTLS(tlsOptions);
          await admin.bind('cn=admin,dc=example,dc=test', 'fixture-admin'); // pragma: allowlist secret
          await admin.add(branch, { objectClass: 'organizationalUnit', ou: key });
          owned.add(branch);
          async function addUser(login: string) {
            await admin.add(userDn, { objectClass: 'inetOrgPerson', uid: login, cn: 'Rollout Fixture',
              sn: 'Fixture', employeeType: 'active', userPassword: password }); // pragma: allowlist secret
            owned.add(userDn);
          }
          async function addGroup() {
            await admin.add(groupDn, { objectClass: 'groupOfUniqueNames',
              cn: groupDn.slice(3, groupDn.indexOf(',')), uniqueMember: userDn });
            owned.add(groupDn);
          }
          async function replace(dn: string, type: string, values: string[]) {
            await admin.modify(dn, new Change({ operation: 'replace', modification: new Attribute({ type, values }) }));
          }
          await addUser(originalLogin);
          await addGroup();

          let url: string | undefined;
          if (dialect === 'postgres') {
            schema = 'ldaprollout_' + randomUUID().replaceAll('-', '');
            control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
            await control.initialize();
            await control.execute(`CREATE SCHEMA ${schema}`);
            const scoped = new URL(process.env.TEST_DATABASE_URL!);
            scoped.searchParams.set('options', `-csearch_path=${schema}`);
            url = scoped.toString();
          }
          database = new DatabaseService(':memory:', dialect, url);
          await database.initialize();
          const db = database.getAdapter();
          const container = createDefaultContainer();
          vi.spyOn(container.resolve('config'), 'getLdapConfig').mockReturnValue(config);
          const auth = resolveAuthenticationService(db, container);
          const users = new UserService(db, auth);
          const administrator = await users.createUser({ username: 'rolloutadmin', email: 'rollout@example.test',
            password: 'LocalFixture123!', firstName: '', lastName: '', isAdmin: true }); // pragma: allowlist secret
          const directory = new LdapDirectoryService(config, container.resolve('logger'));
          const mappings = new LdapMappingService(db, config.directoryId, directory);
          const ldap = new LdapAuthenticationService(db, config, directory, mappings, users);
          await ldap.initialize();
          container.register('ldapAuthentication', ldap);
          const app = express();
          app.use(express.json(), inputSanitizationMiddleware);
          app.use('/api/auth', createAuthRouter(database, container));
          app.get('/protected', createAuthMiddleware(auth), (_req, res) => { res.json({ ok: true }); });
          const server = harness.use(app);
          const login = (username: string) => request(server).post('/api/auth/ldap/login').send({ username, password });
          const refresh = (pair: Pair) => request(server).post('/api/auth/refresh').send({ refreshToken: pair.refreshToken });
          const protectedRequest = (pair: Pair) => request(server).get('/protected').set('Authorization', `Bearer ${pair.token}`);
          const actor = { userId: administrator.id };

          const denied = await login(originalLogin).expect(403);
          expect(denied.body.token).toBeUndefined();
          expect(denied.body.refreshToken).toBeUndefined();
          const identity = await db.queryOne<{ id: string; user_id: string; subject: string }>(
            "SELECT id, user_id, subject FROM federated_identities WHERE provider = 'ldap'");
          expect(identity).not.toBeNull();
          expect(await users.getUserRoles(identity!.user_id)).toEqual([]);
          await users.assignRoleToUser(identity!.user_id, viewer);
          const manual: Pair = (await login(originalLogin).expect(200)).body;
          expect(manual.user).toMatchObject({ id: identity!.user_id, email: null });
          await request(server).post('/api/auth/login').send({ username: originalLogin, password }).expect(401);

          const group = (await directory.searchGroups(key))[0];
          await mappings.create(group.subject, viewer, actor);
          const mapped: Pair = (await refresh(manual).expect(200)).body;
          await users.removeRoleFromUser(manual.user.id, viewer);
          await protectedRequest(manual).expect(200);
          expect(await db.query('SELECT * FROM federated_user_roles WHERE user_id = ?', [manual.user.id])).toHaveLength(1);

          const movedDn = `uid=${movedLogin},${branch}`;
          await admin.modifyDN(userDn, movedDn);
          owned.delete(userDn);
          userDn = movedDn;
          owned.add(userDn);
          await replace(groupDn, 'uniqueMember', [userDn]);
          await replace(userDn, 'displayName', ['Moved Fixture']);
          const moved: Pair = (await refresh(mapped).expect(200)).body;
          expect(moved.user).toMatchObject({ id: manual.user.id, displayName: 'Moved Fixture', email: null });
          expect(await db.queryOne('SELECT subject FROM federated_identities WHERE id = ?', [identity!.id]))
            .toEqual({ subject: identity!.subject });
          expect(await db.queryOne('SELECT login_name, dn FROM ldap_identity_metadata WHERE identity_id = ?', [identity!.id]))
            .toEqual({ login_name: movedLogin, dn: userDn });
          await protectedRequest(manual).expect(200);
          await login(originalLogin).expect(401);

          await replace(userDn, 'employeeType', ['inactive']);
          await refresh(moved).expect(403);
          await replace(userDn, 'employeeType', ['active']);
          const recovered: Pair = (await login(movedLogin).expect(200)).body;
          await protectedRequest(moved).expect(401);
          await refresh(moved).expect(401);
          await protectedRequest(recovered).expect(200);

          const renamedGroup = `cn=${key}-renamed,${groups}`;
          await admin.modifyDN(groupDn, renamedGroup);
          owned.delete(groupDn);
          groupDn = renamedGroup;
          owned.add(groupDn);
          const renamed: Pair = (await refresh(recovered).expect(200)).body;
          expect((await directory.resolveGroup(group.subject)).dn).toBe(groupDn);
          await admin.del(groupDn);
          owned.delete(groupDn);
          await addGroup();
          const replacement = (await directory.searchGroups(key))[0];
          expect(replacement.subject).not.toBe(group.subject);
          await refresh(renamed).expect(403);
          expect(await db.query('SELECT * FROM federated_user_roles WHERE user_id = ?', [manual.user.id])).toEqual([]);
          await login(movedLogin).expect(403);
          await mappings.create(replacement.subject, viewer, actor);
          const remapped: Pair = (await login(movedLogin).expect(200)).body;
          expect(remapped.user.id).toBe(manual.user.id);
          await protectedRequest(renamed).expect(401);

          await admin.del(userDn);
          owned.delete(userDn);
          await refresh(remapped).expect(403);
          await addUser(movedLogin);
          const recreated: Pair = (await login(movedLogin).expect(200)).body;
          expect(recreated.user.id).not.toBe(manual.user.id);
          expect(await db.queryOne('SELECT subject FROM federated_identities WHERE user_id = ?', [recreated.user.id]))
            .not.toEqual({ subject: identity!.subject });
          expect(await db.query('SELECT * FROM user_roles WHERE user_id = ?', [recreated.user.id])).toEqual([]);
          await protectedRequest(remapped).expect(401);
          await protectedRequest(recreated).expect(200);
          await request(server).post('/api/auth/login').send({ username: 'rolloutadmin', password: 'LocalFixture123!' }).expect(200); // pragma: allowlist secret
        }, 30000);
      });
  }
}
