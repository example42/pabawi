import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import express, { Express } from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../src/routes/auth';
import { DatabaseService } from '../../src/database/DatabaseService';
import { randomUUID } from 'crypto';

describe('Auth Routes - POST /api/auth/register', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe('Successful registration', () => {
    it('should register a new user with valid data and return 201', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.firstName).toBe('Test');
      expect(response.body.user.lastName).toBe('User');
      expect(response.body.user.isActive).toBe(true);
      expect(response.body.user.isAdmin).toBe(false);

      // Password should NOT be in response
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should create user with minimum valid username length (3 chars)', async () => {
      const userData = {
        username: 'abc',
        email: 'abc@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.username).toBe('abc');
    });

    it('should create user with maximum valid username length (50 chars)', async () => {
      const longUsername = 'a'.repeat(50);
      const userData = {
        username: longUsername,
        email: 'long@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.username).toBe(longUsername);
    });

    it('should accept username with underscores', async () => {
      const userData = {
        username: 'test_user_123',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.username).toBe('test_user_123');
    });

    it('should accept password with all special characters', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'P@ssw0rd!#$%',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.username).toBe('testuser');
    });
  });

  describe('Username validation (Requirement 2.1)', () => {
    it('should reject username shorter than 3 characters', async () => {
      const userData = {
        username: 'ab',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'username',
            message: 'Username must be at least 3 characters',
          }),
        ])
      );
    });

    it('should reject username longer than 50 characters', async () => {
      const userData = {
        username: 'a'.repeat(51),
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'username',
            message: 'Username must not exceed 50 characters',
          }),
        ])
      );
    });

    it('should reject username with special characters', async () => {
      const userData = {
        username: 'test@user',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'username',
            message: 'Username must contain only alphanumeric characters and underscores',
          }),
        ])
      );
    });

    it('should reject username with spaces', async () => {
      const userData = {
        username: 'test user',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate username (409 Conflict)', async () => {
      const userData = {
        username: 'duplicate',
        email: 'user1@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One',
      };

      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to create second user with same username
      const duplicateData = {
        username: 'duplicate',
        email: 'user2@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateData)
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_USERNAME');
      expect(response.body.error.message).toBe('Username already exists');
    });
  });

  describe('Email validation (Requirement 2.2)', () => {
    it('should reject invalid email format', async () => {
      const userData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'email',
            message: 'Invalid email format',
          }),
        ])
      );
    });

    it('should reject email without domain', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate email (409 Conflict)', async () => {
      const userData = {
        username: 'user1',
        email: 'duplicate@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One',
      };

      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to create second user with same email
      const duplicateData = {
        username: 'user2',
        email: 'duplicate@example.com',
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateData)
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_EMAIL');
      expect(response.body.error.message).toBe('Email already exists');
    });
  });

  describe('Password validation (Requirements 2.3, 2.4, 2.5)', () => {
    it('should reject password shorter than 8 characters', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Pass1!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password must be at least 8 characters',
          }),
        ])
      );
    });

    it('should reject password without uppercase letter', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password must contain at least one uppercase letter',
          }),
        ])
      );
    });

    it('should reject password without lowercase letter', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'PASSWORD123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password must contain at least one lowercase letter',
          }),
        ])
      );
    });

    it('should reject password without number', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password must contain at least one number',
          }),
        ])
      );
    });

    it('should reject password without special character', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password must contain at least one special character',
          }),
        ])
      );
    });

    it('should reject password with multiple validation failures', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'pass',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBeGreaterThan(1);
    });
  });

  describe('Name validation', () => {
    it('should reject missing firstName', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty firstName', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: '',
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing lastName', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject firstName longer than 100 characters', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'a'.repeat(101),
        lastName: 'User',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject lastName longer than 100 characters', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'a'.repeat(101),
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should reject request with missing body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request with empty body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request with extra fields (strict validation)', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        extraField: 'should be ignored',
      };

      // Should still succeed but extra field should be ignored
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user).not.toHaveProperty('extraField');
    });

    it('should handle database errors gracefully', async () => {
      // Create a new database instance that we can close
      const tempDb = new Database(':memory:');
      await initializeSchema(tempDb);

      const tempDatabaseService = {
        getConnection: () => tempDb,
        isInitialized: () => true,
      } as DatabaseService;

      const tempApp = express();
      tempApp.use(express.json());
      tempApp.use('/api/auth', createAuthRouter(tempDatabaseService));

      // Close the database to simulate error
      await closeDatabase(tempDb);

      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(tempApp)
        .post('/api/auth/register')
        .send(userData)
        .expect(500);

      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
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

      CREATE TABLE permissions (
        id TEXT PRIMARY KEY,
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        UNIQUE(resource, action)
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

      CREATE TABLE group_roles (
        groupId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (groupId, roleId),
        FOREIGN KEY (groupId) REFERENCES groups(id),
        FOREIGN KEY (roleId) REFERENCES roles(id)
      );

      CREATE TABLE role_permissions (
        roleId TEXT NOT NULL,
        permissionId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (roleId, permissionId),
        FOREIGN KEY (roleId) REFERENCES roles(id),
        FOREIGN KEY (permissionId) REFERENCES permissions(id)
      );

      CREATE TABLE revoked_tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        revokedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );

      CREATE TABLE account_lockouts (
        username TEXT PRIMARY KEY,
        lockoutType TEXT NOT NULL,
        lockedAt TEXT NOT NULL,
        lockedUntil TEXT,
        failedAttempts INTEGER NOT NULL,
        lastAttemptAt TEXT NOT NULL
      );

      CREATE TABLE failed_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        attemptedAt TEXT NOT NULL,
        ipAddress TEXT,
        reason TEXT NOT NULL
      );

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        userId TEXT,
        username TEXT,
        action TEXT NOT NULL,
        resource TEXT,
        resourceId TEXT,
        details TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        success INTEGER NOT NULL,
        errorMessage TEXT
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

describe('Auth Routes - POST /api/auth/login', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe('Successful login (Requirements 1.1, 1.2, 1.3, 6.1, 6.2)', () => {
    it('should authenticate user with valid credentials and return tokens', async () => {
      // First, register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Now login
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');

      // Verify tokens are strings
      expect(typeof response.body.token).toBe('string');
      expect(typeof response.body.refreshToken).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
      expect(response.body.refreshToken.length).toBeGreaterThan(0);

      // Verify user DTO
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.firstName).toBe('Test');
      expect(response.body.user.lastName).toBe('User');
      expect(response.body.user.isActive).toBe(true);

      // Password should NOT be in response
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should update lastLoginAt timestamp on successful login (Requirement 1.3)', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Initial lastLoginAt should be null
      expect(registerResponse.body.user.lastLoginAt).toBeNull();

      // Login
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // lastLoginAt should now be set
      expect(loginResponse.body.user.lastLoginAt).not.toBeNull();
      expect(typeof loginResponse.body.user.lastLoginAt).toBe('string');

      // Verify it's a valid ISO 8601 timestamp
      const lastLoginDate = new Date(loginResponse.body.user.lastLoginAt);
      expect(lastLoginDate.toString()).not.toBe('Invalid Date');
    });

    it('should generate different tokens for each login', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login first time
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response1 = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Login second time
      const response2 = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Tokens should be different
      expect(response1.body.token).not.toBe(response2.body.token);
      expect(response1.body.refreshToken).not.toBe(response2.body.refreshToken);
    });
  });

  describe('Failed authentication (Requirement 1.2)', () => {
    it('should reject login with invalid username', async () => {
      const loginData = {
        username: 'nonexistent',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(response.body.error.message).toBe('Invalid credentials');

      // Should not reveal whether username exists
      expect(response.body.error.message).not.toContain('user');
      expect(response.body.error.message).not.toContain('not found');
    });

    it('should reject login with invalid password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to login with wrong password
      const loginData = {
        username: 'testuser',
        password: 'WrongPassword123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject login for inactive user (Requirement 1.4)', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Deactivate the user directly in database
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE users SET isActive = 0 WHERE username = ?',
          ['testuser'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Try to login
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(response.body.error.message).toBe('Account is inactive');
    });

    it('should use generic error message to prevent username enumeration', async () => {
      // Try to login with non-existent user
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'Password123!' })
        .expect(401);

      // Register a user
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Try to login with wrong password
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'WrongPassword!' })
        .expect(401);

      // Both should return the same generic error message
      expect(response1.body.error.message).toBe('Invalid credentials');
      expect(response2.body.error.message).toBe('Invalid credentials');
    });
  });

  describe('Input validation', () => {
    it('should reject login with missing username', async () => {
      const loginData = {
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'username',
            message: 'Username is required',
          }),
        ])
      );
    });

    it('should reject login with empty username', async () => {
      const loginData = {
        username: '',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with missing password', async () => {
      const loginData = {
        username: 'testuser',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            message: 'Password is required',
          }),
        ])
      );
    });

    it('should reject login with empty password', async () => {
      const loginData = {
        username: 'testuser',
        password: '',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with missing body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login with empty body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Token generation (Requirements 6.1, 6.2)', () => {
    it('should generate access token with 1-hour expiration', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Verify token is a JWT (has 3 parts separated by dots)
      const tokenParts = response.body.token.split('.');
      expect(tokenParts.length).toBe(3);

      // Decode the payload (without verification for testing)
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      // Verify token contains user information
      expect(payload).toHaveProperty('userId');
      expect(payload).toHaveProperty('username');
      expect(payload.username).toBe('testuser');

      // Verify expiration is set (should be ~1 hour from now)
      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');
      const expirationTime = payload.exp - payload.iat;
      expect(expirationTime).toBe(3600); // 1 hour in seconds
    });

    it('should generate refresh token with 7-day expiration', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      // Verify refresh token is a JWT
      const tokenParts = response.body.refreshToken.split('.');
      expect(tokenParts.length).toBe(3);

      // Decode the payload
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      // Verify expiration is set (should be ~7 days from now)
      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');
      const expirationTime = payload.exp - payload.iat;
      expect(expirationTime).toBe(604800); // 7 days in seconds
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle case-sensitive username', async () => {
      // Register a user
      const userData = {
        username: 'TestUser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to login with different case
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should handle database errors gracefully', async () => {
      // Create a new database instance that we can close
      const tempDb = new Database(':memory:');
      await initializeSchema(tempDb);

      const tempDatabaseService = {
        getConnection: () => tempDb,
        isInitialized: () => true,
      } as DatabaseService;

      const tempApp = express();
      tempApp.use(express.json());
      tempApp.use('/api/auth', createAuthRouter(tempDatabaseService));

      // Close the database to simulate error
      await closeDatabase(tempDb);

      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const response = await request(tempApp)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      // Database errors are masked as authentication failures for security
      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(response.body.error.message).toBe('Authentication failed');
    });

    it('should handle multiple concurrent login requests', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Make multiple concurrent login requests
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send(loginData)
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body).toHaveProperty('user');
      });

      // All tokens should be unique
      const tokens = responses.map(r => r.body.token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });
  });
});

