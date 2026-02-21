import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { PermissionService } from '../../src/services/PermissionService';
import { UserService } from '../../src/services/UserService';
import { GroupService } from '../../src/services/GroupService';
import { RoleService } from '../../src/services/RoleService';
import { AuthenticationService } from '../../src/services/AuthenticationService';

/**
 * Integration Tests for Permission Inheritance
 *
 * These tests validate permission inheritance scenarios:
 * - Direct role assignment permissions
 * - Group-based permission inheritance
 * - Multiple permission paths (direct + group)
 * - Permission revocation when roles/groups are removed
 *
 * Validates Requirements: 8.1, 8.2, 8.3, 8.5
 */
describe('Permission Inheritance Integration Tests', () => {
  let db: Database;
  let permissionService: PermissionService;
  let userService: UserService;
  let groupService: GroupService;
  let roleService: RoleService;
  let authService: AuthenticationService;

  beforeEach(async () => {
    // Set JWT_SECRET for testing
    process.env.JWT_SECRET = 'test-secret-key-for-permission-inheritance-tests';  // pragma: allowlist secret

    // Create in-memory database
    db = new Database(':memory:');

    // Initialize schema
    await initializeSchema(db);

    // Create service instances
    authService = new AuthenticationService(db);
    permissionService = new PermissionService(db);
    userService = new UserService(db, authService);
    groupService = new GroupService(db);
    roleService = new RoleService(db);
  });

  afterEach(async () => {
    await closeDatabase(db);
  });

  describe('Direct Role Assignment Permissions (Requirement 8.1)', () => {
    it('should grant permissions when user is assigned a role directly', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'directuser',
        email: 'direct@example.com',
        password: 'SecurePass123!',
        firstName: 'Direct',
        lastName: 'User',
      });

      // Create role
      const role = await roleService.createRole({
        name: 'Developer',
        description: 'Developer role',
      });

      // Create permissions
      const readPermission = await permissionService.createPermission({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible resources',
      });

      const executePermission = await permissionService.createPermission({
        resource: 'ansible',
        action: 'execute',
        description: 'Execute Ansible playbooks',
      });

      // Assign permissions to role
      await roleService.assignPermissionToRole(role.id, readPermission.id);
      await roleService.assignPermissionToRole(role.id, executePermission.id);

      // Verify user doesn't have permissions before role assignment
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(false);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'execute')).toBe(false);

      // Assign role to user
      await userService.assignRoleToUser(user.id, role.id);

      // Invalidate cache after role assignment
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify user now has permissions through direct role assignment
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'execute')).toBe(true);

      // Verify user doesn't have permissions not in the role
      expect(await permissionService.hasPermission(user.id, 'ansible', 'admin')).toBe(false);
    });

    it('should grant all permissions from role when assigned directly', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'multiperms',
        email: 'multiperms@example.com',
        password: 'SecurePass123!',
        firstName: 'Multi',
        lastName: 'Perms',
      });

      // Create role with multiple permissions
      const role = await roleService.createRole({
        name: 'Operator',
        description: 'Operator role',
      });

      // Create multiple permissions across different resources
      const permissions = [
        await permissionService.createPermission({
          resource: 'ansible',
          action: 'read',
          description: 'Read Ansible',
        }),
        await permissionService.createPermission({
          resource: 'bolt',
          action: 'read',
          description: 'Read Bolt',
        }),
        await permissionService.createPermission({
          resource: 'puppetdb',
          action: 'read',
          description: 'Read PuppetDB',
        }),
      ];

      // Assign all permissions to role
      for (const permission of permissions) {
        await roleService.assignPermissionToRole(role.id, permission.id);
      }

      // Assign role to user
      await userService.assignRoleToUser(user.id, role.id);

      // Verify user has all permissions from the role
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'read')).toBe(true);

      // Verify getUserPermissions returns all permissions
      const userPermissions = await permissionService.getUserPermissions(user.id);
      expect(userPermissions).toHaveLength(3);
      expect(userPermissions.map(p => `${p.resource}:${p.action}`).sort()).toEqual([
        'ansible:read',
        'bolt:read',
        'puppetdb:read',
      ]);
    });
  });

  describe('Group-Based Permission Inheritance (Requirement 8.2)', () => {
    it('should grant permissions when user is member of group with assigned role', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'groupuser',
        email: 'group@example.com',
        password: 'SecurePass123!',
        firstName: 'Group',
        lastName: 'User',
      });

      // Create group
      const group = await groupService.createGroup({
        name: 'Developers',
        description: 'Development team',
      });

      // Create role
      const role = await roleService.createRole({
        name: 'DevRole',
        description: 'Developer role',
      });

      // Create permission
      const permission = await permissionService.createPermission({
        resource: 'bolt',
        action: 'execute',
        description: 'Execute Bolt tasks',
      });

      // Assign permission to role
      await roleService.assignPermissionToRole(role.id, permission.id);

      // Assign role to group
      await groupService.assignRoleToGroup(group.id, role.id);

      // Verify user doesn't have permission before group membership
      expect(await permissionService.hasPermission(user.id, 'bolt', 'execute')).toBe(false);

      // Add user to group
      await userService.addUserToGroup(user.id, group.id);

      // Invalidate cache after group membership change
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify user now has permission through group membership
      expect(await permissionService.hasPermission(user.id, 'bolt', 'execute')).toBe(true);
    });

    it('should inherit permissions from multiple groups', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'multigroup',
        email: 'multigroup@example.com',
        password: 'SecurePass123!',
        firstName: 'Multi',
        lastName: 'Group',
      });

      // Create two groups
      const group1 = await groupService.createGroup({
        name: 'Group1',
        description: 'First group',
      });

      const group2 = await groupService.createGroup({
        name: 'Group2',
        description: 'Second group',
      });

      // Create two roles
      const role1 = await roleService.createRole({
        name: 'Role1',
        description: 'First role',
      });

      const role2 = await roleService.createRole({
        name: 'Role2',
        description: 'Second role',
      });

      // Create permissions
      const perm1 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible',
      });

      const perm2 = await permissionService.createPermission({
        resource: 'bolt',
        action: 'read',
        description: 'Read Bolt',
      });

      // Assign permissions to roles
      await roleService.assignPermissionToRole(role1.id, perm1.id);
      await roleService.assignPermissionToRole(role2.id, perm2.id);

      // Assign roles to groups
      await groupService.assignRoleToGroup(group1.id, role1.id);
      await groupService.assignRoleToGroup(group2.id, role2.id);

      // Add user to both groups
      await userService.addUserToGroup(user.id, group1.id);
      await userService.addUserToGroup(user.id, group2.id);

      // Verify user has permissions from both groups
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'read')).toBe(true);
    });
  });

  describe('Multiple Permission Paths (Requirement 8.3)', () => {
    it('should handle same permission through both direct role and group role', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'multipath',
        email: 'multipath@example.com',
        password: 'SecurePass123!',
        firstName: 'Multi',
        lastName: 'Path',
      });

      // Create group
      const group = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test group',
      });

      // Create two roles
      const directRole = await roleService.createRole({
        name: 'DirectRole',
        description: 'Direct role',
      });

      const groupRole = await roleService.createRole({
        name: 'GroupRole',
        description: 'Group role',
      });

      // Create permission
      const permission = await permissionService.createPermission({
        resource: 'puppetdb',
        action: 'read',
        description: 'Read PuppetDB',
      });

      // Assign same permission to both roles
      await roleService.assignPermissionToRole(directRole.id, permission.id);
      await roleService.assignPermissionToRole(groupRole.id, permission.id);

      // Assign direct role to user
      await userService.assignRoleToUser(user.id, directRole.id);

      // Assign group role to group and add user to group
      await groupService.assignRoleToGroup(group.id, groupRole.id);
      await userService.addUserToGroup(user.id, group.id);

      // Verify user has permission (should be deduplicated)
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'read')).toBe(true);

      // Verify getUserPermissions returns deduplicated permissions
      const userPermissions = await permissionService.getUserPermissions(user.id);
      const puppetdbReadPerms = userPermissions.filter(
        p => p.resource === 'puppetdb' && p.action === 'read'  // pragma: allowlist secret
      );
      expect(puppetdbReadPerms).toHaveLength(1);
    });

    it('should aggregate permissions from direct roles and group roles', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'aggregate',
        email: 'aggregate@example.com',
        password: 'SecurePass123!',
        firstName: 'Aggregate',
        lastName: 'User',
      });

      // Create group
      const group = await groupService.createGroup({
        name: 'AggregateGroup',
        description: 'Aggregate group',
      });

      // Create roles
      const directRole = await roleService.createRole({
        name: 'DirectAggRole',
        description: 'Direct role',
      });

      const groupRole = await roleService.createRole({
        name: 'GroupAggRole',
        description: 'Group role',
      });

      // Create different permissions
      const directPerm = await permissionService.createPermission({
        resource: 'ansible',
        action: 'execute',
        description: 'Execute Ansible',
      });

      const groupPerm = await permissionService.createPermission({
        resource: 'bolt',
        action: 'execute',
        description: 'Execute Bolt',
      });

      // Assign permissions to respective roles
      await roleService.assignPermissionToRole(directRole.id, directPerm.id);
      await roleService.assignPermissionToRole(groupRole.id, groupPerm.id);

      // Assign direct role to user
      await userService.assignRoleToUser(user.id, directRole.id);

      // Assign group role to group and add user to group
      await groupService.assignRoleToGroup(group.id, groupRole.id);
      await userService.addUserToGroup(user.id, group.id);

      // Verify user has permissions from both paths
      expect(await permissionService.hasPermission(user.id, 'ansible', 'execute')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'execute')).toBe(true);

      // Verify getUserPermissions returns all permissions
      const userPermissions = await permissionService.getUserPermissions(user.id);
      expect(userPermissions).toHaveLength(2);
      expect(userPermissions.map(p => `${p.resource}:${p.action}`).sort()).toEqual([
        'ansible:execute',
        'bolt:execute',
      ]);
    });
  });

  describe('Permission Revocation Scenarios (Requirement 8.5)', () => {
    it('should revoke permissions when direct role is removed', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'revokeuser',
        email: 'revoke@example.com',
        password: 'SecurePass123!',
        firstName: 'Revoke',
        lastName: 'User',
      });

      // Create role and permission
      const role = await roleService.createRole({
        name: 'RevokeRole',
        description: 'Role to be revoked',
      });

      const permission = await permissionService.createPermission({
        resource: 'ansible',
        action: 'write',
        description: 'Write Ansible',
      });

      await roleService.assignPermissionToRole(role.id, permission.id);

      // Assign role to user
      await userService.assignRoleToUser(user.id, role.id);

      // Verify user has permission
      expect(await permissionService.hasPermission(user.id, 'ansible', 'write')).toBe(true);

      // Remove role from user
      await userService.removeRoleFromUser(user.id, role.id);

      // Invalidate cache after role removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify permission is revoked
      expect(await permissionService.hasPermission(user.id, 'ansible', 'write')).toBe(false);
    });

    it('should revoke permissions when user is removed from group', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'grouprevoke',
        email: 'grouprevoke@example.com',
        password: 'SecurePass123!',
        firstName: 'Group',
        lastName: 'Revoke',
      });

      // Create group, role, and permission
      const group = await groupService.createGroup({
        name: 'RevokeGroup',
        description: 'Group to be left',
      });

      const role = await roleService.createRole({
        name: 'GroupRevokeRole',
        description: 'Group role',
      });

      const permission = await permissionService.createPermission({
        resource: 'bolt',
        action: 'admin',
        description: 'Admin Bolt',
      });

      await roleService.assignPermissionToRole(role.id, permission.id);
      await groupService.assignRoleToGroup(group.id, role.id);

      // Add user to group
      await userService.addUserToGroup(user.id, group.id);

      // Verify user has permission
      expect(await permissionService.hasPermission(user.id, 'bolt', 'admin')).toBe(true);

      // Remove user from group
      await userService.removeUserFromGroup(user.id, group.id);

      // Invalidate cache after group removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify permission is revoked
      expect(await permissionService.hasPermission(user.id, 'bolt', 'admin')).toBe(false);
    });

    it('should retain permission when removed from one path but still has through another', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'retainuser',
        email: 'retain@example.com',
        password: 'SecurePass123!',
        firstName: 'Retain',
        lastName: 'User',
      });

      // Create group
      const group = await groupService.createGroup({
        name: 'RetainGroup',
        description: 'Retain group',
      });

      // Create two roles with same permission
      const directRole = await roleService.createRole({
        name: 'DirectRetainRole',
        description: 'Direct role',
      });

      const groupRole = await roleService.createRole({
        name: 'GroupRetainRole',
        description: 'Group role',
      });

      // Create permission
      const permission = await permissionService.createPermission({
        resource: 'puppetdb',
        action: 'write',
        description: 'Write PuppetDB',
      });

      // Assign permission to both roles
      await roleService.assignPermissionToRole(directRole.id, permission.id);
      await roleService.assignPermissionToRole(groupRole.id, permission.id);

      // Assign direct role to user
      await userService.assignRoleToUser(user.id, directRole.id);

      // Assign group role to group and add user to group
      await groupService.assignRoleToGroup(group.id, groupRole.id);
      await userService.addUserToGroup(user.id, group.id);

      // Verify user has permission
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'write')).toBe(true);

      // Remove direct role
      await userService.removeRoleFromUser(user.id, directRole.id);

      // Invalidate cache after role removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify user still has permission through group
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'write')).toBe(true);

      // Remove user from group
      await userService.removeUserFromGroup(user.id, group.id);

      // Invalidate cache after group removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Now permission should be revoked
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'write')).toBe(false);
    });

    it('should revoke all permissions when all roles are removed', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'revokeall',
        email: 'revokeall@example.com',
        password: 'SecurePass123!',
        firstName: 'Revoke',
        lastName: 'All',
      });

      // Create multiple roles with different permissions
      const role1 = await roleService.createRole({
        name: 'RevokeAllRole1',
        description: 'First role',
      });

      const role2 = await roleService.createRole({
        name: 'RevokeAllRole2',
        description: 'Second role',
      });

      const perm1 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'admin',
        description: 'Admin Ansible',
      });

      const perm2 = await permissionService.createPermission({
        resource: 'bolt',
        action: 'write',
        description: 'Write Bolt',
      });

      await roleService.assignPermissionToRole(role1.id, perm1.id);
      await roleService.assignPermissionToRole(role2.id, perm2.id);

      // Assign both roles to user
      await userService.assignRoleToUser(user.id, role1.id);
      await userService.assignRoleToUser(user.id, role2.id);

      // Verify user has both permissions
      expect(await permissionService.hasPermission(user.id, 'ansible', 'admin')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'write')).toBe(true);

      // Remove first role
      await userService.removeRoleFromUser(user.id, role1.id);

      // Invalidate cache after role removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify first permission is revoked but second remains
      expect(await permissionService.hasPermission(user.id, 'ansible', 'admin')).toBe(false);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'write')).toBe(true);

      // Remove second role
      await userService.removeRoleFromUser(user.id, role2.id);

      // Invalidate cache after role removal
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify all permissions are revoked
      expect(await permissionService.hasPermission(user.id, 'ansible', 'admin')).toBe(false);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'write')).toBe(false);

      // Verify getUserPermissions returns empty array
      const userPermissions = await permissionService.getUserPermissions(user.id);
      expect(userPermissions).toHaveLength(0);
    });
  });

  describe('Complex Permission Inheritance Scenarios', () => {
    it('should handle user with multiple groups and direct roles', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'complex',
        email: 'complex@example.com',
        password: 'SecurePass123!',
        firstName: 'Complex',
        lastName: 'User',
      });

      // Create two groups
      const group1 = await groupService.createGroup({
        name: 'ComplexGroup1',
        description: 'First complex group',
      });

      const group2 = await groupService.createGroup({
        name: 'ComplexGroup2',
        description: 'Second complex group',
      });

      // Create three roles
      const directRole = await roleService.createRole({
        name: 'ComplexDirectRole',
        description: 'Direct role',
      });

      const groupRole1 = await roleService.createRole({
        name: 'ComplexGroupRole1',
        description: 'First group role',
      });

      const groupRole2 = await roleService.createRole({
        name: 'ComplexGroupRole2',
        description: 'Second group role',
      });

      // Create four permissions
      const perm1 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible',
      });

      const perm2 = await permissionService.createPermission({
        resource: 'bolt',
        action: 'read',
        description: 'Read Bolt',
      });

      const perm3 = await permissionService.createPermission({
        resource: 'puppetdb',
        action: 'read',
        description: 'Read PuppetDB',
      });

      const perm4 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'execute',
        description: 'Execute Ansible',
      });

      // Assign permissions to roles
      await roleService.assignPermissionToRole(directRole.id, perm1.id);
      await roleService.assignPermissionToRole(directRole.id, perm4.id);
      await roleService.assignPermissionToRole(groupRole1.id, perm2.id);
      await roleService.assignPermissionToRole(groupRole2.id, perm3.id);

      // Setup role assignments
      await userService.assignRoleToUser(user.id, directRole.id);
      await groupService.assignRoleToGroup(group1.id, groupRole1.id);
      await groupService.assignRoleToGroup(group2.id, groupRole2.id);
      await userService.addUserToGroup(user.id, group1.id);
      await userService.addUserToGroup(user.id, group2.id);

      // Verify user has all permissions
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'execute')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'bolt', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'puppetdb', 'read')).toBe(true);

      // Verify getUserPermissions returns all permissions
      const userPermissions = await permissionService.getUserPermissions(user.id);
      expect(userPermissions).toHaveLength(4);
    });

    it('should handle permission changes when role permissions are modified', async () => {
      // Create user
      const user = await userService.createUser({
        username: 'rolechange',
        email: 'rolechange@example.com',
        password: 'SecurePass123!',
        firstName: 'Role',
        lastName: 'Change',
      });

      // Create role
      const role = await roleService.createRole({
        name: 'ChangeableRole',
        description: 'Role with changing permissions',
      });

      // Create permissions
      const perm1 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible',
      });

      const perm2 = await permissionService.createPermission({
        resource: 'ansible',
        action: 'write',
        description: 'Write Ansible',
      });

      // Assign first permission to role
      await roleService.assignPermissionToRole(role.id, perm1.id);

      // Assign role to user
      await userService.assignRoleToUser(user.id, role.id);

      // Verify user has first permission
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'write')).toBe(false);

      // Add second permission to role
      await roleService.assignPermissionToRole(role.id, perm2.id);

      // Invalidate cache after permission change
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify user now has both permissions
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(true);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'write')).toBe(true);

      // Remove first permission from role
      await roleService.removePermissionFromRole(role.id, perm1.id);

      // Invalidate cache after permission change
      permissionService.invalidateUserPermissionCache(user.id);

      // Verify user only has second permission
      expect(await permissionService.hasPermission(user.id, 'ansible', 'read')).toBe(false);
      expect(await permissionService.hasPermission(user.id, 'ansible', 'write')).toBe(true);
    });
  });
});

