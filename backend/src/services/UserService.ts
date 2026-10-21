import assert from 'node:assert/strict';
import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import { createHash, randomUUID } from 'crypto';
import type { AuthenticationService } from './AuthenticationService';
import { SetupService } from './SetupService';
import { validatePassword } from '../utils/passwordValidation';

/**
 * User model from database
 */
export interface User {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string | null;
  localAuthEnabled: number;
  displayName: string | null;
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
  local_auth_enabled AS "localAuthEnabled",
  display_name AS "displayName",
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

const FEDERATED_IDENTITY_COLUMNS = `id,
  user_id    AS "userId",
  provider,
  subject,
  issuer,
  email,
  id_token   AS "idToken",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

/**
 * User data transfer object (without password)
 */
export interface UserDTO {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface UserAdministrationMetadata {
  profileReadOnly: boolean;
  sources: { provider: 'local' | 'ldap' | 'entra-id'; name: string; directoryId?: string; loginName?: string }[];
}

export interface UserRoleSource {
  roleId: string; source: 'manual' | 'ldap' | 'entra-id';
  directoryId?: string; groupName?: string;
}

/** Create user data transfer object. */
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
 * Federated identity link — maps an external IdP subject to a Pabawi user
 */
export interface FederatedIdentity {
  id: string;
  userId: string;
  provider: string;
  subject: string;
  issuer: string;
  email: string | null;
  idToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalProfile {
  email: string | null;
  displayName: string | null;
  firstName: string;
  lastName: string;
}

export type FederatedProvisioningInput = ExternalProfile & {
  issuer: string;
  subject: string;
} & ({
  provider: 'entra-id';
  username: string;
  defaultRole: 'configured';
} | {
  provider: 'ldap';
  loginName: string;
  dn: string;
  defaultRole: 'none';
});

export class FederatedAccountError extends Error {
  constructor(
    readonly code: 'IDENTITY_COLLISION' | 'DIRECTORY_ACCOUNT_READ_ONLY' | 'INVALID_EXTERNAL_IDENTITY',
    message: string,
  ) {
    super(message);
    this.name = 'FederatedAccountError';
  }
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
    if (data.username.toLowerCase().startsWith('ldap:')) {
      throw new Error('Username uses a reserved directory namespace');
    }
    // Validate username uniqueness
    const existingUsername = await this.getUserByUsername(data.username);
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Validate email uniqueness
    const existingEmail = await this.findLocalByEmail(data.email);
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
   * Resolve only the unique local credential scope.
   *
   * @param email - Email address
   * @returns User or null if not found
   */
  public async findLocalByEmail(email: string): Promise<User | null> {
    return this.db.queryOne<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = ? AND local_auth_enabled = 1`,
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

    if (data.password !== undefined || data.email !== undefined ||
        data.firstName !== undefined || data.lastName !== undefined) {
      await this.requireLocalProfileOwnership(id);
    }

