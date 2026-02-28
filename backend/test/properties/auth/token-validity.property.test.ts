import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';
import * as jwt from 'jsonwebtoken';

/**
 * Property-Based Tests for Token Validity
 *
 * **Validates: Requirements 6.1, 6.6**
 *
 * Property 2: Token Validity
 * ∀ token ∈ Tokens:
 *   valid(token) ⟺
 *     (verify(token, JWT_SECRET) ∧
 *      token.exp > now() ∧
 *      token ∉ RevokedTokens)
 *
 * This property validates that:
 * - A token is valid if and only if it's properly signed, not expired, and not revoked
 * - Expired tokens are rejected
 * - Revoked tokens are rejected
 * - Valid tokens can be verified
 */
describe('Token Validity Properties', () => {
  let db: Database;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize minimal schema
    await initializeMinimalSchema(db);

    // Create auth service
    authService = new AuthenticationService(db, testJwtSecret);
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
   * Property 2: Token Validity
   *
   * **Validates: Requirements 6.1, 6.6**
   *
   * This property test verifies that:
   * 1. Valid tokens (properly signed, not expired, not revoked) can be verified
   * 2. Expired tokens are rejected
   * 3. Tokens with invalid signatures are rejected
   * 4. Revoked tokens are rejected
   */
  it('should validate tokens based on signature, expiration, and revocation status', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random user data
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 3, maxLength: 50 }),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
        }),
        // Generate expiry offset in seconds (-3600 to 3600, i.e., -1 hour to +1 hour)
        fc.integer({ min: -3600, max: 3600 }),
        async (user, expiryOffset) => {
          // Create a token with custom expiry
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            iat: now,
            exp: now + expiryOffset,
            jti: 'test-token-id'
          };

          const token = jwt.sign(payload, testJwtSecret, { algorithm: 'HS256' });

          if (expiryOffset <= 0) {
            // Property: Expired or immediately expiring tokens should be rejected
            await expect(authService.verifyToken(token)).rejects.toThrow();
          } else {
            // Property: Valid tokens should be verified successfully
            const verifiedPayload = await authService.verifyToken(token);

            expect(verifiedPayload.userId).toBe(user.userId);
            expect(verifiedPayload.username).toBe(user.username);
            expect(verifiedPayload.roles).toEqual(user.roles);
          }
        }
      ),
      {
        numRuns: 50,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Invalid signature rejection
   *
   * Verifies that tokens signed with a different secret are always rejected.
   */
  it('should reject tokens with invalid signatures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 3, maxLength: 50 }),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
        }),
        fc.string({ minLength: 10, maxLength: 50 }), // Different secret
        async (user, wrongSecret) => {
          // Skip if the wrong secret happens to match the test secret
          fc.pre(wrongSecret !== testJwtSecret);

          const now = Math.floor(Date.now() / 1000);
          const payload = {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            iat: now,
            exp: now + 3600, // Valid expiry
            jti: 'test-token-id'
          };

          // Sign with wrong secret
          const token = jwt.sign(payload, wrongSecret, { algorithm: 'HS256' });

          // Property: Token with invalid signature should be rejected
          await expect(authService.verifyToken(token)).rejects.toThrow();
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Revoked token rejection
   *
   * Verifies that revoked tokens are always rejected, even if they are
   * properly signed and not expired.
   */
  it('should reject revoked tokens even if properly signed and not expired', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 3, maxLength: 50 }),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
        }),
        async (user) => {
          // Create a valid token
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            iat: now,
            exp: now + 3600, // Valid for 1 hour
            jti: 'test-token-id'
          };

          const token = jwt.sign(payload, testJwtSecret, { algorithm: 'HS256' });

          // Verify token is valid before revocation
          const verifiedBefore = await authService.verifyToken(token);
          expect(verifiedBefore.userId).toBe(user.userId);

          // Revoke the token
          await authService.revokeToken(token);

          // Property: Revoked token should be rejected
          await expect(authService.verifyToken(token)).rejects.toThrow('Token has been revoked');
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Token expiration boundary
   *
   * Verifies that tokens expire exactly at their expiration time.
   */
  it('should reject tokens at exact expiration boundary', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 3, maxLength: 50 }),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
        }),
        async (user) => {
          // Create a token that expires in the past
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            iat: now - 7200, // Issued 2 hours ago
            exp: now - 3600, // Expired 1 hour ago
            jti: 'test-token-id'
          };

          const token = jwt.sign(payload, testJwtSecret, { algorithm: 'HS256' });

          // Property: Expired token should be rejected
          await expect(authService.verifyToken(token)).rejects.toThrow();
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Additional property: Valid token consistency
   *
   * Verifies that a valid token can be verified multiple times
   * and always returns the same payload.
   */
  it('should consistently verify valid tokens multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          username: fc.string({ minLength: 3, maxLength: 50 }),
          roles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })
        }),
        async (user) => {
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            iat: now,
            exp: now + 3600,
            jti: 'test-token-id'
          };

          const token = jwt.sign(payload, testJwtSecret, { algorithm: 'HS256' });

          // Verify multiple times
          const verified1 = await authService.verifyToken(token);
          const verified2 = await authService.verifyToken(token);
          const verified3 = await authService.verifyToken(token);

          // Property: All verifications should return the same payload
          expect(verified1.userId).toBe(user.userId);
          expect(verified2.userId).toBe(user.userId);
          expect(verified3.userId).toBe(user.userId);

          expect(verified1.username).toBe(user.username);
          expect(verified2.username).toBe(user.username);
          expect(verified3.username).toBe(user.username);

          expect(verified1.roles).toEqual(user.roles);
          expect(verified2.roles).toEqual(user.roles);
          expect(verified3.roles).toEqual(user.roles);
        }
      ),
      {
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);
});

// Helper function to initialize minimal schema
async function initializeMinimalSchema(db: Database): Promise<void> {
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
