import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provisionLifecycleServiceUser } from '../../src/services/LifecycleServiceUser';
import type { UserService } from '../../src/services/UserService';
import type { RoleService } from '../../src/services/RoleService';
import type { PermissionService } from '../../src/services/PermissionService';
import type { LoggerService } from '../../src/services/LoggerService';

function createMockLogger(): LoggerService {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerService;
}

function createMockUserService(overrides: Partial<UserService> = {}): UserService {
  return {
    getUserByUsername: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: 'user-1', username: 'lifecycle-service' }),
    getUserRoles: vi.fn().mockResolvedValue([]),
    assignRoleToUser: vi.fn().mockResolvedValue(undefined),
    removeRoleFromUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UserService;
}

function createMockRoleService(overrides: Partial<RoleService> = {}): RoleService {
  return {
    createRole: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Lifecycle Service' }),
    assignPermissionToRole: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RoleService;
}

/** One permission per action, for every resource asked about. */
function createMockPermissionService(): PermissionService {
  return {
    listPermissions: vi.fn().mockImplementation(({ resource }: { resource: string }) => ({
      items: ['read', 'lifecycle', 'provision', 'destroy', 'execute'].map((action) => ({
        id: `${resource}-${action}`, resource, action, description: '', createdAt: '',
      })),
      total: 5, limit: 100, offset: 0,
    })),
  } as unknown as PermissionService;
}

describe('provisionLifecycleServiceUser', () => {
  let logger: LoggerService;

  beforeEach(() => { logger = createMockLogger(); });

  it('creates the account with an explicit, bounded scope', async () => {
    const userService = createMockUserService();
    const roleService = createMockRoleService();

    const result = await provisionLifecycleServiceUser(
      userService, roleService, createMockPermissionService(), logger,
    );

    expect(result).toEqual({ userId: 'user-1', roleId: 'role-1' });

    const createUserCall = vi.mocked(userService.createUser).mock.calls[0][0];
    expect(createUserCall.username).toBe('lifecycle-service');
    expect(createUserCall.isAdmin).toBe(false);
    expect(createUserCall.isActive).toBe(true);
    expect(createUserCall.password.length).toBeGreaterThan(0);

    expect(roleService.createRole).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Lifecycle Service', isBuiltIn: true,
    }));

    const granted = vi.mocked(roleService.assignPermissionToRole).mock.calls.map((call) => call[1]);
    expect(new Set(granted)).toEqual(new Set([
      'proxmox-read', 'proxmox-lifecycle', 'proxmox-destroy',
      'aws-read', 'aws-lifecycle', 'aws-destroy',
      'azure-read', 'azure-lifecycle', 'azure-destroy',
    ]));
    expect(userService.assignRoleToUser).toHaveBeenCalledWith('user-1', 'role-1');
  });

  it('drops the default role the account is created with', async () => {
    // createUser() attaches the configured default role (Viewer out of the
    // box), which would widen the credential past its documented scope.
    const userService = createMockUserService({
      getUserRoles: vi.fn().mockResolvedValue([{ id: 'role-viewer-001', name: 'Viewer' }]),
    });

    await provisionLifecycleServiceUser(
      userService, createMockRoleService(), createMockPermissionService(), logger,
    );

    expect(userService.removeRoleFromUser).toHaveBeenCalledWith('user-1', 'role-viewer-001');
  });

  it('reuses an existing account without re-granting, so operator changes survive', async () => {
    const userService = createMockUserService({
      getUserByUsername: vi.fn().mockResolvedValue({ id: 'existing-user' }),
      getUserRoles: vi.fn().mockResolvedValue([{ id: 'existing-role', name: 'Lifecycle Service' }]),
    });
    const roleService = createMockRoleService();

    const result = await provisionLifecycleServiceUser(
      userService, roleService, createMockPermissionService(), logger,
    );

    expect(result).toEqual({ userId: 'existing-user', roleId: 'existing-role' });
    expect(userService.createUser).not.toHaveBeenCalled();
    expect(roleService.createRole).not.toHaveBeenCalled();
    expect(roleService.assignPermissionToRole).not.toHaveBeenCalled();
  });

  it('fails loudly when the account exists without its role', async () => {
    const userService = createMockUserService({
      getUserByUsername: vi.fn().mockResolvedValue({ id: 'existing-user' }),
      getUserRoles: vi.fn().mockResolvedValue([]),
    });

    await expect(provisionLifecycleServiceUser(
      userService, createMockRoleService(), createMockPermissionService(), logger,
    )).rejects.toThrow('Lifecycle Service role not found');
  });
});
