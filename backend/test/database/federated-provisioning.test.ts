import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../src/database/DatabaseService';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService, type FederatedProvisioningInput } from '../../src/services/UserService';
import { resetUserPassword } from '../../src/cli/resetUserPassword';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';

const fixturePassword = 'ValidPass123!'; // pragma: allowlist secret
const ldap: FederatedProvisioningInput = {
  provider: 'ldap', issuer: 'directory', subject: 'immutable-subject',
  loginName: 'alice', dn: 'uid=alice,dc=example', email: 'shared@example.test',
  displayName: 'Alice', firstName: 'Alice', lastName: '', defaultRole: 'none',
};
const entra: FederatedProvisioningInput = {
  provider: 'entra-id', issuer: 'tenant', subject: 'subject', username: 'entra',
  email: 'entra@example.test', displayName: null, firstName: 'Entra', lastName: '', defaultRole: 'configured',
};

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} shared external provisioning`, () => {
    let directory: string;
    let schema: string;
    let control: PostgresAdapter | undefined;
    let database: DatabaseService;
    let db: DatabaseAdapter;
    let reader: DatabaseAdapter;
    let auth: AuthenticationService;
    let users: UserService;
    let other: UserService;

    beforeEach(async () => {
      directory = mkdtempSync(join(tmpdir(), 'pabawi-provisioning-'));
      schema = `provision_${randomUUID().replaceAll('-', '')}`;
      let url = '';
      if (dialect === 'postgres') {
        control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const scoped = new URL(process.env.TEST_DATABASE_URL!);
        scoped.searchParams.set('options', `-csearch_path=${schema}`);
        url = scoped.toString();
      }
      const file = join(directory, 'live.db');
      database = new DatabaseService(file, dialect, url);
      await database.initialize();
      db = database.getAdapter();
      reader = dialect === 'sqlite' ? new SQLiteAdapter(file) : new PostgresAdapter(url);
      await reader.initialize();
      auth = new AuthenticationService(db, 'external-provisioning-fixture-secret', undefined, 4);
      users = new UserService(db, auth);
      other = new UserService(reader, new AuthenticationService(reader, 'external-provisioning-fixture-secret', undefined, 4));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await reader?.close();
      await database?.close();
      if (control) {
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        control = undefined;
      }
      rmSync(directory, { recursive: true, force: true });
    });

    it('converges concurrent first logins across connections without roles, credentials or tokens', async () => {
      await db.execute("DELETE FROM config WHERE key = 'default_new_user_role'");
      const tokenSpy = vi.spyOn(auth, 'generateTokenPair');
      const accounts = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? users : other).createFederatedUser(ldap)));
      expect(new Set(accounts.map(user => user.id)).size).toBe(1);
      expect(accounts[0]).toMatchObject({ localAuthEnabled: 0, passwordHash: null, isAdmin: 0, isActive: 1 });
      expect(accounts[0].username).toMatch(/^ldap:[a-f0-9]{64}$/);
      for (const table of ['users', 'federated_identities', 'ldap_identity_metadata', 'ldap_validation_state']) {
        expect(await db.query(`SELECT * FROM ${table}`)).toHaveLength(1);
      }
      expect(await users.getUserRoles(accounts[0].id)).toEqual([]);
      expect(await db.queryOne('SELECT last_validated_at, validation_generation, config_revision FROM ldap_validation_state'))
        .toMatchObject({ last_validated_at: null, config_revision: '' });
      expect(await db.query('SELECT * FROM oauth_auth_codes')).toEqual([]);
      expect(tokenSpy).not.toHaveBeenCalled();
      expect((await auth.authenticate(accounts[0].username, fixturePassword)).success).toBe(false);
      await users.assignRoleToUser(accounts[0].id, 'role-viewer-001');
      const returning = await users.createFederatedUser(ldap);
      expect(returning.id).toBe(accounts[0].id);
      expect(await users.getUserRoles(returning.id)).toHaveLength(1);
    });

    it('refreshes directory profile and locators without reactivating, changing manual grants or rotating sessions', async () => {
      const user = await users.createFederatedUser(ldap);
      const token = await auth.generateToken(user);
      await users.createFederatedUser({ ...ldap, displayName: 'Updated Directory Name' });
      expect((await auth.verifyToken(token)).userId).toBe(user.id);
      await users.assignRoleToUser(user.id, 'role-viewer-001');
      await users.updateUser(user.id, { isActive: false, isAdmin: true });
      const version = await db.queryOne('SELECT session_version FROM users WHERE id = ?', [user.id]);
      const result = await users.createFederatedUser({ ...ldap, loginName: 'renamed', dn: 'uid=renamed,ou=moved,dc=example',
        email: null, displayName: 'Unsplit Full Name', firstName: '', lastName: '' });
      expect(result).toMatchObject({ id: user.id, username: user.username, email: null, displayName: 'Unsplit Full Name',
        firstName: '', lastName: '', isActive: 0, isAdmin: 1, passwordHash: null });
      expect(await db.queryOne('SELECT session_version FROM users WHERE id = ?', [user.id])).toEqual(version);
      expect(await users.getUserRoles(user.id)).toHaveLength(1);
      expect(await db.queryOne('SELECT login_name, dn FROM ldap_identity_metadata'))
        .toEqual({ login_name: 'renamed', dn: 'uid=renamed,ou=moved,dc=example' });
    });

    it('never links matching local, Entra or LDAP contacts and scopes immutable subjects by directory', async () => {
      const local = await users.createUser({ username: 'alice', email: ldap.email!, password: fixturePassword, firstName: 'Local', lastName: 'User' });
      const external = await users.createFederatedUser(ldap);
      const replacement = await users.createFederatedUser({ ...ldap, subject: 'replacement' });
      const anotherDirectory = await users.createFederatedUser({ ...ldap, issuer: 'another-directory' });
      const noEmail = await users.createFederatedUser({ ...ldap, subject: 'no-email', email: null });
      const federated = await users.createFederatedUser({ ...entra, username: 'another', subject: 'another' });
      const sameContact = await users.createFederatedUser({ ...ldap, subject: 'entra-contact', email: federated.email });
      expect(new Set([local, external, replacement, anotherDirectory, noEmail, sameContact].map(user => user.id)).size).toBe(6);
      expect(new Set([external, replacement, anotherDirectory].map(user => user.username)).size).toBe(3);
      expect(await users.findLocalByEmail(ldap.email!)).toMatchObject({ id: local.id });
      await expect(users.linkFederatedIdentity(local.id, 'ldap', 'subject', 'directory', null))
        .rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_READ_ONLY' });
      await expect(users.linkFederatedIdentity(external.id, 'entra-id', 'subject', 'tenant', null))
        .rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_READ_ONLY' });
    });

    it('enforces profile ownership and CLI password rejection even for a legacy mixed account', async () => {
      const user = await users.createFederatedUser(ldap);
      for (const update of [{ email: 'changed@example.test' }, { firstName: 'Changed' }, { lastName: 'Changed' }, { password: fixturePassword }]) {
        await expect(users.updateUser(user.id, update)).rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_READ_ONLY' });
      }
      await db.execute('UPDATE users SET local_auth_enabled = 1, password_hash = ? WHERE id = ?',
        [await auth.hashPassword(fixturePassword), user.id]);
      await expect(users.updateUser(user.id, { password: fixturePassword })).rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_READ_ONLY' });
      await expect(resetUserPassword({ db, userService: users, authService: auth, auditLogger: new AuditLoggingService(db) },
        { username: user.username, password: fixturePassword, activate: true })).rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_READ_ONLY' });
      expect((await users.getUserById(user.id))?.email).toBe(ldap.email);
    });

    it('preserves Entra defaults, returning profiles and explicitly enrolled local credentials', async () => {
      const user = await users.createFederatedUser(entra);
      expect(await users.getUserRoles(user.id)).toHaveLength(1);
      const returning = await users.createFederatedUser({ ...entra, email: 'changed@example.test', firstName: 'Changed' });
      expect(returning).toMatchObject({ id: user.id, email: entra.email, firstName: entra.firstName });
      const local = await users.createUser({ username: 'local', email: 'local@example.test', password: fixturePassword, firstName: 'Local', lastName: 'User' });
      await users.linkFederatedIdentity(local.id, 'entra-id', 'enrolled', 'tenant', local.email);
      const enrolled = await users.createFederatedUser({ ...entra, subject: 'enrolled', username: 'unused' });
      expect(enrolled).toMatchObject({ id: local.id, passwordHash: local.passwordHash, localAuthEnabled: 1 });
    });

    it('serializes Entra contact collisions inside the shared transaction', async () => {
      const results = await Promise.allSettled([users, other].map((service, i) => service.createFederatedUser({
        ...entra, subject: `subject-${String(i)}`, username: `entra_${String(i)}`,
      })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'IDENTITY_COLLISION' } });
      expect(await db.query('SELECT * FROM users')).toHaveLength(1);
    });

    it('rolls back account and identity if metadata creation fails', async () => {
      const execute = db.execute.bind(db);
      vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO ldap_identity_metadata')) throw new Error('metadata write failed');
        return execute(sql, params);
      });
      await expect(users.createFederatedUser(ldap)).rejects.toThrow('metadata write failed');
      for (const table of ['users', 'federated_identities', 'ldap_directory_state', 'ldap_validation_state', 'user_roles']) {
        expect(await db.query(`SELECT * FROM ${table}`)).toEqual([]);
      }
      vi.restoreAllMocks();
      await expect(users.createFederatedUser(ldap)).resolves.toMatchObject({ localAuthEnabled: 0 });
    });

    it('rejects missing immutable identity or locators without creating accounts', async () => {
      for (const input of [{ ...ldap, subject: '' }, { ...ldap, issuer: ' ' }, { ...ldap, loginName: '' }, { ...ldap, dn: '' }]) {
        await expect(users.createFederatedUser(input)).rejects.toMatchObject({ code: 'INVALID_EXTERNAL_IDENTITY' });
      }
      expect(await db.query('SELECT * FROM users')).toEqual([]);
    });
  });
}
