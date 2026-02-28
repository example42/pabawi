import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import { UserService } from '../../../src/services/UserService';
import * as fc from 'fast-check';
import { randomBytes } from 'crypto';

/**
 * Custom arbitrary for generating valid passwords that meet complexity requirements:
 * - At least 8 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains number
 * - Contains special character
 */
const validPasswordArbitrary = fc.string({ minLength: 4, maxLength: 46 }).map(base => {
  // Ensure password meets all requirements
  return `Aa1!${base}`;
});

/**
 * Property-Based Tests for Authentication Atomicity
 *
 * **Validates: Requirements 1.1, 1.4**
 *
 * Property 3: Authentication Atomicity
 * ∀ username, password:
 *   authenticate(username, password).success = true ⟹
 *     (∃ user: user.username = username ∧
 *      user.isActive = true ∧
 *      bcrypt.compare(password, user.passwordHash) = true)
 *
 * This property validates that:
 * - Successful authentication requires valid credentials and active account
 * - Authentication is atomic - either fully succeeds or fully fails
 * - No partial authentication states exist
 */
describe('Authentication Atomicity Properties', () => {
  let db: Database;
  let authService: AuthenticationService;
  let userService: UserService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create services (AuthService first, then UserService with AuthService)
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
   * Property 3: Authentication Atomicity
   *
   * **Validates: Requirements 1.1, 1.4**
   *
   * This property test verifies that successful authentication is atomic:
   * - If authentication succeeds, then ALL conditions must be true:
   *   1. User exists with the given username
   *   2. User account is active
   *   3. Password matches the stored hash
   * - If ANY condition fails, authentication must fail
   * - No partial authentication states exist
   */
  it('should authenticate atomically - success requires all conditions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data with unique username per iteration
        fc.record({
          usernameBase: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          email: fc.emailAddress(),
          password: validPasswordArbitrary,
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 }),
          isActive: fc.boolean()
        }),
        async (userData) => {
          // Make username unique by adding random suffix
          const username = `${userData.usernameBase}_${randomBytes(4).toString('hex')}`;

          // Create user with the generated data
          const user = await userService.createUser({
            username,
            email: userData.email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName
          });

          // Set user active status
          if (!userData.isActive) {
            await userService.deactivateUser(user.id);
          }

          // Attempt authentication with correct password
          const authResult = await authService.authenticate(
            username,
            userData.password
          );

          // Property: Authentication succeeds if and only if user is active
          if (userData.isActive) {
            // All conditions met: user exists, active, correct password
            expect(authResult.success).toBe(true);
            expect(authResult.token).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();
            expect(authResult.user).toBeDefined();
            expect(authResult.user?.username).toBe(username);
            expect(authResult.user?.isActive).toBe(true);
            expect(authResult.error).toBeUndefined();
          } else {
            // User inactive - authentication must fail atomically
            expect(authResult.success).toBe(false);
            expect(authResult.token).toBeUndefined();
            expect(authResult.refreshToken).toBeUndefined();
            expect(authResult.user).toBeUndefined();
            expect(authResult.error).toBeDefined();
          }
        }
      ),
      {
        numRuns: 20, // Reduced due to bcrypt being slow
        timeout: 60000
      }
    );
  }, 120000);

  /**
   * Property: Authentication fails atomically with wrong password
   *
   * Verifies that authentication fails completely when password is incorrect,
   * even if user exists and is active.
   */
  it('should fail atomically when password is incorrect', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          usernameBase: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          email: fc.emailAddress(),
          password: validPasswordArbitrary,
          wrongPassword: validPasswordArbitrary,
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async (userData) => {
          // Ensure passwords are different
          fc.pre(userData.password !== userData.wrongPassword);

          // Make username unique
          const username = `${userData.usernameBase}_${randomBytes(4).toString('hex')}`;

          // Create active user
          await userService.createUser({
            username,
            email: userData.email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName
          });

          // Attempt authentication with wrong password
          const authResult = await authService.authenticate(
            username,
            userData.wrongPassword
          );

          // Property: Authentication must fail completely
          expect(authResult.success).toBe(false);
          expect(authResult.token).toBeUndefined();
          expect(authResult.refreshToken).toBeUndefined();
          expect(authResult.user).toBeUndefined();
          expect(authResult.error).toBeDefined();
        }
      ),
      {
        numRuns: 15,
        timeout: 60000
      }
    );
  }, 120000);

  /**
   * Property: Authentication fails atomically for non-existent user
   *
   * Verifies that authentication fails completely when user doesn't exist.
   */
  it('should fail atomically when user does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          username: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          password: validPasswordArbitrary
        }),
        async (credentials) => {
          // Attempt authentication without creating user
          const authResult = await authService.authenticate(
            credentials.username,
            credentials.password
          );

          // Property: Authentication must fail completely
          expect(authResult.success).toBe(false);
          expect(authResult.token).toBeUndefined();
          expect(authResult.refreshToken).toBeUndefined();
          expect(authResult.user).toBeUndefined();
          expect(authResult.error).toBeDefined();
        }
      ),
      {
        numRuns: 10,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Successful authentication implies all preconditions
   *
   * This is the core atomicity property: if authentication succeeds,
   * we can verify that all required conditions are true.
   */
  it('should only succeed when all preconditions are met', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          usernameBase: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          emailBase: fc.string({ minLength: 3, maxLength: 10 }),
          password: validPasswordArbitrary,
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 })
        }),
        async (userData) => {
          // Make username and email unique
          const username = `${userData.usernameBase}_${randomBytes(4).toString('hex')}`;
          const email = `${userData.emailBase}_${randomBytes(4).toString('hex')}@test.com`;

          // Create active user
          const user = await userService.createUser({
            username,
            email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName
          });

          // Authenticate
          const authResult = await authService.authenticate(
            username,
            userData.password
          );

          // Property: If authentication succeeds, verify all preconditions
          if (authResult.success) {
            // Verify user exists
            const fetchedUser = await userService.getUserByUsername(username);
            expect(fetchedUser).toBeDefined();
            expect(fetchedUser?.id).toBe(user.id);

            // Verify user is active
            expect(fetchedUser?.isActive).toBe(1); // SQLite stores boolean as 1/0

            // Verify password matches (by attempting authentication again)
            const reauth = await authService.authenticate(
              username,
              userData.password
            );
            expect(reauth.success).toBe(true);

            // Verify token is valid
            expect(authResult.token).toBeDefined();
            const tokenPayload = await authService.verifyToken(authResult.token!);
            expect(tokenPayload.userId).toBe(user.id);
            expect(tokenPayload.username).toBe(username);
          }
        }
      ),
      {
        numRuns: 15,
        timeout: 60000
      }
    );
  }, 120000);

  /**
   * Property: No partial authentication states
   *
   * Verifies that authentication result is always complete:
   * - Either all success fields are present (token, refreshToken, user)
   * - Or all are absent and error is present
   */
  it('should never produce partial authentication states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          usernameBase: fc.string({ minLength: 3, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
          email: fc.emailAddress(),
          password: validPasswordArbitrary,
          attemptPassword: validPasswordArbitrary,
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 }),
          isActive: fc.boolean()
        }),
        async (userData) => {
          // Make username unique
          const username = `${userData.usernameBase}_${randomBytes(4).toString('hex')}`;

          // Create user
          const user = await userService.createUser({
            username,
            email: userData.email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName
          });

          // Set active status
          if (!userData.isActive) {
            await userService.deactivateUser(user.id);
          }

          // Attempt authentication
          const authResult = await authService.authenticate(
            username,
            userData.attemptPassword
          );

          // Property: Result is either completely successful or completely failed
          if (authResult.success) {
            // Success: all fields must be present
            expect(authResult.token).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();
            expect(authResult.user).toBeDefined();
            expect(authResult.error).toBeUndefined();
          } else {
            // Failure: success fields must be absent, error must be present
            expect(authResult.token).toBeUndefined();
            expect(authResult.refreshToken).toBeUndefined();
            expect(authResult.user).toBeUndefined();
            expect(authResult.error).toBeDefined();
          }
        }
      ),
      {
        numRuns: 20,
        timeout: 60000
      }
    );
  }, 120000);
});

// Helper function to initialize database schema
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

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      revokedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS failed_login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      attemptedAt TEXT NOT NULL,
      ipAddress TEXT,
      reason TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_lockouts (
      username TEXT PRIMARY KEY,
      lockoutType TEXT NOT NULL,
      lockedAt TEXT NOT NULL,
      lockedUntil TEXT,
      failedAttempts INTEGER NOT NULL,
      lastAttemptAt TEXT NOT NULL
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
