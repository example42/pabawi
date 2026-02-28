import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService } from '../src/services/UserService';
import { AuthenticationService } from '../src/services/AuthenticationService';

describe('UserService - Password Validation Integration', () => {
  let db: Database;
  let userService: UserService;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    authService = new AuthenticationService(db, testJwtSecret);
    userService = new UserService(db, authService);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  describe('createUser - password validation', () => {
    it('should create user with valid password', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPass123!',
        firstName: 'Test',
        lastName: 'User'
      });

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
    });

    it('should reject password shorter than 8 characters', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Short1!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'PASSWORD123!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password must contain at least one number');
    });

    it('should reject password without special character', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password must contain at least one special character');
    });

    it('should reject password with multiple validation failures', async () => {
      await expect(
        userService.createUser({
          username: 'testuser',
          email: 'test@example.com',
          password: 'pass',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toThrow('Password validation failed');
    });
  });

  describe('updateUser - password validation', () => {
    it('should update user with valid new password', async () => {
      // Create user first
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPass123!',
        firstName: 'Test',
        lastName: 'User'
      });

      // Update with new valid password
      const updatedUser = await userService.updateUser(user.id, {
        password: 'NewPass456!'
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser.id).toBe(user.id);

      // Verify new password works
      const authResult = await authService.authenticate('testuser', 'NewPass456!');
      expect(authResult.success).toBe(true);
    });

    it('should reject invalid password on update', async () => {
      // Create user first
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPass123!',
        firstName: 'Test',
        lastName: 'User'
      });

      // Try to update with invalid password
      await expect(
        userService.updateUser(user.id, {
          password: 'weak'
        })
      ).rejects.toThrow('Password validation failed');
    });

    it('should allow updating other fields without changing password', async () => {
      // Create user first
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPass123!',
        firstName: 'Test',
        lastName: 'User'
      });

      // Update other fields without password
      const updatedUser = await userService.updateUser(user.id, {
        firstName: 'Updated',
        lastName: 'Name'
      });

      expect(updatedUser.firstName).toBe('Updated');
      expect(updatedUser.lastName).toBe('Name');

      // Verify old password still works
      const authResult = await authService.authenticate('testuser', 'ValidPass123!');
      expect(authResult.success).toBe(true);
    });
  });
});


// Helper function to initialize database schema
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

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
