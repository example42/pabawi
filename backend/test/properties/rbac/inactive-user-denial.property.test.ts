import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

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

async function createTestUser(
  db: Database,
  userId: string,
  isActive: boolean = true,
  isAdmin: boolean = false
): Promise<void> {
  const sql = `
    INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
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

async function createTestGroup(db: Database, groupId: string): Promise<void> {
  const sql = `
    INSERT INTO groups (id, name, description, createdAt, updatedAt)
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

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function assignRoleToGroup(db: Database, groupId: string, roleId: string): Promise<void> {
  const sql = `
    INSERT INTO group_roles (groupId, roleId, assignedAt)
    VALUES (?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [groupId, roleId, now];

  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
