/**
 * Role Service - Role & Permission Management Operations
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 6)
 *
 * Provides CRUD operations for roles and permissions, including
 * built-in system roles initialization.
 */

import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import type {
  Role,
  RoleRow,
  Permission,
  PermissionRow,
  CreateRoleInput,
  UpdateRoleInput,
  PaginationOptions,
  PaginatedResult,
  BuiltInRoleName,
} from "./types.js";
import { DefaultRolePermissions, BuiltInRoles } from "./types.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Service for managing roles and permissions
 */
export class RoleService {
  private logger: LoggerService;

  constructor(private db: DatabaseAdapter) {
    this.logger = new LoggerService();
  }

  /**
   * Initialize built-in system roles
   */
  async initializeBuiltInRoles(): Promise<void> {
    this.logger.info("Initializing built-in roles", {
      component: "RoleService",
      operation: "initializeBuiltInRoles",
    });

    const builtInRoles: Array<{
      name: BuiltInRoleName;
      description: string;
      priority: number;
    }> = [
      {
        name: BuiltInRoles.ADMIN,
        description: "Full system administrator with all permissions",
        priority: 1000,
      },
      {
        name: BuiltInRoles.OPERATOR,
        description: "Can execute commands and tasks, view inventory and facts",
        priority: 500,
      },
      {
        name: BuiltInRoles.VIEWER,
        description: "Read-only access to inventory, facts, and execution history",
        priority: 100,
      },
      {
        name: BuiltInRoles.ANONYMOUS,
        description: "Unauthenticated access (health checks only)",
        priority: 0,
      },
    ];

    for (const roleConfig of builtInRoles) {
      // Check if role already exists
      const existing = await this.db.queryOne<RoleRow>(
        "SELECT id FROM roles WHERE name = ?",
        [roleConfig.name]
      );

      if (!existing) {
        const roleId = randomUUID();
        const now = new Date().toISOString();

        // Create role
        await this.db.execute(
          `INSERT INTO roles (id, name, description, priority, is_system, created_at)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [roleId, roleConfig.name, roleConfig.description, roleConfig.priority, now]
        );

        // Add default permissions
        const permissions = DefaultRolePermissions[roleConfig.name];
        for (const permission of permissions) {
          await this.db.execute(
            `INSERT INTO permissions (id, role_id, capability, action, conditions)
             VALUES (?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              roleId,
              permission.capability,
              permission.action,
              permission.conditions ? JSON.stringify(permission.conditions) : null,
            ]
          );
        }

        this.logger.info("Created built-in role", {
          component: "RoleService",
          operation: "initializeBuiltInRoles",
          metadata: { roleName: roleConfig.name, roleId },
        });
      }
    }
  }

  /**
   * Create a new role
   */
  async createRole(input: CreateRoleInput): Promise<Role> {
    this.logger.info("Creating new role", {
      component: "RoleService",
      operation: "createRole",
      metadata: { name: input.name },
    });

    // Check for existing role name
    const existingRole = await this.db.queryOne<RoleRow>(
      "SELECT id FROM roles WHERE name = ?",
      [input.name]
    );

    if (existingRole) {
      throw new Error(`Role with name '${input.name}' already exists`);
    }

    const role: Role = {
      id: randomUUID(),
      name: input.name,
      description: input.description || "",
      permissions: input.permissions || [],
      priority: input.priority ?? 0,
      isSystem: false,
      createdAt: new Date(),
    };

    // Insert role
    await this.db.execute(
      `INSERT INTO roles (id, name, description, priority, is_system, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [role.id, role.name, role.description, role.priority, role.createdAt.toISOString()]
    );

    // Add permissions
    for (const permission of role.permissions) {
      await this.db.execute(
        `INSERT INTO permissions (id, role_id, capability, action, conditions)
         VALUES (?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          role.id,
          permission.capability,
          permission.action,
          permission.conditions ? JSON.stringify(permission.conditions) : null,
        ]
      );
    }

    this.logger.info("Role created successfully", {
      component: "RoleService",
      operation: "createRole",
      metadata: { roleId: role.id, name: role.name },
    });

    return role;
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: string): Promise<Role | null> {
    const row = await this.db.queryOne<RoleRow>(
      "SELECT * FROM roles WHERE id = ?",
      [id]
    );

    if (!row) {
      return null;
    }

    return this.hydrateRole(row);
  }

  /**
   * Get role by name
   */
  async getRoleByName(name: string): Promise<Role | null> {
    const row = await this.db.queryOne<RoleRow>(
      "SELECT * FROM roles WHERE name = ?",
      [name]
    );

    if (!row) {
      return null;
    }

    return this.hydrateRole(row);
  }

  /**
   * List roles with pagination
   */
  async listRoles(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Role>> {
    const { limit = 50, offset = 0, sortBy = "priority", sortOrder = "desc" } = options;

    // Validate sort field to prevent SQL injection
    const allowedSortFields = ["name", "priority", "created_at"];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "priority";
    const safeSortOrder = sortOrder === "asc" ? "ASC" : "DESC";

    const [rows, countResult] = await Promise.all([
      this.db.query<RoleRow>(
        `SELECT * FROM roles ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      this.db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM roles"),
    ]);

    const total = countResult?.count ?? 0;
    const roles = await Promise.all(rows.map((row) => this.hydrateRole(row)));

    return {
      items: roles,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Update a role
   */
  async updateRole(id: string, input: UpdateRoleInput): Promise<Role | null> {
    this.logger.info("Updating role", {
      component: "RoleService",
      operation: "updateRole",
      metadata: { roleId: id },
    });

    const existingRole = await this.getRoleById(id);
    if (!existingRole) {
      return null;
    }

    // Prevent modification of system roles (except permissions)
    if (existingRole.isSystem && (input.name || input.priority !== undefined)) {
      throw new Error("Cannot modify name or priority of system roles");
    }

    // Check for name conflict
    if (input.name && input.name !== existingRole.name) {
      const conflict = await this.db.queryOne<RoleRow>(
        "SELECT id FROM roles WHERE id != ? AND name = ?",
        [id, input.name]
      );

      if (conflict) {
        throw new Error("Role name already in use");
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
    if (input.priority !== undefined) {
      updates.push("priority = ?");
      params.push(input.priority);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(new Date().toISOString());
      params.push(id);

      await this.db.execute(
        `UPDATE roles SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update permissions
    if (input.permissions !== undefined) {
      await this.db.execute("DELETE FROM permissions WHERE role_id = ?", [id]);
      for (const permission of input.permissions) {
        await this.db.execute(
          `INSERT INTO permissions (id, role_id, capability, action, conditions)
           VALUES (?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            id,
            permission.capability,
            permission.action,
            permission.conditions ? JSON.stringify(permission.conditions) : null,
          ]
        );
      }
    }

    this.logger.info("Role updated successfully", {
      component: "RoleService",
      operation: "updateRole",
      metadata: { roleId: id },
    });

    return this.getRoleById(id);
  }

  /**
   * Delete a role
   */
  async deleteRole(id: string): Promise<boolean> {
    this.logger.info("Deleting role", {
      component: "RoleService",
      operation: "deleteRole",
      metadata: { roleId: id },
    });

    // Check if system role
    const role = await this.getRoleById(id);
    if (role?.isSystem) {
      throw new Error("Cannot delete system roles");
    }

    // Delete associations first
    await this.db.execute("DELETE FROM permissions WHERE role_id = ?", [id]);
    await this.db.execute("DELETE FROM user_roles WHERE role_id = ?", [id]);
    await this.db.execute("DELETE FROM group_roles WHERE role_id = ?", [id]);

    const result = await this.db.execute("DELETE FROM roles WHERE id = ?", [id]);

    const deleted = result.changes > 0;
    if (deleted) {
      this.logger.info("Role deleted successfully", {
        component: "RoleService",
        operation: "deleteRole",
        metadata: { roleId: id },
      });
    }

    return deleted;
  }

  /**
   * Add a permission to a role
   */
  async addPermission(roleId: string, permission: Permission): Promise<void> {
    this.logger.info("Adding permission to role", {
      component: "RoleService",
      operation: "addPermission",
      metadata: { roleId, capability: permission.capability },
    });

    // Check if permission already exists
    const existing = await this.db.queryOne<PermissionRow>(
      "SELECT id FROM permissions WHERE role_id = ? AND capability = ?",
      [roleId, permission.capability]
    );

    if (existing) {
      // Update existing permission
      await this.db.execute(
        `UPDATE permissions SET action = ?, conditions = ? WHERE id = ?`,
        [
          permission.action,
          permission.conditions ? JSON.stringify(permission.conditions) : null,
          existing.id,
        ]
      );
    } else {
      // Create new permission
      await this.db.execute(
        `INSERT INTO permissions (id, role_id, capability, action, conditions)
         VALUES (?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          roleId,
          permission.capability,
          permission.action,
          permission.conditions ? JSON.stringify(permission.conditions) : null,
        ]
      );
    }
  }

  /**
   * Remove a permission from a role
   */
  async removePermission(roleId: string, capability: string): Promise<void> {
    this.logger.info("Removing permission from role", {
      component: "RoleService",
      operation: "removePermission",
      metadata: { roleId, capability },
    });

    await this.db.execute(
      "DELETE FROM permissions WHERE role_id = ? AND capability = ?",
      [roleId, capability]
    );
  }

  /**
   * Get roles for a user (direct assignments)
   */
  async getRolesForUser(userId: string): Promise<Role[]> {
    const rows = await this.db.query<RoleRow>(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.priority DESC`,
      [userId]
    );

    return Promise.all(rows.map((row) => this.hydrateRole(row)));
  }

  /**
   * Get roles for a group
   */
  async getRolesForGroup(groupId: string): Promise<Role[]> {
    const rows = await this.db.query<RoleRow>(
      `SELECT r.* FROM roles r
       INNER JOIN group_roles gr ON r.id = gr.role_id
       WHERE gr.group_id = ?
       ORDER BY r.priority DESC`,
      [groupId]
    );

    return Promise.all(rows.map((row) => this.hydrateRole(row)));
  }

  /**
   * Get effective roles for a user (including from groups)
   */
  async getEffectiveRolesForUser(userId: string, groupIds: string[]): Promise<Role[]> {
    // Get direct user roles
    const directRoles = await this.getRolesForUser(userId);
    const roleIds = new Set(directRoles.map((r) => r.id));

    // Get roles from groups
    for (const groupId of groupIds) {
      const groupRoles = await this.getRolesForGroup(groupId);
      for (const role of groupRoles) {
        if (!roleIds.has(role.id)) {
          roleIds.add(role.id);
          directRoles.push(role);
        }
      }
    }

    // Sort by priority (highest first)
    return directRoles.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if a capability matches a permission pattern
   */
  matchesCapability(pattern: string, capability: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return capability === prefix || capability.startsWith(prefix + ".");
    }

    return pattern === capability;
  }

  /**
   * Search roles by name
   */
  async searchRoles(
    query: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Role>> {
    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    const [rows, countResult] = await Promise.all([
      this.db.query<RoleRow>(
        `SELECT * FROM roles
         WHERE name LIKE ? OR description LIKE ?
         ORDER BY priority DESC
         LIMIT ? OFFSET ?`,
        [searchPattern, searchPattern, limit, offset]
      ),
      this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM roles
         WHERE name LIKE ? OR description LIKE ?`,
        [searchPattern, searchPattern]
      ),
    ]);

    const total = countResult?.count ?? 0;
    const roles = await Promise.all(rows.map((row) => this.hydrateRole(row)));

    return {
      items: roles,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Hydrate a role row with permissions
   */
  private async hydrateRole(row: RoleRow): Promise<Role> {
    const permissionRows = await this.db.query<PermissionRow>(
      "SELECT * FROM permissions WHERE role_id = ?",
      [row.id]
    );

    const permissions: Permission[] = permissionRows.map((p) => ({
      capability: p.capability,
      action: p.action as "allow" | "deny",
      conditions: p.conditions ? JSON.parse(p.conditions) : undefined,
    }));

    return {
      id: row.id,
      name: row.name,
      description: row.description || "",
      permissions,
      priority: row.priority,
      isSystem: row.is_system === 1,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }
}
