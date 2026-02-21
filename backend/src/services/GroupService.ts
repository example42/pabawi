import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';

/**
 * Group model from database
 */
export interface Group {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Group data transfer object
 */
export interface GroupDTO {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

/**
 * Create group data transfer object
 */
export interface CreateGroupDTO {
  name: string;
  description: string;
}

/**
 * Update group data transfer object
 */
export interface UpdateGroupDTO {
  name?: string;
  description?: string;
}

/**
 * Group filters for listing
 */
export interface GroupFilters {
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * User model (minimal for member queries)
 */
export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: number;
  isAdmin: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * Role model (minimal for role queries)
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  isBuiltIn: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Group service for managing groups and group-role relationships
 *
 * Responsibilities:
 * - Create, read, update, delete groups
 * - Manage group-role associations
 * - Query group membership
 * - Validate group data
 */
export class GroupService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new group
   *
   * @param data - Group creation data
   * @returns Created group
   * @throws Error if group name already exists
   */
  public async createGroup(data: CreateGroupDTO): Promise<Group> {
    // Validate group name uniqueness (Requirement 3.1)
    const existingGroup = await this.getGroupByName(data.name);
    if (existingGroup) {
      throw new Error('Group name already exists');
    }

    // Generate UUID for group
    const groupId = randomUUID();
    const now = new Date().toISOString();

    // Insert group
    await this.runQuery(
      `INSERT INTO groups (id, name, description, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [groupId, data.name, data.description, now, now]
    );

    // Fetch and return created group
    const group = await this.getGroupById(groupId);
    if (!group) {
      throw new Error('Failed to create group');
    }

    return group;
  }

  /**
   * Get group by ID
   *
   * @param id - Group ID
   * @returns Group or null if not found
   */
  public async getGroupById(id: string): Promise<Group | null> {
    return this.getQuery<Group>(
      'SELECT * FROM groups WHERE id = ?',
      [id]
    );
  }

  /**
   * Get group by name
   *
   * @param name - Group name
   * @returns Group or null if not found
   */
  private async getGroupByName(name: string): Promise<Group | null> {
    return this.getQuery<Group>(
      'SELECT * FROM groups WHERE name = ?',
      [name]
    );
  }

  /**
   * Update group
   *
   * @param id - Group ID
   * @param data - Update data
   * @returns Updated group
   * @throws Error if group not found or validation fails
   */
  public async updateGroup(id: string, data: UpdateGroupDTO): Promise<Group> {
    // Check if group exists
    const group = await this.getGroupById(id);
    if (!group) {
      throw new Error('Group not found');
    }

    // Validate name uniqueness if name is being updated
    if (data.name && data.name !== group.name) {
      const existingGroup = await this.getGroupByName(data.name);
      if (existingGroup) {
        throw new Error('Group name already exists');
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }

    // Always update updatedAt
    updates.push('updatedAt = ?');
    params.push(new Date().toISOString());

    // Add group ID to params
    params.push(id);

    // Execute update
    await this.runQuery(
      `UPDATE groups SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch and return updated group
    const updatedGroup = await this.getGroupById(id);
    if (!updatedGroup) {
      throw new Error('Failed to update group');
    }

    return updatedGroup;
  }

  /**
   * Delete group (hard delete - CASCADE will handle cleanup)
   *
   * @param id - Group ID
   * @throws Error if group not found
   */
  public async deleteGroup(id: string): Promise<void> {
    // Check if group exists
    const group = await this.getGroupById(id);
    if (!group) {
      throw new Error('Group not found');
    }

    // Hard delete: CASCADE will remove user_groups and group_roles associations
    await this.runQuery(
      'DELETE FROM groups WHERE id = ?',
      [id]
    );
  }

  /**
   * List groups with optional filters and pagination
   *
   * @param filters - Filter and pagination options
   * @returns Paginated list of groups
   */
  public async listGroups(filters?: GroupFilters): Promise<PaginatedResult<Group>> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.getQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM groups ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get paginated results
    const groups = await this.allQuery<Group>(
      `SELECT * FROM groups ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: groups,
      total,
      limit,
      offset
    };
  }

  /**
   * Get group members
   *
   * @param groupId - Group ID
   * @returns Array of users who are members of the group
   */
  public async getGroupMembers(groupId: string): Promise<User[]> {
    return this.allQuery<User>(
      `SELECT u.* FROM users u
       INNER JOIN user_groups ug ON ug.userId = u.id
       WHERE ug.groupId = ?
       ORDER BY u.username`,
      [groupId]
    );
  }

  /**
   * Get group member count
   *
   * @param groupId - Group ID
   * @returns Number of members in the group
   */
  public async getGroupMemberCount(groupId: string): Promise<number> {
    const result = await this.getQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_groups WHERE groupId = ?`,
      [groupId]
    );
    return result?.count || 0;
  }
  /**
     * Assign role to group
     *
     * @param groupId - Group ID
     * @param roleId - Role ID
     * @throws Error if group or role not found, or if assignment already exists
     */
    public async assignRoleToGroup(groupId: string, roleId: string): Promise<void> {
      // Check if group exists
      const group = await this.getGroupById(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check if role exists
      const role = await this.getQuery<Role>(
        'SELECT * FROM roles WHERE id = ?',
        [roleId]
      );
      if (!role) {
        throw new Error('Role not found');
      }

      // Check if assignment already exists
      const existing = await this.getQuery<{ groupId: string }>(
        'SELECT groupId FROM group_roles WHERE groupId = ? AND roleId = ?',
        [groupId, roleId]
      );
      if (existing) {
        throw new Error('Role is already assigned to this group');
      }

      // Create assignment
      await this.runQuery(
        'INSERT INTO group_roles (groupId, roleId, assignedAt) VALUES (?, ?, ?)',
        [groupId, roleId, new Date().toISOString()]
      );
    }

    /**
     * Remove role from group
     *
     * @param groupId - Group ID
     * @param roleId - Role ID
     * @throws Error if assignment doesn't exist
     */
    public async removeRoleFromGroup(groupId: string, roleId: string): Promise<void> {
      // Check if assignment exists
      const existing = await this.getQuery<{ groupId: string }>(
        'SELECT groupId FROM group_roles WHERE groupId = ? AND roleId = ?',
        [groupId, roleId]
      );
      if (!existing) {
        throw new Error('Role is not assigned to this group');
      }

      // Remove assignment
      await this.runQuery(
        'DELETE FROM group_roles WHERE groupId = ? AND roleId = ?',
        [groupId, roleId]
      );
    }

    /**
     * Get roles assigned to group
     *
     * @param groupId - Group ID
     * @returns Array of roles assigned to the group
     */
    public async getGroupRoles(groupId: string): Promise<Role[]> {
      return this.allQuery<Role>(
        `SELECT r.* FROM roles r
         INNER JOIN group_roles gr ON gr.roleId = r.id
         WHERE gr.groupId = ?
         ORDER BY r.name`,
        [groupId]
      );
    }

  /**
   * Helper: Run a query that doesn't return rows
   */
  private runQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Helper: Get a single row
   */
  private getQuery<T>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T || null);
      });
    });
  }

  /**
   * Helper: Get all rows
   */
  private allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[] || []);
      });
    });
  }
}
