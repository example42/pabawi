import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { RoleService, CreateRoleDTO, UpdateRoleDTO } from '../src/services/RoleService';

describe('RoleService', () => {
  let db: Database;
  let roleService: RoleService;

  beforeEach(async () => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create schema
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          isBuiltIn INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          description TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          UNIQUE(resource, action)
        );

        CREATE TABLE role_permissions (
          roleId TEXT NOT NULL,
          permissionId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (roleId, permissionId),
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
        );

        -- Seed built-in roles
        INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt) VALUES
          ('role-viewer-001', 'Viewer', 'Read-only access', 1, datetime('now'), datetime('now')),
          ('role-operator-001', 'Operator', 'Read and execute access', 1, datetime('now'), datetime('now')),
          ('role-admin-001', 'Administrator', 'Full access', 1, datetime('now'), datetime('now'));

        -- Seed permissions
        INSERT INTO permissions (id, resource, action, description, createdAt) VALUES
          ('perm-ansible-read', 'ansible', 'read', 'View Ansible resources', datetime('now')),
          ('perm-ansible-write', 'ansible', 'write', 'Modify Ansible resources', datetime('now')),
          ('perm-bolt-read', 'bolt', 'read', 'View Bolt resources', datetime('now'));
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    roleService = new RoleService(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
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
      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');

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

      expect(result.items).toHaveLength(3); // 3 built-in roles
      expect(result.total).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should list roles with custom pagination', async () => {
      // Create additional roles
      await roleService.createRole({ name: 'Developer', description: 'Dev role' });
      await roleService.createRole({ name: 'Tester', description: 'Test role' });

      const result = await roleService.listRoles({ limit: 2, offset: 1 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
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

      expect(roles).toHaveLength(3);
      expect(roles.map(r => r.name)).toContain('Viewer');
      expect(roles.map(r => r.name)).toContain('Operator');
      expect(roles.map(r => r.name)).toContain('Administrator');
    });

    it('should not return custom roles', async () => {
      await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      const roles = await roleService.getBuiltInRoles();

      expect(roles).toHaveLength(3);
      expect(roles.map(r => r.name)).not.toContain('Developer');
    });

    it('should order built-in roles by name', async () => {
      const roles = await roleService.getBuiltInRoles();

      expect(roles[0].name).toBe('Administrator');
      expect(roles[1].name).toBe('Operator');
      expect(roles[2].name).toBe('Viewer');
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

      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(1);
      expect(permissions[0].id).toBe('perm-ansible-read');
    });

    it('should throw error if role not found', async () => {
      await expect(
        roleService.assignPermissionToRole('non-existent-id', 'perm-ansible-read')
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

      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');

      await expect(
        roleService.assignPermissionToRole(role.id, 'perm-ansible-read')
      ).rejects.toThrow('Permission is already assigned to this role');
    });

    it('should allow assigning multiple permissions to same role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');
      await roleService.assignPermissionToRole(role.id, 'perm-ansible-write');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(2);
    });
  });

  describe('removePermissionFromRole', () => {
    it('should remove permission from role', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');
      await roleService.removePermissionFromRole(role.id, 'perm-ansible-read');

      const permissions = await roleService.getRolePermissions(role.id);
      expect(permissions).toHaveLength(0);
    });

    it('should throw error if permission not assigned', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await expect(
        roleService.removePermissionFromRole(role.id, 'perm-ansible-read')
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

      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');
      await roleService.assignPermissionToRole(role.id, 'perm-bolt-read');

      const permissions = await roleService.getRolePermissions(role.id);

      expect(permissions).toHaveLength(2);
      expect(permissions.map(p => p.id)).toContain('perm-ansible-read');
      expect(permissions.map(p => p.id)).toContain('perm-bolt-read');
    });

    it('should order permissions by resource and action', async () => {
      const role = await roleService.createRole({ name: 'Developer', description: 'Dev role' });

      await roleService.assignPermissionToRole(role.id, 'perm-bolt-read');
      await roleService.assignPermissionToRole(role.id, 'perm-ansible-write');
      await roleService.assignPermissionToRole(role.id, 'perm-ansible-read');

      const permissions = await roleService.getRolePermissions(role.id);

      expect(permissions[0].resource).toBe('ansible');
      expect(permissions[0].action).toBe('read');
      expect(permissions[1].resource).toBe('ansible');
      expect(permissions[1].action).toBe('write');
      expect(permissions[2].resource).toBe('bolt');
    });
  });
});
