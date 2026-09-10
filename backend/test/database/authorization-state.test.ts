import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { PermissionService } from '../../src/services/PermissionService';

const databaseUrl = process.env.TEST_DATABASE_URL;
for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: durable authorization state`, () => {
    it('invalidates tokens and permission caches across independent database connections', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pabawi-auth-state-'));
      const schema = `auth_${randomUUID().replaceAll('-', '')}`;
      const control = databaseUrl ? new PostgresAdapter(databaseUrl) : null;
      let scopedUrl = '';
      if (dialect === 'postgres' && control && databaseUrl) {
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-csearch_path=${schema}`);
        scopedUrl = url.toString();
      }
      const writer = dialect === 'sqlite' ? new SQLiteAdapter(join(dir, 'state.db')) : new PostgresAdapter(scopedUrl);
      const reader = dialect === 'sqlite' ? new SQLiteAdapter(join(dir, 'state.db')) : new PostgresAdapter(scopedUrl);
      try {
        await writer.initialize();
        await new MigrationRunner(writer).runPendingMigrations();
        await reader.initialize();
        await writer.execute("INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at) VALUES ('user', 'user', 'user@example.test', 'hash', 'User', 'Test', 1, 0, 'now', 'now')");
        await writer.execute("INSERT INTO user_roles VALUES ('user', 'role-viewer-001', 'now')");
        const permissions = new PermissionService(reader);
        const auth = new AuthenticationService(reader, 'database-session-revocation-test-secret');
        const token = await auth.generateToken({ id: 'user', username: 'user' });
        const refresh = await auth.generateRefreshToken({ id: 'user', username: 'user' });
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(true);
        await writer.execute("DELETE FROM user_roles WHERE user_id = 'user'");
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(false);
        await writer.execute("INSERT INTO groups (id, name, description, created_at, updated_at) VALUES ('group', 'group', '', 'now', 'now')");
        await writer.execute("INSERT INTO user_groups VALUES ('user', 'group', 'now')");
        await writer.execute("INSERT INTO group_roles VALUES ('group', 'role-viewer-001', 'now')");
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(true);
        await writer.execute("DELETE FROM role_permissions WHERE role_id = 'role-viewer-001' AND permission_id = 'executions-read-001'");
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(false);
        await writer.execute("UPDATE users SET is_admin = 1 WHERE id = 'user'");
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(true);
        await writer.execute("UPDATE users SET is_admin = 0 WHERE id = 'user'");
        expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(false);
        await expect(auth.verifyToken(token)).rejects.toThrow('revoked');
        expect((await auth.refreshToken(refresh)).success).toBe(false);
        const fresh = await auth.generateToken({ id: 'user', username: 'user' });
        await writer.execute("UPDATE users SET password_hash = 'new-hash' WHERE id = 'user'");
        await expect(auth.verifyToken(fresh)).rejects.toThrow('revoked');
        const transactionPermissions = new PermissionService(writer);
        const writerAuth = new AuthenticationService(writer, 'database-session-revocation-test-secret');
        let rolledBackToken = '';
        await expect(writer.withTransaction(async () => {
          await writer.execute("UPDATE users SET is_admin = 1 WHERE id = 'user'");
          rolledBackToken = await writerAuth.generateToken({ id: 'user', username: 'user' });
          expect(await transactionPermissions.hasPermission('user', 'executions', 'read')).toBe(true);
          throw new Error('rollback cached revision');
        })).rejects.toThrow('rollback cached revision');
        expect(rolledBackToken).not.toBe('');
        await writer.execute("UPDATE groups SET description = 'unrelated change' WHERE id = 'group'");
        expect(await transactionPermissions.hasPermission('user', 'executions', 'read')).toBe(false);
        await writer.execute("UPDATE users SET is_admin = 1 WHERE id = 'user'");
        await expect(auth.verifyToken(rolledBackToken)).rejects.toThrow('revoked');
        await writer.execute("UPDATE users SET is_admin = 0 WHERE id = 'user'");
        const before = await writer.query("SELECT session_version FROM users WHERE id = 'user'");
        const revision = await writer.query('SELECT revision FROM authorization_state');
        await expect(writer.withTransaction(async () => {
          await writer.execute("UPDATE users SET is_active = 0 WHERE id = 'user'");
          throw new Error('rollback');
        })).rejects.toThrow('rollback');
        expect(await reader.query("SELECT session_version FROM users WHERE id = 'user'")).toEqual(before);
        expect(await reader.query('SELECT revision FROM authorization_state')).toEqual(revision);
      } finally {
        await reader.close();
        await writer.close();
        if (dialect === 'postgres' && control) {
          await control.execute(`DROP SCHEMA ${schema} CASCADE`);
          await control.close();
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}
