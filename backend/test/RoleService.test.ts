import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/database/SQLiteAdapter';
import { RoleService, CreateRoleDTO, UpdateRoleDTO } from '../src/services/RoleService';
import { initializeTestSchema } from './helpers/schema';

describe('RoleService', () => {
  let db: SQLiteAdapter;
  let roleService: RoleService;

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Apply real migrations — see .kiro/steering/database-conventions.md
    await initializeTestSchema(db);

    roleService = new RoleService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('createRole', () => {
    it('should create a new role with valid data', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Development team role'
      };

      const role = await roleService.createRole(data);

      expect(role).toBeDefined();
      expect(role.id).toBeDefined();
      expect(role.name).toBe('Developer');
      expect(role.description).toBe('Development team role');
      expect(role.isBuiltIn).toBe(0);
      expect(role.createdAt).toBeDefined();
      expect(role.updatedAt).toBeDefined();
    });

    it('should create a role with empty description', async () => {
      const data: CreateRoleDTO = {
        name: 'TestRole',
        description: ''
      };

      const role = await roleService.createRole(data);

      expect(role).toBeDefined();
      expect(role.description).toBe('');
    });

    it('should throw error if role name already exists', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'First role'
      };

      await roleService.createRole(data);

      await expect(roleService.createRole(data)).rejects.toThrow('Role name already exists');
    });

    it('should throw error if role name is too short', async () => {
      const data: CreateRoleDTO = {
        name: 'AB',
        description: 'Too short'
      };

      await expect(roleService.createRole(data)).rejects.toThrow(
        'Role name must be between 3 and 100 characters'
      );
    });

    it('should throw error if role name is too long', async () => {
      const data: CreateRoleDTO = {
        name: 'A'.repeat(101),
        description: 'Too long'
      };

      await expect(roleService.createRole(data)).rejects.toThrow(
        'Role name must be between 3 and 100 characters'
      );
    });

    it('should throw error if description is too long', async () => {
      const data: CreateRoleDTO = {
        name: 'ValidName',
        description: 'A'.repeat(501)
      };

      await expect(roleService.createRole(data)).rejects.toThrow(
        'Role description must not exceed 500 characters'
      );
    });

    it('should accept role name with exactly 3 characters', async () => {
      const data: CreateRoleDTO = {
        name: 'Dev',
        description: 'Minimum length'
      };

      const role = await roleService.createRole(data);
      expect(role.name).toBe('Dev');
    });

    it('should accept role name with exactly 100 characters', async () => {
      const data: CreateRoleDTO = {
        name: 'A'.repeat(100),
        description: 'Maximum length'
      };

      const role = await roleService.createRole(data);
      expect(role.name).toBe('A'.repeat(100));
    });

    it('should accept description with exactly 500 characters', async () => {
      const data: CreateRoleDTO = {
        name: 'TestRole',
        description: 'A'.repeat(500)
      };

      const role = await roleService.createRole(data);
      expect(role.description).toBe('A'.repeat(500));
    });
  });

  describe('getRoleById', () => {
    it('should return role by ID', async () => {
      const role = await roleService.getRoleById('role-viewer-001');

      expect(role).toBeDefined();
      expect(role?.name).toBe('Viewer');
      expect(role?.isBuiltIn).toBe(1);
    });

    it('should return null for non-existent role', async () => {
      const role = await roleService.getRoleById('non-existent-id');

      expect(role).toBeNull();
    });
  });

  describe('updateRole', () => {
    it('should update role name', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        name: 'Senior Developer'
      };

      const updatedRole = await roleService.updateRole(role.id, updateData);

      expect(updatedRole.name).toBe('Senior Developer');
      expect(updatedRole.description).toBe('Dev role');
    });

    it('should update role description', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        description: 'Updated description'
      };

      const updatedRole = await roleService.updateRole(role.id, updateData);

      expect(updatedRole.name).toBe('Developer');
      expect(updatedRole.description).toBe('Updated description');
    });

    it('should update both name and description', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        name: 'Senior Developer',
        description: 'Senior dev role'
      };

      const updatedRole = await roleService.updateRole(role.id, updateData);

      expect(updatedRole.name).toBe('Senior Developer');
      expect(updatedRole.description).toBe('Senior dev role');
    });

    it('should allow updating description of built-in role', async () => {
      const updateData: UpdateRoleDTO = {
        description: 'Updated viewer description'
      };

      const updatedRole = await roleService.updateRole('role-viewer-001', updateData);

      expect(updatedRole.name).toBe('Viewer');
      expect(updatedRole.description).toBe('Updated viewer description');
    });

    it('should throw error when updating name of built-in role', async () => {
      const updateData: UpdateRoleDTO = {
        name: 'CustomViewer'
      };

      await expect(roleService.updateRole('role-viewer-001', updateData)).rejects.toThrow(
        'Cannot modify name of built-in role'
      );
    });

    it('should throw error if role not found', async () => {
      const updateData: UpdateRoleDTO = {
        name: 'NewName'
      };

      await expect(roleService.updateRole('non-existent-id', updateData)).rejects.toThrow(
        'Role not found'
      );
    });

    it('should throw error if new name already exists', async () => {
      const data1: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const data2: CreateRoleDTO = {
        name: 'Tester',
        description: 'Test role'
      };

      const role1 = await roleService.createRole(data1);
      await roleService.createRole(data2);

      const updateData: UpdateRoleDTO = {
        name: 'Tester'
      };

      await expect(roleService.updateRole(role1.id, updateData)).rejects.toThrow(
        'Role name already exists'
      );
    });

    it('should throw error if updated name is too short', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        name: 'AB'
      };

      await expect(roleService.updateRole(role.id, updateData)).rejects.toThrow(
        'Role name must be between 3 and 100 characters'
      );
    });

    it('should throw error if updated name is too long', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        name: 'A'.repeat(101)
      };

      await expect(roleService.updateRole(role.id, updateData)).rejects.toThrow(
        'Role name must be between 3 and 100 characters'
      );
    });

    it('should throw error if updated description is too long', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        description: 'A'.repeat(501)
      };

      await expect(roleService.updateRole(role.id, updateData)).rejects.toThrow(
        'Role description must not exceed 500 characters'
      );
    });

    it('should allow updating to same name', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      const updateData: UpdateRoleDTO = {
        name: 'Developer',
        description: 'Updated description'
      };

      const updatedRole = await roleService.updateRole(role.id, updateData);

      expect(updatedRole.name).toBe('Developer');
      expect(updatedRole.description).toBe('Updated description');
    });
  });

  describe('deleteRole', () => {
    it('should delete custom role', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      await roleService.deleteRole(role.id);

      const deletedRole = await roleService.getRoleById(role.id);
      expect(deletedRole).toBeNull();
    });

    it('should throw error when deleting built-in role', async () => {
      await expect(roleService.deleteRole('role-viewer-001')).rejects.toThrow(
        'Cannot delete built-in role'
      );
    });

    it('should throw error if role not found', async () => {
      await expect(roleService.deleteRole('non-existent-id')).rejects.toThrow('Role not found');
    });

    it('should cascade delete role-permission associations', async () => {
      const data: CreateRoleDTO = {
        name: 'Developer',
        description: 'Dev role'
      };

      const role = await roleService.createRole(data);

      // Assign permission to role
      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');

      // Verify assignment exists
      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(1);

      // Delete role
      await roleService.deleteRole(role.id);

      // Verify role is deleted
      const deletedRole = await roleService.getRoleById(role.id);
      expect(deletedRole).toBeNull();
    });
  });

  describe('listRoles', () => {
    it('should list all roles with default pagination', async () => {
      const result = await roleService.listRoles();

      // Migrations seed 4 built-in roles: Administrator, Operator, Provisioner, Viewer
      expect(result.items).toHaveLength(4);
      expect(result.total).toBe(4);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should list roles with custom pagination', async () => {
      // Create additional roles
      await roleService.createRole({ name: 'Developer', description: 'Dev role' });
      await roleService.createRole({ name: 'Tester', description: 'Test role' });

      const result = await roleService.listRoles({ limit: 2, offset: 1 });

      expect(result.items).toHaveLength(2);
      // 4 built-in roles + 2 created = 6
      expect(result.total).toBe(6);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });

    it('should search roles by name', async () => {
      await roleService.createRole({ name: 'Developer', description: 'Dev role' });
      await roleService.createRole({ name: 'Tester', description: 'Test role' });

      const result = await roleService.listRoles({ search: 'Dev' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Developer');
    });

    it('should search roles by description', async () => {
      await roleService.createRole({ name: 'Developer', description: 'Development team' });
      await roleService.createRole({ name: 'Tester', description: 'Testing team' });

      const result = await roleService.listRoles({ search: 'team' });

      expect(result.items).toHaveLength(2);
    });

    it('should return empty list when no roles match search', async () => {
      const result = await roleService.listRoles({ search: 'NonExistent' });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should order roles by name', async () => {
      await roleService.createRole({ name: 'Zebra', description: 'Last' });
      await roleService.createRole({ name: 'Alpha', description: 'First' });

      const result = await roleService.listRoles();

      expect(result.items[0].name).toBe('Administrator');
      expect(result.items[result.items.length - 1].name).toBe('Zebra');
    });
  });

  describe('getBuiltInRoles', () => {
    it('should return all built-in roles', async () => {
      const roles = await roleService.getBuiltInRoles();

      // Migrations seed 4 built-in roles: Viewer, Operator, Administrator, Provisioner
      expect(roles).toHaveLength(4);
      expect(roles.map(r => r.name)).toContain('Viewer');
      expect(roles.map(r => r.name)).toContain('Operator');
      expect(roles.map(r => r.name)).toContain('Administrator');
      expect(roles.map(r => r.name)).toContain('Provisioner');
    });

    it('should not return custom roles', async () => {
      await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      const roles = await roleService.getBuiltInRoles();

      expect(roles).toHaveLength(4);
      expect(roles.map(r => r.name)).not.toContain('Developer');
    });

    it('should order built-in roles by name', async () => {
      const roles = await roleService.getBuiltInRoles();

      expect(roles[0].name).toBe('Administrator');
      expect(roles[1].name).toBe('Operator');
      expect(roles[2].name).toBe('Provisioner');
      expect(roles[3].name).toBe('Viewer');
    });
  });

  describe('isBuiltInRole', () => {
    it('should return true for built-in role', async () => {
      const isBuiltIn = await roleService.isBuiltInRole('role-viewer-001');

      expect(isBuiltIn).toBe(true);
    });

    it('should return false for custom role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      const isBuiltIn = await roleService.isBuiltInRole(role.id);

      expect(isBuiltIn).toBe(false);
    });

    it('should return false for non-existent role', async () => {
      const isBuiltIn = await roleService.isBuiltInRole('non-existent-id');

      expect(isBuiltIn).toBe(false);
    });
  });

  describe('assignPermissionToRole', () => {
    it('should assign permission to role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(1);
      expect(permissions[0].id).toBe('ansible-read-001');
    });

    it('should throw error if role not found', async () => {
      await expect(
        roleService.assignPermissionToRole('non-existent-id', 'ansible-read-001')
      ).rejects.toThrow('Role not found');
    });

    it('should throw error if permission not found', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await expect(
        roleService.assignPermissionToRole(role.id, 'non-existent-perm')
      ).rejects.toThrow('Permission not found');
    });

    it('should throw error if permission already assigned', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');

      await expect(
        roleService.assignPermissionToRole(role.id, 'ansible-read-001')
      ).rejects.toThrow('Permission is already assigned to this role');
    });

    it('should allow assigning multiple permissions to same role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');
      await roleService.assignPermissionToRole(role.id, 'ansible-write-001');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(2);
    });
  });

  describe('removePermissionFromRole', () => {
    it('should remove permission from role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');
      await roleService.removePermissionFromRole(role.id, 'ansible-read-001');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(0);
    });

    it('should throw error if permission not assigned', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await expect(
        roleService.removePermissionFromRole(role.id, 'ansible-read-001')
      ).rejects.toThrow('Permission is not assigned to this role');
    });
  });

  describe('getRolePermissions', () => {
    it('should return empty array for role with no permissions', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      const permissions = await roleService.getRolePermissions(role.id);

      expect(permissions).toHaveLength(0);
    });

    it('should return all permissions assigned to role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');
      await roleService.assignPermissionToRole(role.id, 'bolt-read-001');

      const permissions = await roleService.getRolePermissions(role.id);

      expect(permissions).toHaveLength(2);
      expect(permissions.map(p => p.id)).toContain('ansible-read-001');
      expect(permissions.map(p => p.id)).toContain('bolt-read-001');
    });

    it('should order permissions by resource and action', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'bolt-read-001');
      await roleService.assignPermissionToRole(role.id, 'ansible-write-001');
      await roleService.assignPermissionToRole(role.id, 'ansible-read-001');

      const permissions = await roleService.getRolePermissions(role.id);

      expect(permissions[0].resource).toBe('ansible');
      expect(permissions[0].action).toBe('read');
      expect(permissions[1].resource).toBe('ansible');
      expect(permissions[1].action).toBe('write');
      expect(permissions[2].resource).toBe('bolt');
    });
  });
});
