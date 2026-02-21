import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';
import { AuthenticationService } from './AuthenticationService';
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
  private db: Database;
  private authService: AuthenticationService;
  private setupService: SetupService;

  constructor(db: Database, authService: AuthenticationService) {
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
    await this.runQuery(
      `INSERT INTO users (id, username, email, passwordHash, firstName, lastName, isActive, isAdmin, createdAt, updatedAt)
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
        await this.runQuery(
          `INSERT INTO user_roles (userId, roleId, assignedAt)
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
    return this.getQuery<User>(
      'SELECT * FROM users WHERE id = ?',
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
    return this.getQuery<User>(
      'SELECT * FROM users WHERE username = ?',
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
    return this.getQuery<User>(
      'SELECT * FROM users WHERE email = ?',
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
    const params: any[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }

    if (data.firstName !== undefined) {
      updates.push('firstName = ?');
      params.push(data.firstName);
    }

    if (data.lastName !== undefined) {
      updates.push('lastName = ?');
      params.push(data.lastName);
    }

    if (data.password !== undefined) {
      // Validate password complexity
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }

      const passwordHash = await this.authService.hashPassword(data.password);
      updates.push('passwordHash = ?');
      params.push(passwordHash);
    }

    if (data.isActive !== undefined) {
      updates.push('isActive = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (data.isAdmin !== undefined) {
      updates.push('isAdmin = ?');
      params.push(data.isAdmin ? 1 : 0);
    }

    // Always update updatedAt
    updates.push('updatedAt = ?');
    params.push(new Date().toISOString());

    // Add user ID to params
    params.push(id);

    // Execute update
    await this.runQuery(
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

    // Soft delete: set isActive to 0
    await this.runQuery(
      'UPDATE users SET isActive = 0, updatedAt = ? WHERE id = ?',
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
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push('isActive = ?');
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.isAdmin !== undefined) {
      conditions.push('isAdmin = ?');
      params.push(filters.isAdmin ? 1 : 0);
    }

    if (filters?.search) {
      conditions.push('(username LIKE ? OR email LIKE ? OR firstName LIKE ? OR lastName LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.getQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get paginated results
    const users = await this.allQuery<User>(
      `SELECT * FROM users ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
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
    const group = await this.getQuery<Group>(
      'SELECT * FROM groups WHERE id = ?',
      [groupId]
    );
    if (!group) {
      throw new Error('Group not found');
    }

    // Check if association already exists
    const existing = await this.getQuery<{ userId: string }>(
      'SELECT userId FROM user_groups WHERE userId = ? AND groupId = ?',
      [userId, groupId]
    );
    if (existing) {
      throw new Error('User is already a member of this group');
    }

    // Create association
    await this.runQuery(
      'INSERT INTO user_groups (userId, groupId, assignedAt) VALUES (?, ?, ?)',
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
    const existing = await this.getQuery<{ userId: string }>(
      'SELECT userId FROM user_groups WHERE userId = ? AND groupId = ?',
      [userId, groupId]
    );
    if (!existing) {
      throw new Error('User is not a member of this group');
    }

    // Remove association
    await this.runQuery(
      'DELETE FROM user_groups WHERE userId = ? AND groupId = ?',
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
    return this.allQuery<Group>(
      `SELECT g.* FROM groups g
       INNER JOIN user_groups ug ON ug.groupId = g.id
       WHERE ug.userId = ?
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
    const role = await this.getQuery<Role>(
      'SELECT * FROM roles WHERE id = ?',
      [roleId]
    );
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if assignment already exists
    const existing = await this.getQuery<{ userId: string }>(
      'SELECT userId FROM user_roles WHERE userId = ? AND roleId = ?',
      [userId, roleId]
    );
    if (existing) {
      throw new Error('Role is already assigned to this user');
    }

    // Create assignment
    await this.runQuery(
      'INSERT INTO user_roles (userId, roleId, assignedAt) VALUES (?, ?, ?)',
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
    const existing = await this.getQuery<{ userId: string }>(
      'SELECT userId FROM user_roles WHERE userId = ? AND roleId = ?',
      [userId, roleId]
    );
    if (!existing) {
      throw new Error('Role is not assigned to this user');
    }

    // Remove assignment
    await this.runQuery(
      'DELETE FROM user_roles WHERE userId = ? AND roleId = ?',
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
    return this.allQuery<Role>(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON ur.roleId = r.id
       WHERE ur.userId = ?
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
