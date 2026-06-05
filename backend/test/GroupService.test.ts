import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/database/SQLiteAdapter';
import { GroupService } from '../src/services/GroupService';
import { randomUUID } from 'crypto';
import { initializeTestSchema } from './helpers/schema';

describe('GroupService', () => {
  let db: SQLiteAdapter;
  let groupService: GroupService;

  beforeEach(async () => {
    // Create in-memory database
    db = new SQLiteAdapter(':memory:');
    await db.initialize();

    // Apply real migrations — see .kiro/steering/database-conventions.md
    await initializeTestSchema(db);

    // Create group service
    groupService = new GroupService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('createGroup', () => {
    it('should create a new group with valid data', async () => {
      const groupData = {
        name: 'Developers',
        description: 'Development team members'
      };

      const group = await groupService.createGroup(groupData);

      expect(group).toBeDefined();
      expect(group.id).toBeDefined();
      expect(group.name).toBe(groupData.name);
      expect(group.description).toBe(groupData.description);
      expect(group.createdAt).toBeDefined();
      expect(group.updatedAt).toBeDefined();
    });

    it('should generate UUID for group ID', async () => {
      const group = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test description'
      });

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(group.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should reject duplicate group name (Requirement 3.1)', async () => {
      await groupService.createGroup({
        name: 'Developers',
        description: 'First group'
      });

      await expect(
        groupService.createGroup({
          name: 'Developers',
          description: 'Second group'
        })
      ).rejects.toThrow('Group name already exists');
    });

    it('should allow groups with different names', async () => {
      const group1 = await groupService.createGroup({
        name: 'Developers',
        description: 'Dev team'
      });

      const group2 = await groupService.createGroup({
        name: 'Operators',
        description: 'Ops team'
      });

      expect(group1.id).not.toBe(group2.id);
      expect(group1.name).not.toBe(group2.name);
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const beforeCreate = new Date().toISOString();
      const group = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });
      const afterCreate = new Date().toISOString();

      expect(group.createdAt).toBeDefined();
      expect(group.updatedAt).toBeDefined();
      expect(group.createdAt).toBe(group.updatedAt);
      // Verify timestamp is in valid ISO format
      expect(new Date(group.createdAt).toISOString()).toBe(group.createdAt);
    });
  });

  describe('getGroupById', () => {
    it('should retrieve group by ID', async () => {
      const created = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test description'
      });

      const retrieved = await groupService.getGroupById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe(created.name);
      expect(retrieved?.description).toBe(created.description);
    });

    it('should return null for non-existent group', async () => {
      const nonExistentId = randomUUID();
      const group = await groupService.getGroupById(nonExistentId);

      expect(group).toBeNull();
    });
  });

  describe('updateGroup', () => {
    let testGroup: any;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'OriginalName',
        description: 'Original description'
      });
    });

    it('should update group name', async () => {
      const updated = await groupService.updateGroup(testGroup.id, {
        name: 'UpdatedName'
      });

      expect(updated.name).toBe('UpdatedName');
      expect(updated.description).toBe(testGroup.description);
    });

    it('should update group description', async () => {
      const updated = await groupService.updateGroup(testGroup.id, {
        description: 'Updated description'
      });

      expect(updated.name).toBe(testGroup.name);
      expect(updated.description).toBe('Updated description');
    });

    it('should update both name and description', async () => {
      const updated = await groupService.updateGroup(testGroup.id, {
        name: 'NewName',
        description: 'New description'
      });

      expect(updated.name).toBe('NewName');
      expect(updated.description).toBe('New description');
    });

    it('should update updated_at timestamp', async () => {
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await groupService.updateGroup(testGroup.id, {
        description: 'Updated'
      });

      expect(updated.updatedAt).not.toBe(testGroup.updatedAt);
      // Verify updatedAt is later than original (string comparison works for ISO timestamps)
      expect(updated.updatedAt >= testGroup.updatedAt).toBe(true);
    });

    it('should reject duplicate group name', async () => {
      await groupService.createGroup({
        name: 'ExistingGroup',
        description: 'Another group'
      });

      await expect(
        groupService.updateGroup(testGroup.id, {
          name: 'ExistingGroup'
        })
      ).rejects.toThrow('Group name already exists');
    });

    it('should allow updating to same name', async () => {
      const updated = await groupService.updateGroup(testGroup.id, {
        name: testGroup.name,
        description: 'New description'
      });

      expect(updated.name).toBe(testGroup.name);
      expect(updated.description).toBe('New description');
    });

    it('should throw error for non-existent group', async () => {
      const nonExistentId = randomUUID();

      await expect(
        groupService.updateGroup(nonExistentId, {
          name: 'NewName'
        })
      ).rejects.toThrow('Group not found');
    });
  });

  describe('deleteGroup', () => {
    it('should delete existing group', async () => {
      const group = await groupService.createGroup({
        name: 'ToDelete',
        description: 'Will be deleted'
      });

      await groupService.deleteGroup(group.id);

      const retrieved = await groupService.getGroupById(group.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent group', async () => {
      const nonExistentId = randomUUID();

      await expect(
        groupService.deleteGroup(nonExistentId)
      ).rejects.toThrow('Group not found');
    });

    it('should cascade delete user_groups associations', async () => {
      const group = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });

      // Create user and add to group
      const userId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'testuser', 'test@example.com', 'hash', 'Test', 'User', 1, 0, now, now]);

      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?)
      `, [userId, group.id, now]);

      // Verify association exists before delete
      const beforeDelete = await allQuery(db,
        'SELECT * FROM user_groups WHERE group_id = ?',
        [group.id]
      );
      expect(beforeDelete).toHaveLength(1);

      // Delete group
      await groupService.deleteGroup(group.id);

      // Verify user_groups association is deleted (CASCADE should handle this)
      const associations = await allQuery(db,
        'SELECT * FROM user_groups WHERE group_id = ?',
        [group.id]
      );
      expect(associations).toHaveLength(0);
    });

    it('should cascade delete group_roles associations', async () => {
      const group = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });

      // Create role and assign to group
      const roleId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'TestRole', 'Test role', 0, now, now]);

      await runQuery(db, `
        INSERT INTO group_roles (group_id, role_id, assigned_at)
        VALUES (?, ?, ?)
      `, [group.id, roleId, now]);

      // Verify association exists before delete
      const beforeDelete = await allQuery(db,
        'SELECT * FROM group_roles WHERE group_id = ?',
        [group.id]
      );
      expect(beforeDelete).toHaveLength(1);

      // Delete group
      await groupService.deleteGroup(group.id);

      // Verify group_roles association is deleted (CASCADE should handle this)
      const associations = await allQuery(db,
        'SELECT * FROM group_roles WHERE group_id = ?',
        [group.id]
      );
      expect(associations).toHaveLength(0);
    });
  });

  describe('listGroups', () => {
    beforeEach(async () => {
      // Create test groups
      await groupService.createGroup({
        name: 'Developers',
        description: 'Development team'
      });
      await groupService.createGroup({
        name: 'Operators',
        description: 'Operations team'
      });
      await groupService.createGroup({
        name: 'Administrators',
        description: 'Admin team'
      });
    });

    it('should list all groups', async () => {
      const result = await groupService.listGroups();

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should sort groups by name', async () => {
      const result = await groupService.listGroups();

      expect(result.items[0].name).toBe('Administrators');
      expect(result.items[1].name).toBe('Developers');
      expect(result.items[2].name).toBe('Operators');
    });

    it('should support pagination with limit', async () => {
      const result = await groupService.listGroups({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(2);
    });

    it('should support pagination with offset', async () => {
      const result = await groupService.listGroups({ limit: 2, offset: 1 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.offset).toBe(1);
      expect(result.items[0].name).toBe('Developers');
    });

    it('should support search by name', async () => {
      const result = await groupService.listGroups({ search: 'Dev' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Developers');
    });

    it('should support search by description', async () => {
      const result = await groupService.listGroups({ search: 'team' });

      expect(result.items).toHaveLength(3); // All have 'team' in description
    });

    it('should return empty list when no groups match search', async () => {
      const result = await groupService.listGroups({ search: 'NonExistent' });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle empty database', async () => {
      // Delete all groups
      await runQuery(db, 'DELETE FROM groups');

      const result = await groupService.listGroups();

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getGroupMembers', () => {
    let testGroup: any;
    let user1Id: string;
    let user2Id: string;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });

      // Create test users
      const now = new Date().toISOString();
      user1Id = randomUUID();
      user2Id = randomUUID();

      await runQuery(db, `
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [user1Id, 'user1', 'user1@example.com', 'hash', 'User', 'One', 1, 0, now, now]);

      await runQuery(db, `
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [user2Id, 'user2', 'user2@example.com', 'hash', 'User', 'Two', 1, 0, now, now]);
    });

    it('should return empty array for group with no members', async () => {
      const members = await groupService.getGroupMembers(testGroup.id);

      expect(members).toHaveLength(0);
    });

    it('should return group members', async () => {
      // Add users to group
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?)
      `, [user1Id, testGroup.id, now]);

      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?)
      `, [user2Id, testGroup.id, now]);

      const members = await groupService.getGroupMembers(testGroup.id);

      expect(members).toHaveLength(2);
      expect(members.map(m => m.username)).toContain('user1');
      expect(members.map(m => m.username)).toContain('user2');
    });

    it('should sort members by username', async () => {
      // Add users to group
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?), (?, ?, ?)
      `, [user1Id, testGroup.id, now, user2Id, testGroup.id, now]);

      const members = await groupService.getGroupMembers(testGroup.id);

      expect(members[0].username).toBe('user1');
      expect(members[1].username).toBe('user2');
    });

    it('should return complete user information', async () => {
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?)
      `, [user1Id, testGroup.id, now]);

      const members = await groupService.getGroupMembers(testGroup.id);

      expect(members[0]).toHaveProperty('id');
      expect(members[0]).toHaveProperty('username');
      expect(members[0]).toHaveProperty('email');
      expect(members[0]).toHaveProperty('firstName');
      expect(members[0]).toHaveProperty('lastName');
      expect(members[0]).toHaveProperty('isActive');
      expect(members[0]).toHaveProperty('isAdmin');
    });
  });

  describe('getGroupMemberCount', () => {
    let testGroup: any;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });
    });

    it('should return 0 for group with no members', async () => {
      const count = await groupService.getGroupMemberCount(testGroup.id);

      expect(count).toBe(0);
    });

    it('should return correct member count', async () => {
      // Create and add users to group
      const now = new Date().toISOString();

      for (let i = 0; i < 5; i++) {
        const userId = randomUUID();
        await runQuery(db, `
          INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, `user${i}`, `user${i}@example.com`, 'hash', 'User', `${i}`, 1, 0, now, now]);

        await runQuery(db, `
          INSERT INTO user_groups (user_id, group_id, assigned_at)
          VALUES (?, ?, ?)
        `, [userId, testGroup.id, now]);
      }

      const count = await groupService.getGroupMemberCount(testGroup.id);

      expect(count).toBe(5);
    });

    it('should update count when members are added', async () => {
      const initialCount = await groupService.getGroupMemberCount(testGroup.id);
      expect(initialCount).toBe(0);

      // Add a member
      const userId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId, 'newuser', 'new@example.com', 'hash', 'New', 'User', 1, 0, now, now]);

      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?)
      `, [userId, testGroup.id, now]);

      const updatedCount = await groupService.getGroupMemberCount(testGroup.id);
      expect(updatedCount).toBe(1);
    });

    it('should update count when members are removed', async () => {
      // Add members
      const userId1 = randomUUID();
      const userId2 = randomUUID();
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [userId1, 'user1', 'user1@example.com', 'hash', 'User', 'One', 1, 0, now, now,
          userId2, 'user2', 'user2@example.com', 'hash', 'User', 'Two', 1, 0, now, now]);

      await runQuery(db, `
        INSERT INTO user_groups (user_id, group_id, assigned_at)
        VALUES (?, ?, ?), (?, ?, ?)
      `, [userId1, testGroup.id, now, userId2, testGroup.id, now]);

      const beforeRemove = await groupService.getGroupMemberCount(testGroup.id);
      expect(beforeRemove).toBe(2);

      // Remove one member
      await runQuery(db, `
        DELETE FROM user_groups WHERE user_id = ? AND group_id = ?
      `, [userId1, testGroup.id]);

      const afterRemove = await groupService.getGroupMemberCount(testGroup.id);
      expect(afterRemove).toBe(1);
    });
  });

  describe('assignRoleToGroup', () => {
    let testGroup: any;
    let testRole: any;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });

      // Create test role
      const roleId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'TestRole', 'Test role', 0, now, now]);

      testRole = { id: roleId, name: 'TestRole' };
    });

    it('should assign role to group (Requirement 4.7)', async () => {
      await groupService.assignRoleToGroup(testGroup.id, testRole.id);

      const roles = await groupService.getGroupRoles(testGroup.id);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRole.id);
      expect(roles[0].name).toBe(testRole.name);
    });

    it('should throw error if group not found', async () => {
      const nonExistentGroupId = randomUUID();

      await expect(
        groupService.assignRoleToGroup(nonExistentGroupId, testRole.id)
      ).rejects.toThrow('Group not found');
    });

    it('should throw error if role not found', async () => {
      const nonExistentRoleId = randomUUID();

      await expect(
        groupService.assignRoleToGroup(testGroup.id, nonExistentRoleId)
      ).rejects.toThrow('Role not found');
    });

    it('should throw error if role already assigned to group', async () => {
      await groupService.assignRoleToGroup(testGroup.id, testRole.id);

      await expect(
        groupService.assignRoleToGroup(testGroup.id, testRole.id)
      ).rejects.toThrow('Role is already assigned to this group');
    });

    it('should set assignedAt timestamp', async () => {
      const beforeAssign = new Date().toISOString();
      await groupService.assignRoleToGroup(testGroup.id, testRole.id);
      const afterAssign = new Date().toISOString();

      const assignment = await allQuery<{ groupId: string; roleId: string; assignedAt: string }>(db,
        `SELECT group_id    AS "groupId",
                role_id     AS "roleId",
                assigned_at AS "assignedAt"
           FROM group_roles WHERE group_id = ? AND role_id = ?`,
        [testGroup.id, testRole.id]
      );

      expect(assignment).toHaveLength(1);
      expect(assignment[0].assignedAt).toBeDefined();
      expect(assignment[0].assignedAt >= beforeAssign).toBe(true);
      expect(assignment[0].assignedAt <= afterAssign).toBe(true);
    });

    it('should allow assigning multiple roles to same group', async () => {
      // Create second role
      const role2Id = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [role2Id, 'TestRole2', 'Test role 2', 0, now, now]);

      await groupService.assignRoleToGroup(testGroup.id, testRole.id);
      await groupService.assignRoleToGroup(testGroup.id, role2Id);

      const roles = await groupService.getGroupRoles(testGroup.id);
      expect(roles).toHaveLength(2);
    });

    it('should allow assigning same role to multiple groups', async () => {
      const group2 = await groupService.createGroup({
        name: 'TestGroup2',
        description: 'Test 2'
      });

      await groupService.assignRoleToGroup(testGroup.id, testRole.id);
      await groupService.assignRoleToGroup(group2.id, testRole.id);

      const group1Roles = await groupService.getGroupRoles(testGroup.id);
      const group2Roles = await groupService.getGroupRoles(group2.id);

      expect(group1Roles).toHaveLength(1);
      expect(group2Roles).toHaveLength(1);
      expect(group1Roles[0].id).toBe(testRole.id);
      expect(group2Roles[0].id).toBe(testRole.id);
    });
  });

  describe('removeRoleFromGroup', () => {
    let testGroup: any;
    let testRole: any;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });

      // Create and assign test role
      const roleId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'TestRole', 'Test role', 0, now, now]);

      testRole = { id: roleId };

      await groupService.assignRoleToGroup(testGroup.id, testRole.id);
    });

    it('should remove role from group (Requirement 4.7)', async () => {
      await groupService.removeRoleFromGroup(testGroup.id, testRole.id);

      const roles = await groupService.getGroupRoles(testGroup.id);
      expect(roles).toHaveLength(0);
    });

    it('should throw error if role not assigned to group', async () => {
      const unassignedRoleId = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [unassignedRoleId, 'UnassignedRole', 'Not assigned', 0, now, now]);

      await expect(
        groupService.removeRoleFromGroup(testGroup.id, unassignedRoleId)
      ).rejects.toThrow('Role is not assigned to this group');
    });

    it('should only remove specified role', async () => {
      // Add second role
      const role2Id = randomUUID();
      const now = new Date().toISOString();
      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [role2Id, 'TestRole2', 'Test role 2', 0, now, now]);

      await groupService.assignRoleToGroup(testGroup.id, role2Id);

      // Remove first role
      await groupService.removeRoleFromGroup(testGroup.id, testRole.id);

      const roles = await groupService.getGroupRoles(testGroup.id);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(role2Id);
    });

    it('should allow reassigning role after removal', async () => {
      await groupService.removeRoleFromGroup(testGroup.id, testRole.id);
      await groupService.assignRoleToGroup(testGroup.id, testRole.id);

      const roles = await groupService.getGroupRoles(testGroup.id);
      expect(roles).toHaveLength(1);
      expect(roles[0].id).toBe(testRole.id);
    });
  });

  describe('getGroupRoles', () => {
    let testGroup: any;

    beforeEach(async () => {
      testGroup = await groupService.createGroup({
        name: 'TestGroup',
        description: 'Test'
      });
    });

    it('should return empty array for group with no roles (Requirement 4.7)', async () => {
      const roles = await groupService.getGroupRoles(testGroup.id);

      expect(roles).toHaveLength(0);
    });

    it('should return assigned roles', async () => {
      // Create and assign roles
      const role1Id = randomUUID();
      const role2Id = randomUUID();
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `, [role1Id, 'Role1', 'First role', 0, now, now,
          role2Id, 'Role2', 'Second role', 0, now, now]);

      await groupService.assignRoleToGroup(testGroup.id, role1Id);
      await groupService.assignRoleToGroup(testGroup.id, role2Id);

      const roles = await groupService.getGroupRoles(testGroup.id);

      expect(roles).toHaveLength(2);
      expect(roles.map(r => r.name)).toContain('Role1');
      expect(roles.map(r => r.name)).toContain('Role2');
    });

    it('should sort roles by name', async () => {
      // Create roles with names that will sort alphabetically
      const roleIds = ['Zebra', 'Alpha', 'Beta'].map(() => randomUUID());
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `, [roleIds[0], 'Zebra', 'Z role', 0, now, now,
          roleIds[1], 'Alpha', 'A role', 0, now, now,
          roleIds[2], 'Beta', 'B role', 0, now, now]);

      for (const roleId of roleIds) {
        await groupService.assignRoleToGroup(testGroup.id, roleId);
      }

      const roles = await groupService.getGroupRoles(testGroup.id);

      expect(roles[0].name).toBe('Alpha');
      expect(roles[1].name).toBe('Beta');
      expect(roles[2].name).toBe('Zebra');
    });

    it('should return complete role information', async () => {
      const roleId = randomUUID();
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [roleId, 'TestRole', 'Test description', 1, now, now]);

      await groupService.assignRoleToGroup(testGroup.id, roleId);

      const roles = await groupService.getGroupRoles(testGroup.id);

      expect(roles[0]).toHaveProperty('id');
      expect(roles[0]).toHaveProperty('name');
      expect(roles[0]).toHaveProperty('description');
      expect(roles[0]).toHaveProperty('isBuiltIn');
      expect(roles[0]).toHaveProperty('createdAt');
      expect(roles[0]).toHaveProperty('updatedAt');
      expect(roles[0].description).toBe('Test description');
      expect(roles[0].isBuiltIn).toBe(1);
    });

    it('should not return roles from other groups', async () => {
      const group2 = await groupService.createGroup({
        name: 'TestGroup2',
        description: 'Test 2'
      });

      // Create roles
      const role1Id = randomUUID();
      const role2Id = randomUUID();
      const now = new Date().toISOString();

      await runQuery(db, `
        INSERT INTO roles (id, name, description, is_built_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
      `, [role1Id, 'Role1', 'First role', 0, now, now,
          role2Id, 'Role2', 'Second role', 0, now, now]);

      // Assign role1 to testGroup, role2 to group2
      await groupService.assignRoleToGroup(testGroup.id, role1Id);
      await groupService.assignRoleToGroup(group2.id, role2Id);

      const group1Roles = await groupService.getGroupRoles(testGroup.id);
      const group2Roles = await groupService.getGroupRoles(group2.id);

      expect(group1Roles).toHaveLength(1);
      expect(group1Roles[0].id).toBe(role1Id);
      expect(group2Roles).toHaveLength(1);
      expect(group2Roles[0].id).toBe(role2Id);
    });
  });
});

// Helper functions
function runQuery(db: SQLiteAdapter, sql: string, params: any[] = []): Promise<void> {
  return db.execute(sql, params).then(() => {});
}

function allQuery<T>(db: SQLiteAdapter, sql: string, params: any[] = []): Promise<T[]> {
  return db.query<T>(sql, params);
}
