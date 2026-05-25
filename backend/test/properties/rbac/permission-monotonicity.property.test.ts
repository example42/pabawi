import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';
import { initializeTestSchema } from "../../helpers/schema";

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
    await initializeTestSchema(db);
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


async function createTestRole(db: SQLiteAdapter, roleId: string, name?: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
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
    `INSERT INTO permissions (id, resource, "action", description, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [permissionId, resource, action, `Test permission for ${resource}:${action}`, now]
  );
}
