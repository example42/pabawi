import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { randomUUID } from 'crypto';

describe('AuthenticationService - Brute Force Protection', () => {
  let db: sqlite3.Database;
  let authService: AuthenticationService;
  const testUsername = 'testuser';  // pragma: allowlist secret
  const testPassword = 'TestPass123!';  // pragma: allowlist secret
  const wrongPassword = 'WrongPass123!';  // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(':memory:');

    // Initialize schema
    await runQuery(db, `
      CREATE TABLE users (
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
      )
    `);

    await runQuery(db, `
      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        isBuiltIn INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    await runQuery(db, `
      CREATE TABLE user_roles (
        userId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, roleId)
      )
    `);

    await runQuery(db, `
      CREATE TABLE group_roles (
        groupId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (groupId, roleId)
      )
    `);

    await runQuery(db, `
      CREATE TABLE user_groups (
        userId TEXT NOT NULL,
        groupId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, groupId)
      )
    `);

    await runQuery(db, `
      CREATE TABLE revoked_tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        revokedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      )
    `);

    // Create brute force protection tables
    await runQuery(db, `
      CREATE TABLE failed_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        attemptedAt TEXT NOT NULL,
        ipAddress TEXT,
        reason TEXT
      )
    `);

    await runQuery(db, `
      CREATE TABLE account_lockouts (
        username TEXT PRIMARY KEY,
        lockoutType TEXT NOT NULL,
        lockedAt TEXT NOT NULL,
        lockedUntil TEXT,
        failedAttempts INTEGER NOT NULL DEFAULT 0,
        lastAttemptAt TEXT
      )
    `);

    // Create test user
    authService = new AuthenticationService(db, 'test-secret-key');
    const passwordHash = await authService.hashPassword(testPassword);
    const userId = randomUUID();
    const now = new Date().toISOString();

    await runQuery(db, `
      INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `, [userId, testUsername, 'test@example.com', passwordHash, 'Test', 'User', now, now]);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
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

  it('should apply permanent lockout after 10 failed attempts', async () => {
    // Make 10 failed attempts
    for (let i = 0; i < 10; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Check lockout status
    const lockoutStatus = await authService.getAccountLockoutStatus(testUsername);
    expect(lockoutStatus).not.toBeNull();
    expect(lockoutStatus?.lockoutType).toBe('permanent');
    expect(lockoutStatus?.failedAttempts).toBe(10);

    // Try to authenticate - should be permanently locked
    const result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('permanently locked');
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

  it('should allow admin to unlock account', async () => {
    // Apply permanent lockout
    for (let i = 0; i < 10; i++) {
      await authService.authenticate(testUsername, wrongPassword);
    }

    // Verify account is locked
    let result = await authService.authenticate(testUsername, testPassword);
    expect(result.success).toBe(false);
    expect(result.error).toContain('permanently locked');

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
      SET lockedUntil = ?
      WHERE username = ? AND lockoutType = 'temporary'  // pragma: allowlist secret
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
function runQuery(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
