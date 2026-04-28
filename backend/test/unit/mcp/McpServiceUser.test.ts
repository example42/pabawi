import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provisionMcpServiceUser } from '../../../src/mcp/McpServiceUser';
import type { UserService } from '../../../src/services/UserService';
import type { RoleService } from '../../../src/services/RoleService';
import type { PermissionService } from '../../../src/services/PermissionService';
import type { LoggerService } from '../../../src/services/LoggerService';

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

  describe('first run — user does not exist', () => {
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

  describe('idempotency — user already exists', () => {
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

    it('should throw if user exists but MCP Service role is missing', async () => {
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
      ).rejects.toThrow('MCP service user exists but MCP Service role not found');
    });
  });
});
