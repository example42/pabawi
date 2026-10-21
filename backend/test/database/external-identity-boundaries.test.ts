import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../src/database/DatabaseService';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { UserService } from '../../src/services/UserService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { PermissionService } from '../../src/services/PermissionService';
import { EntraIdService, type IdTokenClaims } from '../../src/services/EntraIdService';
import { RoleService } from '../../src/services/RoleService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';

const migrations = join(__dirname, '../../src/database/migrations');
const databaseUrl = process.env.TEST_DATABASE_URL;
const issuer = 'https://login.microsoftonline.com/tenant/v2.0';
const fixturePassword = 'ValidPass123!'; // pragma: allowlist secret
const fixtureClientSecret = 'fixture'; // pragma: allowlist secret
const claims: IdTokenClaims = { sub: 'subject', iss: issuer, aud: 'client', exp: 9999999999,
  nonce: 'nonce', email: 'entra@example.test', preferred_username: 'entrauser', given_name: 'Entra', family_name: 'User' };

async function externalUser(db: DatabaseAdapter, id: string, email: string | null = null): Promise<void> {
  await db.execute(`INSERT INTO users
    (id, username, email, password_hash, local_auth_enabled, first_name, last_name, created_at, updated_at)
    VALUES (?, ?, ?, NULL, 0, '', '', 'now', 'now')`, [id, `ldap:${id}`, email]);
}

async function identity(db: DatabaseAdapter, id: string, user: string, provider = 'ldap', scope = 'directory'): Promise<void> {
  await db.execute(`INSERT INTO federated_identities (id, user_id, provider, issuer, subject, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'now', 'now')`, [id, user, provider, scope, id]);
}

async function ldapIdentity(db: DatabaseAdapter, id = 'ldap', user = 'external'): Promise<void> {
  await identity(db, id, user);
  await db.execute(`INSERT INTO ldap_directory_state (directory_id) VALUES ('directory') ON CONFLICT DO NOTHING`);
  await db.execute(`INSERT INTO ldap_identity_metadata (identity_id, directory_id, login_name, dn)
    VALUES (?, 'directory', 'login', 'uid=login,dc=example')`, [id]);
}

async function mapping(db: DatabaseAdapter, id: string): Promise<void> {
  await db.execute(`INSERT INTO external_group_mappings
    (id, directory_id, group_subject, group_dn, group_name, role_id, created_at, updated_at)
    VALUES (?, 'directory', ?, ?, ?, 'role-viewer-001', 'now', 'now')`, [id, id, `cn=${id},dc=example`, id]);
}

