/**
 * Group Service - Group Management Operations
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 6)
 *
 * Provides CRUD operations for user groups and group-role assignments.
 */

import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import type {
  Group,
  GroupRow,
  CreateGroupInput,
  UpdateGroupInput,
  GroupRoleRow,
  UserGroupRow,
  PaginationOptions,
  PaginatedResult,
} from "./types.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Service for managing user groups
 */
export class GroupService {
  private logger: LoggerService;

  constructor(private db: DatabaseAdapter) {
    this.logger = new LoggerService();
  }

  /**
   * Create a new group
   */
  async createGroup(input: CreateGroupInput): Promise<Group> {
    this.logger.info("Creating new group", {
      component: "GroupService",
      operation: "createGroup",
      metadata: { name: input.name },
    });

    // Check for existing group name
    const existingGroup = await this.db.queryOne<GroupRow>(
      "SELECT id FROM groups WHERE name = ?",
      [input.name]
    );

    if (existingGroup) {
      throw new Error(`Group with name '${input.name}' already exists`);
    }

    const group: Group = {
      id: randomUUID(),
      name: input.name,
      description: input.description || "",
      roles: input.roles || [],
      members: input.members || [],
      createdAt: new Date(),
    };

    // Insert group
    await this.db.execute(
      `INSERT INTO groups (id, name, description, created_at)
       VALUES (?, ?, ?, ?)`,
      [group.id, group.name, group.description, group.createdAt.toISOString()]
    );

    // Add roles to group
    for (const roleId of group.roles) {
      await this.db.execute(
        "INSERT INTO group_roles (group_id, role_id) VALUES (?, ?)",
        [group.id, roleId]
      );
    }

    // Add members to group
    for (const userId of group.members) {
      await this.db.execute(
        "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
        [userId, group.id]
      );
    }

    this.logger.info("Group created successfully", {
      component: "GroupService",
      operation: "createGroup",
      metadata: { groupId: group.id, name: group.name },
    });

    return group;
  }

  /**
   * Get group by ID
   */
  async getGroupById(id: string): Promise<Group | null> {
    const row = await this.db.queryOne<GroupRow>(
      "SELECT * FROM groups WHERE id = ?",
      [id]
    );

    if (!row) {
      return null;
    }

    return this.hydrateGroup(row);
  }

  /**
   * Get group by name
   */
  async getGroupByName(name: string): Promise<Group | null> {
    const row = await this.db.queryOne<GroupRow>(
      "SELECT * FROM groups WHERE name = ?",
      [name]
    );

    if (!row) {
      return null;
    }

    return this.hydrateGroup(row);
  }