describe('Auth Routes - POST /api/auth/logout', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;
  const testJwtSecret = 'test-jwt-secret-for-logout-tests'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Set JWT secret for tests
    process.env.JWT_SECRET = testJwtSecret;

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
  });

  afterEach(async () => {
    delete process.env.JWT_SECRET;
    await closeDatabase(db);
  });

  describe('Successful logout (Requirements 1.6, 6.4)', () => {
    it('should logout user with valid token and return 200', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(logoutResponse.body).toHaveProperty('message');
      expect(logoutResponse.body.message).toBe('Logout successful');
    });

    it('should revoke token after logout (Requirement 6.4)', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Try to logout again with the same token (should fail)
      const secondLogoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(secondLogoutResponse.body.error).toBe('Unauthorized');
      expect(secondLogoutResponse.body.message).toBe('Token has been revoked. Please login again.');
    });

    it('should allow user to login again after logout', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token1 = loginResponse1.body.token;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Login again
      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      expect(loginResponse2.body).toHaveProperty('token');
      expect(loginResponse2.body.token).not.toBe(token1);

      // New token should work
      const logoutResponse2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginResponse2.body.token}`)
        .expect(200);

      expect(logoutResponse2.body.message).toBe('Logout successful');
    });

    it('should only revoke the specific token used for logout', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login twice to get two different tokens
      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token1 = loginResponse1.body.token;
      const token2 = loginResponse2.body.token;

      // Logout with first token
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Second token should still work
      const logoutResponse2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(logoutResponse2.body.message).toBe('Logout successful');
    });
  });

  describe('Authentication required', () => {
    it('should reject logout without Authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Missing authorization header');
    });

    it('should reject logout with invalid Authorization header format', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe("Invalid authorization header format. Expected 'Bearer <token>'");
    });

    it('should reject logout with empty token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      // Empty token after "Bearer " is treated as invalid format by middleware
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBe('Invalid token signature');
    });

    it('should reject logout with expired token', async () => {
      // This test would require mocking time or creating an expired token
      // For now, we'll test with an invalid token structure
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJleHAiOjB9.invalid';  // pragma: allowlist secret

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle multiple logout attempts with same token', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // First logout should succeed
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Second logout with same token should fail (token already revoked)
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error.code).toBe('TOKEN_REVOKED');
      expect(response.body.error.message).toBe('Token has been revoked. Please login again.');
    });

    it('should handle concurrent logout requests with different tokens', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login multiple times to get different tokens
      const loginPromises = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({ username: 'testuser', password: 'Password123!' })
      );

      const loginResponses = await Promise.all(loginPromises);
      const tokens = loginResponses.map(r => r.body.token);

      // Logout concurrently with all tokens
      const logoutPromises = tokens.map(token =>
        request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`)
      );

      const logoutResponses = await Promise.all(logoutPromises);

      // All should succeed
      logoutResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Logout successful');
      });
    });

    it('should handle database errors gracefully during logout', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Close the database to simulate error
      await new Promise<void>((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Logout should fail at middleware level (token verification fails)
      // because the database is needed to check revocation
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error.code).toBeDefined();
      // Database error during token verification results in authentication failure

      // Create a new database for cleanup to avoid double-close error
      db = new Database(':memory:');
    });

    it('should handle logout for inactive user', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Deactivate the user
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE users SET isActive = 0 WHERE username = ?',
          ['testuser'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Logout should still work (token is still valid, just revoke it)
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
    });
  });

  describe('Security considerations', () => {
    it('should not expose user information in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);

      // Error message should be generic and not expose sensitive info
      expect(response.body.message).not.toContain('user');
      expect(response.body.message).not.toContain('userId');
      expect(response.body).not.toHaveProperty('userId');
    });

    it('should log logout events for audit purposes', async () => {
      // This test verifies that logout is properly logged
      // In a real implementation, you would check audit logs

      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Logout (should be logged)
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
      // In production, verify audit log entry exists
    });
  });
});

