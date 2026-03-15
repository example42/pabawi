import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

/**
 * Property-Based Tests for Permission Monotonicity
 *
 * **Validates: Requirement 29.2**
 *
 * Property 19: Permission Monotonicity
 * For any role, adding a permission to that role never removes existing
 * permissions, and removing a permission never adds new ones. The set of
 * permissions only changes by the explicitly added or removed permission.
 */
describe('Permission Monotonicity Properties', () => {
  let db: SQLiteAdapter;
  let roleService: RoleService;
  let permissionService: PermissionService;

  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeRBACSchema(db);
    roleService = new RoleService(db);
    permissionService = new PermissionService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  /**
   * Adding a permission preserves all existing permissions (core monotonicity - add)
   *
   * **Validates: Requirement 29.2**
   */
  it('adding a permission preserves all existing permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numExisting) => {
          const roleId = randomUUID();
          await createTestRole(db, roleId);

          // Create and assign existing permissions
          const existingPermIds: string[] = [];
          for (let i = 0; i < numExisting; i++) {
            const pId = randomUUID();
            await createTestPermission(db, pId, `res_${pId.substring(0, 8)}`, `act_${pId.substring(0, 8)}`);
            await roleService.assignPermissionToRole(roleId, pId);
            existingPermIds.push(pId);
          }

          // Snapshot permissions before adding
          const before = await roleService.getRolePermissions(roleId);
          const beforeIds = new Set(before.map(p => p.id));

          // Add a new permission
          const newPermId = randomUUID();
          await createTestPermission(db, newPermId, `res_${newPermId.substring(0, 8)}`, `act_${newPermId.substring(0, 8)}`);
          await roleService.assignPermissionToRole(roleId, newPermId);

          // Snapshot permissions after adding
          const after = await roleService.getRolePermissions(roleId);
          const afterIds = new Set(after.map(p => p.id));

          // Property: every permission that existed before must still exist
          for (const id of beforeIds) {
            expect(afterIds.has(id)).toBe(true);
          }

          // The new permission should also be present
          expect(afterIds.has(newPermId)).toBe(true);
        }
      ),
      { numRuns: 30, timeout: 30000 }
    );
  }, 60000);

  /**
   * Removing a permission does not introduce new permissions (core monotonicity - remove)
   *
   * **Validates: Requirement 29.2**
   */
  it('removing a permission does not introduce new permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numPermissions) => {
          const roleId = randomUUID();
          await createTestRole(db, roleId);

          // Create and assign permissions
          const permIds: string[] = [];
          for (let i = 0; i < numPermissions; i++) {
            const pId = randomUUID();
            await createTestPermission(db, pId, `res_${pId.substring(0, 8)}`, `act_${pId.substring(0, 8)}`);
            await roleService.assignPermissionToRole(roleId, pId);
            permIds.push(pId);
          }

          // Snapshot before removal
          const before = await roleService.getRolePermissions(roleId);
          const beforeIds = new Set(before.map(p => p.id));

          // Remove the first permission
          const removedId = permIds[0];
          await roleService.removePermissionFromRole(roleId, removedId);

          // Snapshot after removal
          const after = await roleService.getRolePermissions(roleId);
          const afterIds = new Set(after.map(p => p.id));

          // Property: no new permissions should appear
          for (const id of afterIds) {
            expect(beforeIds.has(id)).toBe(true);
          }

          // The removed permission should be gone
          expect(afterIds.has(removedId)).toBe(false);
        }
      ),
      { numRuns: 30, timeout: 30000 }
    );
  }, 60000);

  /**
   * Adding then removing a permission returns to original state (round-trip)
   *
   * **Validates: Requirement 29.2**
   */
  it('adding then removing a permission returns to original state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        async (numExisting) => {
          const roleId = randomUUID();
          await createTestRole(db, roleId);

          // Create and assign initial permissions
          for (let i = 0; i < numExisting; i++) {
            const pId = randomUUID();
            await createTestPermission(db, pId, `res_${pId.substring(0, 8)}`, `act_${pId.substring(0, 8)}`);
            await roleService.assignPermissionToRole(roleId, pId);
          }

          // Snapshot original state
          const original = await roleService.getRolePermissions(roleId);
          const originalIds = new Set(original.map(p => p.id));

          // Add a new permission
          const newPermId = randomUUID();
          await createTestPermission(db, newPermId, `res_${newPermId.substring(0, 8)}`, `act_${newPermId.substring(0, 8)}`);
          await roleService.assignPermissionToRole(roleId, newPermId);

          // Remove the same permission
          await roleService.removePermissionFromRole(roleId, newPermId);

          // Snapshot final state
          const final_ = await roleService.getRolePermissions(roleId);
          const finalIds = new Set(final_.map(p => p.id));

          // Property: final state equals original state
          expect(finalIds.size).toBe(originalIds.size);
          for (const id of originalIds) {
            expect(finalIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 30, timeout: 30000 }
    );
  }, 60000);

  /**
   * Multiple sequential adds preserve all prior permissions
   *
   * **Validates: Requirement 29.2**
   */
  it('multiple sequential adds preserve all prior permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (numAdds) => {
          const roleId = randomUUID();
          await createTestRole(db, roleId);

          const allPermIds: string[] = [];

          for (let i = 0; i < numAdds; i++) {
            const pId = randomUUID();
            await createTestPermission(db, pId, `res_${pId.substring(0, 8)}`, `act_${pId.substring(0, 8)}`);
            await roleService.assignPermissionToRole(roleId, pId);
            allPermIds.push(pId);

            // After each add, verify all previously added permissions still exist
            const current = await roleService.getRolePermissions(roleId);
            const currentIds = new Set(current.map(p => p.id));

            for (const prevId of allPermIds) {
              expect(currentIds.has(prevId)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  }, 60000);
});

// Helper functions

async function initializeRBACSchema(db: SQLiteAdapter): Promise<void> {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      isAdmin INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastLoginAt TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      isBuiltIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(resource, action)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      roleId TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (roleId, permissionId),
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_groups (
      userId TEXT NOT NULL,
      groupId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, groupId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_roles (
      groupId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (groupId, roleId),
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      revokedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL
    )
  `;

  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const statement of statements) {
    await db.execute(statement);
  }
}

async function createTestRole(db: SQLiteAdapter, roleId: string, name?: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [roleId, name || `role_${roleId.substring(0, 8)}`, 'Test role', now, now]
  );
}

async function createTestPermission(
  db: SQLiteAdapter,
  permissionId: string,
  resource: string,
  action: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO permissions (id, resource, "action", description, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [permissionId, resource, action, `Test permission for ${resource}:${action}`, now]
  );
}
