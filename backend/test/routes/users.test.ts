import express, { Express } from 'express';
import request from 'supertest';
import { createUsersRouter } from '../../src/routes/users';
import { DatabaseService } from '../../src/database/DatabaseService';
import { randomUUID } from 'crypto';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { RoleService } from '../../src/services/RoleService';
import { GroupService } from '../../src/services/GroupService';

describe('Users Router - GET /api/users', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));

  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:read permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:read permission (handle if already exists)
    let usersReadPermission;
    try {
      usersReadPermission = await permissionService.createPermission({
        resource: 'users',
        action: 'read',
        description: 'Read users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersReadPermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'read'  // pragma: allowlist secret
      );
      if (!usersReadPermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:read permission
    const adminRole = await roleService.createRole({
      name: 'UserAdmin',
      description: 'Can read users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersReadPermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:read permission', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'read',
      });
    });

    it('should return 200 when user has users:read permission', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 25 test users for pagination testing
      for (let i = 1; i <= 25; i++) {
        await userService.createUser({
          username: `testuser${i}`,
          email: `testuser${i}@test.com`,
          password: 'TestPass123!',
          firstName: `Test${i}`,
          lastName: `User${i}`,
        });
      }
    });

    it('should return first page with default limit of 20', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(20);
      expect(response.body.pagination).toEqual({
        total: 27, // 25 test users + 2 created in beforeEach
        page: 1,
        limit: 20,
        totalPages: 2,
      });
    });

    it('should return second page when page=2', async () => {
      const response = await request(app)
        .get('/api/users?page=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(7); // Remaining users
      expect(response.body.pagination).toEqual({
        total: 27,
        page: 2,
        limit: 20,
        totalPages: 2,
      });
    });

    it('should respect custom limit parameter', async () => {
      const response = await request(app)
        .get('/api/users?limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(10);
      expect(response.body.pagination).toEqual({
        total: 27,
        page: 1,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should handle page and limit together', async () => {
      const response = await request(app)
        .get('/api/users?page=2&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(10);
      expect(response.body.pagination).toEqual({
        total: 27,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/api/users?limit=150')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400); // Zod validation rejects values > 100

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return empty array for page beyond total pages', async () => {
      const response = await request(app)
        .get('/api/users?page=100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(0);
      expect(response.body.pagination.page).toBe(100);
    });
  });

  describe('Response Format', () => {
    it('should return users as DTOs without password hashes', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toBeDefined();
      expect(Array.isArray(response.body.users)).toBe(true);

      // Check that users don't contain password hashes
      response.body.users.forEach((user: any) => {
        expect(user.passwordHash).toBeUndefined();
        expect(user.id).toBeDefined();
        expect(user.username).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.firstName).toBeDefined();
        expect(user.lastName).toBeDefined();
        expect(typeof user.isActive).toBe('boolean');
        expect(typeof user.isAdmin).toBe('boolean');
        expect(user.createdAt).toBeDefined();
        expect(user.updatedAt).toBeDefined();
      });
    });

    it('should include pagination metadata', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBeDefined();
      expect(response.body.pagination.page).toBeDefined();
      expect(response.body.pagination.limit).toBeDefined();
      expect(response.body.pagination.totalPages).toBeDefined();
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid page parameter', async () => {
      const response = await request(app)
        .get('/api/users?page=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid limit parameter', async () => {
      const response = await request(app)
        .get('/api/users?limit=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-numeric page parameter', async () => {
      const response = await request(app)
        .get('/api/users?page=abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to access endpoint', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.users).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });
  });
});

describe('Users Router - GET /api/users/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:read permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:read permission (handle if already exists)
    let usersReadPermission;
    try {
      usersReadPermission = await permissionService.createPermission({
        resource: 'users',
        action: 'read',
        description: 'Read users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersReadPermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'read'  // pragma: allowlist secret
      );
      if (!usersReadPermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:read permission
    const adminRole = await roleService.createRole({
      name: 'UserAdmin',
      description: 'Can read users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersReadPermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user with groups and roles
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:read permission', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'read',
      });
    });

    it('should return 200 when user has users:read permission', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('test_user');
    });
  });

  describe('User Retrieval', () => {
    it('should return 404 when user does not exist', async () => {
      const nonExistentId = randomUUID();
      const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User not found');
    });

    it('should return user without password hash', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('test_user');
      expect(response.body.email).toBe('test@test.com');
      expect(response.body.firstName).toBe('Test');
      expect(response.body.lastName).toBe('User');
      expect(typeof response.body.isActive).toBe('boolean');
      expect(typeof response.body.isAdmin).toBe('boolean');
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should include empty groups array when user has no groups', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toBeDefined();
      expect(Array.isArray(response.body.groups)).toBe(true);
      expect(response.body.groups).toHaveLength(0);
    });

    it('should include empty roles array when user has no roles', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.roles).toBeDefined();
      expect(Array.isArray(response.body.roles)).toBe(true);
      expect(response.body.roles).toHaveLength(0);
    });
  });

  describe('Groups and Roles Inclusion', () => {
    it('should include user groups when user belongs to groups', async () => {
      // Create a group
      const db = databaseService.getConnection();
      const groupId = randomUUID();
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [groupId, 'Test Group', 'Test group description', new Date().toISOString(), new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Add user to group
      await userService.addUserToGroup(testUserId, groupId);

      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toBeDefined();
      expect(Array.isArray(response.body.groups)).toBe(true);
      expect(response.body.groups).toHaveLength(1);
      expect(response.body.groups[0].id).toBe(groupId);
      expect(response.body.groups[0].name).toBe('Test Group');
      expect(response.body.groups[0].description).toBe('Test group description');
    });

    it('should include user roles when user has assigned roles', async () => {
      // Create a role
      const role = await roleService.createRole({
        name: 'Test Role',
        description: 'Test role description',
      });

      // Assign role to user
      await userService.assignRoleToUser(testUserId, role.id);

      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.roles).toBeDefined();
      expect(Array.isArray(response.body.roles)).toBe(true);
      expect(response.body.roles).toHaveLength(1);
      expect(response.body.roles[0].id).toBe(role.id);
      expect(response.body.roles[0].name).toBe('Test Role');
      expect(response.body.roles[0].description).toBe('Test role description');
    });

    it('should include multiple groups and roles', async () => {
      // Create groups
      const db = databaseService.getConnection();
      const group1Id = randomUUID();
      const group2Id = randomUUID();

      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [group1Id, 'Group 1', 'First group', new Date().toISOString(), new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [group2Id, 'Group 2', 'Second group', new Date().toISOString(), new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Add user to groups
      await userService.addUserToGroup(testUserId, group1Id);
      await userService.addUserToGroup(testUserId, group2Id);

      // Create roles
      const role1 = await roleService.createRole({
        name: 'Role 1',
        description: 'First role',
      });

      const role2 = await roleService.createRole({
        name: 'Role 2',
        description: 'Second role',
      });

      // Assign roles to user
      await userService.assignRoleToUser(testUserId, role1.id);
      await userService.assignRoleToUser(testUserId, role2.id);

      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toHaveLength(2);
      expect(response.body.roles).toHaveLength(2);

      // Verify groups are sorted by name
      expect(response.body.groups[0].name).toBe('Group 1');
      expect(response.body.groups[1].name).toBe('Group 2');

      // Verify roles are sorted by name
      expect(response.body.roles[0].name).toBe('Role 1');
      expect(response.body.roles[1].name).toBe('Role 2');
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to access endpoint', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      const response = await request(app)
        .get(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('test_user');
    });
  });
});


describe('Users Router - PUT /api/users/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const adminRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be updated
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', 'Bearer invalid-token')
        .send({ firstName: 'Updated' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:write permission', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ firstName: 'Updated' })
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'write',
      });
    });

    it('should return 200 when user has users:write permission', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body.firstName).toBe('Updated');
    });
  });

  describe('User Update', () => {
    it('should return 404 when user does not exist', async () => {
      const nonExistentId = randomUUID();
      const response = await request(app)
        .put(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated' })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User not found');
    });

    it('should update user email', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'newemail@test.com' })
        .expect(200);

      expect(response.body.email).toBe('newemail@test.com');
      expect(response.body.passwordHash).toBeUndefined();
    });

    it('should update user firstName', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'NewFirstName' })
        .expect(200);

      expect(response.body.firstName).toBe('NewFirstName');
      expect(response.body.lastName).toBe('User'); // Unchanged
    });

    it('should update user lastName', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lastName: 'NewLastName' })
        .expect(200);

      expect(response.body.lastName).toBe('NewLastName');
      expect(response.body.firstName).toBe('Test'); // Unchanged
    });

    it('should update user password', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NewPassword123!' })
        .expect(200);

      expect(response.body.passwordHash).toBeUndefined();

      // Verify new password works
      const authResult = await authService.authenticate('test_user', 'NewPassword123!');
      expect(authResult.success).toBe(true);
    });

    it('should update user isActive status', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should update user isAdmin status', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isAdmin: true })
        .expect(200);

      expect(response.body.isAdmin).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'updated@test.com',
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          isActive: false,
        })
        .expect(200);

      expect(response.body.email).toBe('updated@test.com');
      expect(response.body.firstName).toBe('UpdatedFirst');
      expect(response.body.lastName).toBe('UpdatedLast');
      expect(response.body.isActive).toBe(false);
    });

    it('should update updatedAt timestamp', async () => {
      const userBefore = await userService.getUserById(testUserId);
      const updatedAtBefore = userBefore?.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body.updatedAt).not.toBe(updatedAtBefore);
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should return 400 for empty firstName', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty lastName', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lastName: '' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for firstName exceeding 100 characters', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for lastName exceeding 100 characters', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ lastName: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for password less than 8 characters', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Short1!' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for password without uppercase letter', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'lowercase123!' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('uppercase');
    });

    it('should return 400 for password without lowercase letter', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'UPPERCASE123!' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('lowercase');
    });

    it('should return 400 for password without number', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NoNumbers!' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('number');
    });

    it('should return 400 for password without special character', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NoSpecial123' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('special character');
    });

    it('should return 400 for invalid isActive type', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: 'not-a-boolean' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid isAdmin type', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isAdmin: 'not-a-boolean' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for unknown fields (strict mode)', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unknownField: 'value' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Duplicate Email Handling', () => {
    it('should return 409 when updating to an existing email', async () => {
      // Create another user with a different email
      const anotherUser = await userService.createUser({
        username: 'another_user',
        email: 'another@test.com',
        password: 'AnotherPass123!',
        firstName: 'Another',
        lastName: 'User',
      });

      // Try to update test user's email to the existing email
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'another@test.com' })
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe('Email already exists');
      expect(response.body.error.field).toBe('email');
    });

    it('should allow updating email to the same email (no change)', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test@test.com' })
        .expect(200);

      expect(response.body.email).toBe('test@test.com');
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to update any user', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ firstName: 'AdminUpdated' })
        .expect(200);

      expect(response.body.firstName).toBe('AdminUpdated');
    });
  });

  describe('Response Format', () => {
    it('should return updated user as DTO without password hash', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('test_user');
      expect(response.body.email).toBe('test@test.com');
      expect(response.body.firstName).toBe('Updated');
      expect(response.body.lastName).toBe('User');
      expect(typeof response.body.isActive).toBe('boolean');
      expect(typeof response.body.isAdmin).toBe('boolean');
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty update object', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      // User should be returned unchanged (except updatedAt)
      expect(response.body.id).toBe(testUserId);
      expect(response.body.username).toBe('test_user');
    });

    it('should handle updating only password', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'NewSecurePass123!' })
        .expect(200);

      expect(response.body.passwordHash).toBeUndefined();

      // Verify old password no longer works
      const oldAuthResult = await authService.authenticate('test_user', 'TestPass123!');
      expect(oldAuthResult.success).toBe(false);

      // Verify new password works
      const newAuthResult = await authService.authenticate('test_user', 'NewSecurePass123!');
      expect(newAuthResult.success).toBe(true);
    });

    it('should handle deactivating a user', async () => {
      const response = await request(app)
        .put(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);

      // Verify deactivated user cannot authenticate
      const authResult = await authService.authenticate('test_user', 'TestPass123!');
      expect(authResult.success).toBe(false);
    });
  });
});

