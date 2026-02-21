import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { PermissionService } from '../../../src/services/PermissionService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

/**
 * Property-Based Tests for Admin Privilege
 *
 * **Validates: Requirements 5.5**
 *
 * Property 6: Admin Privilege
 * ∀ user ∈ Users, resource ∈ Resources, action ∈ Actions:
 *   user.isAdmin = true ⟹
 *     hasPermission(user, resource, action) = true
 *
 * This property validates that:
 * - Admin users have all permissions on all resources
 * - Admin flag grants universal access
 * - Admin users bypass normal permission checks
 */
describe('Admin Privilege Properties', () => {
  let db: Database;
  let userService: UserService;
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
   * Property 6: Admin Privilege
   *
   * **Validates: Requirements 5.5**
   *
   * This property test verifies that:
   * 1. When a user is marked as admin (isAdmin = true)
   * 2. Then the user has permission for ANY resource and action
   * 3. Admin users bypass normal role/permission checks
   */
  it('should grant admin users all permissions on all resources', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        async (resource, action) => {
          // Setup: Create user and make them admin
          const userId = randomUUID();
          await createTestUser(db, userId);

          // Make user admin
          await userService.updateUser(userId, { isAdmin: true });

          // Property: Admin has all permissions on any resource/action
          const hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );

          expect(hasAccess).toBe(true);
        }
      ),
      {
        numRuns: 100,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Admin privilege without any role assignments
   *
   * Verifies that admin users have permissions even when
   * they have no roles or group memberships.
   */
  it('should grant admin users permissions without any role assignments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create admin user with NO roles
          const userId = randomUUID();
          await createTestUser(db, userId, true); // Create as admin

          // Verify user has no roles
          const roles = await userService.getUserRoles(userId);
          expect(roles.length).toBe(0);

          // Verify user has no groups
          const groups = await userService.getUserGroups(userId);
          expect(groups.length).toBe(0);

          // Generate random resource and action
          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Property: Admin still has permission
          const hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
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
   * Property: Admin privilege on non-existent permissions
   *
   * Verifies that admin users have access even to resources/actions
   * that don't exist in the permissions table.
   */
  it('should grant admin users access to non-existent permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create admin user
          const userId = randomUUID();
          await createTestUser(db, userId, true);

          // Use resource/action that definitely doesn't exist in permissions table
          const resource = `nonexistent_${randomUUID()}`;
          const action = `nonexistent_${randomUUID()}`;

          // Verify permission doesn't exist
          const permissions = await permissionService.listPermissions({
            resource,
            action
          });
          expect(permissions.items.length).toBe(0);

          // Property: Admin still has access
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

  /**
   * Property: Non-admin users don't have universal access
   *
   * Verifies that regular users (isAdmin = false) do NOT have
   * automatic access to all resources (negative test).
   */
  it('should NOT grant non-admin users universal permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create regular user (not admin)
          const userId = randomUUID();
          await createTestUser(db, userId, false);

          // Use random resource/action
          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Property: Non-admin user should NOT have permission
          const hasAccess = await permissionService.hasPermission(
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
   * Property: Admin privilege persists across cache
   *
   * Verifies that admin privilege checks are consistent
   * whether cached or not.
   */
  it('should return consistent admin privilege results with and without cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        async (resource, action) => {
          // Setup: Create admin user
          const userId = randomUUID();
          await createTestUser(db, userId, true);

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

          // Property: Both checks should return true
          expect(firstCheck).toBe(true);
          expect(secondCheck).toBe(true);
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
   * Property: Admin promotion grants immediate access
   *
   * Verifies that when a regular user is promoted to admin,
   * they immediately gain universal access.
   */
  it('should grant universal access immediately when user is promoted to admin', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create regular user
          const userId = randomUUID();
          await createTestUser(db, userId, false);

          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Verify user doesn't have permission initially
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(false);

          // Promote user to admin
          await userService.updateUser(userId, { isAdmin: true });

          // Invalidate cache to ensure fresh check
          permissionService.invalidateUserPermissionCache(userId);

          // Property: User now has permission
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
   * Property: Admin demotion revokes universal access
   *
   * Verifies that when an admin is demoted to regular user,
   * they lose universal access (unless they have explicit permissions).
   */
  it('should revoke universal access when admin is demoted to regular user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Setup: Create admin user
          const userId = randomUUID();
          await createTestUser(db, userId, true);

          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Verify admin has permission
          let hasAccess = await permissionService.hasPermission(
            userId,
            resource,
            action
          );
          expect(hasAccess).toBe(true);

          // Demote user from admin
          await userService.updateUser(userId, { isAdmin: false });

          // Invalidate cache to ensure fresh check
          permissionService.invalidateUserPermissionCache(userId);

          // Property: User no longer has permission (no explicit roles/permissions)
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
   * Property: Multiple admin users all have universal access
   *
   * Verifies that the admin privilege works consistently
   * across multiple admin users.
   */
  it('should grant universal access to all admin users', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (numAdmins) => {
          // Setup: Create multiple admin users
          const adminIds: string[] = [];
          for (let i = 0; i < numAdmins; i++) {
            const userId = randomUUID();
            await createTestUser(db, userId, true);
            adminIds.push(userId);
          }

          const resource = `resource_${randomUUID().substring(0, 8)}`;
          const action = `action_${randomUUID().substring(0, 8)}`;

          // Property: All admins have permission
          for (const adminId of adminIds) {
            const hasAccess = await permissionService.hasPermission(
              adminId,
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

async function createTestUser(db: Database, userId: string, isAdmin: boolean = false): Promise<void> {
  const sql = `
    INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `;

  const now = new Date().toISOString();
  const params = [
    userId,
    `user_${userId.substring(0, 8)}`,
    `user_${userId.substring(0, 8)}@example.com`,
    'dummy_hash',
    'Test',
    'User',
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
