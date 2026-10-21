import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { provisionMcpServiceUser } from '../../../src/mcp/McpServiceUser';
import { UserService } from '../../../src/services/UserService';
import { RoleService } from '../../../src/services/RoleService';
import { PermissionService } from '../../../src/services/PermissionService';
import type { LoggerService } from '../../../src/services/LoggerService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import { initializeTestSchema } from '../../helpers/schema';

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LoggerService;
}

function createMockUserService(overrides: Partial<UserService> = {}): UserService {
  return {
    getUserByUsername: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: 'user-1', username: 'mcp-service' }),
    getUserRoles: vi.fn().mockResolvedValue([]),
    assignRoleToUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UserService;
}

function createMockRoleService(overrides: Partial<RoleService> = {}): RoleService {
  return {
    createRole: vi.fn().mockResolvedValue({ id: 'role-1', name: 'MCP Service' }),
    getRoleByName: vi.fn().mockResolvedValue(null),
    assignPermissionToRole: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RoleService;
}

function createMockPermissionService(overrides: Partial<PermissionService> = {}): PermissionService {
  return {
    listPermissions: vi.fn().mockResolvedValue({
      items: [
        { id: 'perm-read-1', resource: 'ansible', action: 'read', description: '', createdAt: '' },
        { id: 'perm-read-2', resource: 'puppetdb', action: 'read', description: '', createdAt: '' },
      ],
      total: 2,
      limit: 1000,
      offset: 0,
    }),
    ...overrides,
  } as unknown as PermissionService;
}

describe('provisionMcpServiceUser', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('first run: user does not exist', () => {
    it('should create user, role, assign permissions, and assign role', async () => {
      const userService = createMockUserService();
      const roleService = createMockRoleService();
      const permissionService = createMockPermissionService();

      const result = await provisionMcpServiceUser(
        userService, roleService, permissionService, logger,
      );

      expect(result).toEqual({ userId: 'user-1', roleId: 'role-1' });

      // User created with correct params
      expect(userService.createUser).toHaveBeenCalledOnce();
      const createUserCall = vi.mocked(userService.createUser).mock.calls[0][0];
      expect(createUserCall.username).toBe('mcp-service');
      expect(createUserCall.isActive).toBe(true);
      expect(createUserCall.isAdmin).toBe(false);
      expect(createUserCall.password).toBeDefined();
      expect(createUserCall.password.length).toBeGreaterThan(0);

      // Role created with isBuiltIn
      expect(roleService.createRole).toHaveBeenCalledWith({
        name: 'MCP Service',
        description: 'Built-in role for MCP server with read-only access',
        isBuiltIn: true,
      });

      // Read permissions queried
      expect(permissionService.listPermissions).toHaveBeenCalledWith({
        action: 'read',
        limit: 1000,
      });

      // Each read permission assigned to role
      expect(roleService.assignPermissionToRole).toHaveBeenCalledTimes(2);
      expect(roleService.assignPermissionToRole).toHaveBeenCalledWith('role-1', 'perm-read-1');
      expect(roleService.assignPermissionToRole).toHaveBeenCalledWith('role-1', 'perm-read-2');

      // Role assigned to user
      expect(userService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-1');
    });
  });

  describe('idempotency: user already exists', () => {
    it('should reuse existing user and role without modification', async () => {
      const userService = createMockUserService({
        getUserByUsername: vi.fn().mockResolvedValue({ id: 'existing-user', username: 'mcp-service' }),
        getUserRoles: vi.fn().mockResolvedValue([
          { id: 'existing-role', name: 'MCP Service', isBuiltIn: 1 },
        ]),
      });
      const roleService = createMockRoleService();
      const permissionService = createMockPermissionService();

      const result = await provisionMcpServiceUser(
        userService, roleService, permissionService, logger,
      );

      expect(result).toEqual({ userId: 'existing-user', roleId: 'existing-role' });

      // No creation calls made
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(roleService.createRole).not.toHaveBeenCalled();
      expect(permissionService.listPermissions).not.toHaveBeenCalled();
      expect(roleService.assignPermissionToRole).not.toHaveBeenCalled();
      expect(userService.assignRoleToUser).not.toHaveBeenCalled();
    });

    it('should repair an existing user when MCP Service role is missing', async () => {
      const userService = createMockUserService({
        getUserByUsername: vi.fn().mockResolvedValue({ id: 'existing-user', username: 'mcp-service' }),
        getUserRoles: vi.fn().mockResolvedValue([
          { id: 'other-role', name: 'Viewer', isBuiltIn: 1 },
        ]),
      });
      const roleService = createMockRoleService();
      const permissionService = createMockPermissionService();

      await expect(
        provisionMcpServiceUser(userService, roleService, permissionService, logger),
      ).resolves.toEqual({ userId: 'existing-user', roleId: 'role-1' });
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(roleService.createRole).toHaveBeenCalledOnce();
      expect(roleService.assignPermissionToRole).toHaveBeenCalledTimes(2);
      expect(userService.assignRoleToUser).toHaveBeenCalledWith('existing-user', 'role-1');
    });

    it('should restore a missing assignment without changing existing role permissions', async () => {
      const userService = createMockUserService({
        getUserByUsername: vi.fn().mockResolvedValue({ id: 'existing-user', username: 'mcp-service' }),
      });
      const roleService = createMockRoleService({
        getRoleByName: vi.fn().mockResolvedValue({ id: 'existing-role', name: 'MCP Service' }),
      });
      const permissionService = createMockPermissionService();

      await expect(
        provisionMcpServiceUser(userService, roleService, permissionService, logger),
      ).resolves.toEqual({ userId: 'existing-user', roleId: 'existing-role' });
      expect(userService.createUser).not.toHaveBeenCalled();
      expect(roleService.createRole).not.toHaveBeenCalled();
      expect(permissionService.listPermissions).not.toHaveBeenCalled();
      expect(roleService.assignPermissionToRole).not.toHaveBeenCalled();
      expect(userService.assignRoleToUser).toHaveBeenCalledWith('existing-user', 'existing-role');
    });

    it('should reuse an existing role when creating a missing user', async () => {
      const userService = createMockUserService();
      const roleService = createMockRoleService({
        getRoleByName: vi.fn().mockResolvedValue({ id: 'existing-role', name: 'MCP Service' }),
      });
      const permissionService = createMockPermissionService();

      await expect(
        provisionMcpServiceUser(userService, roleService, permissionService, logger),
      ).resolves.toEqual({ userId: 'user-1', roleId: 'existing-role' });
      expect(userService.createUser).toHaveBeenCalledOnce();
      expect(roleService.createRole).not.toHaveBeenCalled();
      expect(permissionService.listPermissions).not.toHaveBeenCalled();
      expect(userService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'existing-role');
    });
  });
});

describe('provisionMcpServiceUser with persisted RBAC state', () => {
  let db: SQLiteAdapter;
  let userService: UserService;
  let roleService: RoleService;
  let permissionService: PermissionService;
  let logger: LoggerService;

  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeTestSchema(db);
    const authService = new AuthenticationService(db, 'test-mcp-secret'); // pragma: allowlist secret
    userService = new UserService(db, authService);
    roleService = new RoleService(db);
    permissionService = new PermissionService(db);
    logger = createMockLogger();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  it('should recover on restart after role creation fails with the user already persisted', async () => {
    vi.spyOn(roleService, 'createRole').mockRejectedValueOnce(new Error('Interrupted role creation'));

    await expect(
      provisionMcpServiceUser(userService, roleService, permissionService, logger),
    ).rejects.toThrow('Interrupted role creation');
    const user = await userService.getUserByUsername('mcp-service');
    expect(user).not.toBeNull();

    const result = await provisionMcpServiceUser(userService, roleService, permissionService, logger);

    expect(result.userId).toBe(user?.id);
    expect(await userService.getUserRoles(result.userId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: result.roleId, name: 'MCP Service' })]),
    );
    const permissions = await roleService.getRolePermissions(result.roleId);
    const readPermissions = await permissionService.listPermissions({ action: 'read', limit: 1000 });
    expect(permissions.map((permission) => permission.id).sort()).toEqual(
      readPermissions.items.map((permission) => permission.id).sort(),
    );
    await expect(
      provisionMcpServiceUser(userService, roleService, permissionService, logger),
    ).resolves.toEqual(result);
  });

  it('should recover on restart after role assignment fails', async () => {
    vi.spyOn(userService, 'assignRoleToUser').mockRejectedValueOnce(new Error('Interrupted role assignment'));

    await expect(
      provisionMcpServiceUser(userService, roleService, permissionService, logger),
    ).rejects.toThrow('Interrupted role assignment');
    const role = await roleService.getRoleByName('MCP Service');
    expect(role).not.toBeNull();

    const result = await provisionMcpServiceUser(userService, roleService, permissionService, logger);

    expect(result.roleId).toBe(role?.id);
    expect(await userService.getUserRoles(result.userId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: result.roleId })]),
    );
    await expect(
      provisionMcpServiceUser(userService, roleService, permissionService, logger),
    ).resolves.toEqual(result);
  });

  it('should preserve customized permissions when reusing an unassigned role', async () => {
    const role = await roleService.createRole({
      name: 'MCP Service', description: 'Restricted machine access', isBuiltIn: true,
    });
    const readPermissions = await permissionService.listPermissions({ action: 'read', limit: 1000 });
    await roleService.assignPermissionToRole(role.id, readPermissions.items[0].id);
    const permissions = await roleService.getRolePermissions(role.id);

    const result = await provisionMcpServiceUser(userService, roleService, permissionService, logger);

    expect(result.roleId).toBe(role.id);
    expect(await roleService.getRolePermissions(role.id)).toEqual(permissions);
    expect(await userService.getUserRoles(result.userId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: role.id })]),
    );
  });
});
