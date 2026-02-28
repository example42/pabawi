import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';

/**
 * Role model from database
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
 * Role data transfer object
 */
export interface RoleDTO {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create role data transfer object
 */
export interface CreateRoleDTO {
  name: string;
  description: string;
}

/**
 * Update role data transfer object
 */
export interface UpdateRoleDTO {
  name?: string;
  description?: string;
}

/**
 * Role filters for listing
 */
export interface RoleFilters {
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
 * Permission model (minimal for permission queries)
 */
export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
  createdAt: string;
}

/**
 * Role service for managing roles and role-permission relationships
 *
 * Responsibilities:
 * - Create, read, update, delete roles
 * - Manage role-permission associations
 * - Protect built-in system roles
 * - Validate role data
 */
export class RoleService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new role
   *
   * @param data - Role creation data
   * @returns Created role
   * @throws Error if role name already exists or validation fails
   */
  public async createRole(data: CreateRoleDTO): Promise<Role> {
    // Validate role name length (3-100 characters)
    if (!data.name || data.name.length < 3 || data.name.length > 100) {
      throw new Error('Role name must be between 3 and 100 characters');
    }

    // Validate description length (0-500 characters)
    if (data.description && data.description.length > 500) {
      throw new Error('Role description must not exceed 500 characters');
    }

    // Validate role name uniqueness (Requirement 4.1)
    const existingRole = await this.getRoleByName(data.name);
    if (existingRole) {
      throw new Error('Role name already exists');
    }

    // Generate UUID for role
    const roleId = randomUUID();
    const now = new Date().toISOString();

    // Insert role (isBuiltIn defaults to 0 for custom roles)
    await this.runQuery(
      `INSERT INTO roles (id, name, description, isBuiltIn, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [roleId, data.name, data.description || '', now, now]
    );

    // Fetch and return created role
    const role = await this.getRoleById(roleId);
    if (!role) {
      throw new Error('Failed to create role');
    }

    return role;
  }

  /**
   * Get role by ID
   *
   * @param id - Role ID
   * @returns Role or null if not found
   */
  public async getRoleById(id: string): Promise<Role | null> {
    return this.getQuery<Role>(
      'SELECT * FROM roles WHERE id = ?',
      [id]
    );
  }

  /**
   * Get role by name
   *
   * @param name - Role name
   * @returns Role or null if not found
   */
  private async getRoleByName(name: string): Promise<Role | null> {
    return this.getQuery<Role>(
      'SELECT * FROM roles WHERE name = ?',
      [name]
    );
  }

  /**
   * Update role
   *
   * @param id - Role ID
   * @param data - Update data
   * @returns Updated role
   * @throws Error if role not found, is built-in (name change), or validation fails
   */
  public async updateRole(id: string, data: UpdateRoleDTO): Promise<Role> {
    // Check if role exists
    const role = await this.getRoleById(id);
    if (!role) {
      throw new Error('Role not found');
    }

    // Protect built-in roles from name changes (Requirement 17.5)
    if (data.name && data.name !== role.name && role.isBuiltIn === 1) {
      throw new Error('Cannot modify name of built-in role');
    }

    // Validate name length if provided
    if (data.name && (data.name.length < 3 || data.name.length > 100)) {
      throw new Error('Role name must be between 3 and 100 characters');
    }

    // Validate description length if provided
    if (data.description !== undefined && data.description.length > 500) {
      throw new Error('Role description must not exceed 500 characters');
    }

    // Validate name uniqueness if name is being updated
    if (data.name && data.name !== role.name) {
      const existingRole = await this.getRoleByName(data.name);
      if (existingRole) {
        throw new Error('Role name already exists');
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

    // Add role ID to params
    params.push(id);

    // Execute update
    await this.runQuery(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch and return updated role
    const updatedRole = await this.getRoleById(id);
    if (!updatedRole) {
      throw new Error('Failed to update role');
    }

    return updatedRole;
  }

  /**
   * Delete role
   *
   * @param id - Role ID
   * @throws Error if role not found or is built-in (Requirement 17.4)
   */
  public async deleteRole(id: string): Promise<void> {
    // Check if role exists
    const role = await this.getRoleById(id);
    if (!role) {
      throw new Error('Role not found');
    }

    // Protect built-in roles from deletion (Requirement 17.4)
    if (role.isBuiltIn === 1) {
      throw new Error('Cannot delete built-in role');
    }

    // Hard delete: CASCADE will remove user_roles, group_roles, and role_permissions associations
    await this.runQuery(
      'DELETE FROM roles WHERE id = ?',
      [id]
    );
  }

  /**
   * List roles with optional filters and pagination
   *
   * @param filters - Filter and pagination options
   * @returns Paginated list of roles
   */
  public async listRoles(filters?: RoleFilters): Promise<PaginatedResult<Role>> {
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
      `SELECT COUNT(*) as count FROM roles ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get paginated results
    const roles = await this.allQuery<Role>(
      `SELECT * FROM roles ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: roles,
      total,
      limit,
      offset
    };
  }

  /**
   * Get built-in system roles
   *
   * @returns Array of built-in roles (Viewer, Operator, Administrator)
   */
  public async getBuiltInRoles(): Promise<Role[]> {
    return this.allQuery<Role>(
      'SELECT * FROM roles WHERE isBuiltIn = 1 ORDER BY name',
      []
    );
  }

  /**
   * Check if a role is built-in
   *
   * @param roleId - Role ID
   * @returns True if role is built-in, false otherwise
   */
  public async isBuiltInRole(roleId: string): Promise<boolean> {
    const role = await this.getRoleById(roleId);
    return role ? role.isBuiltIn === 1 : false;
  }

  /**
   * Assign permission to role
   *
   * @param roleId - Role ID
   * @param permissionId - Permission ID
   * @throws Error if role or permission not found, or if assignment already exists
   */
  public async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    // Check if role exists
    const role = await this.getRoleById(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if permission exists
    const permission = await this.getQuery<Permission>(
      'SELECT * FROM permissions WHERE id = ?',
      [permissionId]
    );
    if (!permission) {
      throw new Error('Permission not found');
    }

    // Check if assignment already exists
    const existing = await this.getQuery<{ roleId: string }>(
      'SELECT roleId FROM role_permissions WHERE roleId = ? AND permissionId = ?',
      [roleId, permissionId]
    );
    if (existing) {
      throw new Error('Permission is already assigned to this role');
    }

    // Create assignment
    await this.runQuery(
      'INSERT INTO role_permissions (roleId, permissionId, assignedAt) VALUES (?, ?, ?)',
      [roleId, permissionId, new Date().toISOString()]
    );
  }

  /**
   * Remove permission from role
   *
   * @param roleId - Role ID
   * @param permissionId - Permission ID
   * @throws Error if assignment doesn't exist
   */
  public async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    // Check if assignment exists
    const existing = await this.getQuery<{ roleId: string }>(
      'SELECT roleId FROM role_permissions WHERE roleId = ? AND permissionId = ?',
      [roleId, permissionId]
    );
    if (!existing) {
      throw new Error('Permission is not assigned to this role');
    }

    // Remove assignment
    await this.runQuery(
      'DELETE FROM role_permissions WHERE roleId = ? AND permissionId = ?',
      [roleId, permissionId]
    );
  }

  /**
   * Get permissions assigned to role
   *
   * @param roleId - Role ID
   * @returns Array of permissions assigned to the role
   */
  public async getRolePermissions(roleId: string): Promise<Permission[]> {
    return this.allQuery<Permission>(
      `SELECT p.* FROM permissions p
       INNER JOIN role_permissions rp ON rp.permissionId = p.id
       WHERE rp.roleId = ?
       ORDER BY p.resource, p.action`,
      [roleId]
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