  /**
   * List groups with pagination
   */
  async listGroups(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Group>> {
    const { limit = 50, offset = 0, sortBy = "name", sortOrder = "asc" } = options;

    // Validate sort field to prevent SQL injection
    const allowedSortFields = ["name", "created_at"];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "name";
    const safeSortOrder = sortOrder === "desc" ? "DESC" : "ASC";

    const [rows, countResult] = await Promise.all([
      this.db.query<GroupRow>(
        `SELECT * FROM groups ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      this.db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM groups"),
    ]);

    const total = countResult?.count ?? 0;
    const groups = await Promise.all(rows.map((row) => this.hydrateGroup(row)));

    return {
      items: groups,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Update a group
   */
  async updateGroup(id: string, input: UpdateGroupInput): Promise<Group | null> {
    this.logger.info("Updating group", {
      component: "GroupService",
      operation: "updateGroup",
      metadata: { groupId: id },
    });

    const existingGroup = await this.getGroupById(id);
    if (!existingGroup) {
      return null;
    }

    // Check for name conflict
    if (input.name && input.name !== existingGroup.name) {
      const conflict = await this.db.queryOne<GroupRow>(
        "SELECT id FROM groups WHERE id != ? AND name = ?",
        [id, input.name]
      );

      if (conflict) {
        throw new Error("Group name already in use");
      }
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(new Date().toISOString());
      params.push(id);

      await this.db.execute(
        `UPDATE groups SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update roles
    if (input.roles !== undefined) {
      await this.db.execute("DELETE FROM group_roles WHERE group_id = ?", [id]);
      for (const roleId of input.roles) {
        await this.db.execute(
          "INSERT INTO group_roles (group_id, role_id) VALUES (?, ?)",
          [id, roleId]
        );
      }
    }

    // Update members
    if (input.members !== undefined) {
      await this.db.execute("DELETE FROM user_groups WHERE group_id = ?", [id]);
      for (const userId of input.members) {
        await this.db.execute(
          "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
          [userId, id]
        );
      }
    }

    this.logger.info("Group updated successfully", {
      component: "GroupService",
      operation: "updateGroup",
      metadata: { groupId: id },
    });

    return this.getGroupById(id);
  }

  /**
   * Delete a group
   */
  async deleteGroup(id: string): Promise<boolean> {
    this.logger.info("Deleting group", {
      component: "GroupService",
      operation: "deleteGroup",
      metadata: { groupId: id },
    });

    // Delete associations first
    await this.db.execute("DELETE FROM user_groups WHERE group_id = ?", [id]);
    await this.db.execute("DELETE FROM group_roles WHERE group_id = ?", [id]);

    const result = await this.db.execute("DELETE FROM groups WHERE id = ?", [id]);

    const deleted = result.changes > 0;
    if (deleted) {
      this.logger.info("Group deleted successfully", {
        component: "GroupService",
        operation: "deleteGroup",
        metadata: { groupId: id },
      });
    }

    return deleted;
  }

  /**
   * Add a user to a group
   */
  async addMember(groupId: string, userId: string): Promise<void> {
    this.logger.info("Adding member to group", {
      component: "GroupService",
      operation: "addMember",
      metadata: { groupId, userId },
    });

    // Check if already a member
    const existing = await this.db.queryOne<UserGroupRow>(
      "SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?",
      [userId, groupId]
    );

    if (!existing) {
      await this.db.execute(
        "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
        [userId, groupId]
      );
    }
  }

  /**
   * Remove a user from a group
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    this.logger.info("Removing member from group", {
      component: "GroupService",
      operation: "removeMember",
      metadata: { groupId, userId },
    });

    await this.db.execute(
      "DELETE FROM user_groups WHERE user_id = ? AND group_id = ?",
      [userId, groupId]
    );
  }

  /**
   * Add a role to a group
   */
  async addRole(groupId: string, roleId: string): Promise<void> {
    this.logger.info("Adding role to group", {
      component: "GroupService",
      operation: "addRole",
      metadata: { groupId, roleId },
    });

    // Check if already assigned
    const existing = await this.db.queryOne<GroupRoleRow>(
      "SELECT * FROM group_roles WHERE group_id = ? AND role_id = ?",
      [groupId, roleId]
    );

    if (!existing) {
      await this.db.execute(
        "INSERT INTO group_roles (group_id, role_id) VALUES (?, ?)",
        [groupId, roleId]
      );
    }
  }

  /**
   * Remove a role from a group
   */
  async removeRole(groupId: string, roleId: string): Promise<void> {
    this.logger.info("Removing role from group", {
      component: "GroupService",
      operation: "removeRole",
      metadata: { groupId, roleId },
    });

    await this.db.execute(
      "DELETE FROM group_roles WHERE group_id = ? AND role_id = ?",
      [groupId, roleId]
    );
  }

  /**
   * Get groups for a user
   */
  async getGroupsForUser(userId: string): Promise<Group[]> {
    const rows = await this.db.query<GroupRow>(
      `SELECT g.* FROM groups g
       INNER JOIN user_groups ug ON g.id = ug.group_id
       WHERE ug.user_id = ?`,
      [userId]
    );

    return Promise.all(rows.map((row) => this.hydrateGroup(row)));
  }

  /**
   * Search groups by name
   */
  async searchGroups(
    query: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Group>> {
    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    const [rows, countResult] = await Promise.all([
      this.db.query<GroupRow>(
        `SELECT * FROM groups
         WHERE name LIKE ? OR description LIKE ?
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        [searchPattern, searchPattern, limit, offset]
      ),
      this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM groups
         WHERE name LIKE ? OR description LIKE ?`,
        [searchPattern, searchPattern]
      ),
    ]);

    const total = countResult?.count ?? 0;
    const groups = await Promise.all(rows.map((row) => this.hydrateGroup(row)));

    return {
      items: groups,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Hydrate a group row with roles and members
   */
  private async hydrateGroup(row: GroupRow): Promise<Group> {
    const [roleRows, memberRows] = await Promise.all([
      this.db.query<GroupRoleRow>(
        "SELECT role_id FROM group_roles WHERE group_id = ?",
        [row.id]
      ),
      this.db.query<UserGroupRow>(
        "SELECT user_id FROM user_groups WHERE group_id = ?",
        [row.id]
      ),
    ]);

    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      roles: roleRows.map((r) => r.role_id),
      members: memberRows.map((m) => m.user_id),
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }
}
