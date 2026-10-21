import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { randomUUID } from 'crypto';
import { initializeTestSchema } from '../helpers/schema';

describe('AuthenticationService - Brute Force Protection', () => {
  let db: DatabaseAdapter;
  let authService: AuthenticationService;
  const testUsername = 'testuser';  // pragma: allowlist secret
  const testPassword = 'TestPass123!';  // pragma: allowlist secret
  const wrongPassword = 'WrongPass123!';  // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    await initializeTestSchema(db);

    authService = new AuthenticationService(db, 'test-secret-key-for-route-tests-32chars');
    const passwordHash = await authService.hashPassword(testPassword);
    const userId = randomUUID();
    const now = new Date().toISOString();

    await runQuery(db, `
      INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `, [userId, testUsername, 'test@example.com', passwordHash, 'Test', 'User', now, now]);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should allow authentication with correct credentials', async () => {
    const result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.user?.username).toBe(testUsername);
  });

  it('should track failed login attempts', async () => {
    // Attempt with wrong password
    const result = await authService.authenticate(testUsername, wrongPassword);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');

    // Check that attempt was recorded
    const attempts = await authService.getFailedLoginAttempts(testUsername);
    expect(attempts.length).toBe(1);
    expect(attempts[0].reason).toBe('Invalid password');
  });

  it('should apply temporary lockout after 5 failed attempts', async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Check lockout status
    const lockoutStatus = await authService.getAccountLockoutStatus(testUsername);
    expect(lockoutStatus).not.toBeNull();
    expect(lockoutStatus?.lockoutType).toBe('temporary');
    expect(lockoutStatus?.failedAttempts).toBe(5);

    // Try to authenticate - should be locked
    const result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily locked');
  });

  it('should NOT apply permanent lockout — only temporary (C2)', async () => {
    // Per C2, permanent lockout was removed (it created a trivial self-service
    // DoS against any legitimate user). 10 attempts → still only a temporary
    // lockout from the first 5 attempts in the 15min window.
    for (let i = 0; i < 10; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    const lockoutStatus = await authService.getAccountLockoutStatus(testUsername);
    expect(lockoutStatus).not.toBeNull();
    expect(lockoutStatus?.lockoutType).toBe('temporary');
  });

  it('should clear failed attempts on successful authentication', async () => {
    // Make 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Verify attempts were recorded
    let attempts = await authService.getFailedLoginAttempts(testUsername);
    expect(attempts.length).toBe(3);

    // Successful authentication
    const result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(true);

    // Verify attempts were cleared
    attempts = await authService.getFailedLoginAttempts(testUsername);
    expect(attempts.length).toBe(0);
  });

  it('should allow admin to unlock a temporarily-locked account', async () => {
    // Per C2, only temporary lockout remains. Trigger it with 5 failed attempts.
    for (let i = 0; i < 5; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Verify account is locked
    let result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily locked');

    // Unlock account
    await authService.unlockAccount(testUsername);

    // Verify account is unlocked
    result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();

    // Verify lockout status is cleared
    const lockoutStatus = await authService.getAccountLockoutStatus(testUsername);
    expect(lockoutStatus).toBeNull();
  });

  it('should lock even non-existent usernames to prevent enumeration', async () => {
    const nonExistentUser = 'nonexistent';  // pragma: allowlist secret

    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await authService.authenticate(nonExistentUser, wrongPassword);
    }

    // Check that attempts were recorded
    const attempts = await authService.getFailedLoginAttempts(nonExistentUser);
    expect(attempts.length).toBe(5);

    // Check lockout status - should be temporarily locked
    const lockoutStatus = await authService.getAccountLockoutStatus(nonExistentUser);
    expect(lockoutStatus).not.toBeNull();
    expect(lockoutStatus?.lockoutType).toBe('temporary');

    // Next attempt should be blocked by lockout
    const result = await authService.authenticate(nonExistentUser, wrongPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily locked');
  });

  it('should prevent timing attacks by checking lockout before password verification', async () => {
    // Apply lockout
    for (let i = 0; i < 5; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Measure time for locked account (should be fast, no password check)
    const start = Date.now();
    await authService.authenticate(testUsername, testPassword);
    const lockedTime = Date.now() - start;

    // Locked account should respond quickly (< 100ms) since it doesn't check password
    expect(lockedTime).toBeLessThan(100);
  });

  it('should allow authentication after temporary lockout expires', async () => {
    // Make 5 failed attempts to trigger temporary lockout
    for (let i = 0; i < 5; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Verify account is temporarily locked
    let result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily locked');

    // Get the lockout record and manually expire it by setting lockedUntil to past
    const pastTime = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    await runQuery(db, `
      UPDATE account_lockouts
      SET locked_until = ?
      WHERE username = ? AND lockout_type = 'temporary'
    `, [pastTime, testUsername]);

    // Now authentication should succeed (lockout expired)
    result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.user?.username).toBe(testUsername);

    // Verify the expired lockout was removed
    const lockoutStatus = await authService.getAccountLockoutStatus(testUsername);
    expect(lockoutStatus).toBeNull();

    // Verify failed attempts were cleared
    const attempts = await authService.getFailedLoginAttempts(testUsername);
    expect(attempts.length).toBe(0);
  });
});

// Helper function to run queries
async function runQuery(db: DatabaseAdapter, sql: string, params: any[] = []): Promise<void> {
  await db.execute(sql, params);
}