// Helper functions
async function initializeSchema(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        isAdmin INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastLoginAt TEXT
      );

      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        isBuiltIn INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE permissions (
        id TEXT PRIMARY KEY,
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        UNIQUE(resource, action)
      );

      CREATE TABLE user_groups (
        userId TEXT NOT NULL,
        groupId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, groupId),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (groupId) REFERENCES groups(id)
      );

      CREATE TABLE user_roles (
        userId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (userId, roleId),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (roleId) REFERENCES roles(id)
      );

      CREATE TABLE group_roles (
        groupId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (groupId, roleId),
        FOREIGN KEY (groupId) REFERENCES groups(id),
        FOREIGN KEY (roleId) REFERENCES roles(id)
      );

      CREATE TABLE role_permissions (
        roleId TEXT NOT NULL,
        permissionId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        PRIMARY KEY (roleId, permissionId),
        FOREIGN KEY (roleId) REFERENCES roles(id),
        FOREIGN KEY (permissionId) REFERENCES permissions(id)
      );

      -- Indexes for performance
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_active ON users(isActive);
      CREATE INDEX idx_user_roles_user ON user_roles(userId);
      CREATE INDEX idx_user_roles_role ON user_roles(roleId);
      CREATE INDEX idx_group_roles_group ON group_roles(groupId);
      CREATE INDEX idx_group_roles_role ON group_roles(roleId);
      CREATE INDEX idx_user_groups_user ON user_groups(userId);
      CREATE INDEX idx_user_groups_group ON user_groups(groupId);
      CREATE INDEX idx_role_permissions_role ON role_permissions(roleId);
      CREATE INDEX idx_role_permissions_perm ON role_permissions(permissionId);
      CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function closeDatabase(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
