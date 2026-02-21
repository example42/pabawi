import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import { randomUUID } from 'crypto';

/**
 * Property-Based Tests for Role Assignment Idempotence
 *
 * **Validates: Requirements 14.6**
 *
 * Property 11: Role Assignment Idempotence
 * ∀ user ∈ Users, role ∈ Roles:
 *   assignRoleToUser(user, role) ∧ assignRoleToUser(user, role) ⟹
 *     |{r ∈ user.roles : r.id = role.id}| = 1
 *
 * This property validates that:
 * - Assigning the same role multiple times results in single assignment
 * - Role assignments are idempotent
 * - No duplicate role assignments exist
 */
describe('Role Assignment Idempotence Properties', () => {
  let db: Database;
  let userService: UserService;
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
   * Property 11: Role Assignment Idempotence
   *
   * **Validates: Requirements 14.6**
   *
   * This property test verifies that:
   * 1. Assigning the same role multiple times results in only one assignment record
   * 2. The system maintains idempotence for role assignments
   * 3. No duplicate role assignments exist in the database
   */
  it('should maintain only one role assignment when assigned multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a small number of assignment attempts (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (assignmentAttempts) => {
          // Setup: Create a user and a role
          const userId = randomUUID();
          const roleId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);

          // Attempt to assign the same role multiple times
          let successfulAssignments = 0;
          let errors = 0;

          for (let i = 0; i < assignmentAttempts; i++) {
            try {
              await userService.assignRoleToUser(userId, roleId);
              successfulAssignments++;
            } catch (error) {
              // Expected: subsequent assignments may throw error
              errors++;
            }
          }

          // Property 1: At least one assignment should succeed
          expect(successfulAssignments).toBeGreaterThanOrEqual(1);

          // Property 2: Query the database to verify only one assignment exists
          const assignments = await queryUserRoleAssignments(db, userId, roleId);
          expect(assignments).toBe(1);

          // Property 3: getUserRoles should return the role exactly once
          const userRoles = await userService.getUserRoles(userId);
          const matchingRoles = userRoles.filter(r => r.id === roleId);
          expect(matchingRoles.length).toBe(1);
        }
      ),
      {
        numRuns: 50,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Multiple roles can be assigned to same user
   *
   * Verifies that while duplicate role assignments are prevented,
   * a user can have multiple different roles assigned.
   */
  it('should allow multiple different roles to be assigned to the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-5 different roles
        fc.integer({ min: 2, max: 5 }),
        async (numberOfRoles) => {
          // Setup: Create a user and multiple roles
          const userId = randomUUID();
          await createTestUser(db, userId);

          const roleIds: string[] = [];
          for (let i = 0; i < numberOfRoles; i++) {
            const roleId = randomUUID();
            // Use roleId in name to ensure uniqueness across test runs
            await createTestRole(db, roleId, `Role_${roleId.substring(0, 8)}_${i}`);
            roleIds.push(roleId);
          }

          // Assign all roles to the user
          for (const roleId of roleIds) {
            await userService.assignRoleToUser(userId, roleId);
          }

          // Property: User should have exactly the number of roles assigned
          const userRoles = await userService.getUserRoles(userId);
          expect(userRoles.length).toBe(numberOfRoles);

          // Property: All assigned role IDs should be present
          const assignedRoleIds = userRoles.map(r => r.id).sort();
          const expectedRoleIds = roleIds.sort();
          expect(assignedRoleIds).toEqual(expectedRoleIds);
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Idempotence with concurrent-like assignments
   *
   * Verifies that even with rapid successive assignments,
   * only one assignment record is maintained.
   */
  it('should maintain idempotence with rapid successive assignments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No random input needed
        async () => {
          // Setup: Create a user and a role
          const userId = randomUUID();
          const roleId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);

          // Attempt rapid successive assignments
          const assignmentPromises = [];
          for (let i = 0; i < 10; i++) {
            assignmentPromises.push(
              userService.assignRoleToUser(userId, roleId).catch(() => {
                // Ignore errors from duplicate assignments
              })
            );
          }

          // Wait for all attempts to complete
          await Promise.all(assignmentPromises);

          // Property: Only one assignment should exist
          const assignments = await queryUserRoleAssignments(db, userId, roleId);
          expect(assignments).toBe(1);

          // Property: getUserRoles should return the role exactly once
          const userRoles = await userService.getUserRoles(userId);
          const matchingRoles = userRoles.filter(r => r.id === roleId);
          expect(matchingRoles.length).toBe(1);
        }
      ),
      {
        numRuns: 10,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Assignment and removal idempotence
   *
   * Verifies that assigning, removing, and re-assigning a role
   * maintains correct state.
   */
  it('should handle assignment-removal-reassignment correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (cycles) => {
          // Setup: Create a user and a role
          const userId = randomUUID();
          const roleId = randomUUID();

          await createTestUser(db, userId);
          await createTestRole(db, roleId);

          // Perform multiple assign-remove cycles
          for (let i = 0; i < cycles; i++) {
            // Assign
            await userService.assignRoleToUser(userId, roleId);

            // Verify assignment exists
            let assignments = await queryUserRoleAssignments(db, userId, roleId);
            expect(assignments).toBe(1);

            // Remove
            await userService.removeRoleFromUser(userId, roleId);

            // Verify assignment removed
            assignments = await queryUserRoleAssignments(db, userId, roleId);
            expect(assignments).toBe(0);
          }

          // Final assignment
          await userService.assignRoleToUser(userId, roleId);

          // Property: Final state should have exactly one assignment
          const finalAssignments = await queryUserRoleAssignments(db, userId, roleId);
          expect(finalAssignments).toBe(1);
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

    CREATE TABLE IF NOT EXISTS user_roles (
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
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
  // Use roleId in the name to ensure uniqueness
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

async function queryUserRoleAssignments(
  db: Database,
  userId: string,
  roleId: string
): Promise<number> {
  const sql = 'SELECT COUNT(*) as count FROM user_roles WHERE userId = ? AND roleId = ?';  // pragma: allowlist secret

  return new Promise<number>((resolve, reject) => {
    db.get(sql, [userId, roleId], (err, row: any) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });
}
