import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import express, { Express } from 'express';
import request from 'supertest';
import { createAuthRouter } from '../../src/routes/auth';
import { createUsersRouter } from '../../src/routes/users';
import { DatabaseService } from '../../src/database/DatabaseService';

/**
 * Integration Tests for Authentication Flow
 *
 * These tests validate complete end-to-end authentication workflows:
 * - Registration → Login → Access Protected Endpoint
 * - Token Refresh Flow
 * - Logout Flow
 *
 * Validates Requirements: 1.1, 6.3, 19.1
 */
describe('Authentication Flow Integration Tests', () => {
  let app: Express;
  let db: Database;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Set JWT_SECRET for testing
    process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';  // pragma: allowlist secret

    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Seed built-in roles and permissions
    await seedBuiltInData(db);

    // Create mock DatabaseService
    databaseService = {
      getConnection: () => db,
      isInitialized: () => true,
    } as DatabaseService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(databaseService));
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe('Complete Registration → Login → Access Protected Endpoint Flow', () => {
    it('should complete full authentication workflow successfully', async () => {
      // Step 1: Register a new user
      const userData = {
        username: 'integrationuser',
        email: 'integration@example.com',
        password: 'SecurePass123!',
        firstName: 'Integration',
        lastName: 'Test',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body).toHaveProperty('user');
      expect(registerResponse.body.user.username).toBe('integrationuser');
      expect(registerResponse.body.user.email).toBe('integration@example.com');
      expect(registerResponse.body.user.isActive).toBe(true);

      // Verify password is not in response
      expect(registerResponse.body.user).not.toHaveProperty('password');
      expect(registerResponse.body.user).not.toHaveProperty('passwordHash');

      const userId = registerResponse.body.user.id;

      // Make user admin so they can access protected endpoints
      await makeUserAdmin(db, userId);

      // Step 2: Login with the registered credentials
      const loginData = {
        username: 'integrationuser',
        password: 'SecurePass123!',
      };

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
      expect(loginResponse.body).toHaveProperty('refreshToken');
      expect(loginResponse.body).toHaveProperty('user');
      expect(loginResponse.body.user.username).toBe('integrationuser');

      // Verify tokens are valid strings
      expect(typeof loginResponse.body.token).toBe('string');
      expect(typeof loginResponse.body.refreshToken).toBe('string');
      expect(loginResponse.body.token.length).toBeGreaterThan(0);
      expect(loginResponse.body.refreshToken.length).toBeGreaterThan(0);

      const accessToken = loginResponse.body.token;

      // Step 3: Access a protected endpoint with the token
      const protectedResponse = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(protectedResponse.body).toHaveProperty('id');
      expect(protectedResponse.body.id).toBe(userId);
      expect(protectedResponse.body.username).toBe('integrationuser');
      expect(protectedResponse.body.email).toBe('integration@example.com');

      // Step 4: Verify that accessing without token fails
      await request(app)
        .get(`/api/users/${userId}`)
        .expect(401);

      // Step 5: Verify that accessing with invalid token fails
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
    });

    it('should prevent access to protected endpoints without authentication', async () => {
      // Try to access protected endpoint without token
      const response = await request(app)
        .get('/api/users')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject expired or invalid tokens', async () => {
      // Register and login
      const userData = {
        username: 'tokentest',
        email: 'tokentest@example.com',
        password: 'SecurePass123!',
        firstName: 'Token',
        lastName: 'Test',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'tokentest', password: 'SecurePass123!' })
        .expect(200);

      const userId = loginResponse.body.user.id;

      // Try with malformed token
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', 'Bearer malformed.token.here')
        .expect(401);

      // Try with completely invalid token
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', 'Bearer not-a-jwt-token')
        .expect(401);
    });

    it('should maintain session state across multiple requests', async () => {
      // Register and login
      const userData = {
        username: 'sessionuser',
        email: 'session@example.com',
        password: 'SecurePass123!',
        firstName: 'Session',
        lastName: 'User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      await makeUserAdmin(db, registerResponse.body.user.id);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'sessionuser', password: 'SecurePass123!' })
        .expect(200);

      const token = loginResponse.body.token;
      const userId = loginResponse.body.user.id;

      // Make multiple requests with the same token
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.username).toBe('sessionuser');
      }
    });
  });

  describe('Token Refresh Flow', () => {
    it('should successfully refresh access token using refresh token', async () => {
      // Step 1: Register and login
      const userData = {
        username: 'refreshuser',
        email: 'refresh@example.com',
        password: 'SecurePass123!',
        firstName: 'Refresh',
        lastName: 'User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      await makeUserAdmin(db, registerResponse.body.user.id);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'refreshuser', password: 'SecurePass123!' })
        .expect(200);

      const originalToken = loginResponse.body.token;
      const refreshToken = loginResponse.body.refreshToken;
      const userId = loginResponse.body.user.id;

      // Step 2: Use refresh token to get new access token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('token');
      expect(refreshResponse.body).toHaveProperty('user');
      expect(refreshResponse.body.user.id).toBe(userId);

      const newToken = refreshResponse.body.token;

      // Verify new token is different from original
      expect(newToken).not.toBe(originalToken);

      // Step 3: Verify new token works for protected endpoints
      const protectedResponse = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(protectedResponse.body.username).toBe('refreshuser');

      // Step 4: Verify original token still works (not revoked by refresh)
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${originalToken}`)
        .expect(200);
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle refresh token after user logout', async () => {
      // Register and login
      const userData = {
        username: 'logoutrefresh',
        email: 'logoutrefresh@example.com',
        password: 'SecurePass123!',
        firstName: 'Logout',
        lastName: 'Refresh',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'logoutrefresh', password: 'SecurePass123!' })
        .expect(200);

      const token = loginResponse.body.token;
      const refreshToken = loginResponse.body.refreshToken;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Try to use refresh token after logout
      // Note: Refresh token should still work as only access token is revoked
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('token');
    });
  });

  describe('Logout Flow', () => {
    it('should successfully logout and revoke token', async () => {
      // Step 1: Register and login
      const userData = {
        username: 'logoutuser',
        email: 'logout@example.com',
        password: 'SecurePass123!',
        firstName: 'Logout',
        lastName: 'User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      await makeUserAdmin(db, registerResponse.body.user.id);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'logoutuser', password: 'SecurePass123!' })
        .expect(200);

      const token = loginResponse.body.token;
      const userId = loginResponse.body.user.id;

      // Step 2: Verify token works before logout
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Step 3: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(logoutResponse.body).toHaveProperty('message');
      expect(logoutResponse.body.message).toBe('Logout successful');

      // Step 4: Verify token is revoked and cannot be used
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should require authentication for logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle logout with invalid token', async () => {
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should allow re-login after logout', async () => {
      // Register and login
      const userData = {
        username: 'reloginuser',
        email: 'relogin@example.com',
        password: 'SecurePass123!',
        firstName: 'Relogin',
        lastName: 'User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      await makeUserAdmin(db, registerResponse.body.user.id);

      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'reloginuser', password: 'SecurePass123!' })
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
        .send({ username: 'reloginuser', password: 'SecurePass123!' })
        .expect(200);

      expect(loginResponse2.body).toHaveProperty('token');
      expect(loginResponse2.body).toHaveProperty('refreshToken');

      const token2 = loginResponse2.body.token;
      const userId = loginResponse2.body.user.id;

      // Verify new token works
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Verify old token still doesn't work
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);
    });
  });

  describe('End-to-End Authentication Scenarios', () => {
    it('should handle complete user lifecycle: register → login → use → logout → re-login', async () => {
      const userData = {
        username: 'lifecycleuser',
        email: 'lifecycle@example.com',
        password: 'SecurePass123!',
        firstName: 'Lifecycle',
        lastName: 'User',
      };

      // 1. Register
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body.user.username).toBe('lifecycleuser');

      await makeUserAdmin(db, registerResponse.body.user.id);

      // 2. Login
      const loginResponse1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'lifecycleuser', password: 'SecurePass123!' })
        .expect(200);

      const token1 = loginResponse1.body.token;
      const userId = loginResponse1.body.user.id;

      // 3. Use protected endpoint
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // 4. Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // 5. Verify token is revoked
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      // 6. Re-login
      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'lifecycleuser', password: 'SecurePass123!' })
        .expect(200);

      const token2 = loginResponse2.body.token;

      // 7. Use protected endpoint with new token
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
    });

    it('should handle multiple concurrent sessions for same user', async () => {
      const userData = {
        username: 'multiuser',
        email: 'multi@example.com',
        password: 'SecurePass123!',
        firstName: 'Multi',
        lastName: 'User',
      };

      // Register
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      await makeUserAdmin(db, registerResponse.body.user.id);

      // Login from "device 1"
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'multiuser', password: 'SecurePass123!' })
        .expect(200);

      const token1 = login1.body.token;
      const userId = login1.body.user.id;

      // Login from "device 2"
      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'multiuser', password: 'SecurePass123!' })
        .expect(200);

      const token2 = login2.body.token;

      // Verify both tokens work
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Logout from device 1
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify token1 is revoked
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      // Verify token2 still works
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
    });

    it('should handle authentication with inactive user account', async () => {
      const userData = {
        username: 'inactiveuser',
        email: 'inactive@example.com',
        password: 'SecurePass123!',
        firstName: 'Inactive',
        lastName: 'User',
      };

      // Register
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const userId = registerResponse.body.user.id;

      await makeUserAdmin(db, userId);

      // Login successfully
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'inactiveuser', password: 'SecurePass123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Verify token works
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Deactivate user
      await new Promise<void>((resolve, reject) => {
        db.run(
          'UPDATE users SET isActive = 0 WHERE id = ?',
          [userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Try to login with inactive account
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'inactiveuser', password: 'SecurePass123!' })
        .expect(401);

      // Existing token should still work (token was issued when user was active)
      // Note: In production, you might want to check user status on each request
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should validate token structure and payload', async () => {
      const userData = {
        username: 'tokenstructure',
        email: 'tokenstructure@example.com',
        password: 'SecurePass123!',
        firstName: 'Token',
        lastName: 'Structure',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'tokenstructure', password: 'SecurePass123!' })
        .expect(200);

      const token = loginResponse.body.token;

      // Verify token is a JWT (has 3 parts separated by dots)
      const tokenParts = token.split('.');
      expect(tokenParts).toHaveLength(3);

      // Verify each part is base64-encoded
      tokenParts.forEach((part: string) => {
        expect(part.length).toBeGreaterThan(0);
        expect(/^[A-Za-z0-9_-]+$/.test(part)).toBe(true);
      });
    });
  });
});

// Helper functions
async function makeUserAdmin(db: Database, userId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE users SET isAdmin = 1 WHERE id = ?',
      [userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

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

      CREATE TABLE failed_login_attempts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        attemptedAt TEXT NOT NULL
      );

      CREATE TABLE account_lockouts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        lockoutType TEXT NOT NULL,
        lockedAt TEXT NOT NULL,
        expiresAt TEXT,
        reason TEXT
      );

      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        eventType TEXT NOT NULL,
        action TEXT NOT NULL,
        userId TEXT,
        targetUserId TEXT,
        targetResourceType TEXT,
        targetResourceId TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        details TEXT,
        result TEXT NOT NULL
      );
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function seedBuiltInData(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();

    db.exec(`
      -- Insert built-in permissions
      INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
        ('perm-users-read', 'users', 'read', 'View user information', '${now}'),
        ('perm-users-write', 'users', 'write', 'Create and update users', '${now}'),
        ('perm-users-admin', 'users', 'admin', 'Full user management', '${now}');

      -- Insert built-in roles
      INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
        ('role-viewer', 'Viewer', 'Read-only access', 1, '${now}', '${now}'),
        ('role-operator', 'Operator', 'Read and execute access', 1, '${now}', '${now}'),
        ('role-admin', 'Administrator', 'Full system access', 1, '${now}', '${now}');

      -- Assign permissions to roles
      INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES
        ('role-viewer', 'perm-users-read', '${now}'),
        ('role-operator', 'perm-users-read', '${now}'),
        ('role-admin', 'perm-users-read', '${now}'),
        ('role-admin', 'perm-users-write', '${now}'),
        ('role-admin', 'perm-users-admin', '${now}');
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
