import express, { Express } from 'express';
import request from 'supertest';
import { createRolesRouter } from '../../src/routes/roles';
import { DatabaseService } from '../../src/database/DatabaseService';
import { randomUUID } from 'crypto';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { RoleService } from '../../src/services/RoleService';

describe('Roles Router - Role-Permission Association Routes', () => {
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
  let testRoleId: string;
  let testPermissionId: string;

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

    // Create Express app with roles router
    app = express();
    app.use(express.json());
    app.use('/api/roles', createRolesRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with roles:write permission
    const adminUser = await userService.createUser({
      username: 'admin_user',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Create roles:write permission
    let rolesWritePermission;
    try {
      rolesWritePermission = await permissionService.createPermission({
        resource: 'roles',
        action: 'write',
        description: 'Write roles',
      });
    } catch (error) {
      const allPermissions = await permissionService.listPermissions();
      rolesWritePermission = allPermissions.items.find(
        p => p.resource === 'roles' && p.action === 'write'  // pragma: allowlist secret
      );
      if (!rolesWritePermission) {
        throw error;
      }
    }

    // Create role with roles:write permission
    const adminRole = await roleService.createRole({
      name: 'RoleAdmin',
      description: 'Can write roles',
    });

    await roleService.assignPermissionToRole(adminRole.id, rolesWritePermission.id);
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

    // Create test role
    const testRole = await roleService.createRole({
      name: 'Test Role',
      description: 'Test role for permission assignment',
    });
    testRoleId = testRole.id;

    // Create test permission
    const testPermission = await permissionService.createPermission({
      resource: 'test',
      action: 'read',
      description: 'Test permission',
    });
    testPermissionId = testPermission.id;
  });

  afterEach(async () => {
    // Clean up database after each test
    const db = databaseService.getConnection();
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM user_roles', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM role_permissions', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM roles WHERE isBuiltIn = 0', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM permissions WHERE resource NOT IN (\'ansible\', \'bolt\', \'puppetdb\', \'users\', \'groups\', \'roles\')', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM users', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('POST /api/roles/:id/permissions/:permissionId', () => {
    describe('Authentication and Authorization', () => {
      it('should return 401 when no token is provided', async () => {
        const response = await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .expect(401);

        expect(response.body.error).toBeDefined();
      });

      it('should return 403 when user lacks roles:write permission', async () => {
        const response = await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${regularUserToken}`)
          .expect(403);

        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(response.body.error.message).toBeDefined();
      });
    });

    describe('Success Cases', () => {
      it('should assign permission to role successfully', async () => {
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Verify permission is assigned
        const permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(1);
        expect(permissions[0].id).toBe(testPermissionId);
      });

      it('should allow assigning multiple permissions to a role', async () => {
        // Create second permission
        const secondPermission = await permissionService.createPermission({
          resource: 'test',
          action: 'write',
          description: 'Test write permission',
        });

        // Assign first permission
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Assign second permission
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${secondPermission.id}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Verify both permissions are assigned
        const permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(2);
        const permissionIds = permissions.map(p => p.id);
        expect(permissionIds).toContain(testPermissionId);
        expect(permissionIds).toContain(secondPermission.id);
      });
    });

    describe('Error Cases', () => {
      it('should return 404 when role does not exist', async () => {
        const fakeId = randomUUID();
        const response = await request(app)
          .post(`/api/roles/${fakeId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toBe('Role not found');
      });

      it('should return 404 when permission does not exist', async () => {
        const fakeId = randomUUID();
        const response = await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${fakeId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toBe('Permission not found');
      });

      it('should handle duplicate permission assignment gracefully (idempotent)', async () => {
        // Assign permission first time
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Try to assign again - should succeed (idempotent)
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Verify only one assignment exists
        const permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(1);
      });
    });

    describe('Permission Inheritance', () => {
      it('should grant permission to users with the role', async () => {
        // Assign permission to role
        await request(app)
          .post(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Assign role to regular user
        await userService.assignRoleToUser(regularUserId, testRoleId);

        // Verify user has the permission
        const hasPermission = await permissionService.hasPermission(
          regularUserId,
          'test',
          'read'
        );
        expect(hasPermission).toBe(true);
      });
    });
  });

  describe('DELETE /api/roles/:id/permissions/:permissionId', () => {
    beforeEach(async () => {
      // Assign permission to role before each test
      await roleService.assignPermissionToRole(testRoleId, testPermissionId);
    });

    describe('Authentication and Authorization', () => {
      it('should return 401 when no token is provided', async () => {
        const response = await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .expect(401);

        expect(response.body.error).toBeDefined();
      });

      it('should return 403 when user lacks roles:write permission', async () => {
        const response = await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${regularUserToken}`)
          .expect(403);

        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(response.body.error.message).toBeDefined();
      });
    });

    describe('Success Cases', () => {
      it('should remove permission from role successfully', async () => {
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Verify permission is removed
        const permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(0);
      });

      it('should revoke permission from users with the role', async () => {
        // Assign role to regular user
        await userService.assignRoleToUser(regularUserId, testRoleId);

        // Verify user has the permission initially
        let hasPermission = await permissionService.hasPermission(
          regularUserId,
          'test',
          'read'
        );
        expect(hasPermission).toBe(true);

        // Remove permission from role
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Clear the cache to force a fresh check
        permissionService.invalidateUserPermissionCache(regularUserId);

        // Verify user no longer has the permission
        hasPermission = await permissionService.hasPermission(
          regularUserId,
          'test',
          'read'
        );
        expect(hasPermission).toBe(false);
      });

      it('should handle removing one permission while keeping others', async () => {
        // Create and assign second permission
        const secondPermission = await permissionService.createPermission({
          resource: 'test',
          action: 'write',
          description: 'Test write permission',
        });
        await roleService.assignPermissionToRole(testRoleId, secondPermission.id);

        // Verify both permissions are assigned
        let permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(2);

        // Remove first permission
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Verify only second permission remains
        permissions = await roleService.getRolePermissions(testRoleId);
        expect(permissions).toHaveLength(1);
        expect(permissions[0].id).toBe(secondPermission.id);
      });
    });

    describe('Error Cases', () => {
      it('should handle removing non-existent permission gracefully (idempotent)', async () => {
        const fakeId = randomUUID();

        // Should succeed even if permission doesn't exist (idempotent)
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${fakeId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);
      });

      it('should handle removing already removed permission gracefully (idempotent)', async () => {
        // Remove permission first time
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);

        // Try to remove again - should succeed (idempotent)
        await request(app)
          .delete(`/api/roles/${testRoleId}/permissions/${testPermissionId}`)
          .send()
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);
      });
    });
  });
});
