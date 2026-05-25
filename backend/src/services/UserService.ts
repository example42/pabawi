import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import { randomUUID } from 'crypto';
import type { AuthenticationService } from './AuthenticationService';
import { SetupService } from './SetupService';
import { validatePassword } from '../utils/passwordValidation';

/**
 * User model from database
 */
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isActive: number;
  isAdmin: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * Column list for SELECTs that hydrate the User interface.
 *
 * The DB schema is snake_case (see .kiro/steering/database-conventions.md);
 * each row column is aliased to the camelCase TS field. Use this constant
 * instead of `SELECT *` so adding a column to the DB does not silently
 * change the row shape.
 */
const USER_COLUMNS = `id, username, email,
  password_hash AS "passwordHash",
  first_name    AS "firstName",
  last_name     AS "lastName",
  is_active     AS "isActive",
  is_admin      AS "isAdmin",
  created_at    AS "createdAt",
  updated_at    AS "updatedAt",
  last_login_at AS "lastLoginAt"`;

const GROUP_COLUMNS = `id, name, description,
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

const ROLE_COLUMNS = `id, name, description,
  is_built_in AS "isBuiltIn",
  created_at  AS "createdAt",
  updated_at  AS "updatedAt"`;

/**
 * User data transfer object (without password)
 */
export interface UserDTO {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * Create user data transfer object
 */
export interface CreateUserDTO {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive?: boolean;
  isAdmin?: boolean;
}

/**
 * Update user data transfer object
 */
export interface UpdateUserDTO {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  isActive?: boolean;
  isAdmin?: boolean;
}

/**
 * User filters for listing
 */
export interface UserFilters {
  limit?: number;
  offset?: number;
  isActive?: boolean;
  isAdmin?: boolean;
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
 * Group model
 */
export interface Group {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Role model
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
 * User service for managing user accounts, profiles, and user-group/role relationships
 *
 * Responsibilities:
 * - Create, read, update, delete user accounts
 * - Manage user-group associations
 * - Manage user-role assignments
 * - Handle user activation/deactivation
 * - Validate user data
 */
export class UserService {
  private db: DatabaseAdapter;
  private authService: AuthenticationService;
  private setupService: SetupService;

  constructor(db: DatabaseAdapter, authService: AuthenticationService) {
    this.db = db;
    this.authService = authService;
    this.setupService = new SetupService(db);
  }

  /**
   * Create a new user
   *
   * @param data - User creation data
   * @returns Created user
   * @throws Error if username or email already exists
   */
  public async createUser(data: CreateUserDTO): Promise<User> {
    // Validate username uniqueness
    const existingUsername = await this.getUserByUsername(data.username);
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Validate email uniqueness
    const existingEmail = await this.getUserByEmail(data.email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Validate password complexity
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password
    const passwordHash = await this.authService.hashPassword(data.password);

    // Generate UUID for user
    const userId = randomUUID();
    const now = new Date().toISOString();

    // Insert user
    await this.db.execute(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.username,
        data.email,
        passwordHash,
        data.firstName,
        data.lastName,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1, // isActive defaults to true
        data.isAdmin ? 1 : 0,
        now,
        now
      ]
    );

    // Assign default role to new users (unless they're admin)
    // Role is determined by setup configuration
    if (!data.isAdmin) {
      const defaultRoleId = await this.setupService.getDefaultNewUserRole();
      if (defaultRoleId) {
        await this.db.execute(
          `INSERT INTO user_roles (user_id, role_id, assigned_at)
           VALUES (?, ?, ?)`,
          [userId, defaultRoleId, now]
        );
      }
    }

    // Fetch and return created user
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  /**
   * Get user by ID
   *
   * @param id - User ID
   * @returns User or null if not found
   */
  public async getUserById(id: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get user by username
   *
   * @param username - Username
   * @returns User or null if not found
   */
  public async getUserByUsername(username: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE username = ?`,
      [username]
    );
  }

  /**
   * Get user by email
   *
   * @param email - Email address
   * @returns User or null if not found
   */
  private async getUserByEmail(email: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = ?`,
      [email]
    );
  }

  /**
   * Update user
   *
   * @param id - User ID
   * @param data - Update data
   * @returns Updated user
   * @throws Error if user not found or validation fails
   */
  public async updateUser(id: string, data: UpdateUserDTO): Promise<User> {
    // Check if user exists
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate email uniqueness if email is being updated
    if (data.email && data.email !== user.email) {
      const existingEmail = await this.getUserByEmail(data.email);
      if (existingEmail) {
        throw new Error('Email already exists');
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }

    if (data.firstName !== undefined) {
      updates.push('first_name = ?');
      params.push(data.firstName);
    }

    if (data.lastName !== undefined) {
      updates.push('last_name = ?');
      params.push(data.lastName);
    }

    if (data.password !== undefined) {
      // Validate password complexity
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }

      const passwordHash = await this.authService.hashPassword(data.password);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (data.isAdmin !== undefined) {
      updates.push('is_admin = ?');
      params.push(data.isAdmin ? 1 : 0);
    }

    // Always update updated_at
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    // Add user ID to params
    params.push(id);

    // Execute update
    await this.db.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch and return updated user
    const updatedUser = await this.getUserById(id);
    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    return updatedUser;
  }

  /**
   * Delete user (soft delete - sets isActive to 0)
   *
   * @param id - User ID
   * @throws Error if user not found
   */
  public async deleteUser(id: string): Promise<void> {
    // Check if user exists
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Soft delete: set is_active to 0
    await this.db.execute(
      'UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );
  }

  /**
   * List users with optional filters and pagination
   *
   * @param filters - Filter and pagination options
   * @returns Paginated list of users
   */
  public async listUsers(filters?: UserFilters): Promise<PaginatedResult<User>> {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.isAdmin !== undefined) {
      conditions.push('is_admin = ?');
      params.push(filters.isAdmin ? 1 : 0);
    }

    if (filters?.search) {
      // Escape SQL LIKE wildcards so user-supplied `%` and `_` don't match anything
      const escaped = filters.search.replace(/[\\%_]/g, '\\$&');
      const searchPattern = `%${escaped}%`;
      // SQLite LIKE is case-insensitive for ASCII; Postgres LIKE is not.
      // Use ILIKE on Postgres so search stays case-insensitive on both backends.
      const like = this.db.getDialect() === 'postgres' ? 'ILIKE' : 'LIKE';
      conditions.push(
        `(username ${like} ? ESCAPE '\\' OR email ${like} ? ESCAPE '\\' OR first_name ${like} ? ESCAPE '\\' OR last_name ${like} ? ESCAPE '\\')`,
      );
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const total = countResult?.count ?? 0;

    // Get paginated results
    const users = await this.db.query<User>(
      `SELECT ${USER_COLUMNS} FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: users,
      total,
      limit,
      offset
    };
  }

  /**
   * Add user to group
   *
   * @param userId - User ID
   * @param groupId - Group ID
   * @throws Error if user or group not found, or association already exists
   */
  public async addUserToGroup(userId: string, groupId: string): Promise<void> {
    // Check if user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if group exists
    const group = await this.db.queryOne<Group>(
      `SELECT ${GROUP_COLUMNS} FROM groups WHERE id = ?`,
      [groupId]
    );
    if (!group) {
      throw new Error('Group not found');
    }

    // Check if association already exists
    const existing = await this.db.queryOne<{ userId: string }>(
      `SELECT user_id AS "userId" FROM user_groups WHERE user_id = ? AND group_id = ?`,
      [userId, groupId]
    );
    if (existing) {
      throw new Error('User is already a member of this group');
    }

    // Create association
    await this.db.execute(
      'INSERT INTO user_groups (user_id, group_id, assigned_at) VALUES (?, ?, ?)',
      [userId, groupId, new Date().toISOString()]
    );
  }

  /**
   * Remove user from group
   *
   * @param userId - User ID
   * @param groupId - Group ID
   * @throws Error if association not found
   */
  public async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    // Check if association exists
    const existing = await this.db.queryOne<{ userId: string }>(
      `SELECT user_id AS "userId" FROM user_groups WHERE user_id = ? AND group_id = ?`,
      [userId, groupId]
    );
    if (!existing) {
      throw new Error('User is not a member of this group');
    }

    // Remove association
    await this.db.execute(
      'DELETE FROM user_groups WHERE user_id = ? AND group_id = ?',
      [userId, groupId]
    );
  }

  /**
   * Get user's groups
   *
   * @param userId - User ID
   * @returns Array of groups
   */
  public async getUserGroups(userId: string): Promise<Group[]> {
    return this.db.query<Group>(
      `SELECT g.id, g.name, g.description,
              g.created_at AS "createdAt",
              g.updated_at AS "updatedAt"
         FROM groups g
        INNER JOIN user_groups ug ON ug.group_id = g.id
        WHERE ug.user_id = ?
        ORDER BY g.name`,
      [userId]
    );
  }

  /**
   * Assign role to user
   *
   * @param userId - User ID
   * @param roleId - Role ID
   * @throws Error if user or role not found, or assignment already exists
   */
  public async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    // Check if user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if role exists
    const role = await this.db.queryOne<Role>(
      `SELECT ${ROLE_COLUMNS} FROM roles WHERE id = ?`,
      [roleId]
    );
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if assignment already exists
    const existing = await this.db.queryOne<{ userId: string }>(
      `SELECT user_id AS "userId" FROM user_roles WHERE user_id = ? AND role_id = ?`,
      [userId, roleId]
    );
    if (existing) {
      throw new Error('Role is already assigned to this user');
    }

    // Create assignment
    await this.db.execute(
      'INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)',
      [userId, roleId, new Date().toISOString()]
    );
  }

  /**
   * Remove role from user
   *
   * @param userId - User ID
   * @param roleId - Role ID
   * @throws Error if assignment not found
   */
  public async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    // Check if assignment exists
    const existing = await this.db.queryOne<{ userId: string }>(
      `SELECT user_id AS "userId" FROM user_roles WHERE user_id = ? AND role_id = ?`,
      [userId, roleId]
    );
    if (!existing) {
      throw new Error('Role is not assigned to this user');
    }

    // Remove assignment
    await this.db.execute(
      'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
      [userId, roleId]
    );
  }

  /**
   * Get user's roles
   *
   * @param userId - User ID
   * @returns Array of roles
   */
  public async getUserRoles(userId: string): Promise<Role[]> {
    return this.db.query<Role>(
      `SELECT r.id, r.name, r.description,
              r.is_built_in AS "isBuiltIn",
              r.created_at  AS "createdAt",
              r.updated_at  AS "updatedAt"
         FROM roles r
        INNER JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ?
        ORDER BY r.name`,
      [userId]
    );
  }

  /**
   * Activate user
   *
   * @param id - User ID
   * @throws Error if user not found
   */
  public async activateUser(id: string): Promise<void> {
    await this.updateUser(id, { isActive: true });
  }

  /**
   * Deactivate user
   *
   * @param id - User ID
   * @throws Error if user not found
   */
  public async deactivateUser(id: string): Promise<void> {
    await this.updateUser(id, { isActive: false });
  }

  /**
   * Convert User to UserDTO (remove password hash)
   */
  public toUserDTO(user: User): UserDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive === 1,
      isAdmin: user.isAdmin === 1,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    };
  }

}
