import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for Password Hashing
 *
 * **Validates: Requirements 1.5**
 *
 * Property 1: Password Security
 * ∀ user ∈ Users, password ∈ Passwords:
 *   stored(user.passwordHash) ⟹
 *     bcrypt.verify(password, user.passwordHash) ∧
 *     ¬∃ f: f(user.passwordHash) = password
 *
 * This property validates that:
 * - All passwords are hashed using bcrypt and cannot be reversed
 * - Different hashes are generated for the same password (due to salt)
 * - Both hashes verify correctly against the original password
 */
describe('Password Hashing Properties', () => {
  let db: Database;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize minimal schema (not needed for password hashing tests, but good practice)
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
   * Property 1: Password Security
   *
   * **Validates: Requirements 1.5**
   *
   * This property test verifies that:
   * 1. Passwords are hashed using bcrypt (cannot be reversed)
   * 2. Different hashes are generated for the same password (due to salt)
   * 3. Both hashes verify correctly against the original password
   */
  it('should hash passwords securely with bcrypt and generate different salts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random passwords with minimum length of 8 characters
        fc.string({ minLength: 8, maxLength: 100 }),
        async (password) => {
          // Hash the password twice
          const hash1 = await authService.hashPassword(password);
          const hash2 = await authService.hashPassword(password);

          // Property 1: Hashes should be different due to different salts
          expect(hash1).not.toBe(hash2);

          // Property 2: Hash should not equal the original password (irreversibility)
          expect(hash1).not.toBe(password);
          expect(hash2).not.toBe(password);

          // Property 3: Hash should be in bcrypt format
          expect(hash1).toMatch(/^\$2[aby]\$/);
          expect(hash2).toMatch(/^\$2[aby]\$/);

          // Property 4: Both hashes should verify correctly against the original password
          const verify1 = await authService.comparePassword(password, hash1);
          const verify2 = await authService.comparePassword(password, hash2);

          expect(verify1).toBe(true);
          expect(verify2).toBe(true);

          // Property 5: Wrong password should not verify
          const wrongPassword = password + 'x';
          const verifyWrong1 = await authService.comparePassword(wrongPassword, hash1);
          const verifyWrong2 = await authService.comparePassword(wrongPassword, hash2);

          expect(verifyWrong1).toBe(false);
          expect(verifyWrong2).toBe(false);
        }
      ),
      {
        // Run 20 test cases (bcrypt is slow, so we reduce iterations)
        numRuns: 20,
        // Set timeout for async operations
        timeout: 60000,
        // Enable verbose mode for better debugging
        verbose: false
      }
    );
  }, 120000); // 2 minute timeout for the test itself

  /**
   * Additional property: Hash consistency
   *
   * Verifies that the same password always verifies against its hash,
   * regardless of when the verification happens.
   */
  it('should consistently verify the same password against its hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 100 }),
        async (password) => {
          const hash = await authService.hashPassword(password);

          // Verify multiple times - should always return true
          const verify1 = await authService.comparePassword(password, hash);
          const verify2 = await authService.comparePassword(password, hash);
          const verify3 = await authService.comparePassword(password, hash);

          expect(verify1).toBe(true);
          expect(verify2).toBe(true);
          expect(verify3).toBe(true);
        }
      ),
      {
        numRuns: 10,
        timeout: 60000
      }
    );
  }, 120000);

  /**
   * Additional property: Hash format validation
   *
   * Verifies that all generated hashes follow the bcrypt format specification.
   */
  it('should always generate valid bcrypt hash format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 100 }),
        async (password) => {
          const hash = await authService.hashPassword(password);

          // Bcrypt hash format: $2a$10$[22 character salt][31 character hash]
          // Total length should be 60 characters
          expect(hash.length).toBe(60);

          // Should start with $2a$, $2b$, or $2y$ (bcrypt version identifiers)
          expect(hash).toMatch(/^\$2[aby]\$/);

          // Should contain the cost factor (default 10)
          expect(hash).toMatch(/^\$2[aby]\$10\$/);
        }
      ),
      {
        numRuns: 10,
        timeout: 60000
      }
    );
  }, 120000);

  /**
   * Additional property: Different passwords produce different hashes
   *
   * Verifies that different passwords always produce different hashes
   * (collision resistance).
   */
  it('should produce different hashes for different passwords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 100 }),
        fc.string({ minLength: 8, maxLength: 100 }),
        async (password1, password2) => {
          // Skip if passwords are the same
          fc.pre(password1 !== password2);

          const hash1 = await authService.hashPassword(password1);
          const hash2 = await authService.hashPassword(password2);

          // Different passwords should produce different hashes
          expect(hash1).not.toBe(hash2);

          // Each hash should only verify its own password
          expect(await authService.comparePassword(password1, hash1)).toBe(true);
          expect(await authService.comparePassword(password2, hash2)).toBe(true);
          expect(await authService.comparePassword(password1, hash2)).toBe(false);
          expect(await authService.comparePassword(password2, hash1)).toBe(false);
        }
      ),
      {
        numRuns: 10,
        timeout: 60000
      }
    );
  }, 120000);
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
