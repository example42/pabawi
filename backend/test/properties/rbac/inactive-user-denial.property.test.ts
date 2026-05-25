import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import { UserService } from '../../../src/services/UserService';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';
import { initializeTestSchema } from "../../helpers/schema";

/**
 * Property-Based Tests for Inactive User Denial
 *
 * **Validates: Requirements 5.6**
 *
 * Property 7: Inactive User Denial
 * ∀ user ∈ Users, resource ∈ Resources, action ∈ Actions:
 *   user.isActive = false ⟹
 *     hasPermission(user, resource, action) = false
 *
 * This property validates that:
 * - Inactive users have no permissions
 * - User activation status is checked before granting permissions
 * - Deactivated users lose all access
 */
describe('Inactive User Denial Properties', () => {
  let db: SQLiteAdapter;
  let userService: UserService;
  let roleService: RoleService;
  let permissionService: PermissionService;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Initialize schema
    await initializeTestSchema(db);

    // Create services
    authService = new AuthenticationService(db, testJwtSecret);
    userService = new UserService(db, authService);
    roleService = new RoleService(db);
    permissionService = new PermissionService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  /**
   * Property 7: Inactive User Denial
   *
   * **Validates: Requirements 5.6**
   *
   * This property test verifies that:
   * 1. When a user is marked as inactive (isActive = false)
   * 2. Then the user has NO permissions for ANY resource and action
   * 3. Inactive users are denied access regardless of roles/permissions
   */
  it('should deny all permissions to inactive users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        async (resource, action) => {
          // Setup: Create user and deactivate them
          const userId = randomUUID();
          await createTestUser(db, userId, true); // Create as active

          // Deactivate user
          await userService.updateUser(userId, { isActive: false });

          // Property: Inactive user has no permissions on any resource/action
          const hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(false);
        }
      ),
      {
        numRuns: 100,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Inactive users denied even with role assignments
   *
   * Verifies that inactive users have no permissions even when
   * they have roles with permissions assigned.
   */
  it('should deny permissions to inactive users even with role assignments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, role, and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId, true); // Create as active
          await createTestRole(db, roleId);
          const resource = `resource_${permissionId.substring(0, 8)}`;
          const action = `action_${permissionId.substring(0, 8)}`;
          await createTestPermission(db, permissionId, resource, action);

          // Assign permission to role and role to user
          await roleService.assignPermissionToRole(roleId, permissionId);
          await userService.assignRoleToUser(userId, roleId);

          // Verify user has permission while active
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(true);

          // Deactivate user
          await userService.updateUser(userId, { isActive: false });

          // Invalidate cache to ensure fresh check
          permissionService.invalidateUserPermissionCache(userId);

          // Property: Inactive user should NOT have permission
          hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(false);
        }
      ),
      {
        numRuns: 50,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Inactive admin users denied
   *
   * Verifies that even admin users lose all permissions
   * when deactivated.
   */
  it('should deny permissions to inactive admin users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create admin user
          const userId = randomUUID();
          await createTestUser(db, userId, true, true); // Create as active admin

          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Verify admin has permission while active
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(true);

          // Deactivate admin user
          await userService.updateUser(userId, { isActive: false });

          // Invalidate cache to ensure fresh check
          permissionService.invalidateUserPermissionCache(userId);

          // Property: Inactive admin should NOT have permission
          hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(false);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: User reactivation restores permissions
   *
   * Verifies that when an inactive user is reactivated,
   * they regain their permissions.
   */
  it('should restore permissions when inactive user is reactivated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user with role and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId, true); // Create as active
          await createTestRole(db, roleId);
          const resource = `resource_${permissionId.substring(0, 8)}`;
          const action = `action_${permissionId.substring(0, 8)}`;
          await createTestPermission(db, permissionId, resource, action);

          // Assign permission to role and role to user
          await roleService.assignPermissionToRole(roleId, permissionId);
          await userService.assignRoleToUser(userId, roleId);

          // Deactivate user
          await userService.updateUser(userId, { isActive: false });
          permissionService.invalidateUserPermissionCache(userId);

          // Verify user has no permission while inactive
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(false);

          // Reactivate user
          await userService.updateUser(userId, { isActive: true });
          permissionService.invalidateUserPermissionCache(userId);

          // Property: Reactivated user should have permission again
          hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(true);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Inactive users denied across cache
   *
   * Verifies that inactive user denial is consistent
   * whether cached or not.
   */
  it('should consistently deny permissions to inactive users with and without cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        async (resource, action) => {
          // Setup: Create inactive user
          const userId = randomUUID();
          await createTestUser(db, userId, false); // Create as inactive

          // First check (cache miss)
          const firstCheck = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          // Second check (cache hit)
          const secondCheck = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          // Property: Both checks should return false
          expect(firstCheck).toBe(false);
          expect(secondCheck).toBe(false);
          expect(firstCheck).toBe(secondCheck);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Inactive users denied with group permissions
   *
   * Verifies that inactive users have no permissions even when
   * they inherit permissions through group memberships.
   */
  it('should deny permissions to inactive users even with group role assignments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, group, role, and permission
          const userId = randomUUID();
          const groupId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId, true); // Create as active
          await createTestGroup(db, groupId);
          await createTestRole(db, roleId);
          const resource = `resource_${permissionId.substring(0, 8)}`;
          const action = `action_${permissionId.substring(0, 8)}`;
          await createTestPermission(db, permissionId, resource, action);

          // Setup permission chain: user -> group -> role -> permission
          await roleService.assignPermissionToRole(roleId, permissionId);
          await assignRoleToGroup(db, groupId, roleId);
          await userService.addUserToGroup(userId, groupId);

          // Verify user has permission while active
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(true);

          // Deactivate user
          await userService.updateUser(userId, { isActive: false });
          permissionService.invalidateUserPermissionCache(userId);

          // Property: Inactive user should NOT have permission
          hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(false);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Multiple inactive users all denied
   *
   * Verifies that the inactive user denial works consistently
   * across multiple inactive users.
   */
  it('should deny permissions to all inactive users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numUsers) => {
          // Setup: Create multiple inactive users
          const userIds: string[] = [];
          for (let i = 0; i < numUsers; i++) {
            const userId = randomUUID();
            await createTestUser(db, userId, false); // Create as inactive
            userIds.push(userId);
          }

          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Property: All inactive users should be denied
          for (const userId of userIds) {
            const hasAccess = await permissionService.hasPermission(
              userId,
              resource,
              action
            );
            expect(hasAccess).toBe(false);
          }
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Active users not affected
   *
   * Verifies that active users with permissions are not affected
   * by the inactive user denial logic (positive control test).
   */
  it('should grant permissions to active users with role assignments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create active user with role and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId, true); // Create as active
          await createTestRole(db, roleId);
          const resource = `resource_${permissionId.substring(0, 8)}`;
          const action = `action_${permissionId.substring(0, 8)}`;
          await createTestPermission(db, permissionId, resource, action);

          // Assign permission to role and role to user
          await roleService.assignPermissionToRole(roleId, permissionId);
          await userService.assignRoleToUser(userId, roleId);

          // Property: Active user should have permission
          const hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(true);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);
});

// Helper functions


async function createTestUser(
  db: SQLiteAdapter,
  userId: string,
  isActive: boolean = true,
  isAdmin: boolean = false
): Promise<void> {
  const sql = `
    INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [
    userId,
    `user_${userId.substring(0, 8)}`,
    `user_${userId.substring(0, 8)}@example.com`,
    'dummy_hash',
    'Test',
    'User',
    isActive ? 1 : 0,
    isAdmin ? 1 : 0,
    now,
    now
  ];

  await db.execute(sql, params);
}

async function createTestRole(db: SQLiteAdapter, roleId: string, name?: string): Promise<void> {
  const sql = `
    INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `;

  const now = new Date().toISOString();
  const roleName = name || `role_${roleId}`;
  const params = [
    roleId,
    roleName,
    'Test role',
    now,
    now
  ];

  await db.execute(sql, params);
}

async function createTestPermission(
  db: SQLiteAdapter,
  permissionId: string,
  resource: string,
  action: string
): Promise<void> {
  const sql = `
    INSERT INTO permissions (id, resource, "action", description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [
    permissionId,
    resource,
    action,
    `Test permission for ${resource}:${action}`,
    now
  ];

  await db.execute(sql, params);
}

async function createTestGroup(db: SQLiteAdapter, groupId: string): Promise<void> {
  const sql = `
    INSERT INTO groups (id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [
    groupId,
    `group_${groupId}`,
    'Test group',
    now,
    now
  ];

  await db.execute(sql, params);
}

async function assignRoleToGroup(db: SQLiteAdapter, groupId: string, roleId: string): Promise<void> {
  const sql = `
    INSERT INTO group_roles (group_id, role_id, assigned_at)
    VALUES (?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [groupId, roleId, now];

  await db.execute(sql, params);
}