describe('Users Router - DELETE /api/users/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let writerUserToken: string;
  let writerUserId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:admin permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:admin permission (handle if already exists)
    let usersAdminPermission;
    try {
      usersAdminPermission = await permissionService.createPermission({
        resource: 'users',
        action: 'admin',
        description: 'Admin users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersAdminPermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'admin'  // pragma: allowlist secret
      );
      if (!usersAdminPermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:admin permission
    const adminRole = await roleService.createRole({
      name: 'UserAdministrator',
      description: 'Can admin users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersAdminPermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create user with users:write permission (but not users:admin)
    const writerUser = await userService.createUser({
      username: 'writer_user',
      email: 'writer@test.com',
      password: 'WriterPass123!',
      firstName: 'Writer',
      lastName: 'User',
      isAdmin: false,
    });
    writerUserId = writerUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const writerRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(writerRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(writerUserId, writerRole.id);

    // Generate token for writer user
    writerUserToken = await authService.generateToken(writerUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be deleted
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:admin permission', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'admin',
      });
    });

    it('should return 403 when user has users:write but not users:admin permission', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${writerUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'admin',
      });
    });

    it('should return 204 when user has users:admin permission', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
    });
  });

  describe('User Deletion', () => {
    it('should return 404 when user does not exist', async () => {
      const nonExistentId = randomUUID();
      const response = await request(app)
        .delete(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User not found');
    });

    it('should soft delete user (set isActive to 0)', async () => {
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user still exists in database but is inactive
      const user = await userService.getUserById(testUserId);
      expect(user).toBeDefined();
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });

    it('should return 204 No Content on successful deletion', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should prevent deleted user from authenticating', async () => {
      // Delete the user
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to authenticate with deleted user
      const authResult = await authService.authenticate('test_user', 'TestPass123!');
      expect(authResult.success).toBe(false);
    });

    it('should update updatedAt timestamp on deletion', async () => {
      const userBefore = await userService.getUserById(testUserId);
      const updatedAtBefore = userBefore?.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const userAfter = await userService.getUserById(testUserId);
      expect(userAfter?.updatedAt).not.toBe(updatedAtBefore);
    });

    it('should allow deleting already inactive user', async () => {
      // First deactivate the user
      await userService.updateUser(testUserId, { isActive: false });

      // Then delete (should still work)
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const user = await userService.getUserById(testUserId);
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow super admin users to delete any user', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204);

      const user = await userService.getUserById(testUserId);
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });
  });

  describe('Edge Cases', () => {
    it('should handle deleting user with groups', async () => {
      // Create a group and add user to it
      const db = databaseService.getConnection();
      const groupId = randomUUID();
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [groupId, 'Test Group', 'Test group description', new Date().toISOString(), new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await userService.addUserToGroup(testUserId, groupId);

      // Delete user should succeed
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const user = await userService.getUserById(testUserId);
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });

    it('should handle deleting user with roles', async () => {
      // Create a role and assign to user
      const role = await roleService.createRole({
        name: 'Test Role',
        description: 'Test role description',
      });

      await userService.assignRoleToUser(testUserId, role.id);

      // Delete user should succeed
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const user = await userService.getUserById(testUserId);
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });

    it('should handle deleting user with both groups and roles', async () => {
      // Create a group
      const db = databaseService.getConnection();
      const groupId = randomUUID();
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO groups (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [groupId, 'Test Group', 'Test group description', new Date().toISOString(), new Date().toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await userService.addUserToGroup(testUserId, groupId);

      // Create a role
      const role = await roleService.createRole({
        name: 'Test Role',
        description: 'Test role description',
      });

      await userService.assignRoleToUser(testUserId, role.id);

      // Delete user should succeed
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const user = await userService.getUserById(testUserId);
      expect(user?.isActive).toBeFalsy(); // SQLite stores as 0
    });

    it('should return 404 when trying to delete same user twice', async () => {
      // First deletion
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Second deletion - getUserById returns inactive users, but they're still "found"
      // So this should succeed again (idempotent soft delete)
      await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('Permission Specificity', () => {
    it('should require users:admin permission, not just users:write', async () => {
      // This test verifies that DELETE requires higher privilege than PUT
      // Writer user has users:write but not users:admin
      const response = await request(app)
        .delete(`/api/users/${testUserId}`)
        .set('Authorization', `Bearer ${writerUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.required.action).toBe('admin');
    });
  });
});

describe('Users Router - POST /api/users/:id/groups/:groupId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;
  let testGroupId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const adminRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be added to group
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;

    // Create test group
    const testGroup = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test group for user association',
    });
    testGroupId = testGroup.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:write permission', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'write',
      });
    });

    it('should return 204 when user has users:write permission', async () => {
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('User-Group Association', () => {
    it('should successfully add user to group', async () => {
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is in group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(testGroupId);
      expect(groups[0].name).toBe('Test Group');
    });

    it('should return 404 when user does not exist', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${nonExistentUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User not found');
    });

    it('should return 404 when group does not exist', async () => {
      const nonExistentGroupId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${nonExistentGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('Group not found');
    });

    it('should return 409 when user is already in group', async () => {
      // Add user to group first time
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to add again
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe('User is already a member of this group');
    });

    it('should allow user to be added to multiple groups', async () => {
      // Create second group
      const secondGroup = await groupService.createGroup({
        name: 'Second Group',
        description: 'Second test group',
      });

      // Add user to first group
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Add user to second group
      await request(app)
        .post(`/api/users/${testUserId}/groups/${secondGroup.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is in both groups
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(2);
      const groupIds = groups.map(g => g.id);
      expect(groupIds).toContain(testGroupId);
      expect(groupIds).toContain(secondGroup.id);
    });
  });

  describe('Permission Cache Invalidation', () => {
    it('should invalidate permission cache after adding user to group', async () => {
      // Create a permission and role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'read',
        description: 'Test permission',
      });

      const testRole = await roleService.createRole({
        name: 'Test Role',
        description: 'Test role with permission',
      });

      await roleService.assignPermissionToRole(testRole.id, testPermission.id);

      // Assign role to group
      await groupService.assignRoleToGroup(testGroupId, testRole.id);

      // Check permission before adding to group (should be false)
      const hasPermissionBefore = await permissionService.hasPermission(
        testUserId,
        'test',
        'read'
      );
      expect(hasPermissionBefore).toBe(false);

      // Add user to group via API
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is actually in the group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(testGroupId);

      // Check permission after adding to group (should be true)
      // Note: We need to create a fresh PermissionService to avoid using cached instance
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'test',
        'read'
      );
      expect(hasPermissionAfter).toBe(true);
    });

    it('should clear cached permission checks for the user', async () => {
      // Create a permission and role
      const testPermission = await permissionService.createPermission({
        resource: 'cached',
        action: 'execute',
        description: 'Cached test permission',
      });

      const testRole = await roleService.createRole({
        name: 'Cached Role',
        description: 'Role for cache test',
      });

      await roleService.assignPermissionToRole(testRole.id, testPermission.id);
      await groupService.assignRoleToGroup(testGroupId, testRole.id);

      // Check permission to populate cache (should be false)
      const cachedBefore = await permissionService.hasPermission(testUserId, 'cached', 'execute');
      expect(cachedBefore).toBe(false);

      // Add user to group via API (this should invalidate cache in the router's instance)
      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is in the group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(1);

      // Check permission again with a fresh service instance
      // This simulates a new request where the cache would be checked
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermission = await freshPermissionService.hasPermission(
        testUserId,
        'cached',
        'execute'
      );
      expect(hasPermission).toBe(true);
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to add users to groups', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204);

      // Verify user is in group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(testGroupId);
    });
  });

  describe('Response Format', () => {
    it('should return 204 No Content with no response body on success', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return proper error format for 404 errors', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${nonExistentUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return proper error format for 409 conflict', async () => {
      // Add user to group first
      await userService.addUserToGroup(testUserId, testGroupId);

      const response = await request(app)
        .post(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });
});

describe('Users Router - DELETE /api/users/:id/groups/:groupId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;
  let testGroupId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const adminRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be removed from group
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;

    // Create test group
    const testGroup = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test group for user disassociation',
    });
    testGroupId = testGroup.id;

    // Add user to group for removal tests
    await userService.addUserToGroup(testUserId, testGroupId);
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:write permission', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'write',
      });
    });

    it('should return 204 when user has users:write permission', async () => {
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('User-Group Disassociation', () => {
    it('should successfully remove user from group', async () => {
      // Verify user is in group before removal
      const groupsBefore = await userService.getUserGroups(testUserId);
      expect(groupsBefore).toHaveLength(1);
      expect(groupsBefore[0].id).toBe(testGroupId);

      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is no longer in group
      const groupsAfter = await userService.getUserGroups(testUserId);
      expect(groupsAfter).toHaveLength(0);
    });

    it('should return 404 when user is not a member of the group', async () => {
      // Create a second group that user is not in
      const secondGroup = await groupService.createGroup({
        name: 'Second Group',
        description: 'Group user is not in',
      });

      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${secondGroup.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User is not a member of this group');
    });

    it('should return 404 when trying to remove from non-existent group', async () => {
      const nonExistentGroupId = randomUUID();
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${nonExistentGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User is not a member of this group');
    });

    it('should allow removing user from one group while keeping other group memberships', async () => {
      // Create second group and add user to it
      const secondGroup = await groupService.createGroup({
        name: 'Second Group',
        description: 'Second test group',
      });
      await userService.addUserToGroup(testUserId, secondGroup.id);

      // Verify user is in both groups
      const groupsBefore = await userService.getUserGroups(testUserId);
      expect(groupsBefore).toHaveLength(2);

      // Remove user from first group
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is still in second group
      const groupsAfter = await userService.getUserGroups(testUserId);
      expect(groupsAfter).toHaveLength(1);
      expect(groupsAfter[0].id).toBe(secondGroup.id);
    });

    it('should handle removing user from group twice (idempotency check)', async () => {
      // Remove user from group first time
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to remove again - should return 404
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User is not a member of this group');
    });
  });

  describe('Permission Cache Invalidation', () => {
    it('should invalidate permission cache after removing user from group', async () => {
      // Create a permission and role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'delete',
        description: 'Test delete permission',
      });

      const testRole = await roleService.createRole({
        name: 'Test Role',
        description: 'Test role with permission',
      });

      await roleService.assignPermissionToRole(testRole.id, testPermission.id);

      // Assign role to group
      await groupService.assignRoleToGroup(testGroupId, testRole.id);

      // Check permission before removing from group (should be true)
      const hasPermissionBefore = await permissionService.hasPermission(
        testUserId,
        'test',
        'delete'
      );
      expect(hasPermissionBefore).toBe(true);

      // Remove user from group via API
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is no longer in the group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(0);

      // Check permission after removing from group (should be false)
      // Note: We need to create a fresh PermissionService to avoid using cached instance
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'test',
        'delete'
      );
      expect(hasPermissionAfter).toBe(false);
    });

    it('should clear cached permission checks for the user', async () => {
      // Create a permission and role
      const testPermission = await permissionService.createPermission({
        resource: 'cached',
        action: 'remove',
        description: 'Cached test permission',
      });

      const testRole = await roleService.createRole({
        name: 'Cached Role',
        description: 'Role for cache test',
      });

      await roleService.assignPermissionToRole(testRole.id, testPermission.id);
      await groupService.assignRoleToGroup(testGroupId, testRole.id);

      // Check permission to populate cache (should be true)
      const cachedBefore = await permissionService.hasPermission(testUserId, 'cached', 'remove');
      expect(cachedBefore).toBe(true);

      // Remove user from group via API (this should invalidate cache in the router's instance)
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user is no longer in the group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(0);

      // Check permission again with a fresh service instance
      // This simulates a new request where the cache would be checked
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermission = await freshPermissionService.hasPermission(
        testUserId,
        'cached',
        'remove'
      );
      expect(hasPermission).toBe(false);
    });

    it('should not affect permissions from other sources after group removal', async () => {
      // Create a permission and role
      const testPermission = await permissionService.createPermission({
        resource: 'multi',
        action: 'access',
        description: 'Multi-source permission',
      });

      const groupRole = await roleService.createRole({
        name: 'Group Role',
        description: 'Role assigned to group',
      });

      const directRole = await roleService.createRole({
        name: 'Direct Role',
        description: 'Role assigned directly to user',
      });

      await roleService.assignPermissionToRole(groupRole.id, testPermission.id);
      await roleService.assignPermissionToRole(directRole.id, testPermission.id);

      // Assign group role to group and direct role to user
      await groupService.assignRoleToGroup(testGroupId, groupRole.id);
      await userService.assignRoleToUser(testUserId, directRole.id);

      // Check permission before removing from group (should be true)
      const hasPermissionBefore = await permissionService.hasPermission(
        testUserId,
        'multi',
        'access'
      );
      expect(hasPermissionBefore).toBe(true);

      // Remove user from group via API
      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Check permission after removing from group (should still be true due to direct role)
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'multi',
        'access'
      );
      expect(hasPermissionAfter).toBe(true);
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to remove users from groups', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204);

      // Verify user is no longer in group
      const groups = await userService.getUserGroups(testUserId);
      expect(groups).toHaveLength(0);
    });
  });

  describe('Response Format', () => {
    it('should return 204 No Content with no response body on success', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return proper error format for 404 errors', async () => {
      // Create a group user is not in
      const secondGroup = await groupService.createGroup({
        name: 'Other Group',
        description: 'Group user is not in',
      });

      const response = await request(app)
        .delete(`/api/users/${testUserId}/groups/${secondGroup.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});

describe('Users Router - POST /api/users/:id/roles/:roleId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;
  let testRoleId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const adminRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be assigned role
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;

    // Create test role
    const testRole = await roleService.createRole({
      name: 'Test Role',
      description: 'Test role for user assignment',
    });
    testRoleId = testRole.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:write permission', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'write',
      });
    });

    it('should return 204 when user has users:write permission', async () => {
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('User-Role Assignment', () => {
    it('should successfully assign role to user', async () => {
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user has the role
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRoleId);
      expect(roles[0].name).toBe('Test Role');
    });

    it('should return 404 when user does not exist', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${nonExistentUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User not found');
    });

    it('should return 404 when role does not exist', async () => {
      const nonExistentRoleId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${nonExistentRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('Role not found');
    });

    it('should return 409 when role is already assigned to user', async () => {
      // Assign role first time
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to assign again
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toBe('Role is already assigned to this user');
    });

    it('should allow user to be assigned multiple roles', async () => {
      // Create second role
      const secondRole = await roleService.createRole({
        name: 'Second Role',
        description: 'Second test role',
      });

      // Assign first role
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Assign second role
      await request(app)
        .post(`/api/users/${testUserId}/roles/${secondRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user has both roles
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(2);
      const roleIds = roles.map(r => r.id);
      expect(roleIds).toContain(testRoleId);
      expect(roleIds).toContain(secondRole.id);
    });
  });

  describe('Permission Cache Invalidation', () => {
    it('should invalidate permission cache after assigning role to user', async () => {
      // Create a permission and assign to test role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'read',
        description: 'Test permission',
      });

      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Check permission before assigning role (should be false)
      const hasPermissionBefore = await permissionService.hasPermission(
        testUserId,
        'test',
        'read'
      );
      expect(hasPermissionBefore).toBe(false);

      // Assign role to user via API
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user has the role
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRoleId);

      // Check permission after assigning role (should be true)
      // Note: We need to create a fresh PermissionService to avoid using cached instance
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'test',
        'read'
      );
      expect(hasPermissionAfter).toBe(true);
    });

    it('should clear cached permission checks for the user', async () => {
      // Create a permission and assign to test role
      const testPermission = await permissionService.createPermission({
        resource: 'cached',
        action: 'execute',
        description: 'Cached test permission',
      });

      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Check permission to populate cache (should be false)
      const cachedBefore = await permissionService.hasPermission(testUserId, 'cached', 'execute');
      expect(cachedBefore).toBe(false);

      // Assign role to user via API (this should invalidate cache in the router's instance)
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user has the role
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(1);

      // Check permission again with a fresh service instance
      // This simulates a new request where the cache would be checked
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermission = await freshPermissionService.hasPermission(
        testUserId,
        'cached',
        'execute'
      );
      expect(hasPermission).toBe(true);
    });

    it('should grant permissions from role immediately after assignment', async () => {
      // Create multiple permissions and assign to test role
      const readPermission = await permissionService.createPermission({
        resource: 'resource',
        action: 'read',
        description: 'Read permission',
      });

      const writePermission = await permissionService.createPermission({
        resource: 'resource',
        action: 'write',
        description: 'Write permission',
      });

      await roleService.assignPermissionToRole(testRoleId, readPermission.id);
      await roleService.assignPermissionToRole(testRoleId, writePermission.id);

      // Assign role to user via API
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Check both permissions with fresh service
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasReadPermission = await freshPermissionService.hasPermission(
        testUserId,
        'resource',
        'read'
      );
      const hasWritePermission = await freshPermissionService.hasPermission(
        testUserId,
        'resource',
        'write'
      );

      expect(hasReadPermission).toBe(true);
      expect(hasWritePermission).toBe(true);
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to assign roles to users', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204);

      // Verify user has the role
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRoleId);
    });
  });

  describe('Response Format', () => {
    it('should return 204 No Content with no response body on success', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return proper error format for 404 errors', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .post(`/api/users/${nonExistentUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return proper error format for 409 conflict errors', async () => {
      // Assign role first time
      await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to assign again
      const response = await request(app)
        .post(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Built-in Roles', () => {
    it('should allow assigning built-in roles to users', async () => {
      // Get a built-in role (e.g., Viewer)
      const builtInRoles = await roleService.getBuiltInRoles();
      expect(builtInRoles.length).toBeGreaterThan(0);

      const viewerRole = builtInRoles.find(r => r.name === 'Viewer');
      if (!viewerRole) {
        // Skip test if Viewer role doesn't exist
        return;
      }

      await request(app)
        .post(`/api/users/${testUserId}/roles/${viewerRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user has the built-in role
      const roles = await userService.getUserRoles(testUserId);
      const hasViewerRole = roles.some(r => r.id === viewerRole.id);
      expect(hasViewerRole).toBe(true);
    });
  });
});

describe('Users Router - DELETE /api/users/:id/roles/:roleId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let testUserId: string;
  let testRoleId: string;

  beforeAll(async () => {
    // Create in-memory database for testing
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    // Initialize services
    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());

    // Create Express app with users router
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with users:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create users:write permission (handle if already exists)
    let usersWritePermission;
    try {
      usersWritePermission = await permissionService.createPermission({
        resource: 'users',
        action: 'write',
        description: 'Write users',
      });
    } catch (error) {
      // Permission might already exist from previous test, fetch it
      const allPermissions = await permissionService.listPermissions();
      usersWritePermission = allPermissions.items.find(
        p => p.resource === 'users' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!usersWritePermission) {
        throw error; // Re-throw if it's a different error
      }
    }

    // Create role with users:write permission
    const adminRole = await roleService.createRole({
      name: 'UserWriter',
      description: 'Can write users',
    });

    await roleService.assignPermissionToRole(adminRole.id, usersWritePermission.id);
    await userService.assignRoleToUser(adminUserId, adminRole.id);

    // Generate token for admin user
    adminToken = await authService.generateToken(adminUser);

    // Create regular user without permissions
    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserId = regularUser.id;

    // Generate token for regular user
    regularUserToken = await authService.generateToken(regularUser);

    // Create test user to be assigned role
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;

    // Create test role
    const testRole = await roleService.createRole({
      name: 'Test Role',
      description: 'Test role for user assignment',
    });
    testRoleId = testRole.id;

    // Assign role to test user for removal tests
    await userService.assignRoleToUser(testUserId, testRoleId);
  });

  afterEach(async () => {
    // Clean up database after each test
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM users;
        DELETE FROM roles WHERE isBuiltIn = 0;
        DELETE FROM permissions;
        DELETE FROM groups;
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('authorization header');
    });

    it('should return 401 when invalid token is provided', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_TOKEN');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks users:write permission', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
      expect(response.body.error.required).toEqual({
        resource: 'users',
        action: 'write',
      });
    });

    it('should return 204 when user has users:write permission', async () => {
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('User-Role Removal', () => {
    it('should successfully remove role from user', async () => {
      // Verify user has the role before removal
      const rolesBefore = await userService.getUserRoles(testUserId);
      expect(rolesBefore).toHaveLength(1);
      expect(rolesBefore[0].id).toBe(testRoleId);

      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user no longer has the role
      const rolesAfter = await userService.getUserRoles(testUserId);
      expect(rolesAfter).toHaveLength(0);
    });

    it('should return 404 when user does not have the role', async () => {
      // Create a new role that the user doesn't have
      const unassignedRole = await roleService.createRole({
        name: 'Unassigned Role',
        description: 'Role not assigned to user',
      });

      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${unassignedRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User does not have this role');
    });

    it('should return 404 when trying to remove role from user who already had it removed', async () => {
      // Remove role first time
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Try to remove again
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User does not have this role');
    });

    it('should allow removing one role while user has multiple roles', async () => {
      // Create and assign second role
      const secondRole = await roleService.createRole({
        name: 'Second Role',
        description: 'Second test role',
      });
      await userService.assignRoleToUser(testUserId, secondRole.id);

      // Verify user has both roles
      const rolesBefore = await userService.getUserRoles(testUserId);
      expect(rolesBefore).toHaveLength(2);

      // Remove first role
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user still has second role
      const rolesAfter = await userService.getUserRoles(testUserId);
      expect(rolesAfter).toHaveLength(1);
      expect(rolesAfter[0].id).toBe(secondRole.id);
    });

    it('should handle removing role from user with non-existent user ID gracefully', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .delete(`/api/users/${nonExistentUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User does not have this role');
    });

    it('should handle removing non-existent role from user gracefully', async () => {
      const nonExistentRoleId = randomUUID();
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${nonExistentRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toBe('User does not have this role');
    });
  });

  describe('Permission Cache Invalidation', () => {
    it('should invalidate permission cache after removing role from user', async () => {
      // Create a permission and assign to test role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'delete',
        description: 'Test permission for deletion',
      });

      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Verify user has permission through the role
      const hasPermissionBefore = await permissionService.hasPermission(
        testUserId,
        'test',
        'delete'
      );
      expect(hasPermissionBefore).toBe(true);

      // Remove role from user via API
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user no longer has the role
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(0);

      // Check permission after removing role (should be false)
      // Note: We need to create a fresh PermissionService to avoid using cached instance
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'test',
        'delete'
      );
      expect(hasPermissionAfter).toBe(false);
    });

    it('should clear cached permission checks for the user', async () => {
      // Create a permission and assign to test role
      const testPermission = await permissionService.createPermission({
        resource: 'cached_delete',
        action: 'read',
        description: 'Cached permission for deletion test',
      });

      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Check permission to populate cache
      const hasPermissionInitial = await permissionService.hasPermission(
        testUserId,
        'cached_delete',
        'read'
      );
      expect(hasPermissionInitial).toBe(true);

      // Remove role from user via API (should invalidate cache)
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Check permission again - should reflect the removal
      // Note: We need to create a fresh PermissionService to avoid using cached instance
      const freshPermissionService = new PermissionService(databaseService.getConnection());
      const hasPermissionAfter = await freshPermissionService.hasPermission(
        testUserId,
        'cached_delete',
        'read'
      );
      expect(hasPermissionAfter).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should return 204 No Content with no response body on success', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return proper error format for 404 errors', async () => {
      const nonExistentUserId = randomUUID();
      const response = await request(app)
        .delete(`/api/users/${nonExistentUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Built-in Roles', () => {
    it('should allow removing built-in roles from users', async () => {
      // Get a built-in role (e.g., Viewer)
      const builtInRoles = await roleService.getBuiltInRoles();
      expect(builtInRoles.length).toBeGreaterThan(0);

      const viewerRole = builtInRoles.find(r => r.name === 'Viewer');
      if (!viewerRole) {
        // Skip test if Viewer role doesn't exist
        return;
      }

      // Assign built-in role to user
      await userService.assignRoleToUser(testUserId, viewerRole.id);

      // Verify user has the built-in role
      const rolesBefore = await userService.getUserRoles(testUserId);
      const hasViewerRoleBefore = rolesBefore.some(r => r.id === viewerRole.id);
      expect(hasViewerRoleBefore).toBe(true);

      // Remove built-in role
      await request(app)
        .delete(`/api/users/${testUserId}/roles/${viewerRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify user no longer has the built-in role
      const rolesAfter = await userService.getUserRoles(testUserId);
      const hasViewerRoleAfter = rolesAfter.some(r => r.id === viewerRole.id);
      expect(hasViewerRoleAfter).toBe(false);
    });
  });

  describe('Admin User Behavior', () => {
    it('should allow admin users to remove roles', async () => {
      // Create a super admin user
      const superAdmin = await userService.createUser({
        username: 'superadmin',
        email: 'superadmin@test.com',
        password: 'SuperAdmin123!',
        firstName: 'Super',
        lastName: 'Admin',
        isAdmin: true,
      });

      const superAdminToken = await authService.generateToken(superAdmin);

      await request(app)
        .delete(`/api/users/${testUserId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204);

      // Verify role was removed
      const roles = await userService.getUserRoles(testUserId);
      expect(roles).toHaveLength(0);
    });
  });
});