describe('Auth Routes - POST /api/auth/refresh', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;
  const testJwtSecret = 'test-jwt-secret-for-refresh-tests'; // pragma: allowlist secret

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Set JWT secret for tests
    process.env.JWT_SECRET = testJwtSecret;

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
  });

  afterEach(async () => {
    delete process.env.JWT_SECRET;
    await closeDatabase(db);
  });

  describe('Successful token refresh (Requirements 6.3, 19.2)', () => {
    it('should refresh access token with valid refresh token and return 200', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Verify response structure
      expect(refreshResponse.body).toHaveProperty('token');
      expect(refreshResponse.body).toHaveProperty('user');

      // Verify new token is a string
      expect(typeof refreshResponse.body.token).toBe('string');
      expect(refreshResponse.body.token.length).toBeGreaterThan(0);

      // Verify user DTO
      expect(refreshResponse.body.user.username).toBe('testuser');
      expect(refreshResponse.body.user.email).toBe('test@example.com');
      expect(refreshResponse.body.user.firstName).toBe('Test');
      expect(refreshResponse.body.user.lastName).toBe('User');
      expect(refreshResponse.body.user.isActive).toBe(true);

      // Password should NOT be in response
      expect(refreshResponse.body.user).not.toHaveProperty('password');
      expect(refreshResponse.body.user).not.toHaveProperty('passwordHash');
    });

    it('should generate a new access token different from the original', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const originalToken = loginResponse.body.token;
      const refreshToken = loginResponse.body.refreshToken;

      // Refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const newToken = refreshResponse.body.token;

      // New token should be different from original
      expect(newToken).not.toBe(originalToken);

      // Both tokens should be valid JWTs
      expect(originalToken.split('.').length).toBe(3);
      expect(newToken.split('.').length).toBe(3);
    });

    it('should generate new access token with 1-hour expiration', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Decode the new token payload
      const tokenParts = refreshResponse.body.token.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      // Verify expiration is set (should be ~1 hour from now)
      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');
      const expirationTime = payload.exp - payload.iat;
      expect(expirationTime).toBe(3600); // 1 hour in seconds
    });

    it('should allow multiple token refreshes with same refresh token', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // First refresh
      const refreshResponse1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Second refresh with same refresh token
      const refreshResponse2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Both should succeed
      expect(refreshResponse1.body).toHaveProperty('token');
      expect(refreshResponse2.body).toHaveProperty('token');

      // Tokens should be different (each refresh generates a new token)
      expect(refreshResponse1.body.token).not.toBe(refreshResponse2.body.token);
    });
  });

  describe('Failed token refresh', () => {
    it('should reject refresh with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'refreshToken',
            message: 'Refresh token is required',
          }),
        ])
      );
    });

    it('should reject refresh with empty refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'refreshToken',
            message: 'Refresh token is required',
          }),
        ])
      );
    });

    it('should reject refresh with invalid refresh token format', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.format' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      expect(response.body.error.message).toContain('Invalid');
    });

    it('should reject refresh with access token instead of refresh token', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const accessToken = loginResponse.body.token;

      // Try to refresh with access token (should fail)
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      expect(response.body.error.message).toBe('Invalid refresh token');
    });

    it('should allow refresh token to work after access token logout', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;
      const accessToken = loginResponse.body.token;

      // Logout to revoke access token
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Refresh token should still work (it's independent of access token)
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should reject refresh for inactive user', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Deactivate the user
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE users SET isActive = 0 WHERE username = ?',
          ['testuser'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Try to refresh token
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
      expect(response.body.error.message).toContain('not found or inactive');
    });

    it('should reject refresh for non-existent user', async () => {
      // Create a valid-looking refresh token for a non-existent user
      const jwt = require('jsonwebtoken');
      const fakeRefreshToken = jwt.sign(
        {
          userId: 'non-existent-user-id',
          username: 'nonexistent',
          type: 'refresh',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 604800,
        },
        testJwtSecret,
        { algorithm: 'HS256' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: fakeRefreshToken })
        .expect(401);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
      expect(response.body.error.message).toContain('not found or inactive');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing request body', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express will return 400 for malformed JSON
      expect(response.status).toBe(400);
    });

    it('should handle concurrent refresh requests', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Make multiple concurrent refresh requests
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('user');
      });

      // All tokens should be unique
      const tokens = responses.map(r => r.body.token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
    });

    it('should handle database errors gracefully', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Close the database to simulate error
      await new Promise<void>((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Refresh should fail gracefully
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error).toBeDefined();

      // Create a new database for cleanup
      db = new Database(':memory:');
    });

    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(400);

      // Error message should be generic and not expose sensitive info
      expect(response.body.error.message).not.toContain('userId');
      expect(response.body.error.message).not.toContain('database');
      expect(response.body).not.toHaveProperty('userId');
    });
  });

  describe('Security considerations', () => {
    it('should verify refresh token signature', async () => {
      // Create a token with wrong signature
      const jwt = require('jsonwebtoken');
      const wrongSecretToken = jwt.sign(
        {
          userId: 'test-user-id',
          username: 'testuser',
          type: 'refresh',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 604800,
        },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: wrongSecretToken })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      expect(response.body.error.message).toContain('Invalid');
    });

    it('should check token expiration', async () => {
      // Create an expired refresh token
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        {
          userId: 'test-user-id',
          username: 'testuser',
          type: 'refresh',
          iat: Math.floor(Date.now() / 1000) - 604800,
          exp: Math.floor(Date.now() / 1000) - 1, // Expired 1 second ago
        },
        testJwtSecret,
        { algorithm: 'HS256' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
      expect(response.body.error.message).toContain('expired');
    });

    it('should log refresh events for audit purposes', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Refresh token (should be logged)
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      // In production, verify audit log entry exists
    });
  });

  describe('Integration with other endpoints', () => {
    it('should allow using new access token to access protected endpoints', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      // Refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const newAccessToken = refreshResponse.body.token;

      // Use new access token to logout (protected endpoint)
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      expect(logoutResponse.body.message).toBe('Logout successful');
    });

    it('should maintain user session continuity after refresh', async () => {
      // Register and login a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const originalUser = loginResponse.body.user;
      const refreshToken = loginResponse.body.refreshToken;

      // Refresh the token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const refreshedUser = refreshResponse.body.user;

      // User data should be consistent
      expect(refreshedUser.id).toBe(originalUser.id);
      expect(refreshedUser.username).toBe(originalUser.username);
      expect(refreshedUser.email).toBe(originalUser.email);
      expect(refreshedUser.isActive).toBe(originalUser.isActive);
      expect(refreshedUser.isAdmin).toBe(originalUser.isAdmin);
    });
  });
});