async function grant(db: DatabaseAdapter, mappingId: string): Promise<void> {
  await db.execute(`INSERT INTO federated_user_roles (user_id, role_id, identity_id, source_key, mapping_id, directory_id)
    VALUES ('external', 'role-viewer-001', 'ldap', ?, ?, 'directory')`, [`mapping:${mappingId}`, mappingId]);
}

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: external identity boundaries`, () => {
    let dir: string;
    let url: string;
    let control: PostgresAdapter | undefined;
    let database: DatabaseService;
    let db: DatabaseAdapter;
    let reader: DatabaseAdapter;
    let users: UserService;
    let auth: AuthenticationService;
    let entra: EntraIdService;
    let schema: string;

    beforeEach(async () => {
      dir = mkdtempSync(join(tmpdir(), 'pabawi-ldap-schema-'));
      schema = `ldap_${randomUUID().replaceAll('-', '')}`;
      url = '';
      if (dialect === 'postgres' && databaseUrl) {
        control = new PostgresAdapter(databaseUrl);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const scoped = new URL(databaseUrl);
        scoped.searchParams.set('options', `-csearch_path=${schema}`);
        url = scoped.toString();
      }
      database = new DatabaseService(join(dir, 'live.db'), dialect, url);
      await database.initialize();
      db = database.getAdapter();
      reader = dialect === 'sqlite' ? new SQLiteAdapter(join(dir, 'live.db')) : new PostgresAdapter(url);
      await reader.initialize();
      auth = new AuthenticationService(db, 'external-identity-fixture-secret');
      users = new UserService(db, auth);
      entra = new EntraIdService(db, { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: fixtureClientSecret,
        redirectUri: 'http://localhost/callback', scopes: ['openid'], groupMapping: { A: 'Viewer', B: 'Viewer' }, jwksCacheTtlMs: 1000 },
      auth, users, new RoleService(db), new AuditLoggingService(db), new LoggerService());
    });

    afterEach(async () => {
      await reader?.close();
      await database?.close();
      if (control) {
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        control = undefined;
      }
      rmSync(dir, { recursive: true, force: true });
    });

    it('allows null and duplicate external emails while local lookup and uniqueness remain unambiguous', async () => {
      await externalUser(db, 'one');
      await externalUser(db, 'two');
      await externalUser(db, 'three', 'shared@example.test');
      await externalUser(db, 'four', 'shared@example.test');
      expect((await users.getUserById('one'))?.passwordHash).toBeNull();
      expect(users.toUserDTO((await users.getUserById('one'))!).email).toBeNull();
      expect(await users.findLocalByEmail('shared@example.test')).toBeNull();
      const local = await users.createUser({ username: 'local', email: 'shared@example.test', password: fixturePassword, firstName: 'Local', lastName: 'User' });
      expect((await users.findLocalByEmail('shared@example.test'))?.id).toBe(local.id);
      expect(await users.findAllByEmail('shared@example.test')).toHaveLength(3);
      await expect(users.createUser({ username: 'another', email: 'shared@example.test', password: fixturePassword, firstName: '', lastName: '' })).rejects.toThrow('Email already exists');
      await expect(db.execute(`INSERT INTO users (id, username, email, first_name, last_name, created_at, updated_at)
        VALUES ('duplicate', 'duplicate', 'shared@example.test', '', '', 'now', 'now')`)).rejects.toThrow();
      await expect(db.execute(`UPDATE users SET email = NULL WHERE id = ?`, [local.id])).rejects.toThrow();
      await expect(db.execute(`UPDATE users SET password_hash = ? WHERE id = 'one'`, ['hash'])).rejects.toThrow();
      expect((await auth.authenticate('local', fixturePassword)).success).toBe(true);
      expect((await auth.authenticate('ldap:one', fixturePassword)).success).toBe(false);
      await expect(users.createUser({ username: 'LDAP:reserved', email: 'reserved@example.test', password: fixturePassword, firstName: '', lastName: '' })).rejects.toThrow('reserved');
    });

    it('preserves Entra collision rejection with any email match and permits missing contact email', async () => {
      await externalUser(db, 'one', claims.email);
      await externalUser(db, 'two', claims.email);
      await expect(entra.provisionUser(claims)).rejects.toMatchObject({ code: 'IDENTITY_COLLISION' });
      expect(await db.query('SELECT id FROM federated_identities')).toEqual([]);
      for (const name of ['first', 'second']) {
        const user = await entra.provisionUser({ ...claims, sub: name, email: '', preferred_username: name });
        expect(user.email).toBeNull();
        expect(user.localAuthEnabled).toBe(0);
        expect(await users.getUserRoles(user.id)).toHaveLength(1);
      }
    });

    it('keys identities by provider, issuer and subject and preserves identity during locator changes', async () => {
      await externalUser(db, 'external');
      await ldapIdentity(db);
      await identity(db, 'other', 'external', 'ldap', 'other-directory');
      await db.execute(`UPDATE federated_identities SET subject = 'ldap' WHERE id = 'other'`);
      await expect(identity(db, 'third', 'external')).resolves.toBeUndefined();
      await expect(db.execute(`UPDATE federated_identities SET subject = 'ldap' WHERE id = 'third'`)).rejects.toThrow();
      expect((await users.findByFederatedIdentity('ldap', 'ldap', 'directory'))?.id).toBe('external');
      const originalVersion = await db.queryOne('SELECT session_version FROM users WHERE id = ?', ['external']);
      await db.execute(`UPDATE ldap_identity_metadata SET login_name = 'renamed', dn = 'uid=renamed,ou=moved,dc=example' WHERE identity_id = 'ldap'`);
      await db.execute(`UPDATE users SET display_name = 'Single Display Name', first_name = '', last_name = '', email = NULL, updated_at = 'later' WHERE id = 'external'`);
      expect(await db.queryOne('SELECT session_version FROM users WHERE id = ?', ['external'])).toEqual(originalVersion);
      expect((await users.getUserById('external'))?.displayName).toBe('Single Display Name');
      await externalUser(db, 'replacement');
      await ldapIdentity(db, 'new-object', 'replacement');
      expect((await users.findByFederatedIdentity('ldap', 'new-object', 'directory'))?.id).toBe('replacement');
      await expect(db.execute(`UPDATE ldap_identity_metadata SET directory_id = 'other-directory' WHERE identity_id = 'ldap'`)).rejects.toThrow();
    });

    it('preserves explicit Entra password administration and rejects local credentials for LDAP identities', async () => {
      const user = await entra.provisionUser(claims);
      expect((await auth.authenticate(user.username, fixturePassword)).success).toBe(false);
      await users.updateUser(user.id, { password: fixturePassword });
      expect((await users.getUserById(user.id))?.localAuthEnabled).toBe(1);
      expect((await auth.authenticate(user.username, fixturePassword)).success).toBe(true);
      expect((await entra.provisionUser(claims)).id).toBe(user.id);
      await externalUser(db, 'external');
      await ldapIdentity(db);
      await expect(users.updateUser('external', { password: fixturePassword })).rejects.toThrow('cannot have local passwords');
      expect((await users.getUserById('external'))?.passwordHash).toBeNull();
      await expect(auth.generateTokenPair({ id: 'external', username: 'ldap:external' }, { provider: 'local', identityId: null }))
        .rejects.toThrow('Invalid token');
      const contactless = await entra.provisionUser({ ...claims, sub: 'contactless', email: '', preferred_username: 'contactless' });
      const contactlessIdentity = await db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [contactless.id]);
      const { refreshToken } = await auth.generateTokenPair(contactless, { provider: 'entra-id', identityId: contactlessIdentity!.id });
      expect((await auth.refreshToken(refreshToken)).user?.email).toBeNull();
    });

    it('serializes concurrent Entra email collision checks after removal of the global email index', async () => {
      const readerAuth = new AuthenticationService(reader, 'external-identity-fixture-secret');
      const otherEntra = new EntraIdService(reader, { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: fixtureClientSecret,
        redirectUri: 'http://localhost/callback', scopes: ['openid'], groupMapping: null, jwksCacheTtlMs: 1000 },
      readerAuth, new UserService(reader, readerAuth), new RoleService(reader), new AuditLoggingService(reader), new LoggerService());
      const results = await Promise.allSettled([entra, otherEntra].map((service, index) => service.provisionUser({
        ...claims, sub: `subject-${String(index)}`, preferred_username: `user_${String(index)}`,
      })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect(await users.findAllByEmail(claims.email)).toHaveLength(1);
      expect(await db.query('SELECT id FROM federated_identities')).toHaveLength(1);
    });

    it('deduplicates effective roles while preserving mapping, manual and other identity provenance', async () => {
      await externalUser(db, 'external');
      await ldapIdentity(db);
      await identity(db, 'entra', 'external', 'entra-id', issuer);
      await identity(db, 'another-entra', 'external', 'entra-id', issuer);
      await db.execute(`INSERT INTO federated_user_roles (user_id, role_id, identity_id, source_key)
        VALUES ('external', 'role-viewer-001', 'another-entra', 'other-source')`);
      await mapping(db, 'one');
      await mapping(db, 'two');
      await grant(db, 'one');
      await grant(db, 'two');
      await entra.syncGroupRoles('entra', ['A', 'B']);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(5);
      expect(await users.getUserRoles('external')).toHaveLength(1);
      await entra.syncGroupRoles('entra', []);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(3);
      await db.execute(`INSERT INTO user_roles VALUES ('external', 'role-viewer-001', 'now')`);
      const permissions = new PermissionService(reader);
      expect(await permissions.hasPermission('external', 'executions', 'read')).toBe(true);
      await db.execute(`DELETE FROM external_group_mappings WHERE id = 'one'`);
      expect(await db.query(`SELECT mapping_id FROM federated_user_roles WHERE identity_id = 'ldap'`)).toEqual([{ mapping_id: 'two' }]);
      expect(await permissions.hasPermission('external', 'executions', 'read')).toBe(true);
      await db.execute(`UPDATE external_group_mappings SET enabled = 0 WHERE id = 'two'`);
      expect(await db.query(`SELECT * FROM federated_user_roles WHERE identity_id = 'ldap'`)).toEqual([]);
      await db.execute(`DELETE FROM federated_identities WHERE id = 'another-entra'`);
      expect(await permissions.hasPermission('external', 'executions', 'read')).toBe(true);
      await db.execute(`DELETE FROM user_roles WHERE user_id = 'external'`);
      expect(await permissions.hasPermission('external', 'executions', 'read')).toBe(false);
      await expect(entra.syncGroupRoles('ldap', ['A'])).rejects.toThrow('identity is missing');
    });

    it('enforces grant ownership and invalidates persisted validation on mapping changes across connections', async () => {
      await externalUser(db, 'external');
      await externalUser(db, 'other-user');
      await ldapIdentity(db);
      await mapping(db, 'one');
      await grant(db, 'one');
      await db.execute(`INSERT INTO ldap_validation_state
        (identity_id, last_validated_at, validation_generation, mapping_revision, config_revision)
        VALUES ('ldap', 1000, 3, 1, 'config')`);
      await db.execute(`INSERT INTO ldap_validation_leases (identity_id, lease_owner, lease_expires_at, fencing_generation)
        VALUES ('ldap', 'process', 2000, 4)`);
      await expect(db.execute(`UPDATE federated_user_roles SET user_id = 'other-user'`)).rejects.toThrow();
      await expect(db.execute(`UPDATE federated_user_roles SET directory_id = 'other-directory'`)).rejects.toThrow();
      const before = await reader.queryOne<{ revision: string }>('SELECT revision FROM authorization_state');
      await db.execute(`UPDATE external_group_mappings SET group_dn = 'cn=moved,dc=example' WHERE id = 'one'`);
      expect(String((await reader.queryOne<{ mapping_revision: string }>('SELECT mapping_revision FROM ldap_directory_state'))?.mapping_revision)).toBe('2');
      expect(await reader.queryOne('SELECT last_validated_at FROM ldap_validation_state')).toEqual({ last_validated_at: null });
      expect(await reader.queryOne('SELECT revision FROM authorization_state')).not.toEqual(before);
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
      await grant(db, 'one');
      await db.execute(`UPDATE external_group_mappings SET role_id = 'role-operator-001' WHERE id = 'one'`);
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
      await expect(db.withTransaction(async () => {
        await db.execute(`DELETE FROM external_group_mappings WHERE id = 'one'`);
        throw new Error('rollback mapping');
      })).rejects.toThrow('rollback mapping');
      expect(String((await reader.queryOne<{ mapping_revision: string }>('SELECT mapping_revision FROM ldap_directory_state'))?.mapping_revision)).toBe('3');
      await db.execute(`DELETE FROM users WHERE id = 'external'`);
      for (const table of ['federated_identities', 'ldap_identity_metadata', 'ldap_validation_state', 'ldap_validation_leases']) {
        expect(await db.query(`SELECT * FROM ${table}`)).toEqual([]);
      }
      if (dialect === 'sqlite') expect(await db.query('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('upgrades a populated migration-030 database preserving enrollments and relationships with intentional session invalidation', async () => {
      // Use a second isolated schema/file so the fixture really predates migration 031.
      const partial = join(dir, 'migrations');
      mkdirSync(partial);
      for (const file of readdirSync(migrations)) {
        if (file.slice(0, 3) <= '030') copyFileSync(join(migrations, file), join(partial, file));
      }
      const upgradeSchema = `${schema}_upgrade`;
      if (control) await control.execute(`CREATE SCHEMA ${upgradeSchema}`);
      const upgradeUrl = new URL(url || 'postgresql://localhost/unused');
      upgradeUrl.searchParams.set('options', `-csearch_path=${upgradeSchema}`);
      const old = dialect === 'sqlite' ? new SQLiteAdapter(join(dir, 'upgrade.db')) : new PostgresAdapter(upgradeUrl.toString());
      await old.initialize();
      try {
        await new MigrationRunner(old, partial).runPendingMigrations();
        for (const [id, password] of [['local', 'hash'], ['enrolled', 'hash'], ['federated', null], ['detached', null]]) {
          await old.execute(`INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at, session_version)
            VALUES (?, ?, ?, ?, '', '', 'now', 'now', 'abc123')`, [id, id, `${id}@example.test`, password]);
        }
        for (const user of ['enrolled', 'federated']) {
          await identity(old, `${user}-identity`, user, 'entra-id', issuer);
          await old.execute(`INSERT INTO federated_user_roles VALUES (?, 'role-viewer-001')`, [user]);
        }
        await old.execute(`INSERT INTO federated_user_roles VALUES ('detached', 'role-viewer-001')`);
        await old.execute(`INSERT INTO user_roles VALUES ('enrolled', 'role-operator-001', 'now')`);
        await old.execute(`INSERT INTO legacy_federated_user_roles VALUES ('enrolled', 'role-operator-001')`);
        await old.execute(`INSERT INTO groups VALUES ('group', 'group', '', 'now', 'now')`);
        await old.execute(`INSERT INTO user_groups VALUES ('enrolled', 'group', 'now')`);
        await old.execute(`INSERT INTO revoked_tokens VALUES ('token', 'enrolled', 'now', 'later')`);
        await old.execute(`INSERT INTO audit_logs (id, timestamp, event_type, "action", user_id, result)
          VALUES ('audit', 'now', 'auth', 'login_success', 'enrolled', 'success')`);
        await old.execute(`INSERT INTO journal_entries (id, node_id, node_uri, event_type, source, "action", summary, user_id, timestamp)
          VALUES ('journal', 'n1', 'ssh://n1', 'note', 'user', 'note', 'fixture', 'enrolled', 'now')`);
        const tables = ['federated_identities', 'user_groups', 'legacy_federated_user_roles', 'revoked_tokens', 'audit_logs', 'journal_entries'];
        const before = await Promise.all(tables.map(table => old.query(`SELECT * FROM ${table}`)));
        const accountColumns = 'id, username, email, password_hash, is_active, is_admin, first_name, last_name, created_at, updated_at, last_login_at';
        const accountsBefore = await old.query(`SELECT ${accountColumns} FROM users ORDER BY id`);
        const permissionsBefore = await old.query('SELECT * FROM effective_user_roles ORDER BY user_id, role_id');
        await new MigrationRunner(old).runPendingMigrations();
        expect(await old.query(`SELECT ${accountColumns} FROM users ORDER BY id`)).toEqual(accountsBefore);
        expect(await old.query("SELECT id FROM users WHERE session_version = 'abc123'")).toEqual([]);
        expect(await Promise.all(tables.map(table => old.query(`SELECT * FROM ${table}`)))).toEqual(before);
        expect(await old.query('SELECT * FROM effective_user_roles ORDER BY user_id, role_id')).toEqual(permissionsBefore);
        expect(await old.query('SELECT user_id, identity_id, source_key FROM federated_user_roles ORDER BY user_id')).toEqual([
          { user_id: 'enrolled', identity_id: 'enrolled-identity', source_key: 'legacy' },
          { user_id: 'federated', identity_id: 'federated-identity', source_key: 'legacy' },
        ]);
        expect(await old.query('SELECT id, local_auth_enabled FROM users ORDER BY id')).toEqual([
          { id: 'detached', local_auth_enabled: 0 }, { id: 'enrolled', local_auth_enabled: 1 },
          { id: 'federated', local_auth_enabled: 0 }, { id: 'local', local_auth_enabled: 1 },
        ]);
        const oldAuth = new AuthenticationService(old, 'upgrade-fixture-secret');
        const token = await oldAuth.generateToken({ id: 'enrolled', username: 'enrolled' }, { provider: 'local', identityId: null });
        await old.execute(`UPDATE users SET display_name = 'Changed' WHERE id = 'enrolled'`);
        await expect(oldAuth.verifyToken(token)).resolves.toBeDefined();
        await old.execute(`UPDATE users SET password_hash = ? WHERE id = 'enrolled'`, ['changed']);
        await expect(oldAuth.verifyToken(token)).rejects.toThrow('revoked');
        expect((await new MigrationRunner(old).getStatus()).pending).toEqual([]);
        if (dialect === 'sqlite') {
          expect(await old.query('PRAGMA foreign_key_check')).toEqual([]);
          expect(await old.query('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
        }
      } finally {
        await old.close();
        if (control) await control.execute(`DROP SCHEMA ${upgradeSchema} CASCADE`);
      }
    });
  });
}

describe('SQLite migration 031 rollback', () => {
  it('restores the pre-upgrade schema and foreign keys after a rebuild fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pabawi-ldap-rollback-'));
    const db = new SQLiteAdapter(join(dir, 'live.db'));
    await db.initialize();
    try {
      for (const file of readdirSync(migrations)) {
        if (file.slice(0, 3) <= '030') copyFileSync(join(migrations, file), join(dir, file));
      }
      await new MigrationRunner(db, dir).runPendingMigrations();
      await db.execute(`INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at)
        VALUES ('user', 'user', 'user@example.test', 'hash', '', '', 'now', 'now')`);
      await identity(db, 'entra', 'user', 'entra-id', issuer);
      await db.execute(`INSERT INTO federated_user_roles VALUES ('user', 'role-viewer-001')`);
      const filename = '031_external_identity_boundaries.sqlite.sql';
      writeFileSync(join(dir, filename), `${readFileSync(join(migrations, filename), 'utf8')}\n-- pabawi:statement-breakpoint\nINSERT INTO missing_table VALUES (1);`);
      await expect(new MigrationRunner(db, dir).runPendingMigrations()).rejects.toThrow('missing_table');
      expect(await db.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
      expect(await db.query('SELECT * FROM effective_user_roles')).toEqual([{ user_id: 'user', role_id: 'role-viewer-001' }]);
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([{ user_id: 'user', role_id: 'role-viewer-001' }]);
      expect(await db.query("SELECT * FROM migrations WHERE id = '031'")).toEqual([]);
      await new MigrationRunner(db).runPendingMigrations();
      expect(await db.query('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
