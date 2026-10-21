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
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { LdapMappingService, type LdapMapping } from '../../src/services/LdapMappingService';
import { LdapDirectoryError } from '../../src/services/LdapDirectoryService';

const groupSubject = '10112233-4455-6677-8899-aabbccddeeff';
const anotherGroup = '20112233-4455-6677-8899-aabbccddeeff';
const group = { subject: groupSubject, dn: 'cn=operators,dc=example', name: 'Operators' };
const actor = { userId: 'administrator' };
const viewer = 'role-viewer-001';

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} LDAP mapping administration`, () => {
    let directory: string;
    let schema: string;
    let control: PostgresAdapter | undefined;
    let database: DatabaseService;
    let db: DatabaseAdapter;
    let reader: DatabaseAdapter;
    let mappings: LdapMappingService;
    let other: LdapMappingService;
    let resolveGroup: ReturnType<typeof vi.fn>;
    let userId: string;
    let identityId: string;

    beforeEach(async () => {
      directory = mkdtempSync(join(tmpdir(), 'pabawi-ldap-mappings-'));
      schema = `mapping_${randomUUID().replaceAll('-', '')}`;
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
      const users = new UserService(db, new AuthenticationService(db, 'ldap-mapping-fixture-jwt-secret-for-tests'));
      userId = (await users.createFederatedUser({ provider: 'ldap', issuer: 'directory', subject: 'user-subject',
        loginName: 'alice', dn: 'uid=alice,dc=example', displayName: 'Alice', email: null,
        firstName: '', lastName: '', defaultRole: 'none' })).id;
      identityId = (await db.queryOne<{ id: string }>("SELECT id FROM federated_identities WHERE user_id = ?", [userId]))!.id;
      await db.execute(`INSERT INTO users (id, username, email, first_name, last_name, created_at, updated_at)
        VALUES ('administrator', 'administrator', 'admin@example.test', '', '', 'now', 'now')`);
      resolveGroup = vi.fn().mockImplementation(async (subject: string) => ({ ...group, subject }));
      mappings = new LdapMappingService(db, 'directory', { resolveGroup });
      other = new LdapMappingService(reader, 'directory', { resolveGroup });
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

    async function grant(mapping: LdapMapping, adapter = db): Promise<void> {
      await adapter.execute(`INSERT INTO federated_user_roles
        (user_id, role_id, identity_id, source_key, mapping_id, directory_id) VALUES (?, ?, ?, ?, ?, 'directory')`,
      [userId, mapping.roleId, identityId, `mapping:${mapping.id}`, mapping.id]);
    }
    async function validate(): Promise<void> {
      await db.execute('UPDATE ldap_validation_state SET last_validated_at = 1234, mapping_revision = ? WHERE identity_id = ?',
        [(await mappings.revision()).mappingRevision, identityId]);
    }

    it('returns current source labels and independent manual/mapped grant provenance for administration', async () => {
      const users = new UserService(db, new AuthenticationService(db, 'administration-metadata-fixture-signing-secret'));
      const user = await users.getUserById(userId);
      expect(user).not.toBeNull();
      const metadata = await users.getAdministrationMetadata([user!], { directoryId: 'directory', displayName: 'Corporate' });
      expect(metadata.get(userId)).toEqual({ profileReadOnly: true, sources: [
        { provider: 'ldap', name: 'Corporate', directoryId: 'directory', loginName: 'alice' },
      ] });
      expect(await users.getAdministrationMetadata([])).toEqual(new Map());
      const mapping = await mappings.create(groupSubject, viewer, actor);
      await grant(mapping);
      await users.assignRoleToUser(userId, viewer);
      expect(await users.getUserRoleSources(userId)).toEqual([
        { roleId: viewer, source: 'manual' },
        { roleId: viewer, source: 'ldap', directoryId: 'directory', groupName: 'Operators' },
      ]);
      await users.removeRoleFromUser(userId, viewer);
      expect(await users.getUserRoleSources(userId)).toEqual([
        { roleId: viewer, source: 'ldap', directoryId: 'directory', groupName: 'Operators' },
      ]);
      expect(await users.getUserRoles(userId)).toHaveLength(1);
    });

    it('persists authoritative immutable identity, source, role and atomic audit without granting access', async () => {
      const mapping = await mappings.create(groupSubject.toUpperCase(), viewer, actor);
      expect(resolveGroup).toHaveBeenCalledWith(groupSubject);
      expect(mapping).toMatchObject({ source: 'ldap', directoryId: 'directory', groupSubject,
        groupDn: group.dn, groupName: group.name, roleId: viewer, roleName: 'Viewer', enabled: true });
      expect(await other.list()).toEqual([mapping]);
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([]);
      expect((await mappings.revision()).mappingRevision).toBe('1');
      const audit = await db.queryOne<{ details: string; action: string; user_id: string }>('SELECT details, "action", user_id FROM audit_logs');
      expect(audit).toMatchObject({ action: 'createLdapMapping', user_id: actor.userId });
      expect(JSON.parse(audit!.details)).toEqual({ directoryId: 'directory', mappingId: mapping.id, groupSubject, roleId: viewer, enabled: true });
      expect(audit!.details).not.toContain(group.dn);
    });

    it('rejects duplicate mappings and absent roles without advancing revision', async () => {
      await mappings.create(groupSubject, viewer, actor);
      const revision = await mappings.revision();
      await expect(mappings.create(groupSubject, viewer, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(mappings.create(anotherGroup, 'absent', actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await mappings.revision()).toEqual(revision);
      expect(await db.query('SELECT * FROM audit_logs')).toHaveLength(1);
      expect(await mappings.create(groupSubject, 'role-operator-001', actor)).toMatchObject({ groupSubject });
    });

    it('withdraws only attributable grants and invalidates timestamp and permission caches across adapters', async () => {
      const one = await mappings.create(groupSubject, viewer, actor);
      const two = await mappings.create(anotherGroup, viewer, actor);
      await grant(one); await grant(two); await validate();
      await db.execute(`INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, 'now')`, [userId, viewer]);
      await db.execute(`INSERT INTO federated_identities (id, user_id, provider, issuer, subject, created_at, updated_at)
        VALUES ('entra', ?, 'entra-id', 'tenant', 'subject', 'now', 'now')`, [userId]);
      await db.execute(`INSERT INTO federated_user_roles (user_id, role_id, identity_id, source_key) VALUES (?, ?, 'entra', 'source')`, [userId, viewer]);
      const permissions = new PermissionService(reader);
      expect(await permissions.hasPermission(userId, 'executions', 'read')).toBe(true);
      const authorization = await reader.queryOne('SELECT revision FROM authorization_state');
      await mappings.update(one.id, { enabled: false }, actor);
      expect(await reader.queryOne('SELECT last_validated_at FROM ldap_validation_state')).toEqual({ last_validated_at: null });
      expect(await reader.queryOne('SELECT revision FROM authorization_state')).not.toEqual(authorization);
      expect(await reader.query('SELECT mapping_id FROM federated_user_roles WHERE identity_id = ?', [identityId])).toEqual([{ mapping_id: two.id }]);
      await mappings.remove(two.id, actor);
      expect(await permissions.hasPermission(userId, 'executions', 'read')).toBe(true);
      expect(await reader.query('SELECT identity_id FROM federated_user_roles')).toEqual([{ identity_id: 'entra' }]);
      await db.execute('DELETE FROM federated_identities WHERE id = ?', ['entra']);
      expect(await permissions.hasPermission(userId, 'executions', 'read')).toBe(true);
      await db.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      expect(await permissions.hasPermission(userId, 'executions', 'read')).toBe(false);
    });

    it('refreshes labels by immutable subject on replacement and withdraws old role grants', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      await grant(mapping); await validate();
      resolveGroup.mockResolvedValue({ ...group, dn: 'cn=renamed,dc=example', name: 'Renamed' });
      expect(await mappings.update(mapping.id, { roleId: 'role-operator-001' }, actor))
        .toMatchObject({ groupSubject, groupName: 'Renamed', groupDn: 'cn=renamed,dc=example', roleId: 'role-operator-001' });
      expect(resolveGroup).toHaveBeenLastCalledWith(groupSubject);
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
    });

    it('allows outage withdrawal but prevents new, changed or reenabled grants and rolls back no-op failures', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      await grant(mapping);
      resolveGroup.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
      const before = await mappings.revision();
      await expect(mappings.create(anotherGroup, viewer, actor)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await expect(mappings.update(mapping.id, { roleId: 'role-operator-001' }, actor)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(await mappings.revision()).toEqual(before);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
      await mappings.update(mapping.id, { enabled: false }, actor);
      await expect(mappings.update(mapping.id, { enabled: true }, actor)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await mappings.remove(mapping.id, actor);
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
      expect(await mappings.list()).toEqual([]);
    });

    it.each(['disable', 'replace', 'delete', 'insert'] as const)('fences stale validation after mapping %s without resurrecting grants', async mutation => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      const stale = await other.revision();
      if (mutation === 'disable') await mappings.update(mapping.id, { enabled: false }, actor);
      if (mutation === 'replace') await mappings.update(mapping.id, { roleId: 'role-operator-001' }, actor);
      if (mutation === 'delete') await mappings.remove(mapping.id, actor);
      if (mutation === 'insert') await mappings.create(anotherGroup, viewer, actor);
      let published = false;
      await expect(other.withRevision(stale, async () => {
        published = true;
        await grant(mapping, reader);
        await reader.execute('UPDATE ldap_validation_state SET last_validated_at = 9999');
      })).rejects.toMatchObject({ code: 'STALE_REVISION' });
      expect(published).toBe(false);
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
      expect(await reader.queryOne('SELECT last_validated_at FROM ldap_validation_state')).toEqual({ last_validated_at: null });
    });

    it('serializes an edit queued while a validation transaction owns the directory revision', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      const revision = await mappings.revision();
      let edit: Promise<LdapMapping> | undefined;
      await mappings.withRevision(revision, async () => {
        await grant(mapping);
        edit = other.update(mapping.id, { enabled: false }, actor);
        await db.execute('UPDATE ldap_validation_state SET last_validated_at = 1234');
      });
      await edit;
      expect(await reader.query('SELECT * FROM federated_user_roles')).toEqual([]);
      expect(await reader.queryOne('SELECT last_validated_at FROM ldap_validation_state')).toEqual({ last_validated_at: null });
    });

    it('rejects an administration result whose revision changed during directory I/O', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      resolveGroup.mockImplementationOnce(async () => {
        await other.remove(mapping.id, actor);
        return group;
      });
      await expect(mappings.update(mapping.id, { enabled: true }, actor)).rejects.toMatchObject({ code: 'STALE_REVISION' });
      expect(await mappings.list()).toEqual([]);
    });

    it('rolls back withdrawal, revision invalidation and mutation when audit persistence fails', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      await grant(mapping); await validate();
      const revision = await mappings.revision();
      const execute = db.execute.bind(db);
      vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) throw new Error('audit unavailable');
        return execute(sql, params);
      });
      await expect(mappings.remove(mapping.id, actor)).rejects.toThrow('audit unavailable');
      expect(await mappings.revision()).toEqual(revision);
      expect(await mappings.get(mapping.id)).toMatchObject({ enabled: true });
      expect(await reader.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
      expect(String((await reader.queryOne<{ last_validated_at: string | number }>('SELECT last_validated_at FROM ldap_validation_state'))?.last_validated_at)).toBe('1234');
    });

    it('rejects other directory ownership and changed configuration revisions', async () => {
      const mapping = await mappings.create(groupSubject, viewer, actor);
      const wrong = new LdapMappingService(reader, 'another-directory', { resolveGroup });
      await expect(wrong.get(mapping.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const revision = await mappings.revision();
      await expect(wrong.withRevision(revision, async () => {})).rejects.toMatchObject({ code: 'STALE_REVISION' });
      await db.execute("UPDATE ldap_directory_state SET config_revision = 'changed' WHERE directory_id = 'directory'");
      await expect(other.withRevision(revision, async () => {})).rejects.toMatchObject({ code: 'STALE_REVISION' });
    });
  });
}