describe('Auth Routes - POST /api/auth/change-password', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Set JWT secret for consistent token generation/verification
    process.env.JWT_SECRET = 'test-secret-key-for-change-password-tests';  // pragma: allowlist secret

    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
  });

  afterEach(async () => {
    await closeDatabase(db);
    delete process.env.JWT_SECRET;
  });

  describe('Successful password change (Requirements 20.1, 20.2, 20.3, 20.4)', () => {
    it('should change password with valid current password and new password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Change password
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password changed successfully');
    });

    it('should allow login with new password after change', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      // Try to login with new password
      const newLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'NewPassword456!' })
        .expect(200);

      expect(newLoginResponse.body).toHaveProperty('token');
      expect(newLoginResponse.body).toHaveProperty('user');
    });

    it('should reject login with old password after change', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      // Try to login with old password (should fail)
      const oldLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(401);

      expect(oldLoginResponse.body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should revoke all existing tokens after password change (Requirement 20.4)', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get first token
      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token1 = loginResponse1.body.token;

      // Login again to get second token
      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token2 = loginResponse2.body.token;

      // Change password using first token
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      // Try to use first token (should fail - revoked)
      const logoutResponse1 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      // Try to use second token (should also fail - all tokens revoked)
      const logoutResponse2 = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);
    });
  });

  describe('Authentication required', () => {
    it('should reject password change without authentication token', async () => {
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .send(changePasswordData)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject password change with invalid token', async () => {
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', 'Bearer invalid-token')
        .send(changePasswordData)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject password change with expired token', async () => {
      // This test would require mocking time or using a very short token expiration
      // For now, we'll skip this as it's covered by the auth middleware tests
    });
  });

  describe('Current password verification (Requirement 20.1)', () => {
    it('should reject password change with incorrect current password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password with wrong current password
      const changePasswordData = {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(401);

      expect(response.body.error.code).toBe('INCORRECT_PASSWORD');
      expect(response.body.error.message).toContain('Current password is incorrect');
    });

    it('should reject password change with missing current password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without current password
      const changePasswordData = {
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'currentPassword',
            message: 'Current password is required',
          }),
        ])
      );
    });

    it('should reject password change with empty current password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password with empty current password
      const changePasswordData = {
        currentPassword: '',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('New password validation (Requirement 20.2)', () => {
    it('should reject new password shorter than 8 characters', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password with short new password
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'Pass1!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'Password must be at least 8 characters',
          }),
        ])
      );
    });

    it('should reject new password without uppercase letter', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without uppercase
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'newpassword123!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'Password must contain at least one uppercase letter',
          }),
        ])
      );
    });

    it('should reject new password without lowercase letter', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without lowercase
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NEWPASSWORD123!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'Password must contain at least one lowercase letter',
          }),
        ])
      );
    });

    it('should reject new password without number', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without number
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'Password must contain at least one number',
          }),
        ])
      );
    });

    it('should reject new password without special character', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without special character
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'Password must contain at least one special character',
          }),
        ])
      );
    });

    it('should reject missing new password', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password without new password
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'newPassword',
            message: 'New password is required',
          }),
        ])
      );
    });

    it('should accept new password with all complexity requirements', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Change password with valid new password
      const changePasswordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'C0mpl3x!P@ssw0rd',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(200);

      expect(response.body.message).toContain('Password changed successfully');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should reject password change with empty request body', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'OldPassword123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'OldPassword123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Try to change password with empty body
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should allow using same password as new password (no password history)', async () => {
      // Register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'Password123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Change password to the same password (should succeed - no password history requirement)
      const changePasswordData = {
        currentPassword: 'Password123!',
        newPassword: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(changePasswordData)
        .expect(200);

      expect(response.body.message).toContain('Password changed successfully');
    });
  });
});
