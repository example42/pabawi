import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { initializeTestSchema } from '../helpers/schema';
import { EntraIdService } from '../../src/services/EntraIdService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { PermissionService } from '../../src/services/PermissionService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';
import type { EntraIdConfig } from '../../src/config/schema';

describe('Entra group reconciliation against storage', () => {
  let db: SQLiteAdapter;
  let config: EntraIdConfig;
  let service: EntraIdService;
  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeTestSchema(db);
    await db.execute(`INSERT INTO users (id, username, email, first_name, last_name, is_active, is_admin, created_at, updated_at)
      VALUES ('user', 'user', 'user@example.test', '', '', 1, 0, 'now', 'now')`);
    await db.execute("INSERT INTO federated_identities (id, user_id, provider, subject, issuer, created_at, updated_at) VALUES ('identity', 'user', 'entra-id', 'subject', 'https://login.microsoftonline.com/tenant/v2.0', 'now', 'now')");
    config = { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: 'fixture',
      redirectUri: 'http://localhost/callback', scopes: ['openid'], jwksCacheTtlMs: 1000,
      groupMapping: { A: 'Viewer', B: 'Operator' } };
    const auth = new AuthenticationService(db, 'test-group-sync-secret');
    service = new EntraIdService(db, config, auth, new UserService(db, auth), new RoleService(db), new AuditLoggingService(db), new LoggerService());
  });
  afterEach(async () => { await db.close(); });
  const grants = async (db: SQLiteAdapter, table: string) =>
    (await db.query<{ role_id: string }>(`SELECT DISTINCT role_id FROM ${table} WHERE user_id = 'user' ORDER BY role_id`)).map(row => row.role_id);

  it('reconciles arbitrary claim changes while preserving manual grants to the same role', async () => {
    await db.execute("INSERT INTO user_roles VALUES ('user', 'role-viewer-001', 'now')");
    await fc.assert(fc.asyncProperty(fc.array(fc.boolean(), { minLength: 2, maxLength: 2 }), async ([viewer, operator]) => {
      await service.syncGroupRoles('identity', [...(viewer ? ['a'] : []), ...(operator ? ['b'] : [])]);
      expect(await grants(db, 'federated_user_roles')).toEqual([
        ...(operator ? ['role-operator-001'] : []), ...(viewer ? ['role-viewer-001'] : []),
      ]);
      expect(await grants(db, 'user_roles')).toEqual(['role-viewer-001']);
    }), { numRuns: 50 });
  });

  it('removes provider grants when groups or the mapping disappear and invalidates cached permissions', async () => {
    const permissions = new PermissionService(db);
    await service.syncGroupRoles('identity', ['A']);
    expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(true);
    await service.syncGroupRoles('identity', undefined);
    expect(await permissions.hasPermission('user', 'executions', 'read')).toBe(false);
    await service.syncGroupRoles('identity', ['A']);
    config.groupMapping = null;
    await service.syncGroupRoles('identity', ['A']);
    expect(await grants(db, 'federated_user_roles')).toEqual([]);
  });

  it('reconciles legacy grants once, without erasing subsequent manual assignments', async () => {
    await db.execute("INSERT INTO user_roles VALUES ('user', 'role-viewer-001', 'now')");
    await db.execute("INSERT INTO legacy_federated_user_roles VALUES ('user', 'role-viewer-001')");
    await service.syncGroupRoles('identity', []);
    expect(await grants(db, 'user_roles')).toEqual([]);
    await db.execute("INSERT INTO user_roles VALUES ('user', 'role-viewer-001', 'now')");
    await service.syncGroupRoles('identity', []);
    expect(await grants(db, 'user_roles')).toEqual(['role-viewer-001']);
  });

  it('rolls back partial reconciliation and fails login work when a mapped role is invalid', async () => {
    await service.syncGroupRoles('identity', ['B']);
    config.groupMapping = { A: 'Viewer', B: 'Missing role' };
    await expect(service.syncGroupRoles('identity', ['A', 'B'])).rejects.toThrow('unknown role');
    expect(await grants(db, 'federated_user_roles')).toEqual(['role-operator-001']);
  });

  it('retains both group sources under simultaneous reconciliation to the same role', async () => {
    config.groupMapping = { A: 'Viewer', B: 'viewer' };
    await Promise.all(Array.from({ length: 8 }, () => service.syncGroupRoles('identity', ['A', 'B'])));
    expect(await grants(db, 'federated_user_roles')).toEqual(['role-viewer-001']);
    expect(await db.query('SELECT source_key FROM federated_user_roles ORDER BY source_key')).toEqual([
      { source_key: 'group:a' }, { source_key: 'group:b' },
    ]);
  });
});
