import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { randomUUID } from 'crypto';

describe('AuthenticationService', () => {
  let db: Database;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

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

  describe('Password Hashing', () => {
    it('should hash passwords using bcrypt', async () => {
      const password = 'TestPassword123!';  // pragma: allowlist secret
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'TestPassword123!';  // pragma: allowlist secret
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different due to salt
    });

    it('should verify correct password against hash', async () => {
      const password = 'TestPassword123!';  // pragma: allowlist secret
      const hash = await authService.hashPassword(password);

      const isValid = await authService.comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password against hash', async () => {
      const password = 'TestPassword123!';  // pragma: allowlist secret
      const wrongPassword = 'WrongPassword456!';  // pragma: allowlist secret
      const hash = await authService.hashPassword(password);

      const isValid = await authService.comparePassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('User Authentication', () => {
    beforeEach(async () => {
      // Create test user
      const userId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);
    });

    it('should authenticate user with valid credentials', async () => {
      const result = await authService.authenticate('testuser', 'TestPass123!');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('testuser');
      expect(result.error).toBeUndefined();
    });

    it('should reject authentication with invalid password', async () => {
      const result = await authService.authenticate('testuser', 'WrongPassword');

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Invalid credentials');
    });

    it('should reject authentication with non-existent username', async () => {
      const result = await authService.authenticate('nonexistent', 'TestPass123!');

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Invalid credentials');
    });

    it('should reject authentication for inactive user', async () => {
      // Deactivate user
      await runQuery(db, 'UPDATE users SET isActive = 0 WHERE username = ?', ['testuser']);

      const result = await authService.authenticate('testuser', 'TestPass123!');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is inactive');
    });

    it('should update lastLoginAt timestamp on successful authentication', async () => {
      await authService.authenticate('testuser', 'TestPass123!');

      const user = await getQuery<{ lastLoginAt: string }>(db,
        'SELECT lastLoginAt FROM users WHERE username = ?',
        ['testuser']
      );

      expect(user?.lastLoginAt).toBeDefined();
      expect(user?.lastLoginAt).not.toBeNull();
    });

    it('should require username and password', async () => {
      const result1 = await authService.authenticate('', 'password');
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Username and password required');

      const result2 = await authService.authenticate('username', '');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Username and password required');
    });

    it('should log failed authentication attempts', async () => {
      // Spy on console.warn to capture log output
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Test invalid password
      await authService.authenticate('testuser', 'WrongPassword');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUTH FAILURE]')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Username: testuser')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reason: Invalid password')
      );

      warnSpy.mockClear();

      // Test non-existent user
      await authService.authenticate('nonexistent', 'SomePassword');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Username: nonexistent')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reason: User not found')
      );

      warnSpy.mockRestore();
    });
  });

  describe('Token Generation', () => {
    let testUser: any;

    beforeEach(async () => {
      const userId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);

      testUser = await getQuery(db, 'SELECT * FROM users WHERE username = ?', ['testuser']);
    });

    it('should generate valid JWT access token', async () => {
      const token = await authService.generateToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should generate valid JWT refresh token', async () => {
      const refreshToken = await authService.generateRefreshToken(testUser);

      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.split('.')).toHaveLength(3);
    });

    it('should include user information in token payload', async () => {
      const token = await authService.generateToken(testUser);
      const payload = await authService.verifyToken(token);

      expect(payload.userId).toBe(testUser.id);
      expect(payload.username).toBe(testUser.username);
      expect(payload.roles).toBeDefined();
      expect(Array.isArray(payload.roles)).toBe(true);
    });

    it('should include expiration time in token', async () => {
      const token = await authService.generateToken(testUser);
      const payload = await authService.verifyToken(token);

      expect(payload.exp).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);

      // Access token should expire in ~1 hour
      const expiresIn = payload.exp - payload.iat;
      expect(expiresIn).toBeGreaterThanOrEqual(3500); // ~1 hour (with some tolerance)
      expect(expiresIn).toBeLessThanOrEqual(3700);
    });

    it('should include token ID (jti) for revocation tracking', async () => {
      const token = await authService.generateToken(testUser);
      const payload = await authService.verifyToken(token);

      expect(payload.jti).toBeDefined();
      expect(typeof payload.jti).toBe('string');
      expect(payload.jti.length).toBeGreaterThan(0);
    });
  });

  describe('Token Verification', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
      const userId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);

      testUser = await getQuery(db, 'SELECT * FROM users WHERE username = ?', ['testuser']);
      validToken = await authService.generateToken(testUser);
    });

    it('should verify valid token', async () => {
      const payload = await authService.verifyToken(validToken);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe(testUser.id);
      expect(payload.username).toBe(testUser.username);
    });

    it('should reject invalid token signature', async () => {
      const invalidToken = validToken.slice(0, -5) + 'xxxxx';

      await expect(authService.verifyToken(invalidToken)).rejects.toThrow('Invalid token');
    });

    it('should reject malformed token', async () => {
      await expect(authService.verifyToken('not.a.valid.token')).rejects.toThrow();
    });

    it('should reject revoked token', async () => {
      await authService.revokeToken(validToken);

      await expect(authService.verifyToken(validToken)).rejects.toThrow('Token has been revoked');
    });
  });

  describe('Token Refresh', () => {
    let testUser: any;
    let refreshToken: string;

    beforeEach(async () => {
      const userId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);

      testUser = await getQuery(db, 'SELECT * FROM users WHERE username = ?', ['testuser']);
      refreshToken = await authService.generateRefreshToken(testUser);
    });

    it('should generate new access token from valid refresh token', async () => {
      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('testuser');
    });

    it('should reject access token used as refresh token', async () => {
      const accessToken = await authService.generateToken(testUser);
      const result = await authService.refreshToken(accessToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should reject revoked refresh token', async () => {
      await authService.revokeToken(refreshToken);
      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Refresh token has been revoked');
    });

    it('should reject refresh token for inactive user', async () => {
      await runQuery(db, 'UPDATE users SET isActive = 0 WHERE id = ?', [testUser.id]);
      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found or inactive');
    });
  });

  describe('Token Revocation', () => {
    let testUser: any;
    let token: string;

    beforeEach(async () => {
      const userId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);

      testUser = await getQuery(db, 'SELECT * FROM users WHERE username = ?', ['testuser']);
      token = await authService.generateToken(testUser);
    });

    it('should revoke specific token', async () => {
      await authService.revokeToken(token);

      await expect(authService.verifyToken(token)).rejects.toThrow('Token has been revoked');
    });

    it('should store revoked token in database', async () => {
      await authService.revokeToken(token);

      const revokedTokens = await allQuery(db, 'SELECT * FROM revoked_tokens');
      expect(revokedTokens.length).toBeGreaterThan(0);
    });

    it('should revoke all user tokens', async () => {
      const token1 = await authService.generateToken(testUser);
      const token2 = await authService.generateToken(testUser);

      await authService.revokeAllUserTokens(testUser.id);

      await expect(authService.verifyToken(token1)).rejects.toThrow();
      await expect(authService.verifyToken(token2)).rejects.toThrow();
    });
  });

  describe('User Roles in Token', () => {
    let testUser: any;

    beforeEach(async () => {
      const userId = randomUUID();
      const roleId = randomUUID();
      const passwordHash = await authService.hashPassword('TestPass123!');
      const now = new Date().toISOString();

      // Create user
      await runQuery(db, `
        INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', passwordHash, 'Test', 'User', 1, 0, now, now]);

      // Create role
      await runQuery(db, `
        INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'TestRole', 'Test role', 0, now, now]);

      // Assign role to user
      await runQuery(db, `
        INSERT INTO user_roles (userId, roleId, assignedAt)
        VALUES (?, ?, ?)
      `, [userId, roleId, now]);

      testUser = await getQuery(db, 'SELECT * FROM users WHERE username = ?', ['testuser']);
    });

    it('should include user roles in token payload', async () => {
      const token = await authService.generateToken(testUser);
      const payload = await authService.verifyToken(token);

      expect(payload.roles).toBeDefined();
      expect(payload.roles).toContain('TestRole');
    });

    it('should include roles from groups', async () => {
      const groupId = randomUUID();
      const roleId = randomUUID();
      const now = new Date().toISOString();

      // Create group
      await runQuery(db, `
        INSERT INTO groups (id, name, description, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `, [groupId, 'TestGroup', 'Test group', now, now]);

      // Create role
      await runQuery(db, `
        INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'GroupRole', 'Group role', 0, now, now]);

      // Add user to group
      await runQuery(db, `
        INSERT INTO user_groups (userId, groupId, assignedAt)
        VALUES (?, ?, ?)
      `, [testUser.id, groupId, now]);

      // Assign role to group
      await runQuery(db, `
        INSERT INTO group_roles (groupId, roleId, assignedAt)
        VALUES (?, ?, ?)
      `, [groupId, roleId, now]);

      const token = await authService.generateToken(testUser);
      const payload = await authService.verifyToken(token);

      expect(payload.roles).toContain('GroupRole');
    });
  });
});

// Helper functions
function runQuery(db: Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getQuery<T>(db: Database, sql: string, params: any[] = []): Promise<T | null> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T || null);
    });
  });
}

function allQuery<T>(db: Database, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[] || []);
    });
  });
}

async function initializeSchema(db: Database): Promise<void> {
  const schema = `
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
    );

    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      isBuiltIn INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE permissions (
      id TEXT PRIMARY KEY,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(resource, action)
    );

    CREATE TABLE user_groups (
      userId TEXT NOT NULL,
      groupId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, groupId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE user_roles (
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE group_roles (
      groupId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (groupId, roleId),
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE role_permissions (
      roleId TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      assignedAt TEXT NOT NULL,
      PRIMARY KEY (roleId, permissionId),
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE revoked_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      revokedAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const statement of statements) {
    await runQuery(db, statement);
  }
}
