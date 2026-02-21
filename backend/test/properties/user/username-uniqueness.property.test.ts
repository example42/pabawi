import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../../../src/services/UserService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for Username Uniqueness
 *
 * **Validates: Requirements 2.1, 14.1**
 *
 * Property 8: Username Uniqueness
 * ∀ u1, u2 ∈ Users:
 *   u1.id ≠ u2.id ⟹ u1.username ≠ u2.username
 *
 * This property validates that:
 * - All usernames are unique across the system
 * - Attempting to create a user with an existing username fails
 * - No two users can have the same username
 */
describe('Username Uniqueness Properties', () => {
  let db: Database;
  let authService: AuthenticationService;
  let userService: UserService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

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
   * Property 8: Username Uniqueness
   *
   * **Validates: Requirements 2.1, 14.1**
   *
   * This property test verifies that:
   * 1. All successfully created users have unique usernames
   * 2. Attempting to create a user with an existing username fails
   * 3. The system enforces username uniqueness at the service level
   */
  it('should enforce username uniqueness across all users', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an array of user data with potentially duplicate usernames
        fc.array(
          fc.record({
            username: fc.string({ minLength: 3, maxLength: 50 })
              .filter(s => /^[a-zA-Z0-9_]+$/.test(s)), // Valid username format
            email: fc.emailAddress(),
            password: fc.string({ minLength: 4, maxLength: 96 })
              .map(s => 'Aa1!' + s), // Ensure password complexity (uppercase, lowercase, number, special)
            firstName: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 100 })
              .filter(s => s.trim().length > 0)
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (usersData) => {
          const createdUsers = [];
          const failedUsernames = new Set<string>();

          // Attempt to create all users
          for (const userData of usersData) {
            try {
              const user = await userService.createUser(userData);
              createdUsers.push(user);
            } catch (error) {
              // Expected to fail for duplicate usernames or emails
              if (error instanceof Error &&
                  (error.message.includes('Username already exists') ||
                   error.message.includes('Email already exists'))) {
                failedUsernames.add(userData.username);
              } else {
                // Unexpected error - rethrow
                throw error;
              }
            }
          }

          // Property 1: All created users have unique usernames
          const usernames = createdUsers.map(u => u.username);
          const uniqueUsernames = new Set(usernames);
          expect(usernames.length).toBe(uniqueUsernames.size);

          // Property 2: All created users have unique IDs
          const userIds = createdUsers.map(u => u.id);
          const uniqueIds = new Set(userIds);
          expect(userIds.length).toBe(uniqueIds.size);

          // Property 3: For any two different users, their usernames must be different
          for (let i = 0; i < createdUsers.length; i++) {
            for (let j = i + 1; j < createdUsers.length; j++) {
              const user1 = createdUsers[i];
              const user2 = createdUsers[j];

              // Different IDs must have different usernames
              if (user1.id !== user2.id) {
                expect(user1.username).not.toBe(user2.username);
              }
            }
          }

          // Property 4: Attempting to create a user with an existing username should fail
          if (createdUsers.length > 0) {
            const existingUser = createdUsers[0];
            const duplicateAttempt = {
              username: existingUser.username,
              email: 'different@example.com',
              password: 'DifferentPass123!',
              firstName: 'Different',
              lastName: 'User'
            };

            await expect(userService.createUser(duplicateAttempt))
              .rejects
              .toThrow('Username already exists');
          }
        }
      ),
      {
        numRuns: 50,
        timeout: 60000,
        verbose: false
      }
    );
  }, 120000);

  /**
   * Additional property: Username uniqueness persists across operations
   *
   * Verifies that username uniqueness is maintained even after
   * other database operations.
   */
  it('should maintain username uniqueness after multiple operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            username: fc.string({ minLength: 3, maxLength: 50 })
              .filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
            email: fc.emailAddress(),
            password: fc.string({ minLength: 4, maxLength: 96 })
              .map(s => 'Aa1!' + s)
          }),
          { minLength: 3, maxLength: 5 }
        ),
        async (usersData) => {
          const createdUsers = [];

          // Create users one by one
          for (const userData of usersData) {
            try {
              const user = await userService.createUser({
                ...userData,
                firstName: 'Test',
                lastName: 'User'
              });
              createdUsers.push(user);
            } catch (error) {
              // Expected for duplicates
              if (error instanceof Error &&
                  !error.message.includes('already exists')) {
                throw error;
              }
            }
          }

          // Verify uniqueness after all creations
          const usernames = createdUsers.map(u => u.username);
          const uniqueUsernames = new Set(usernames);
          expect(usernames.length).toBe(uniqueUsernames.size);

          // Try to create a duplicate of the first user
          if (createdUsers.length > 0) {
            const firstUser = createdUsers[0];
            await expect(
              userService.createUser({
                username: firstUser.username,
                email: 'newemail@example.com',
                password: 'NewPass123!',
                firstName: 'New',
                lastName: 'User'
              })
            ).rejects.toThrow('Username already exists');
          }

          // Verify all users can still be retrieved by username
          for (const user of createdUsers) {
            const retrieved = await userService.getUserByUsername(user.username);
            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe(user.id);
            expect(retrieved?.username).toBe(user.username);
          }
        }
      ),
      {
        numRuns: 30,
        timeout: 60000
      }
    );
  }, 120000);
});

// Helper function to initialize schema
async function initializeSchema(db: Database): Promise<void> {
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

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS user_groups (
      userId TEXT NOT NULL,
      groupId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, groupId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_roles (
      groupId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (groupId, roleId),
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
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
