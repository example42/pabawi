import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { GroupService } from '../../../src/services/GroupService';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

/**
 * Property-Based Tests for Group Permission Inheritance
 *
 * **Validates: Requirements 8.2, 3.4**
 *
 * Property 5: Group Permission Inheritance
 * ∀ user ∈ Users, group ∈ Groups, role ∈ Roles, permission ∈ Permissions:
 *   (user ∈ group.members ∧
 *    role ∈ group.roles ∧
 *    permission ∈ role.permissions) ⟹
 *     hasPermission(user, permission.resource, permission.action) = true
 *
 * This property validates that:
 * - Users inherit permissions from roles assigned to their groups
 * - If a user is in a group, and that group has a role with a permission, then the user has that permission
 * - Group-based permission inheritance works correctly
 */
describe('Group Permission Inheritance Properties', () => {
  let db: Database;
  let userService: UserService;
  let groupService: GroupService;
  let roleService: RoleService;
  let permissionService: PermissionService;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeRBACSchema(db);

    // Create services
    authService = new AuthenticationService(db, testJwtSecret);
    userService = new UserService(db, authService);
    groupService = new GroupService(db);
    roleService = new RoleService(db);
    permissionService = new PermissionService(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Property 5: Group Permission Inheritance
   *
   * **Validates: Requirements 8.2, 3.4**
   *
   * This property test verifies that:
   * 1. When a user is added to a group
   * 2. And that group has a role assigned
   * 3. And that role has a permission
   * 4. Then the user has that permission through group membership
   */
  it('should grant user permission through group role assignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No random input needed for basic test
        async () => {
          // Setup: Create user, group, role, and permission
          const userId = randomUUID();
          const groupId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Step 1: Assign permission to role
          await roleService.assignPermissionToRole(roleId, permissionId);

          // Step 2: Assign role to group
          await groupService.assignRoleToGroup(groupId, roleId);

          // Step 3: Add user to group
          await userService.addUserToGroup(userId, groupId);

          // Get permission details
          const permission = await permissionService.getPermissionById(permissionId);
          expect(permission).not.toBeNull();

          // Property: User should have the permission through group membership
          const hasAccess = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
          );

          expect(hasAccess).toBe(true);
        }
      ),
      {
        numRuns: 50,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Multiple permissions through group
   *
   * Verifies that when a group's role has multiple permissions,
   * all of them are inherited by group members.
   */
  it('should grant user all permissions from group role', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numPermissions) => {
          // Setup: Create user, group, and role
          const userId = randomUUID();
          const groupId = randomUUID();
          const roleId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, roleId);

          // Create multiple permissions and assign to role
          const permissionDetails: Array<{ resource: string; action: string }> = [];

          for (let i = 0; i < numPermissions; i++) {
            const permissionId = randomUUID();
            // Use permissionId to ensure uniqueness across all test runs
            const resource = `resource_${permissionId.substring(0, 8)}`;
            const action = `action_${permissionId.substring(0, 8)}`;

            await createTestPermission(db, permissionId, resource, action);
            await roleService.assignPermissionToRole(roleId, permissionId);

            permissionDetails.push({ resource, action });
          }

          // Assign role to group and add user to group
          await groupService.assignRoleToGroup(groupId, roleId);
          await userService.addUserToGroup(userId, groupId);

          // Property: User should have all permissions from the group's role
          for (const { resource, action } of permissionDetails) {
            const hasAccess = await permissionService.hasPermission(
              userId,
              resource,
              action
            );
            expect(hasAccess).toBe(true);
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
   * Property: Multiple groups with different roles
   *
   * Verifies that when a user is in multiple groups,
   * they inherit permissions from all group roles.
   */
  it('should grant user permissions from all group memberships', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        async (numGroups) => {
          // Setup: Create user
          const userId = randomUUID();
          await createTestUser(db, userId);

          // Create multiple groups, each with a role and permission
          const groupPermissions: Array<{ groupId: string; resource: string; action: string }> = [];

          for (let i = 0; i < numGroups; i++) {
            const groupId = randomUUID();
            const roleId = randomUUID();
            const permissionId = randomUUID();
            // Use unique identifiers to ensure uniqueness across all test runs
            const resource = `resource_${permissionId.substring(0, 8)}`;
            const action = `action_${permissionId.substring(0, 8)}`;

            await createTestGroup(db, groupId, `group_${groupId.substring(0, 8)}`);
            await createTestRole(db, roleId, `role_${roleId.substring(0, 8)}`);
            await createTestPermission(db, permissionId, resource, action);
            await roleService.assignPermissionToRole(roleId, permissionId);
            await groupService.assignRoleToGroup(groupId, roleId);
            await userService.addUserToGroup(userId, groupId);

            groupPermissions.push({ groupId, resource, action });
          }

          // Property: User should have permissions from all groups
          for (const { resource, action } of groupPermissions) {
            const hasAccess = await permissionService.hasPermission(
              userId,
              resource,
              action
            );
            expect(hasAccess).toBe(true);
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
   * Property: Permission denial without group membership
   *
   * Verifies that users do NOT have permissions from groups
   * they are not members of (negative test).
   */
  it('should NOT grant permission when user is not in group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, group, role, and permission
          const userId = randomUUID();
          const groupId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Assign permission to role and role to group, but DON'T add user to group
          await roleService.assignPermissionToRole(roleId, permissionId);
          await groupService.assignRoleToGroup(groupId, roleId);

          // Get permission details
          const permission = await permissionService.getPermissionById(permissionId);
          expect(permission).not.toBeNull();

          // Property: User should NOT have the permission
          const hasAccess = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
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
   * Property: Permission revocation on group removal
   *
   * Verifies that when a user is removed from a group,
   * they lose the permissions from that group's roles.
   */
  it('should revoke permission when user is removed from group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, group, role, and permission
          const userId = randomUUID();
          const groupId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Assign permission to role, role to group, and user to group
          await roleService.assignPermissionToRole(roleId, permissionId);
          await groupService.assignRoleToGroup(groupId, roleId);
          await userService.addUserToGroup(userId, groupId);

          // Get permission details
          const permission = await permissionService.getPermissionById(permissionId);
          expect(permission).not.toBeNull();

          // Verify user has permission
          let hasAccess = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
          );
          expect(hasAccess).toBe(true);

          // Remove user from group
          await userService.removeUserFromGroup(userId, groupId);

          // Invalidate cache to ensure fresh check
          permissionService.invalidateUserPermissionCache(userId);

          // Property: User should no longer have the permission
          hasAccess = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
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
   * Property: Combined direct and group permissions
   *
   * Verifies that users can have permissions from both
   * direct role assignments AND group memberships.
   */
  it('should grant permissions from both direct roles and group roles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, group, two roles, and two permissions
          const userId = randomUUID();
          const groupId = randomUUID();
          const directRoleId = randomUUID();
          const groupRoleId = randomUUID();
          const directPermissionId = randomUUID();
          const groupPermissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, directRoleId, `direct_role_${directRoleId.substring(0, 8)}`);
          await createTestRole(db, groupRoleId, `group_role_${groupRoleId.substring(0, 8)}`);

          // Create two different permissions
          const directResource = `resource_${directPermissionId.substring(0, 8)}`;
          const directAction = `action_${directPermissionId.substring(0, 8)}`;
          const groupResource = `resource_${groupPermissionId.substring(0, 8)}`;
          const groupAction = `action_${groupPermissionId.substring(0, 8)}`;

          await createTestPermission(db, directPermissionId, directResource, directAction);
          await createTestPermission(db, groupPermissionId, groupResource, groupAction);

          // Assign direct permission through direct role
          await roleService.assignPermissionToRole(directRoleId, directPermissionId);
          await userService.assignRoleToUser(userId, directRoleId);

          // Assign group permission through group role
          await roleService.assignPermissionToRole(groupRoleId, groupPermissionId);
          await groupService.assignRoleToGroup(groupId, groupRoleId);
          await userService.addUserToGroup(userId, groupId);

          // Property: User should have both permissions
          const hasDirectAccess = await permissionService.hasPermission(
            userId,
            directResource,
            directAction
          );
          const hasGroupAccess = await permissionService.hasPermission(
            userId,
            groupResource,
            groupAction
          );

          expect(hasDirectAccess).toBe(true);
          expect(hasGroupAccess).toBe(true);
        }
      ),
      {
        numRuns: 30,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Permission persistence when one path is removed
   *
   * Verifies that if a user has the same permission through both
   * direct role and group role, removing one path doesn't revoke the permission.
   */
  it('should maintain permission when available through multiple paths', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, group, two roles, and one permission
          const userId = randomUUID();
          const groupId = randomUUID();
          const directRoleId = randomUUID();
          const groupRoleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);
          await createTestRole(db, directRoleId, `direct_role_${directRoleId.substring(0, 8)}`);
          await createTestRole(db, groupRoleId, `group_role_${groupRoleId.substring(0, 8)}`);

          // Create one permission
          const resource = `resource_${permissionId.substring(0, 8)}`;
          const action = `action_${permissionId.substring(0, 8)}`;
          await createTestPermission(db, permissionId, resource, action);

          // Assign same permission through both direct role and group role
          await roleService.assignPermissionToRole(directRoleId, permissionId);
          await roleService.assignPermissionToRole(groupRoleId, permissionId);
          await userService.assignRoleToUser(userId, directRoleId);
          await groupService.assignRoleToGroup(groupId, groupRoleId);
          await userService.addUserToGroup(userId, groupId);

          // Verify user has permission
          let hasAccess = await permissionService.hasPermission(userId, resource, action);
          expect(hasAccess).toBe(true);

          // Remove user from group (removes one path)
          await userService.removeUserFromGroup(userId, groupId);
          permissionService.invalidateUserPermissionCache(userId);

          // Property: User should still have permission through direct role
          hasAccess = await permissionService.hasPermission(userId, resource, action);
          expect(hasAccess).toBe(true);

          // Remove direct role (removes second path)
          await userService.removeRoleFromUser(userId, directRoleId);
          permissionService.invalidateUserPermissionCache(userId);

          // Property: Now user should NOT have permission
          hasAccess = await permissionService.hasPermission(userId, resource, action);
          expect(hasAccess).toBe(false);
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Group with multiple roles
   *
   * Verifies that when a group has multiple roles assigned,
   * group members inherit permissions from all roles.
   */
  it('should grant permissions from all roles assigned to group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        async (numRoles) => {
          // Setup: Create user and group
          const userId = randomUUID();
          const groupId = randomUUID();

          await createTestUser(db, userId);
          await createTestGroup(db, groupId);

          // Create multiple roles, each with a unique permission
          const rolePermissions: Array<{ roleId: string; resource: string; action: string }> = [];

          for (let i = 0; i < numRoles; i++) {
            const roleId = randomUUID();
            const permissionId = randomUUID();
            // Use unique identifiers to ensure uniqueness across all test runs
            const resource = `resource_${permissionId.substring(0, 8)}`;
            const action = `action_${permissionId.substring(0, 8)}`;

            await createTestRole(db, roleId, `role_${roleId.substring(0, 8)}`);
            await createTestPermission(db, permissionId, resource, action);
            await roleService.assignPermissionToRole(roleId, permissionId);
            await groupService.assignRoleToGroup(groupId, roleId);

            rolePermissions.push({ roleId, resource, action });
          }

          // Add user to group
          await userService.addUserToGroup(userId, groupId);

          // Property: User should have permissions from all roles in the group
          for (const { resource, action } of rolePermissions) {
            const hasAccess = await permissionService.hasPermission(
              userId,
              resource,
              action
            );
            expect(hasAccess).toBe(true);
          }
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);
});

// Helper functions

async function initializeRBACSchema(db: Database): Promise<void> {
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
    );
  `;

  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const statement of statements) {
    await new Promise<void>((resolve, reject) => {
      db.run(statement, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function createTestUser(db: Database, userId: string): Promise<void> {
  const sql = `
    INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [
    userId,
    `user_${userId.substring(0, 8)}`,
    `user_${userId.substring(0, 8)}@example.com`,
    'dummy_hash',
    'Test',
    'User',
    now,
    now
  ];

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createTestGroup(db: Database, groupId: string, name?: string): Promise<void> {
  const sql = `
    INSERT INTO groups (id, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `;

  const now = new Date().toISOString();
  const groupName = name || `group_${groupId}`;
  const params = [
    groupId,
    groupName,
    'Test group',
    now,
    now
  ];

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createTestRole(db: Database, roleId: string, name?: string): Promise<void> {
  const sql = `
    INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
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

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createTestPermission(
  db: Database,
  permissionId: string,
  resource: string,
  action: string
): Promise<void> {
  const sql = `
    INSERT INTO permissions (id, resource, action, description, createdAt)
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

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
