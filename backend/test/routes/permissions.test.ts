import express, { Express } from 'express';
import request from 'supertest';
import { createPermissionsRouter } from '../../src/routes/permissions';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { RoleService } from '../../src/services/RoleService';

describe('Permissions Router', () => {
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

    // Create Express app with permissions router
    app = express();
    app.use(express.json());
    app.use('/api/permissions', createPermissionsRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with permissions:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create permissions:write and permissions:read permissions
    let permissionsWritePermission;
    let permissionsReadPermission;
    try {
      permissionsWritePermission = await permissionService.createPermission({
        resource: 'permissions',
        action: 'write',
        description: 'Write permissions',
      });
      permissionsReadPermission = await permissionService.createPermission({
        resource: 'permissions',
        action: 'read',
        description: 'Read permissions',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      permissionsWritePermission = allPermissions.items.find(
        p => p.resource === 'permissions' && p.action === 'write'  // pragma: allowlist secret
      );
      permissionsReadPermission = allPermissions.items.find(
        p => p.resource === 'permissions' && p.action === 'read'  // pragma: allowlist secret
      );
      if (!permissionsWritePermission || !permissionsReadPermission) {
        throw error;
      }
    }

    // Create role with permissions:write and permissions:read permissions
    const adminRole = await roleService.createRole({
      name: 'PermissionAdmin',
      description: 'Can manage permissions',
    });

    await roleService.assignPermissionToRole(adminRole.id, permissionsWritePermission.id);
    await roleService.assignPermissionToRole(adminRole.id, permissionsReadPermission.id);
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
    // Clean up test data
    const db = databaseService.getConnection();
    db.exec('DELETE FROM user_roles');
    db.exec('DELETE FROM role_permissions');
    db.exec('DELETE FROM users WHERE username IN ("admin_user", "regular_user")');
    db.exec('DELETE FROM roles WHERE name = "PermissionAdmin"');
    db.exec('DELETE FROM permissions WHERE resource NOT IN ("users", "groups", "roles", "permissions", "ansible", "bolt", "puppetdb")');
  });

  describe('POST /api/permissions', () => {
    it('should create a new permission with valid data', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'Test permission',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.resource).toBe('test_resource');
      expect(response.body.action).toBe('test_action');
      expect(response.body.description).toBe('Test permission');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'Test permission',
        });

      expect(response.status).toBe(401);
    });

    it('should return 403 when user lacks permissions:write permission', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'Test permission',
        });

      expect(response.status).toBe(403);
    });

    it('should return 400 when resource is invalid', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'Invalid-Resource',
          action: 'test_action',
          description: 'Test permission',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when action is invalid', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'Invalid-Action',
          description: 'Test permission',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when resource is too short', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'ab',
          action: 'test_action',
          description: 'Test permission',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when action is too short', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'ab',
          description: 'Test permission',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 409 when permission with same resource-action already exists', async () => {
      // Create first permission
      await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'Test permission',
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'Duplicate permission',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toHaveProperty('code', 'CONFLICT');
      expect(response.body.error.message).toContain('already exists');
    });

    it('should return 400 when description is too long', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
          action: 'test_action',
          description: 'a'.repeat(501),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'test_resource',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('GET /api/permissions', () => {
    beforeEach(async () => {
      // Create some test permissions
      await permissionService.createPermission({
        resource: 'test_resource_1',
        action: 'read',
        description: 'Test permission 1',
      });
      await permissionService.createPermission({
        resource: 'test_resource_2',
        action: 'write',
        description: 'Test permission 2',
      });
      await permissionService.createPermission({
        resource: 'test_resource_3',
        action: 'execute',
        description: 'Test permission 3',
      });
    });

    it('should return paginated list of permissions', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('permissions');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.permissions)).toBe(true);
      expect(response.body.permissions.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .get('/api/permissions');

      expect(response.status).toBe(401);
    });

    it('should return 403 when user lacks permissions:read permission', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${regularUserToken}`);

      expect(response.status).toBe(403);
    });

    it('should support pagination with different page sizes', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.permissions.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should default to page 1 and limit 20 when not specified', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
    });

    it('should return 400 when page is invalid', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when limit exceeds maximum', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 101 });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should include all permission fields in response', async () => {
      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.permissions.length).toBeGreaterThan(0);
      const permission = response.body.permissions[0];
      expect(permission).toHaveProperty('id');
      expect(permission).toHaveProperty('resource');
      expect(permission).toHaveProperty('action');
      expect(permission).toHaveProperty('description');
      expect(permission).toHaveProperty('createdAt');
    });
  });
});
