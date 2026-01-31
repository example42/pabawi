/**
 * User Service - User Management Operations
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 6)
 *
 * Provides CRUD operations for user accounts with bcrypt password hashing.
 */

import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import type {
  User,
  UserPublic,
  UserRow,
  CreateUserInput,
  UpdateUserInput,
  UserGroupRow,
  UserRoleRow,
  PaginationOptions,
  PaginatedResult,
} from "./types.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Number of salt rounds for bcrypt password hashing
 */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Service for managing user accounts
 */
export class UserService {
  private logger: LoggerService;

  constructor(private db: DatabaseAdapter) {
    this.logger = new LoggerService();
  }

  /**
   * Create a new user account
   */
  async createUser(input: CreateUserInput): Promise<User> {
    this.logger.info("Creating new user", {
      component: "UserService",
      operation: "createUser",
      metadata: { username: input.username, email: input.email },
    });

    // Check for existing username or email
    const existingUser = await this.db.queryOne<UserRow>(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [input.username, input.email]
    );

    if (existingUser) {
      throw new Error(
        `User with username '${input.username}' or email '${input.email}' already exists`
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const user: User = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      groups: input.groups || [],
      roles: input.roles || [],
      active: input.active ?? true,
      createdAt: new Date(),
    };

    // Insert user
    await this.db.execute(
      `INSERT INTO users (id, username, email, password_hash, display_name, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.displayName || null,
        user.active ? 1 : 0,
        user.createdAt.toISOString(),
      ]
    );

    // Add user to groups
    for (const groupId of user.groups) {
      await this.db.execute(
        "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
        [user.id, groupId]
      );
    }

    // Add direct roles
    for (const roleId of user.roles) {
      await this.db.execute(
        "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
        [user.id, roleId]
      );
    }

    this.logger.info("User created successfully", {
      component: "UserService",
      operation: "createUser",
      metadata: { userId: user.id, username: user.username },
    });

    return user;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );

    if (!row) {
      return null;
    }

    return this.hydrateUser(row);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (!row) {
      return null;
    }

    return this.hydrateUser(row);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.db.queryOne<UserRow>(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (!row) {
      return null;
    }

    return this.hydrateUser(row);
  }

  /**
   * List users with pagination
   */
  async listUsers(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<UserPublic>> {
    const { limit = 50, offset = 0, sortBy = "created_at", sortOrder = "desc" } = options;

    // Validate sort field to prevent SQL injection
    const allowedSortFields = ["username", "email", "created_at", "last_login_at", "active"];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";
    const safeSortOrder = sortOrder === "asc" ? "ASC" : "DESC";

    const [rows, countResult] = await Promise.all([
      this.db.query<UserRow>(
        `SELECT * FROM users ORDER BY ${safeSortBy} ${safeSortOrder} LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      this.db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users"),
    ]);

    const total = countResult?.count ?? 0;
    const users = await Promise.all(rows.map((row) => this.hydrateUser(row)));

    return {
      items: users.map(this.toPublicUser),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Update a user
   */
  async updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
    this.logger.info("Updating user", {
      component: "UserService",
      operation: "updateUser",
      metadata: { userId: id },
    });

    const existingUser = await this.getUserById(id);
    if (!existingUser) {
      return null;
    }

    // Check for username/email conflicts
    if (input.username || input.email) {
      const conflict = await this.db.queryOne<UserRow>(
        "SELECT id FROM users WHERE id != ? AND (username = ? OR email = ?)",
        [id, input.username || existingUser.username, input.email || existingUser.email]
      );

      if (conflict) {
        throw new Error("Username or email already in use");
      }
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.username !== undefined) {
      updates.push("username = ?");
      params.push(input.username);
    }
    if (input.email !== undefined) {
      updates.push("email = ?");
      params.push(input.email);
    }
    if (input.password !== undefined) {
      updates.push("password_hash = ?");
      params.push(await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS));
    }
    if (input.displayName !== undefined) {
      updates.push("display_name = ?");
      params.push(input.displayName || null);
    }
    if (input.active !== undefined) {
      updates.push("active = ?");
      params.push(input.active ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(new Date().toISOString());
      params.push(id);

      await this.db.execute(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
    }

    // Update groups
    if (input.groups !== undefined) {
      await this.db.execute("DELETE FROM user_groups WHERE user_id = ?", [id]);
      for (const groupId of input.groups) {
        await this.db.execute(
          "INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
          [id, groupId]
        );
      }
    }

    // Update direct roles
    if (input.roles !== undefined) {
      await this.db.execute("DELETE FROM user_roles WHERE user_id = ?", [id]);
      for (const roleId of input.roles) {
        await this.db.execute(
          "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [id, roleId]
        );
      }
    }

    this.logger.info("User updated successfully", {
      component: "UserService",
      operation: "updateUser",
      metadata: { userId: id },
    });

    return this.getUserById(id);
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<boolean> {
    this.logger.info("Deleting user", {
      component: "UserService",
      operation: "deleteUser",
      metadata: { userId: id },
    });

    // Delete associations first
    await this.db.execute("DELETE FROM user_groups WHERE user_id = ?", [id]);
    await this.db.execute("DELETE FROM user_roles WHERE user_id = ?", [id]);

    const result = await this.db.execute("DELETE FROM users WHERE id = ?", [id]);

    const deleted = result.changes > 0;
    if (deleted) {
      this.logger.info("User deleted successfully", {
        component: "UserService",
        operation: "deleteUser",
        metadata: { userId: id },
      });
    }

    return deleted;
  }

  /**
   * Verify user password
   */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.db.execute(
      "UPDATE users SET last_login_at = ? WHERE id = ?",
      [new Date().toISOString(), id]
    );
  }

  /**
   * Get users by group ID
   */
  async getUsersByGroup(groupId: string): Promise<UserPublic[]> {
    const rows = await this.db.query<UserRow>(
      `SELECT u.* FROM users u
       INNER JOIN user_groups ug ON u.id = ug.user_id
       WHERE ug.group_id = ?`,
      [groupId]
    );

    const users = await Promise.all(rows.map((row) => this.hydrateUser(row)));
    return users.map(this.toPublicUser);
  }

  /**
   * Get users by role ID
   */
  async getUsersByRole(roleId: string): Promise<UserPublic[]> {
    const rows = await this.db.query<UserRow>(
      `SELECT u.* FROM users u
       INNER JOIN user_roles ur ON u.id = ur.user_id
       WHERE ur.role_id = ?`,
      [roleId]
    );

    const users = await Promise.all(rows.map((row) => this.hydrateUser(row)));
    return users.map(this.toPublicUser);
  }

  /**
   * Search users by username or email
   */
  async searchUsers(
    query: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<UserPublic>> {
    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    const [rows, countResult] = await Promise.all([
      this.db.query<UserRow>(
        `SELECT * FROM users
         WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?
         ORDER BY username ASC
         LIMIT ? OFFSET ?`,
        [searchPattern, searchPattern, searchPattern, limit, offset]
      ),
      this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users
         WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?`,
        [searchPattern, searchPattern, searchPattern]
      ),
    ]);

    const total = countResult?.count ?? 0;
    const users = await Promise.all(rows.map((row) => this.hydrateUser(row)));

    return {
      items: users.map(this.toPublicUser),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  /**
   * Hydrate a user row with groups and roles
   */
  private async hydrateUser(row: UserRow): Promise<User> {
    const [groupRows, roleRows] = await Promise.all([
      this.db.query<UserGroupRow>(
        "SELECT group_id FROM user_groups WHERE user_id = ?",
        [row.id]
      ),
      this.db.query<UserRoleRow>(
        "SELECT role_id FROM user_roles WHERE user_id = ?",
        [row.id]
      ),
    ]);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      displayName: row.display_name || undefined,
      groups: groupRows.map((g) => g.group_id),
      roles: roleRows.map((r) => r.role_id),
      active: row.active === 1,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
    };
  }

  /**
   * Convert User to UserPublic (strips sensitive data)
   */
  private toPublicUser(user: User): UserPublic {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      groups: user.groups,
      roles: user.roles,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
