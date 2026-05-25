import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/database/SQLiteAdapter';
import { UserService } from '../src/services/UserService';
import { AuthenticationService } from '../src/services/AuthenticationService';

describe('UserService - Password Validation Integration', () => {
  let db: SQLiteAdapter;
  let userService: UserService;
  let authService: AuthenticationService;
  const testJwtSecret = 'test-secret-key-for-testing-only'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Initialize schema
    await initializeSchema(db);

    authService = new AuthenticationService(db, testJwtSecret);
    userService = new UserService(db, authService);
  });

  afterEach(async () => {
    await db.close();
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
async function initializeSchema(db: SQLiteAdapter): Promise<void> {
  const schema = `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      is_built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE permissions (
      id TEXT PRIMARY KEY,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(resource, action)
    );

    CREATE TABLE user_groups (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE group_roles (
      group_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (group_id, role_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE revoked_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      revoked_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO config (key, value, updated_at) VALUES
      ('allow_self_registration', 'false', datetime('now')),
      ('default_new_user_role', 'role-viewer-001', datetime('now'));

    INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at) VALUES
      ('role-viewer-001', 'Viewer', 'Default viewer role', 1, datetime('now'), datetime('now'));
  `;

  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const statement of statements) {
    await db.execute(statement);
  }
}
