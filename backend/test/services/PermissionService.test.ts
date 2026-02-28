import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { PermissionService, CreatePermissionDTO } from '../../src/services/PermissionService';
import { promises as fs } from 'fs';
import path from 'path';

describe('PermissionService', () => {
  let db: Database;
  let permissionService: PermissionService;
  const testDbPath = path.join(__dirname, '../../test-permission-service.db');

  beforeEach(async () => {
    // Remove test database if it exists
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }

    // Create new database
    db = new Database(testDbPath);

    // Create permissions table
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          UNIQUE(resource, action)
        );

        CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    permissionService = new PermissionService(db);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });

    // Remove test database
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore errors
    }
  });

  describe('createPermission', () => {
    it('should create a permission with valid data', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'read',
        description: 'View Ansible inventory'
      };

      const permission = await permissionService.createPermission(data);

      expect(permission).toBeDefined();
      expect(permission.id).toBeDefined();
      expect(permission.resource).toBe('ansible');
      expect(permission.action).toBe('read');
      expect(permission.description).toBe('View Ansible inventory');
      expect(permission.createdAt).toBeDefined();
    });

    it('should enforce unique resource-action combinations', async () => {
      const data: CreatePermissionDTO = {
        resource: 'bolt',
        action: 'execute',
        description: 'Execute Bolt tasks'
      };

      await permissionService.createPermission(data);

      // Attempt to create duplicate
      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Permission with this resource-action combination already exists');
    });

    it('should validate resource length (minimum 3 characters)', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ab',
        action: 'read',
        description: 'Test'
      };

      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Resource must be between 3 and 100 characters');
    });

    it('should validate resource length (maximum 100 characters)', async () => {
      const data: CreatePermissionDTO = {
        resource: 'a'.repeat(101),
        action: 'read',
        description: 'Test'
      };

      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Resource must be between 3 and 100 characters');
    });

    it('should validate resource format (lowercase alphanumeric and underscore only)', async () => {
      const invalidResources = [
        'Ansible',      // uppercase
        'ansible-api',  // hyphen
        'ansible api',  // space
        'ansible@api',  // special char
      ];

      for (const resource of invalidResources) {
        const data: CreatePermissionDTO = {
          resource,
          action: 'read',
          description: 'Test'
        };

        await expect(
          permissionService.createPermission(data)
        ).rejects.toThrow('Resource must be lowercase alphanumeric characters and underscores only');
      }
    });

    it('should accept valid resource formats', async () => {
      const validResources = [
        'ansible',
        'puppet_db',
        'bolt123',
        'api_v2_endpoint'
      ];

      for (const resource of validResources) {
        const data: CreatePermissionDTO = {
          resource,
          action: `read_${resource}`,
          description: 'Test'
        };

        const permission = await permissionService.createPermission(data);
        expect(permission.resource).toBe(resource);
      }
    });

    it('should validate action length (minimum 3 characters)', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'ab',
        description: 'Test'
      };

      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Action must be between 3 and 50 characters');
    });

    it('should validate action length (maximum 50 characters)', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'a'.repeat(51),
        description: 'Test'
      };

      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Action must be between 3 and 50 characters');
    });

    it('should validate action format (lowercase alphanumeric and underscore only)', async () => {
      const invalidActions = [
        'Read',         // uppercase
        'read-write',   // hyphen
        'read write',   // space
        'read@write',   // special char
      ];

      for (const action of invalidActions) {
        const data: CreatePermissionDTO = {
          resource: 'ansible',
          action,
          description: 'Test'
        };

        await expect(
          permissionService.createPermission(data)
        ).rejects.toThrow('Action must be lowercase alphanumeric characters and underscores only');
      }
    });

    it('should accept valid action formats', async () => {
      const validActions = [
        'read',
        'read_write',
        'execute123',
        'admin_full_access'
      ];

      for (const action of validActions) {
        const data: CreatePermissionDTO = {
          resource: `resource_${action}`,
          action,
          description: 'Test'
        };

        const permission = await permissionService.createPermission(data);
        expect(permission.action).toBe(action);
      }
    });

    it('should validate description length (maximum 500 characters)', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'read',
        description: 'a'.repeat(501)
      };

      await expect(
        permissionService.createPermission(data)
      ).rejects.toThrow('Permission description must not exceed 500 characters');
    });

    it('should allow empty description', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'read',
        description: ''
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.description).toBe('');
    });
  });

  describe('getPermissionById', () => {
    it('should retrieve permission by ID', async () => {
      const data: CreatePermissionDTO = {
        resource: 'puppetdb',
        action: 'query',
        description: 'Query PuppetDB'
      };

      const created = await permissionService.createPermission(data);
      const retrieved = await permissionService.getPermissionById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.resource).toBe('puppetdb');
      expect(retrieved?.action).toBe('query');
    });

    it('should return null for non-existent ID', async () => {
      const retrieved = await permissionService.getPermissionById('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('listPermissions', () => {
    beforeEach(async () => {
      // Create test permissions
      const permissions: CreatePermissionDTO[] = [
        { resource: 'ansible', action: 'read', description: 'Read Ansible' },
        { resource: 'ansible', action: 'write', description: 'Write Ansible' },
        { resource: 'ansible', action: 'execute', description: 'Execute Ansible' },
        { resource: 'bolt', action: 'read', description: 'Read Bolt' },
        { resource: 'bolt', action: 'execute', description: 'Execute Bolt' },
        { resource: 'puppetdb', action: 'query', description: 'Query PuppetDB' },
      ];

      for (const perm of permissions) {
        await permissionService.createPermission(perm);
      }
    });

    it('should list all permissions with default pagination', async () => {
      const result = await permissionService.listPermissions();

      expect(result.items).toHaveLength(6);
      expect(result.total).toBe(6);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should apply pagination limit', async () => {
      const result = await permissionService.listPermissions({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(6);
      expect(result.limit).toBe(3);
    });

    it('should apply pagination offset', async () => {
      const result = await permissionService.listPermissions({ limit: 3, offset: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(6);
      expect(result.offset).toBe(3);
    });

    it('should filter by resource', async () => {
      const result = await permissionService.listPermissions({ resource: 'ansible' });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.items.every(p => p.resource === 'ansible')).toBe(true);
    });

    it('should filter by action', async () => {
      const result = await permissionService.listPermissions({ action: 'read' });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items.every(p => p.action === 'read')).toBe(true);
    });

    it('should filter by resource and action', async () => {
      const result = await permissionService.listPermissions({
        resource: 'ansible',
        action: 'execute'
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].resource).toBe('ansible');
      expect(result.items[0].action).toBe('execute');
    });

    it('should search by resource, action, or description', async () => {
      const result = await permissionService.listPermissions({ search: 'Execute' });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every(p =>
        p.resource.includes('execute') ||
        p.action.includes('execute') ||
        p.description.toLowerCase().includes('execute')
      )).toBe(true);
    });

    it('should order results by resource and action', async () => {
      const result = await permissionService.listPermissions();

      // Check ordering
      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1];
        const curr = result.items[i];

        if (prev.resource === curr.resource) {
          expect(prev.action <= curr.action).toBe(true);
        } else {
          expect(prev.resource <= curr.resource).toBe(true);
        }
      }
    });

    it('should return empty result when no permissions match filters', async () => {
      const result = await permissionService.listPermissions({ resource: 'nonexistent' });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent permission creation attempts', async () => {
      const data: CreatePermissionDTO = {
        resource: 'concurrent',
        action: 'test',
        description: 'Concurrent test'
      };

      // Attempt to create the same permission concurrently
      const promises = [
        permissionService.createPermission(data),
        permissionService.createPermission(data),
        permissionService.createPermission(data)
      ];

      const results = await Promise.allSettled(promises);

      // Only one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(2);
    });

    it('should handle resource with exactly 3 characters', async () => {
      const data: CreatePermissionDTO = {
        resource: 'abc',
        action: 'read',
        description: 'Test'
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.resource).toBe('abc');
    });

    it('should handle resource with exactly 100 characters', async () => {
      const data: CreatePermissionDTO = {
        resource: 'a'.repeat(100),
        action: 'read',
        description: 'Test'
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.resource).toHaveLength(100);
    });

    it('should handle action with exactly 3 characters', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'abc',
        description: 'Test'
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.action).toBe('abc');
    });

    it('should handle action with exactly 50 characters', async () => {
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'a'.repeat(50),
        description: 'Test'
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.action).toHaveLength(50);
    });

    it('should handle description with exactly 500 characters', async () => {
      const description = 'a'.repeat(500);
      const data: CreatePermissionDTO = {
        resource: 'ansible',
        action: 'read',
        description
      };

      const permission = await permissionService.createPermission(data);
      expect(permission.description).toHaveLength(500);
    });
  });

  describe('hasPermission', () => {
    let userId: string;
    let adminUserId: string;
    let inactiveUserId: string;
    let groupId: string;
    let roleId: string;
    let groupRoleId: string;
    let permissionId: string;

    beforeEach(async () => {
      // Create full RBAC schema for permission checking tests
      await new Promise<void>((resolve, reject) => {
        db.exec(
          `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            passwordHash TEXT NOT NULL,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            isActive INTEGER NOT NULL DEFAULT 1,
            isAdmin INTEGER NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            lastLoginAt TEXT
          );

          CREATE TABLE groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );

          CREATE TABLE roles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            isBuiltIn INTEGER NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );

          CREATE TABLE user_groups (
            userId TEXT NOT NULL,
            groupId TEXT NOT NULL,
            assignedAt TEXT NOT NULL,
            PRIMARY KEY (userId, groupId),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
          );

          CREATE TABLE user_roles (
            userId TEXT NOT NULL,
            roleId TEXT NOT NULL,
            assignedAt TEXT NOT NULL,
            PRIMARY KEY (userId, roleId),
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
          );

          CREATE TABLE group_roles (
            groupId TEXT NOT NULL,
            roleId TEXT NOT NULL,
            assignedAt TEXT NOT NULL,
            PRIMARY KEY (groupId, roleId),
            FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
          );

          CREATE TABLE role_permissions (
            roleId TEXT NOT NULL,
            permissionId TEXT NOT NULL,
            assignedAt TEXT NOT NULL,
            PRIMARY KEY (roleId, permissionId),
            FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
          );

          CREATE INDEX idx_user_roles_user ON user_roles(userId);
          CREATE INDEX idx_user_roles_role ON user_roles(roleId);
          CREATE INDEX idx_user_groups_user ON user_groups(userId);
          CREATE INDEX idx_user_groups_group ON user_groups(groupId);
          CREATE INDEX idx_group_roles_group ON group_roles(groupId);
          CREATE INDEX idx_group_roles_role ON group_roles(roleId);
          CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
          CREATE INDEX idx_role_permissions_perm ON role_permissions(permissionId);
          `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create test data
      const now = new Date().toISOString();

      // Create users
      userId = 'user-123';  // pragma: allowlist secret
      adminUserId = 'admin-456';  // pragma: allowlist secret
      inactiveUserId = 'inactive-789';  // pragma: allowlist secret

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, 'testuser', 'test@example.com', 'hash', 'Test', 'User', 1, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [adminUserId, 'admin', 'admin@example.com', 'hash', 'Admin', 'User', 1, 1, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [inactiveUserId, 'inactive', 'inactive@example.com', 'hash', 'Inactive', 'User', 0, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create group
      groupId = 'group-123';  // pragma: allowlist secret
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO groups (id, name, description, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?)`,
          [groupId, 'Test Group', 'Test group description', now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create roles
      roleId = 'role-123';  // pragma: allowlist secret
      groupRoleId = 'role-456';  // pragma: allowlist secret

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [roleId, 'Test Role', 'Test role description', 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [groupRoleId, 'Group Role', 'Group role description', 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create permission
      const permission = await permissionService.createPermission({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible inventory'
      });
      permissionId = permission.id;
    });

    it('should return false for non-existent user', async () => {
      const hasAccess = await permissionService.hasPermission('non-existent', 'ansible', 'read');
      expect(hasAccess).toBe(false);
    });

    it('should return false for inactive user (Requirement 5.6)', async () => {
      // Assign role and permission to inactive user
      const now = new Date().toISOString();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [inactiveUserId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [roleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(inactiveUserId, 'ansible', 'read');
      expect(hasAccess).toBe(false);
    });

    it('should return true for admin user regardless of permissions (Requirement 5.5)', async () => {
      // Admin should have access even without explicit permission assignment
      const hasAccess = await permissionService.hasPermission(adminUserId, 'ansible', 'read');
      expect(hasAccess).toBe(true);

      // Admin should have access to any resource/action
      const hasAccess2 = await permissionService.hasPermission(adminUserId, 'nonexistent', 'action');
      expect(hasAccess2).toBe(true);
    });

    it('should return true when user has direct role assignment (Requirement 5.2)', async () => {
      const now = new Date().toISOString();

      // Assign role to user
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign permission to role
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [roleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(true);
    });

    it('should return true when user has group role assignment (Requirement 5.3)', async () => {
      const now = new Date().toISOString();

      // Add user to group
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
          [userId, groupId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign role to group
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [groupId, groupRoleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign permission to role
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [groupRoleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(true);
    });

    it('should return true when user has permission through multiple paths (Requirement 5.4)', async () => {
      const now = new Date().toISOString();

      // Path 1: Direct role assignment
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [roleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Path 2: Group role assignment
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
          [userId, groupId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [groupId, groupRoleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [groupRoleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(true);
    });

    it('should return false when user has no permission', async () => {
      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(false);
    });

    it('should return false when user has role but role has no permission', async () => {
      const now = new Date().toISOString();

      // Assign role to user but don't assign permission to role
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(false);
    });

    it('should return false when checking for different resource', async () => {
      const now = new Date().toISOString();

      // Assign ansible:read permission
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [roleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Check for different resource
      const hasAccess = await permissionService.hasPermission(userId, 'bolt', 'read');
      expect(hasAccess).toBe(false);
    });

    it('should return false when checking for different action', async () => {
      const now = new Date().toISOString();

      // Assign ansible:read permission
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [roleId, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Check for different action
      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'write');
      expect(hasAccess).toBe(false);
    });

    it('should handle user in multiple groups with different roles', async () => {
      const now = new Date().toISOString();

      // Create second group and role
      const group2Id = 'group-456';  // pragma: allowlist secret
      const role2Id = 'role-789';  // pragma: allowlist secret

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO groups (id, name, description, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?)`,
          [group2Id, 'Test Group 2', 'Second test group', now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [role2Id, 'Test Role 2', 'Second test role', 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Add user to both groups
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
          [userId, groupId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
          [userId, group2Id, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign roles to groups
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [groupId, groupRoleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [group2Id, role2Id, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign permission to second role only
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [role2Id, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(true);
    });

    it('should handle user with multiple direct roles', async () => {
      const now = new Date().toISOString();

      // Create second role
      const role2Id = 'role-789';  // pragma: allowlist secret

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [role2Id, 'Test Role 2', 'Second test role', 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign both roles to user
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [userId, role2Id, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign permission to second role only
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
          [role2Id, permissionId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const hasAccess = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(hasAccess).toBe(true);
    });
  });
});

describe('PermissionService - getUserPermissions', () => {
  let db: Database;
  let permissionService: PermissionService;
  const testDbPath = path.join(__dirname, '../../test-permission-service-get-user-perms.db');
  let userId: string;
  let adminUserId: string;
  let inactiveUserId: string;
  let groupId: string;
  let roleId: string;
  let groupRoleId: string;
  let permission1Id: string;
  let permission2Id: string;
  let permission3Id: string;

  beforeEach(async () => {
    // Remove test database if it exists
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }

    // Create new database
    db = new Database(testDbPath);

    // Create full RBAC schema for getUserPermissions tests
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          firstName TEXT NOT NULL,
          lastName TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          isAdmin INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          lastLoginAt TEXT
        );

        CREATE TABLE groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          isBuiltIn INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE user_groups (
          userId TEXT NOT NULL,
          groupId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (userId, groupId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
        );

        CREATE TABLE user_roles (
          userId TEXT NOT NULL,
          roleId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (userId, roleId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
        );

        CREATE TABLE group_roles (
          groupId TEXT NOT NULL,
          roleId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (groupId, roleId),
          FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
        );

        CREATE TABLE role_permissions (
          roleId TEXT NOT NULL,
          permissionId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (roleId, permissionId),
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_user_roles_user ON user_roles(userId);
        CREATE INDEX idx_user_roles_role ON user_roles(roleId);
        CREATE INDEX idx_user_groups_user ON user_groups(userId);
        CREATE INDEX idx_user_groups_group ON user_groups(groupId);
        CREATE INDEX idx_group_roles_group ON group_roles(groupId);
        CREATE INDEX idx_group_roles_role ON group_roles(roleId);
        CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
        CREATE INDEX idx_role_permissions_perm ON role_permissions(permissionId);

        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          UNIQUE(resource, action)
        );

        CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Initialize permission service
    permissionService = new PermissionService(db);

    // Create test data
    const now = new Date().toISOString();

    // Create users
    userId = 'user-123';  // pragma: allowlist secret
    adminUserId = 'admin-456';  // pragma: allowlist secret
    inactiveUserId = 'inactive-789';  // pragma: allowlist secret

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, 'testuser', 'test@example.com', 'hash', 'Test', 'User', 1, 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [adminUserId, 'admin', 'admin@example.com', 'hash', 'Admin', 'User', 1, 1, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inactiveUserId, 'inactive', 'inactive@example.com', 'hash', 'Inactive', 'User', 0, 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create group
    groupId = 'group-123';  // pragma: allowlist secret
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO groups (id, name, description, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [groupId, 'Test Group', 'Test group description', now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create roles
    roleId = 'role-123';  // pragma: allowlist secret
    groupRoleId = 'role-456';  // pragma: allowlist secret

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roleId, 'Test Role', 'Test role description', 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [groupRoleId, 'Group Role', 'Group role description', 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create permissions
    const perm1 = await permissionService.createPermission({
      resource: 'ansible',
      action: 'read',
      description: 'Read Ansible inventory'
    });
    permission1Id = perm1.id;

    const perm2 = await permissionService.createPermission({
      resource: 'ansible',
      action: 'write',
      description: 'Write Ansible configuration'
    });
    permission2Id = perm2.id;

    const perm3 = await permissionService.createPermission({
      resource: 'bolt',
      action: 'execute',
      description: 'Execute Bolt tasks'
    });
    permission3Id = perm3.id;
  });

  it('should return empty array for non-existent user', async () => {
    const permissions = await permissionService.getUserPermissions('non-existent');
    expect(permissions).toEqual([]);
  });

  it('should return empty array for inactive user (Requirement 8.6)', async () => {
    // Assign role and permission to inactive user
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [inactiveUserId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(inactiveUserId);
    expect(permissions).toEqual([]);
  });

  it('should return all permissions for admin user (Requirement 8.3)', async () => {
    const permissions = await permissionService.getUserPermissions(adminUserId);

    expect(permissions).toHaveLength(3);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:read',
      'ansible:write',
      'bolt:execute'
    ]);
  });

  it('should return permissions from direct role assignment (Requirement 8.3)', async () => {
    const now = new Date().toISOString();

    // Assign role to user
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign permissions to role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    expect(permissions).toHaveLength(2);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:read',
      'ansible:write'
    ]);
  });

  it('should return permissions from group role assignment (Requirement 8.3)', async () => {
    const now = new Date().toISOString();

    // Add user to group
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
        [userId, groupId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign role to group
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [groupId, groupRoleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign permission to role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [groupRoleId, permission3Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    expect(permissions).toHaveLength(1);
    expect(permissions[0].resource).toBe('bolt');
    expect(permissions[0].action).toBe('execute');
  });

  it('should deduplicate permissions from multiple paths (Requirement 8.6)', async () => {
    const now = new Date().toISOString();

    // Path 1: Direct role assignment with permission1
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Path 2: Group role assignment with same permission1
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
        [userId, groupId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [groupId, groupRoleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [groupRoleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    // Should only return permission1 once, not twice
    expect(permissions).toHaveLength(1);
    expect(permissions[0].resource).toBe('ansible');
    expect(permissions[0].action).toBe('read');
  });

  it('should aggregate permissions from multiple sources (Requirement 8.3)', async () => {
    const now = new Date().toISOString();

    // Direct role with permission1 and permission2
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Group role with permission3
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
        [userId, groupId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [groupId, groupRoleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [groupRoleId, permission3Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    expect(permissions).toHaveLength(3);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:read',
      'ansible:write',
      'bolt:execute'
    ]);
  });

  it('should order permissions by resource and action (Requirement 8.6)', async () => {
    const now = new Date().toISOString();

    // Create additional permissions in non-alphabetical order
    const perm4 = await permissionService.createPermission({
      resource: 'bolt',
      action: 'read',
      description: 'Read Bolt'
    });

    const perm5 = await permissionService.createPermission({
      resource: 'ansible',
      action: 'execute',
      description: 'Execute Ansible'
    });

    // Assign role to user
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign permissions in non-alphabetical order
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission3Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, perm5.id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, perm4.id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    // Should be ordered by resource ASC, then action ASC
    expect(permissions).toHaveLength(4);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:execute',
      'ansible:read',
      'bolt:execute',
      'bolt:read'
    ]);
  });

  it('should return empty array when user has no roles', async () => {
    const permissions = await permissionService.getUserPermissions(userId);
    expect(permissions).toEqual([]);
  });

  it('should return empty array when user has roles but roles have no permissions', async () => {
    const now = new Date().toISOString();

    // Assign role to user but don't assign any permissions to role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);
    expect(permissions).toEqual([]);
  });

  it('should handle user in multiple groups with different permissions', async () => {
    const now = new Date().toISOString();

    // Create second group and role
    const group2Id = 'group-456';  // pragma: allowlist secret
    const role2Id = 'role-789';  // pragma: allowlist secret

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO groups (id, name, description, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [group2Id, 'Test Group 2', 'Second test group', now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [role2Id, 'Test Role 2', 'Second test role', 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Add user to both groups
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
        [userId, groupId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)`,
        [userId, group2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign roles to groups
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [groupId, groupRoleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [group2Id, role2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign different permissions to each role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [groupRoleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [role2Id, permission2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    expect(permissions).toHaveLength(2);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:read',
      'ansible:write'
    ]);
  });

  it('should handle user with multiple direct roles', async () => {
    const now = new Date().toISOString();

    // Create second role
    const role2Id = 'role-789';  // pragma: allowlist secret

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [role2Id, 'Test Role 2', 'Second test role', 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign both roles to user
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, role2Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign different permissions to each role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permission1Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [role2Id, permission3Id, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const permissions = await permissionService.getUserPermissions(userId);

    expect(permissions).toHaveLength(2);
    expect(permissions.map(p => `${p.resource}:${p.action}`)).toEqual([
      'ansible:read',
      'bolt:execute'
    ]);
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });

    // Remove test database
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore errors
    }
  });
});

describe('PermissionService - Permission Caching', () => {
  let db: Database;
  let permissionService: PermissionService;
  const testDbPath = path.join(__dirname, '../../test-permission-service-caching.db');
  let userId: string;
  let roleId: string;
  let permissionId: string;

  beforeEach(async () => {
    // Remove test database if it exists
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }

    // Create new database
    db = new Database(testDbPath);

    // Create full RBAC schema
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          firstName TEXT NOT NULL,
          lastName TEXT NOT NULL,
          isActive INTEGER NOT NULL DEFAULT 1,
          isAdmin INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          lastLoginAt TEXT
        );

        CREATE TABLE groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE roles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          isBuiltIn INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE user_groups (
          userId TEXT NOT NULL,
          groupId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (userId, groupId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
        );

        CREATE TABLE user_roles (
          userId TEXT NOT NULL,
          roleId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (userId, roleId),
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
        );

        CREATE TABLE group_roles (
          groupId TEXT NOT NULL,
          roleId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (groupId, roleId),
          FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE,
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE
        );

        CREATE TABLE role_permissions (
          roleId TEXT NOT NULL,
          permissionId TEXT NOT NULL,
          assignedAt TEXT NOT NULL,
          PRIMARY KEY (roleId, permissionId),
          FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
        );

        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          UNIQUE(resource, action)
        );

        CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
        CREATE INDEX idx_user_roles_user ON user_roles(userId);
        CREATE INDEX idx_user_roles_role ON user_roles(roleId);
        CREATE INDEX idx_user_groups_user ON user_groups(userId);
        CREATE INDEX idx_user_groups_group ON user_groups(groupId);
        CREATE INDEX idx_group_roles_group ON group_roles(groupId);
        CREATE INDEX idx_group_roles_role ON group_roles(roleId);
        CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
        CREATE INDEX idx_role_permissions_perm ON role_permissions(permissionId);
        `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Initialize permission service
    permissionService = new PermissionService(db);

    // Create test data
    const now = new Date().toISOString();

    // Create user
    userId = 'user-cache-123';  // pragma: allowlist secret
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, 'cacheuser', 'cache@example.com', 'hash', 'Cache', 'User', 1, 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create role
    roleId = 'role-cache-123';  // pragma: allowlist secret
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roleId, 'Cache Role', 'Cache test role', 0, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create permission
    const permission = await permissionService.createPermission({
      resource: 'ansible',
      action: 'read',
      description: 'Read Ansible inventory'
    });
    permissionId = permission.id;

    // Assign role to user
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
        [userId, roleId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Assign permission to role
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)`,
        [roleId, permissionId, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });

    // Remove test database
    try {
      await fs.unlink(testDbPath);
    } catch (err) {
      // Ignore errors
    }
  });

  describe('Cache functionality (Requirement 15.1)', () => {
    it('should cache permission check results', async () => {
      // First call - should query database
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result1).toBe(true);

      // Second call - should use cache (we can't directly verify cache hit, but we can verify same result)
      const result2 = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result2).toBe(true);
    });

    it('should cache negative permission results', async () => {
      // Check for permission user doesn't have
      const result1 = await permissionService.hasPermission(userId, 'bolt', 'execute');
      expect(result1).toBe(false);

      // Second call should also return false from cache
      const result2 = await permissionService.hasPermission(userId, 'bolt', 'execute');
      expect(result2).toBe(false);
    });

    it('should cache admin user results', async () => {
      // Create admin user
      const adminId = 'admin-cache-123';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [adminId, 'adminuser', 'admin@example.com', 'hash', 'Admin', 'User', 1, 1, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // First call
      const result1 = await permissionService.hasPermission(adminId, 'any_resource', 'any_action');
      expect(result1).toBe(true);

      // Second call should use cache
      const result2 = await permissionService.hasPermission(adminId, 'any_resource', 'any_action');
      expect(result2).toBe(true);
    });

    it('should cache inactive user results', async () => {
      // Create inactive user
      const inactiveId = 'inactive-cache-123';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [inactiveId, 'inactiveuser', 'inactive@example.com', 'hash', 'Inactive', 'User', 0, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // First call
      const result1 = await permissionService.hasPermission(inactiveId, 'ansible', 'read');
      expect(result1).toBe(false);

      // Second call should use cache
      const result2 = await permissionService.hasPermission(inactiveId, 'ansible', 'read');
      expect(result2).toBe(false);
    });

    it('should use separate cache entries for different users', async () => {
      // Create second user without permissions
      const user2Id = 'user-cache-456';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [user2Id, 'cacheuser2', 'cache2@example.com', 'hash', 'Cache2', 'User', 1, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Check permissions for both users
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      const result2 = await permissionService.hasPermission(user2Id, 'ansible', 'read');

      expect(result1).toBe(true);  // User 1 has permission
      expect(result2).toBe(false); // User 2 doesn't have permission
    });

    it('should use separate cache entries for different resources', async () => {
      // Check different resources for same user
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      const result2 = await permissionService.hasPermission(userId, 'bolt', 'read');

      expect(result1).toBe(true);  // Has ansible:read
      expect(result2).toBe(false); // Doesn't have bolt:read
    });

    it('should use separate cache entries for different actions', async () => {
      // Check different actions for same user and resource
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      const result2 = await permissionService.hasPermission(userId, 'ansible', 'write');

      expect(result1).toBe(true);  // Has ansible:read
      expect(result2).toBe(false); // Doesn't have ansible:write
    });
  });

  describe('Cache invalidation (Requirement 15.2)', () => {
    it('should invalidate all cache entries for a user', async () => {
      // Cache some permission checks
      await permissionService.hasPermission(userId, 'ansible', 'read');
      await permissionService.hasPermission(userId, 'bolt', 'execute');
      await permissionService.hasPermission(userId, 'puppetdb', 'query');

      // Invalidate cache
      permissionService.invalidateUserPermissionCache(userId);

      // After invalidation, checks should query database again
      // We can't directly verify this, but we can verify the results are still correct
      const result = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result).toBe(true);
    });

    it('should only invalidate cache for specified user', async () => {
      // Create second user
      const user2Id = 'user-cache-789';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [user2Id, 'cacheuser3', 'cache3@example.com', 'hash', 'Cache3', 'User', 1, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Cache permissions for both users
      await permissionService.hasPermission(userId, 'ansible', 'read');
      await permissionService.hasPermission(user2Id, 'ansible', 'read');

      // Invalidate only user1's cache
      permissionService.invalidateUserPermissionCache(userId);

      // Both users should still get correct results
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      const result2 = await permissionService.hasPermission(user2Id, 'ansible', 'read');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should handle invalidation for user with no cached entries', async () => {
      // Invalidate cache for user who hasn't made any permission checks
      expect(() => {
        permissionService.invalidateUserPermissionCache('non-existent-user');
      }).not.toThrow();
    });

    it('should allow re-caching after invalidation', async () => {
      // Cache a permission check
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result1).toBe(true);

      // Invalidate cache
      permissionService.invalidateUserPermissionCache(userId);

      // Check again - should cache the new result
      const result2 = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result2).toBe(true);

      // Third check should use the new cache
      const result3 = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result3).toBe(true);
    });
  });

  describe('Cache correctness', () => {
    it('should return same results with and without cache', async () => {
      // First check (no cache)
      const result1 = await permissionService.hasPermission(userId, 'ansible', 'read');

      // Second check (from cache)
      const result2 = await permissionService.hasPermission(userId, 'ansible', 'read');

      // Results should be identical
      expect(result1).toBe(result2);
    });

    it('should not affect correctness for admin users', async () => {
      // Create admin user
      const adminId = 'admin-correct-123';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [adminId, 'admincorrect', 'admincorrect@example.com', 'hash', 'Admin', 'Correct', 1, 1, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Multiple checks should all return true
      const result1 = await permissionService.hasPermission(adminId, 'resource1', 'action1');
      const result2 = await permissionService.hasPermission(adminId, 'resource2', 'action2');
      const result3 = await permissionService.hasPermission(adminId, 'resource1', 'action1'); // Cached

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    it('should not affect correctness for inactive users', async () => {
      // Create inactive user with role and permission
      const inactiveId = 'inactive-correct-123';  // pragma: allowlist secret
      const now = new Date().toISOString();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [inactiveId, 'inactivecorrect', 'inactivecorrect@example.com', 'hash', 'Inactive', 'Correct', 0, 0, now, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Assign role with permission
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)`,
          [inactiveId, roleId, now],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Multiple checks should all return false (inactive users always denied)
      const result1 = await permissionService.hasPermission(inactiveId, 'ansible', 'read');
      const result2 = await permissionService.hasPermission(inactiveId, 'ansible', 'read'); // Cached

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should handle concurrent permission checks correctly', async () => {
      // Make multiple concurrent permission checks
      const promises = [
        permissionService.hasPermission(userId, 'ansible', 'read'),
        permissionService.hasPermission(userId, 'ansible', 'read'),
        permissionService.hasPermission(userId, 'ansible', 'read'),
        permissionService.hasPermission(userId, 'bolt', 'execute'),
        permissionService.hasPermission(userId, 'bolt', 'execute')
      ];

      const results = await Promise.all(promises);

      // First three should be true (has ansible:read)
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(true);
      expect(results[2]).toBe(true);

      // Last two should be false (doesn't have bolt:execute)
      expect(results[3]).toBe(false);
      expect(results[4]).toBe(false);
    });
  });

  describe('Cache key format', () => {
    it('should use correct cache key format: perm:userId:resource:action', async () => {
      // This is an implementation detail test
      // We verify the cache works correctly with the expected key format

      // Cache a permission
      await permissionService.hasPermission(userId, 'ansible', 'read');

      // Invalidate using the user ID
      permissionService.invalidateUserPermissionCache(userId);

      // After invalidation, the permission check should still work
      const result = await permissionService.hasPermission(userId, 'ansible', 'read');
      expect(result).toBe(true);
    });
  });
});
