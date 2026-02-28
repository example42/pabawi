import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

/**
 * Property-Based Tests for Permission Transitivity
 *
 * **Validates: Requirements 8.1, 4.6**
 *
 * Property 4: Permission Transitivity
 * ∀ user ∈ Users, role ∈ Roles, permission ∈ Permissions:
 *   (user ∈ role.users ∧ permission ∈ role.permissions) ⟹
 *     hasPermission(user, permission.resource, permission.action) = true
 *
 * This property validates that:
 * - Users inherit all permissions from their assigned roles
 * - If a user has a role, and that role has a permission, then the user has that permission
 * - Permission inheritance is transitive
 */
describe('Permission Transitivity Properties', () => {
  let db: Database;
  let userService: UserService;
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
   * Property 4: Permission Transitivity
   *
   * **Validates: Requirements 8.1, 4.6**
   *
   * This property test verifies that:
   * 1. When a user is assigned a role
   * 2. And that role has a permission
   * 3. Then the user has that permission
   */
  it('should grant user permission when role with that permission is assigned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No random input needed for basic test
        async () => {
          // Setup: Create user, role, and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Step 1: Assign permission to role
          await roleService.assignPermissionToRole(roleId, permissionId);

          // Step 2: Assign role to user
          await userService.assignRoleToUser(userId, roleId);

          // Get permission details
          const permission = await permissionService.getPermissionById(permissionId);
          expect(permission).not.toBeNull();

          // Property: User should have the permission
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
   * Property: Multiple permissions transitivity
   *
   * Verifies that when a role has multiple permissions,
   * all of them are inherited by the user.
   */
  it('should grant user all permissions from assigned role', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numPermissions) => {
          // Setup: Create user and role
          const userId = randomUUID();
          const roleId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);

          // Create multiple permissions and assign to role
          const permissionIds: string[] = [];
          const permissionDetails: Array<{ resource: string; action: string }> = [];

          for (let i = 0; i < numPermissions; i++) {
            const permissionId = randomUUID();
            // Use permissionId to ensure uniqueness across all test runs
            const resource = `resource_${permissionId.substring(0, 8)}`;
            const action = `action_${permissionId.substring(0, 8)}`;

            await createTestPermission(db, permissionId, resource, action);
            await roleService.assignPermissionToRole(roleId, permissionId);

            permissionIds.push(permissionId);
            permissionDetails.push({ resource, action });
          }

          // Assign role to user
          await userService.assignRoleToUser(userId, roleId);

          // Property: User should have all permissions from the role
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
   * Property: Permission transitivity with multiple roles
   *
   * Verifies that when a user has multiple roles,
   * they inherit permissions from all roles.
   */
  it('should grant user permissions from all assigned roles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        async (numRoles) => {
          // Setup: Create user
          const userId = randomUUID();
          await createTestUser(db, userId);

          // Create multiple roles, each with a unique permission
          const rolePermissions: Array<{ roleId: string; resource: string; action: string }> = [];

          for (let i = 0; i < numRoles; i++) {
            const roleId = randomUUID();
            const permissionId = randomUUID();
            // Use roleId and permissionId to ensure uniqueness across all test runs
            const resource = `resource_${permissionId.substring(0, 8)}`;
            const action = `action_${permissionId.substring(0, 8)}`;

            await createTestRole(db, roleId, `role_${roleId.substring(0, 8)}`);
            await createTestPermission(db, permissionId, resource, action);
            await roleService.assignPermissionToRole(roleId, permissionId);
            await userService.assignRoleToUser(userId, roleId);

            rolePermissions.push({ roleId, resource, action });
          }

          // Property: User should have permissions from all roles
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

  /**
   * Property: Permission denial without role assignment
   *
   * Verifies that users do NOT have permissions from roles
   * they are not assigned to (negative test).
   */
  it('should NOT grant permission when role is not assigned to user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, role, and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Assign permission to role, but DON'T assign role to user
          await roleService.assignPermissionToRole(roleId, permissionId);

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
   * Property: Permission revocation on role removal
   *
   * Verifies that when a role is removed from a user,
   * they lose the permissions from that role.
   */
  it('should revoke permission when role is removed from user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, role, and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Assign permission to role and role to user
          await roleService.assignPermissionToRole(roleId, permissionId);
          await userService.assignRoleToUser(userId, roleId);

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

          // Remove role from user
          await userService.removeRoleFromUser(userId, roleId);

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
   * Property: Permission persistence across cache
   *
   * Verifies that permission checks are consistent
   * whether cached or not.
   */
  it('should return consistent permission results with and without cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create user, role, and permission
          const userId = randomUUID();
          const roleId = randomUUID();
          const permissionId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);
          // Use unique resource/action names to avoid conflicts across test runs
          await createTestPermission(db, permissionId, `resource_${permissionId.substring(0, 8)}`, `action_${permissionId.substring(0, 8)}`);

          // Assign permission to role and role to user
          await roleService.assignPermissionToRole(roleId, permissionId);
          await userService.assignRoleToUser(userId, roleId);

          // Get permission details
          const permission = await permissionService.getPermissionById(permissionId);
          expect(permission).not.toBeNull();

          // First check (cache miss)
          const firstCheck = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
          );

          // Second check (cache hit)
          const secondCheck = await permissionService.hasPermission(
            userId,
            permission!.resource,
            permission!.action
          );

          // Property: Both checks should return the same result
          expect(firstCheck).toBe(secondCheck);
          expect(firstCheck).toBe(true);
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
