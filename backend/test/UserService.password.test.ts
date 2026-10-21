import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/database/SQLiteAdapter';
import { UserService } from '../src/services/UserService';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { initializeTestSchema } from './helpers/schema';

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
    await initializeTestSchema(db);

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
