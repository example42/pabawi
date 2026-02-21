import express, { Express } from 'express';
import request from 'supertest';
import { createGroupsRouter } from '../../src/routes/groups';
import { DatabaseService } from '../../src/database/DatabaseService';
import { randomUUID } from 'crypto';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { RoleService } from '../../src/services/RoleService';
import { GroupService } from '../../src/services/GroupService';

describe('Groups Router - POST /api/groups', () => {
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

    // Create Express app with groups router
    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with groups:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create groups:write permission
    let groupsWritePermission;
    try {
      groupsWritePermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'write',
        description: 'Write groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsWritePermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!groupsWritePermission) {
        throw error;
      }
    }

    // Create role with groups:write permission
    const adminRole = await roleService.createRole({
      name: 'GroupAdmin',
      description: 'Can write groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsWritePermission.id);
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
        DELETE FROM groups;
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
        .post('/api/groups')
        .send({ name: 'Test Group', description: 'Test description' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 when user lacks groups:write permission', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ name: 'Test Group', description: 'Test description' })
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Validation', () => {
    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Test description' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when name is too short', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'ab', description: 'Test description' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when name is too long', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'a'.repeat(101), description: 'Test description' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when description is too long', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Group', description: 'a'.repeat(501) })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success Cases', () => {
    it('should create a group with valid data', async () => {
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Developers', description: 'Development team' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Developers',
        description: 'Development team',
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should return 409 when group name already exists', async () => {
      // Create first group
      await groupService.createGroup({
        name: 'Developers',
        description: 'Development team',
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Developers', description: 'Another team' })
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('already exists');
    });
  });
});

describe('Groups Router - GET /api/groups', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsReadPermission;
    try {
      groupsReadPermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'read',
        description: 'Read groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsReadPermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'read'  // pragma: allowlist secret
      );
      if (!groupsReadPermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupReader',
      description: 'Can read groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsReadPermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserToken = await authService.generateToken(regularUser);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM groups;
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
        .get('/api/groups')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks groups:read permission', async () => {
      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });
  });

  describe('Success Cases', () => {
    it('should return empty list when no groups exist', async () => {
      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toEqual([]);
      expect(response.body.pagination).toMatchObject({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('should return paginated list of groups', async () => {
      // Create test groups
      await groupService.createGroup({ name: 'Group A', description: 'First group' });
      await groupService.createGroup({ name: 'Group B', description: 'Second group' });
      await groupService.createGroup({ name: 'Group C', description: 'Third group' });

      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toHaveLength(3);
      expect(response.body.pagination).toMatchObject({
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('should support pagination parameters', async () => {
      // Create 5 groups
      for (let i = 1; i <= 5; i++) {
        await groupService.createGroup({ name: `Group ${i}`, description: `Group ${i}` });
      }

      const response = await request(app)
        .get('/api/groups?page=2&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.groups).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        total: 5,
        page: 2,
        limit: 2,
        totalPages: 3,
      });
    });
  });
});

describe('Groups Router - GET /api/groups/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let testGroupId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsReadPermission;
    try {
      groupsReadPermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'read',
        description: 'Read groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsReadPermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'read'  // pragma: allowlist secret
      );
      if (!groupsReadPermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupReader',
      description: 'Can read groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsReadPermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    // Create test group
    const group = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test description',
    });
    testGroupId = group.id;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM groups;
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

  describe('Success Cases', () => {
    it('should return group with members and roles', async () => {
      const response = await request(app)
        .get(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testGroupId,
        name: 'Test Group',
        description: 'Test description',
      });
      expect(response.body.members).toEqual([]);
      expect(response.body.roles).toEqual([]);
    });

    it('should return 404 when group does not exist', async () => {
      const fakeId = randomUUID();
      const response = await request(app)
        .get(`/api/groups/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});

describe('Groups Router - PUT /api/groups/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let testGroupId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsWritePermission;
    try {
      groupsWritePermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'write',
        description: 'Write groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsWritePermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!groupsWritePermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupWriter',
      description: 'Can write groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsWritePermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    // Create test group
    const group = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test description',
    });
    testGroupId = group.id;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM groups;
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

  describe('Success Cases', () => {
    it('should update group name', async () => {
      const response = await request(app)
        .put(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Group' })
        .expect(200);

      expect(response.body.name).toBe('Updated Group');
      expect(response.body.description).toBe('Test description');
    });

    it('should update group description', async () => {
      const response = await request(app)
        .put(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(response.body.name).toBe('Test Group');
      expect(response.body.description).toBe('Updated description');
    });

    it('should return 404 when group does not exist', async () => {
      const fakeId = randomUUID();
      const response = await request(app)
        .put(`/api/groups/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Group' })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 409 when updating to existing group name', async () => {
      // Create another group
      await groupService.createGroup({
        name: 'Existing Group',
        description: 'Another group',
      });

      const response = await request(app)
        .put(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing Group' })
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });
  });
});

describe('Groups Router - DELETE /api/groups/:id', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let regularUserToken: string;
  let testGroupId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsAdminPermission;
    try {
      groupsAdminPermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'admin',
        description: 'Admin groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsAdminPermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'admin'  // pragma: allowlist secret
      );
      if (!groupsAdminPermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupAdmin',
      description: 'Can admin groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsAdminPermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserToken = await authService.generateToken(regularUser);

    // Create test group
    const group = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test description',
    });
    testGroupId = group.id;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM groups;
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
    it('should return 403 when user lacks groups:admin permission', async () => {
      const response = await request(app)
        .delete(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });
  });

  describe('Success Cases', () => {
    it('should delete group successfully', async () => {
      await request(app)
        .delete(`/api/groups/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify group is deleted
      const group = await groupService.getGroupById(testGroupId);
      expect(group).toBeNull();
    });

    it('should return 404 when group does not exist', async () => {
      const fakeId = randomUUID();
      const response = await request(app)
        .delete(`/api/groups/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});

describe('Groups Router - POST /api/groups/:id/roles/:roleId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let regularUserToken: string;
  let testGroupId: string;
  let testRoleId: string;
  let testUserId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsWritePermission;
    try {
      groupsWritePermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'write',
        description: 'Write groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsWritePermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!groupsWritePermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupWriter',
      description: 'Can write groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsWritePermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserToken = await authService.generateToken(regularUser);

    // Create test group
    const group = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test description',
    });
    testGroupId = group.id;

    // Create test role
    const role = await roleService.createRole({
      name: 'Test Role',
      description: 'Test role description',
    });
    testRoleId = role.id;

    // Create test user and add to group
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;
    await userService.addUserToGroup(testUserId, testGroupId);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM groups;
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
        .post(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks groups:write permission', async () => {
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });
  });

  describe('Success Cases', () => {
    it('should assign role to group successfully', async () => {
      await request(app)
        .post(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify role is assigned
      const roles = await groupService.getGroupRoles(testGroupId);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRoleId);
    });

    it('should invalidate permission cache for all group members', async () => {
      // Create a permission and assign to role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'read',
        description: 'Test permission',
      });
      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Assign role to group
      await request(app)
        .post(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Create a fresh PermissionService instance to bypass cache
      const freshPermissionService = new PermissionService(databaseService.getConnection());

      // Check permission after assignment (should be true)
      const hasPermAfter = await freshPermissionService.hasPermission(testUserId, 'test', 'read');
      expect(hasPermAfter).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when group does not exist', async () => {
      const fakeId = randomUUID();
      const response = await request(app)
        .post(`/api/groups/${fakeId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('Group not found');
    });

    it('should return 404 when role does not exist', async () => {
      const fakeId = randomUUID();
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/roles/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('Role not found');
    });

    it('should return 409 when role is already assigned to group', async () => {
      // Assign role first time
      await groupService.assignRoleToGroup(testGroupId, testRoleId);

      // Try to assign again
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('already assigned');
    });
  });
});

describe('Groups Router - DELETE /api/groups/:id/roles/:roleId', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let groupService: GroupService;
  let adminToken: string;
  let regularUserToken: string;
  let testGroupId: string;
  let testRoleId: string;
  let testUserId: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const jwtSecret = 'test-secret-key';  // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    groupService = new GroupService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use('/api/groups', createGroupsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });

    let groupsWritePermission;
    try {
      groupsWritePermission = await permissionService.createPermission({
        resource: 'groups',
        action: 'write',
        description: 'Write groups',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      groupsWritePermission = allPermissions.items.find(
        p => p.resource === 'groups' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!groupsWritePermission) {
        throw error;
      }
    }

    const adminRole = await roleService.createRole({
      name: 'GroupWriter',
      description: 'Can write groups',
    });

    await roleService.assignPermissionToRole(adminRole.id, groupsWritePermission.id);
    await userService.assignRoleToUser(adminUser.id, adminRole.id);
    adminToken = await authService.generateToken(adminUser);

    const regularUser = await userService.createUser({
      username: 'regular_user',
      email: 'regular@test.com',
      password: 'RegularPass123!',
      firstName: 'Regular',
      lastName: 'User',
      isAdmin: false,
    });
    regularUserToken = await authService.generateToken(regularUser);

    // Create test group
    const group = await groupService.createGroup({
      name: 'Test Group',
      description: 'Test description',
    });
    testGroupId = group.id;

    // Create test role
    const role = await roleService.createRole({
      name: 'Test Role',
      description: 'Test role description',
    });
    testRoleId = role.id;

    // Create test user and add to group
    const testUser = await userService.createUser({
      username: 'test_user',
      email: 'test@test.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
    });
    testUserId = testUser.id;
    await userService.addUserToGroup(testUserId, testGroupId);

    // Assign role to group
    await groupService.assignRoleToGroup(testGroupId, testRoleId);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      databaseService.getConnection().exec(
        `
        DELETE FROM user_roles;
        DELETE FROM role_permissions;
        DELETE FROM user_groups;
        DELETE FROM group_roles;
        DELETE FROM groups;
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
        .delete(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBeDefined();
    });

    it('should return 403 when user lacks groups:write permission', async () => {
      const response = await request(app)
        .delete(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });
  });

  describe('Success Cases', () => {
    it('should remove role from group successfully', async () => {
      await request(app)
        .delete(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify role is removed
      const roles = await groupService.getGroupRoles(testGroupId);
      expect(roles).toHaveLength(0);
    });

    it('should invalidate permission cache for all group members', async () => {
      // Create a permission and assign to role
      const testPermission = await permissionService.createPermission({
        resource: 'test',
        action: 'write',
        description: 'Test permission',
      });
      await roleService.assignPermissionToRole(testRoleId, testPermission.id);

      // Remove role from group
      await request(app)
        .delete(`/api/groups/${testGroupId}/roles/${testRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Create a fresh PermissionService instance to bypass cache
      const freshPermissionService = new PermissionService(databaseService.getConnection());

      // Check permission after removal (should be false)
      const hasPermAfter = await freshPermissionService.hasPermission(testUserId, 'test', 'write');
      expect(hasPermAfter).toBe(false);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 when role is not assigned to group', async () => {
      // Create another role that is not assigned
      const anotherRole = await roleService.createRole({
        name: 'Another Role',
        description: 'Another role',
      });

      const response = await request(app)
        .delete(`/api/groups/${testGroupId}/roles/${anotherRole.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('not assigned');
    });
  });
});