    // Validate email uniqueness if email is being updated
    if (data.email && data.email !== user.email && user.localAuthEnabled === 1) {
      const existingEmail = await this.findLocalByEmail(data.email);
      if (existingEmail && existingEmail.id !== id) {
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
      if (user.localAuthEnabled === 0) {
        const entraIdentity = await this.db.queryOne<{ id: string }>(
          `SELECT id FROM federated_identities WHERE user_id = ? AND provider = 'entra-id'
           AND NOT EXISTS (SELECT 1 FROM federated_identities WHERE user_id = ? AND provider = 'ldap')`,
          [id, id]
        );
        if (!entraIdentity) throw new Error('Directory accounts cannot have local passwords');
        updates.push('local_auth_enabled = 1');
      }
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
        INNER JOIN effective_user_roles ur ON ur.role_id = r.id
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
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive === 1,
      isAdmin: user.isAdmin === 1,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  public async getAdministrationMetadata(
    users: User[], directory?: { directoryId: string; displayName: string },
  ): Promise<Map<string, UserAdministrationMetadata>> {
    const result = new Map<string, UserAdministrationMetadata>(users.map(user => [user.id, {
      profileReadOnly: false,
      sources: user.localAuthEnabled === 1 ? [{ provider: 'local', name: 'Local' }] : [],
    }]));
    if (users.length === 0) return result;
    const rows = await this.db.query<{ userId: string; provider: string; issuer: string; loginName: string | null }>(
      'SELECT f.user_id AS "userId", f.provider, f.issuer, m.login_name AS "loginName" ' +
      'FROM federated_identities f LEFT JOIN ldap_identity_metadata m ON m.identity_id = f.id ' +
      'WHERE f.user_id IN (' + users.map(() => '?').join(',') + ') ORDER BY f.provider, f.issuer, f.id',
      users.map(user => user.id));
    for (const row of rows) {
      const metadata = result.get(row.userId);
      if (!metadata) continue;
      if (row.provider === 'ldap') {
        metadata.profileReadOnly = true;
        metadata.sources.push({
          provider: 'ldap', name: directory?.directoryId === row.issuer ? directory.displayName : 'LDAP',
          directoryId: row.issuer, ...(row.loginName === null ? {} : { loginName: row.loginName }),
        });
      } else if (row.provider === 'entra-id') {
        metadata.sources.push({ provider: 'entra-id', name: 'Microsoft Entra ID' });
      }
    }
    return result;
  }

  public async getUserRoleSources(userId: string): Promise<UserRoleSource[]> {
    const manual = await this.db.query<{ roleId: string }>(
      'SELECT role_id AS "roleId" FROM user_roles WHERE user_id = ?', [userId]);
    const external = await this.db.query<{ roleId: string; source: 'ldap' | 'entra-id'; directoryId: string | null; groupName: string | null }>(
      'SELECT g.role_id AS "roleId", f.provider AS source, m.directory_id AS "directoryId", m.group_name AS "groupName" ' +
      'FROM federated_user_roles g JOIN federated_identities f ON f.id = g.identity_id ' +
      'LEFT JOIN external_group_mappings m ON m.id = g.mapping_id WHERE g.user_id = ?', [userId]);
    const legacy = await this.db.query<{ roleId: string }>(
      'SELECT role_id AS "roleId" FROM legacy_federated_user_roles WHERE user_id = ?', [userId]);
    return [
      ...manual.map(row => ({ roleId: row.roleId, source: 'manual' as const })),
      ...external.map(row => ({ roleId: row.roleId, source: row.source,
        ...(row.directoryId === null ? {} : { directoryId: row.directoryId }),
        ...(row.groupName === null ? {} : { groupName: row.groupName }) })),
      ...legacy.map(row => ({ roleId: row.roleId, source: 'entra-id' as const })),
    ];
  }

  /** Reject directory-owned writes even for administrators and legacy mixed accounts. */
  public async requireLocalProfileOwnership(userId: string): Promise<void> {
    const identity = await this.db.queryOne<{ id: string }>(
      "SELECT id FROM federated_identities WHERE user_id = ? AND provider = 'ldap'",
      [userId],
    );
    if (identity) {
      throw new FederatedAccountError('DIRECTORY_ACCOUNT_READ_ONLY',
        'Directory profile fields are read-only; directory accounts cannot have local passwords');
    }
  }

  /**
   * Owns the provisioning transaction. Call only after proving the external identity.
   * No token is issued here, including when a committed account has no effective roles.
   */
  public async createFederatedUser(input: FederatedProvisioningInput): Promise<User> {
    return this.withFederatedUser(input, user => Promise.resolve(user));
  }

  /** Publish provider-owned authorization in the same transaction as account/profile changes.
   * The callback performs database work only and must not open another transaction.
   */
  public async withFederatedUser<T>(input: FederatedProvisioningInput, publish: (user: User) => Promise<T>): Promise<T> {
    if (!input.issuer.trim() || !input.subject.trim() ||
        (input.provider === 'ldap' && (!input.loginName.trim() || !input.dn.trim())) ||
        (input.provider === 'entra-id' && input.username.toLowerCase().startsWith('ldap:'))) {
      throw new FederatedAccountError('INVALID_EXTERNAL_IDENTITY', 'Invalid external identity or provisioning policy');
    }
    // Hash a structured tuple so separators and mutable directory locators cannot collide.
    const username = input.provider === 'ldap'
      ? 'ldap:' + createHash('sha256').update(JSON.stringify([input.provider, input.issuer, input.subject])).digest('hex')
      : input.username;

    return this.db.withTransaction(async () => {
      const now = new Date().toISOString();
      // Preserve SetupService's fallback when the row is absent and lock every provisioning writer.
      await this.db.execute(
        `INSERT INTO config (key, value, updated_at) VALUES ('default_new_user_role', 'role-viewer-001', ?)
         ON CONFLICT(key) DO UPDATE SET value = config.value`, [now],
      );
      const existing = await this.findByFederatedIdentity(input.provider, input.subject, input.issuer);
      let userId: string;
      let identityId: string;
      if (existing) {
        if (input.provider === 'entra-id') return publish(existing);
        userId = existing.id;
        const identity = await this.db.queryOne<{ id: string }>(
          'SELECT id FROM federated_identities WHERE provider = ? AND issuer = ? AND subject = ?',
          [input.provider, input.issuer, input.subject],
        );
        assert(identity);
        identityId = identity.id;
        await this.db.execute(
          'UPDATE users SET email = ?, display_name = ?, first_name = ?, last_name = ?, updated_at = ? WHERE id = ?',
          [input.email, input.displayName, input.firstName, input.lastName, now, userId],
        );
        await this.db.execute('UPDATE federated_identities SET email = ?, updated_at = ? WHERE id = ?',
          [input.email, now, identityId]);
      } else {
        if (await this.getUserByUsername(username)) {
          throw new FederatedAccountError('IDENTITY_COLLISION', 'Account creation failed: derived username already exists');
        }
        if (input.provider === 'entra-id' && input.email && (await this.findAllByEmail(input.email)).length > 0) {
          throw new FederatedAccountError('IDENTITY_COLLISION', 'Existing accounts require explicit administrative enrollment');
        }
        userId = randomUUID();
        identityId = randomUUID();
        await this.db.execute(
          `INSERT INTO users (id, username, email, password_hash, local_auth_enabled, display_name,
            first_name, last_name, is_active, is_admin, created_at, updated_at)
           VALUES (?, ?, ?, NULL, 0, ?, ?, ?, 1, 0, ?, ?)`,
          [userId, username, input.email, input.displayName, input.firstName, input.lastName, now, now],
        );
        await this.db.execute(
          `INSERT INTO federated_identities (id, user_id, provider, issuer, subject, email, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [identityId, userId, input.provider, input.issuer, input.subject, input.email, now, now],
        );
        if (input.defaultRole === 'configured') {
          const roleId = await this.setupService.getDefaultNewUserRole();
          if (roleId) await this.db.execute(
            'INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)', [userId, roleId, now]);
        }
      }
      if (input.provider === 'ldap') {
        await this.db.execute('INSERT INTO ldap_directory_state (directory_id) VALUES (?) ON CONFLICT DO NOTHING', [input.issuer]);
        await this.db.execute(
          `INSERT INTO ldap_identity_metadata (identity_id, directory_id, login_name, dn) VALUES (?, ?, ?, ?)
           ON CONFLICT(identity_id) DO UPDATE SET login_name = excluded.login_name, dn = excluded.dn`,
          [identityId, input.issuer, input.loginName, input.dn],
        );
        // Provisioning alone proves no session freshness. Revalidation owns these revisions later.
        await this.db.execute(
          `INSERT INTO ldap_validation_state (identity_id, config_revision) VALUES (?, '')
           ON CONFLICT(identity_id) DO NOTHING`, [identityId],
        );
      }
      const user = await this.getUserById(userId);
      assert(user);
      return publish(user);
    });
  }

  /**
   * Link an existing user account to a federated identity.
   *
   * Only explicit administrative enrollment may link an existing account; this
   * preserves the existing password_hash so local login remains available.
   *
   * @param userId - Existing Pabawi user ID
   * @param provider - Identity provider name (e.g. 'entra-id')
   * @param subject - The IdP subject claim (unique per tenant+user)
   * @param issuer - Token issuer URL
   * @param email - Email from the IdP (informational)
   */
  public async linkFederatedIdentity(
    userId: string,
    provider: string,
    subject: string,
    issuer: string,
    email: string | null,
  ): Promise<FederatedIdentity> {
    if (provider === 'ldap') {
      throw new FederatedAccountError('DIRECTORY_ACCOUNT_READ_ONLY', 'LDAP identities cannot be linked to existing accounts');
    }
    await this.requireLocalProfileOwnership(userId);
    const id = randomUUID();
    const now = new Date().toISOString();

    try {
      await this.db.execute(
        `INSERT INTO federated_identities (id, user_id, provider, subject, issuer, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, provider, subject, issuer, email, now, now]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE') || message.includes('unique') || message.includes('duplicate')) {
        throw new Error(
          `Federated identity already linked: provider=${provider}, subject=${subject}`
        );
      }
      throw err;
    }

    const identity = await this.db.queryOne<FederatedIdentity>(
      `SELECT ${FEDERATED_IDENTITY_COLUMNS} FROM federated_identities WHERE id = ?`,
      [id]
    );
    if (!identity) {
      throw new Error('Failed to create federated identity link');
    }

    return identity;
  }

  /**
   * Look up a user by their federated identity (provider + subject).
   *
   * @param provider - Identity provider name (e.g. 'entra-id')
   * @param subject - The IdP subject claim
   * @returns The linked user, or null if no matching federated identity exists
   */
  public async findByFederatedIdentity(
    provider: string,
    subject: string,
    issuer: string,
  ): Promise<User | null> {
    const identity = await this.db.queryOne<FederatedIdentity>(
      `SELECT ${FEDERATED_IDENTITY_COLUMNS} FROM federated_identities
       WHERE provider = ? AND subject = ? AND issuer = ?`,
      [provider, subject, issuer]
    );

    if (!identity) {
      return null;
    }

    return this.getUserById(identity.userId);
  }

  /**
   * External contact email is not an identity key. Callers must handle all matches.
   */
  public async findAllByEmail(email: string): Promise<User[]> {
    return this.db.query<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = ? ORDER BY id`,
      [email]
    );
  }

}
