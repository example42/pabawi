import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { UserService, CreateUserDTO, UpdateUserDTO } from '../src/services/UserService';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { randomUUID } from 'crypto';

describe('UserService', () => {
  let db: Database;
  let userService: UserService;
  let authService: AuthenticationService;

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create services
    authService = new AuthenticationService(db, 'test-secret'); // pragma: allowlist secret
    userService = new UserService(db, authService);
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = await userService.createUser(userData);

      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.firstName).toBe('Test');
      expect(user.lastName).toBe('User');
      expect(user.isActive).toBe(1);
      expect(user.isAdmin).toBe(0);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe('Password123!'); // Password should be hashed
    });

    it('should create an admin user when isAdmin is true', async () => {
      const userData: CreateUserDTO = {
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'Password123!',
        firstName: 'Admin',
        lastName: 'User',
        isAdmin: true
      };

      const user = await userService.createUser(userData);

      expect(user.isAdmin).toBe(1);
    });

    it('should throw error if username already exists', async () => {
      const userData: CreateUserDTO = {
        username: 'duplicate',
        email: 'user1@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One'
      };

      await userService.createUser(userData);

      // Try to create another user with same username
      const duplicateData: CreateUserDTO = {
        username: 'duplicate',
        email: 'user2@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two'
      };

      await expect(userService.createUser(duplicateData)).rejects.toThrow('Username already exists');
    });

    it('should throw error if email already exists', async () => {
      const userData: CreateUserDTO = {
        username: 'user1',
        email: 'duplicate@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One'
      };

      await userService.createUser(userData);

      // Try to create another user with same email
      const duplicateData: CreateUserDTO = {
        username: 'user2',
        email: 'duplicate@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two'
      };

      await expect(userService.createUser(duplicateData)).rejects.toThrow('Email already exists');
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const createdUser = await userService.createUser(userData);
      const fetchedUser = await userService.getUserById(createdUser.id);

      expect(fetchedUser).not.toBeNull();
      expect(fetchedUser?.id).toBe(createdUser.id);
      expect(fetchedUser?.username).toBe('testuser');
    });

    it('should return null for non-existent user', async () => {
      const user = await userService.getUserById('non-existent-id');
      expect(user).toBeNull();
    });
  });

  describe('getUserByUsername', () => {
    it('should return user by username', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      await userService.createUser(userData);
      const user = await userService.getUserByUsername('testuser');

      expect(user).not.toBeNull();
      expect(user?.username).toBe('testuser');
    });

    it('should return null for non-existent username', async () => {
      const user = await userService.getUserByUsername('nonexistent');
      expect(user).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user email', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'old@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = await userService.createUser(userData);
      const updatedUser = await userService.updateUser(user.id, {
        email: 'new@example.com'
      });

      expect(updatedUser.email).toBe('new@example.com');
      expect(updatedUser.username).toBe('testuser'); // Other fields unchanged
    });

    it('should update user names', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Old',
        lastName: 'Name'
      };

      const user = await userService.createUser(userData);
      const updatedUser = await userService.updateUser(user.id, {
        firstName: 'New',
        lastName: 'Name'
      });

      expect(updatedUser.firstName).toBe('New');
      expect(updatedUser.lastName).toBe('Name');
    });

    it('should update user password', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = await userService.createUser(userData);
      const oldPasswordHash = user.passwordHash;

      const updatedUser = await userService.updateUser(user.id, {
        password: 'NewPassword123!'
      });

      expect(updatedUser.passwordHash).not.toBe(oldPasswordHash);

      // Verify new password works
      const isValid = await authService.comparePassword('NewPassword123!', updatedUser.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should update user active status', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = await userService.createUser(userData);
      expect(user.isActive).toBe(1);

      const updatedUser = await userService.updateUser(user.id, {
        isActive: false
      });

      expect(updatedUser.isActive).toBe(0);
    });

    it('should throw error if user not found', async () => {
      await expect(
        userService.updateUser('non-existent-id', { email: 'new@example.com' })
      ).rejects.toThrow('User not found');
    });

    it('should throw error if new email already exists', async () => {
      const user1: CreateUserDTO = {
        username: 'user1',
        email: 'user1@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One'
      };

      const user2: CreateUserDTO = {
        username: 'user2',
        email: 'user2@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two'
      };

      const createdUser1 = await userService.createUser(user1);
      await userService.createUser(user2);

      await expect(
        userService.updateUser(createdUser1.id, { email: 'user2@example.com' })
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user (set isActive to 0)', async () => {
      const userData: CreateUserDTO = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = await userService.createUser(userData);
      expect(user.isActive).toBe(1);

      await userService.deleteUser(user.id);

      const deletedUser = await userService.getUserById(user.id);
      expect(deletedUser).not.toBeNull();
      expect(deletedUser?.isActive).toBe(0);
    });

    it('should throw error if user not found', async () => {
      await expect(userService.deleteUser('non-existent-id')).rejects.toThrow('User not found');
    });
  });

  describe('listUsers', () => {
    beforeEach(async () => {
      // Create test users
      await userService.createUser({
        username: 'user1',
        email: 'user1@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One'
      });

      await userService.createUser({
        username: 'user2',
        email: 'user2@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two',
        isAdmin: true
      });

      await userService.createUser({
        username: 'user3',
        email: 'user3@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Three'
      });

      // Deactivate user3
      const user3 = await userService.getUserByUsername('user3');
      if (user3) {
        await userService.deactivateUser(user3.id);
      }
    });

    it('should list all users', async () => {
      const result = await userService.listUsers();

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should filter by isActive', async () => {
      const result = await userService.listUsers({ isActive: true });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.items.every(u => u.isActive === 1)).toBe(true);
    });

    it('should filter by isAdmin', async () => {
      const result = await userService.listUsers({ isAdmin: true });

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.items[0].username).toBe('user2');
    });

    it('should support pagination', async () => {
      const page1 = await userService.listUsers({ limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(3);

      const page2 = await userService.listUsers({ limit: 2, offset: 2 });
      expect(page2.items.length).toBe(1);
      expect(page2.total).toBe(3);
    });

    it('should support search by username', async () => {
      const result = await userService.listUsers({ search: 'user1' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].username).toBe('user1');
    });

    it('should support search by email', async () => {
      const result = await userService.listUsers({ search: 'user2@example.com' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].email).toBe('user2@example.com');
    });

    it('should support search by name', async () => {
      const result = await userService.listUsers({ search: 'Two' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].lastName).toBe('Two');
    });
  });

  describe('addUserToGroup', () => {
    it('should add user to group', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const groupId = await createTestGroup(db, 'Test Group');

      await userService.addUserToGroup(user.id, groupId);

      const groups = await userService.getUserGroups(user.id);
      expect(groups.length).toBe(1);
      expect(groups[0].name).toBe('Test Group');
    });

    it('should throw error if user not found', async () => {
      const groupId = await createTestGroup(db, 'Test Group');

      await expect(
        userService.addUserToGroup('non-existent-id', groupId)
      ).rejects.toThrow('User not found');
    });

    it('should throw error if group not found', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      await expect(
        userService.addUserToGroup(user.id, 'non-existent-id')
      ).rejects.toThrow('Group not found');
    });

    it('should throw error if user already in group', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const groupId = await createTestGroup(db, 'Test Group');

      await userService.addUserToGroup(user.id, groupId);

      await expect(
        userService.addUserToGroup(user.id, groupId)
      ).rejects.toThrow('User is already a member of this group');
    });
  });

  describe('removeUserFromGroup', () => {
    it('should remove user from group', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const groupId = await createTestGroup(db, 'Test Group');

      await userService.addUserToGroup(user.id, groupId);
      let groups = await userService.getUserGroups(user.id);
      expect(groups.length).toBe(1);

      await userService.removeUserFromGroup(user.id, groupId);
      groups = await userService.getUserGroups(user.id);
      expect(groups.length).toBe(0);
    });

    it('should throw error if user not in group', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const groupId = await createTestGroup(db, 'Test Group');

      await expect(
        userService.removeUserFromGroup(user.id, groupId)
      ).rejects.toThrow('User is not a member of this group');
    });
  });

  describe('assignRoleToUser', () => {
    it('should assign role to user', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const roleId = await createTestRole(db, 'Test Role');

      await userService.assignRoleToUser(user.id, roleId);

      const roles = await userService.getUserRoles(user.id);
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe('Test Role');
    });

    it('should throw error if user not found', async () => {
      const roleId = await createTestRole(db, 'Test Role');

      await expect(
        userService.assignRoleToUser('non-existent-id', roleId)
      ).rejects.toThrow('User not found');
    });

    it('should throw error if role not found', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      await expect(
        userService.assignRoleToUser(user.id, 'non-existent-id')
      ).rejects.toThrow('Role not found');
    });

    it('should throw error if role already assigned', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const roleId = await createTestRole(db, 'Test Role');

      await userService.assignRoleToUser(user.id, roleId);

      await expect(
        userService.assignRoleToUser(user.id, roleId)
      ).rejects.toThrow('Role is already assigned to this user');
    });
  });

  describe('removeRoleFromUser', () => {
    it('should remove role from user', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const roleId = await createTestRole(db, 'Test Role');

      await userService.assignRoleToUser(user.id, roleId);
      let roles = await userService.getUserRoles(user.id);
      expect(roles.length).toBe(1);

      await userService.removeRoleFromUser(user.id, roleId);
      roles = await userService.getUserRoles(user.id);
      expect(roles.length).toBe(0);
    });

    it('should throw error if role not assigned', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const roleId = await createTestRole(db, 'Test Role');

      await expect(
        userService.removeRoleFromUser(user.id, roleId)
      ).rejects.toThrow('Role is not assigned to this user');
    });
  });

  describe('activateUser and deactivateUser', () => {
    it('should activate user', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      await userService.deactivateUser(user.id);
      let updatedUser = await userService.getUserById(user.id);
      expect(updatedUser?.isActive).toBe(0);

      await userService.activateUser(user.id);
      updatedUser = await userService.getUserById(user.id);
      expect(updatedUser?.isActive).toBe(1);
    });

    it('should deactivate user', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      expect(user.isActive).toBe(1);

      await userService.deactivateUser(user.id);
      const updatedUser = await userService.getUserById(user.id);
      expect(updatedUser?.isActive).toBe(0);
    });
  });

  describe('toUserDTO', () => {
    it('should convert User to UserDTO', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      });

      const dto = userService.toUserDTO(user);

      expect(dto.id).toBe(user.id);
      expect(dto.username).toBe(user.username);
      expect(dto.email).toBe(user.email);
      expect(dto.firstName).toBe(user.firstName);
      expect(dto.lastName).toBe(user.lastName);
      expect(dto.isActive).toBe(true);
      expect(dto.isAdmin).toBe(false);
      expect(dto.createdAt).toBe(user.createdAt);
      expect(dto.updatedAt).toBe(user.updatedAt);
      expect(dto.lastLoginAt).toBe(user.lastLoginAt);
      expect((dto as any).passwordHash).toBeUndefined();
    });
  });
});

// Helper functions

async function initializeSchema(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        isAdmin INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastLoginAt TEXT
      );

      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        isBuiltIn INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE user_groups (
        userId TEXT NOT NULL,
        groupId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, groupId),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (groupId) REFERENCES groups(id)
      );

      CREATE TABLE user_roles (
        userId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, roleId),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (roleId) REFERENCES roles(id)
      );

      CREATE TABLE revoked_tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        revokedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function closeDatabase(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createTestGroup(db: Database, name: string): Promise<string> {
  const groupId = randomUUID();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [groupId, name, 'Test group description', now, now],
      (err) => {
        if (err) reject(err);
        else resolve(groupId);
      }
    );
  });
}

async function createTestRole(db: Database, name: string): Promise<string> {
  const roleId = randomUUID();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [roleId, name, 'Test role description', 0, now, now],
      (err) => {
        if (err) reject(err);
        else resolve(roleId);
      }
    );
  });
}
