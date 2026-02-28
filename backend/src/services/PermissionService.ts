import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';
import { performanceMonitor } from './PerformanceMonitor';

/**
 * Permission model from database
 */
export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
  createdAt: string;
}

/**
 * Permission data transfer object
 */
export interface PermissionDTO {
  id: string;
  resource: string;
  action: string;
  description: string;
  createdAt: string;
}

/**
 * Create permission data transfer object
 */
export interface CreatePermissionDTO {
  resource: string;
  action: string;
  description: string;
}

/**
 * Permission filters for listing
 */
export interface PermissionFilters {
  limit?: number;
  offset?: number;
  resource?: string;
  action?: string;
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
 * Permission service for managing permissions
 *
 * Responsibilities:
 * - Create and manage permissions
 * - Enforce unique resource-action combinations
 * - Validate permission data
 * - Support search and filtering
 * - Cache permission check results for performance
 */
export class PermissionService {
  private db: Database;
  private cache: Map<string, { value: boolean; expiresAt: number }>;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(db: Database) {
    this.db = db;
    this.cache = new Map();
  }

  /**
   * Create a new permission
   *
   * @param data - Permission creation data
   * @returns Created permission
   * @throws Error if validation fails or resource-action combination already exists
   */
  public async createPermission(data: CreatePermissionDTO): Promise<Permission> {
    // Validate resource format (3-100 characters, lowercase, alphanumeric + underscore)
    if (!data.resource || data.resource.length < 3 || data.resource.length > 100) {
      throw new Error('Resource must be between 3 and 100 characters');
    }

    if (!/^[a-z0-9_]+$/.test(data.resource)) {
      throw new Error('Resource must be lowercase alphanumeric characters and underscores only');
    }

    // Validate action format (3-50 characters, lowercase, alphanumeric + underscore)
    if (!data.action || data.action.length < 3 || data.action.length > 50) {
      throw new Error('Action must be between 3 and 50 characters');
    }

    if (!/^[a-z0-9_]+$/.test(data.action)) {
      throw new Error('Action must be lowercase alphanumeric characters and underscores only');
    }

    // Validate description length (0-500 characters)
    if (data.description && data.description.length > 500) {
      throw new Error('Permission description must not exceed 500 characters');
    }

    // Validate unique resource-action combination (Requirement 14.5)
    const existingPermission = await this.getPermissionByResourceAction(data.resource, data.action);
    if (existingPermission) {
      throw new Error('Permission with this resource-action combination already exists');
    }

    // Generate UUID for permission
    const permissionId = randomUUID();
    const now = new Date().toISOString();

    // Insert permission
    await this.runQuery(
      `INSERT INTO permissions (id, resource, action, description, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [permissionId, data.resource, data.action, data.description || '', now]
    );

    // Fetch and return created permission
    const permission = await this.getPermissionById(permissionId);
    if (!permission) {
      throw new Error('Failed to create permission');
    }

    return permission;
  }

  /**
   * Get permission by ID
   *
   * @param id - Permission ID
   * @returns Permission or null if not found
   */
  public async getPermissionById(id: string): Promise<Permission | null> {
    return this.getQuery<Permission>(
      'SELECT * FROM permissions WHERE id = ?',
      [id]
    );
  }

  /**
   * Get permission by resource and action
   *
   * @param resource - Resource identifier
   * @param action - Action identifier
   * @returns Permission or null if not found
   */
  private async getPermissionByResourceAction(resource: string, action: string): Promise<Permission | null> {
    return this.getQuery<Permission>(
      'SELECT * FROM permissions WHERE resource = ? AND action = ?',
      [resource, action]
    );
  }

  /**
   * List permissions with optional filters and pagination
   *
   * @param filters - Filter and pagination options
   * @returns Paginated list of permissions
   */
  public async listPermissions(filters?: PermissionFilters): Promise<PaginatedResult<Permission>> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.resource) {
      conditions.push('resource = ?');
      params.push(filters.resource);
    }

    if (filters?.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    if (filters?.search) {
      conditions.push('(resource LIKE ? OR action LIKE ? OR description LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.getQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM permissions ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get paginated results
    const permissions = await this.allQuery<Permission>(
      `SELECT * FROM permissions ${whereClause} ORDER BY resource ASC, action ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      items: permissions,
      total,
      limit,
      offset
    };
  }

  /**
   * Check if a user has a specific permission
   *
   * This method implements multi-path permission checking:
   * - Path 1: Direct user-role-permission
   * - Path 2: User-group-role-permission
   *
   * Special cases:
   * - Admin users (isAdmin=1) always return true
   * - Inactive users (isActive=0) always return false
   *
   * Caching:
   * - Results are cached for 5 minutes (Requirement 15.1)
   * - Cache key format: perm:${userId}:${resource}:${action}
   * - Cache is checked BEFORE database queries
   * - Cache is updated AFTER successful permission checks
   *
   * @param userId - User ID to check
   * @param resource - Resource identifier (e.g., 'ansible', 'bolt')
   * @param action - Action identifier (e.g., 'read', 'write', 'execute')
   * @returns True if user has permission, false otherwise
   *
   * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 15.1
   */
  public async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    // Start performance timing
    const startTime = Date.now();
    let cacheHit = false;

    // Step 1: Check cache for permission result (Requirement 15.1)
    const cacheKey = `perm:${userId}:${resource}:${action}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      // Cache hit - return cached value
      cacheHit = true;
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, cacheHit);
      return cached.value;
    }

    // Cache miss or expired - remove expired entry
    if (cached) {
      this.cache.delete(cacheKey);
    }

    // Step 2: Check if user exists and get admin/active status (Requirement 5.5, 5.6)
    const user = await this.getQuery<{ isAdmin: number; isActive: number }>(
      'SELECT isAdmin, isActive FROM users WHERE id = ?',
      [userId]
    );

    // User doesn't exist or is inactive - deny all permissions (Requirement 5.6)
    if (!user || user.isActive === 0) {
      // Cache the negative result
      this.cache.set(cacheKey, {
        value: false,
        expiresAt: Date.now() + this.CACHE_TTL_MS
      });
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, cacheHit);
      return false;
    }

    // Admin users have all permissions (Requirement 5.5)
    if (user.isAdmin === 1) {
      // Cache the positive result
      this.cache.set(cacheKey, {
        value: true,
        expiresAt: Date.now() + this.CACHE_TTL_MS
      });
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, cacheHit);
      return true;
    }

    // Step 3: Check permissions through all paths using UNION (Requirements 5.2, 5.3, 5.4)
    // Path 1: Direct user-role-permission
    // Path 2: User-group-role-permission
    const hasPermissionQuery = `
      SELECT COUNT(*) as count FROM permissions p
      WHERE p.resource = ? AND p.action = ?
      AND p.id IN (
        -- Path 1: Direct role assignment (user -> user_roles -> role_permissions -> permissions)
        SELECT rp.permissionId FROM role_permissions rp
        INNER JOIN user_roles ur ON ur.roleId = rp.roleId
        WHERE ur.userId = ?

        UNION

        -- Path 2: Group role assignment (user -> user_groups -> group_roles -> role_permissions -> permissions)
        SELECT rp.permissionId FROM role_permissions rp
        INNER JOIN group_roles gr ON gr.roleId = rp.roleId
        INNER JOIN user_groups ug ON ug.groupId = gr.groupId
        WHERE ug.userId = ?
      )
    `;

    const result = await this.getQuery<{ count: number }>(hasPermissionQuery, [
      resource,
      action,
      userId,
      userId
    ]);

    // Determine if user has permission
    const hasAccess = (result?.count || 0) > 0;

    // Step 4: Cache the result (Requirement 15.1)
    this.cache.set(cacheKey, {
      value: hasAccess,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });

    // Record performance timing (cache miss)
    const duration = Date.now() - startTime;
    performanceMonitor.recordPermissionCheck(duration, cacheHit);

    return hasAccess;
  }

  /**
   * Invalidate all cached permission checks for a specific user
   *
   * This method should be called when:
   * - User's roles are modified (added/removed)
   * - User's group memberships are modified (added/removed)
   * - Roles assigned to user's groups are modified
   * - Permissions assigned to user's roles are modified
   *
   * @param userId - User ID to invalidate cache for
   *
   * Requirement: 15.2
   */
  public invalidateUserPermissionCache(userId: string): void {
    // Find and delete all cache entries for this user
    // Cache keys follow pattern: perm:${userId}:${resource}:${action}
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`perm:${userId}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Get all permissions for a user
   *
   * This method aggregates permissions from all sources:
   * - Path 1: Direct user-role-permission
   * - Path 2: User-group-role-permission
   *
   * Special cases:
   * - Admin users (isAdmin=1) get ALL permissions
   * - Inactive users (isActive=0) get empty array
   *
   * Results are:
   * - Deduplicated using DISTINCT
   * - Ordered by resource ASC, action ASC
   *
   * @param userId - User ID to get permissions for
   * @returns Array of all unique permissions for the user
   *
   * Requirements: 8.3, 8.6
   */
  public async getUserPermissions(userId: string): Promise<Permission[]> {
    // Step 1: Check if user exists and get admin/active status
    const user = await this.getQuery<{ isAdmin: number; isActive: number }>(
      'SELECT isAdmin, isActive FROM users WHERE id = ?',
      [userId]
    );

    // User doesn't exist or is inactive - return empty array (Requirement 8.6)
    if (!user || user.isActive === 0) {
      return [];
    }

    // Admin users get all permissions (Requirement 8.3)
    if (user.isAdmin === 1) {
      return this.allQuery<Permission>(
        'SELECT * FROM permissions ORDER BY resource ASC, action ASC'
      );
    }

    // Step 2: Aggregate permissions from all sources with deduplication (Requirements 8.3, 8.6)
    // Use DISTINCT to deduplicate permissions from multiple paths
    const permissionsQuery = `
      SELECT DISTINCT p.* FROM permissions p
      INNER JOIN role_permissions rp ON rp.permissionId = p.id
      WHERE rp.roleId IN (
        -- Path 1: Direct role assignments (user -> user_roles -> roles)
        SELECT roleId FROM user_roles WHERE userId = ?

        UNION

        -- Path 2: Group role assignments (user -> user_groups -> group_roles -> roles)
        SELECT gr.roleId FROM group_roles gr
        INNER JOIN user_groups ug ON ug.groupId = gr.groupId
        WHERE ug.userId = ?
      )
      ORDER BY p.resource ASC, p.action ASC
    `;

    return this.allQuery<Permission>(permissionsQuery, [userId, userId]);
  }

  /**
   * Check multiple permissions for a user in a single batch operation
   *
   * This method is optimized for checking multiple permissions at once,
   * reducing the number of database queries and cache lookups.
   *
   * @param userId - User ID to check
   * @param checks - Array of permission checks to perform
   * @returns Array of results indicating which permissions are allowed
   *
   * Requirements: 15.2, 15.5
   */
  public async checkMultiplePermissions(
    userId: string,
    checks: Array<{ resource: string; action: string }>
  ): Promise<Array<{ resource: string; action: string; allowed: boolean }>> {
    const startTime = Date.now();

    // Step 1: Check cache for all permissions
    const results: Array<{ resource: string; action: string; allowed: boolean }> = [];
    const uncachedChecks: Array<{ resource: string; action: string; index: number }> = [];

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      const cacheKey = `perm:${userId}:${check.resource}:${check.action}`;
      const cached = this.cache.get(cacheKey);

      if (cached && cached.expiresAt > Date.now()) {
        // Cache hit
        results[i] = { ...check, allowed: cached.value };
      } else {
        // Cache miss - need to query
        uncachedChecks.push({ ...check, index: i });
      }
    }

    // If all results were cached, return immediately
    if (uncachedChecks.length === 0) {
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, true);
      return results;
    }

    // Step 2: Check user status once for all uncached checks
    const user = await this.getQuery<{ isAdmin: number; isActive: number }>(
      'SELECT isAdmin, isActive FROM users WHERE id = ?',
      [userId]
    );

    // Handle inactive users
    if (!user || user.isActive === 0) {
      for (const check of uncachedChecks) {
        results[check.index] = { resource: check.resource, action: check.action, allowed: false };
        const cacheKey = `perm:${userId}:${check.resource}:${check.action}`;
        this.cache.set(cacheKey, { value: false, expiresAt: Date.now() + this.CACHE_TTL_MS });
      }
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, false);
      return results;
    }

    // Handle admin users
    if (user.isAdmin === 1) {
      for (const check of uncachedChecks) {
        results[check.index] = { resource: check.resource, action: check.action, allowed: true };
        const cacheKey = `perm:${userId}:${check.resource}:${check.action}`;
        this.cache.set(cacheKey, { value: true, expiresAt: Date.now() + this.CACHE_TTL_MS });
      }
      const duration = Date.now() - startTime;
      performanceMonitor.recordPermissionCheck(duration, false);
      return results;
    }

    // Step 3: Batch query for all uncached permissions
    // Build a query that checks all resource-action pairs at once
    const conditions = uncachedChecks.map(() => '(p.resource = ? AND p.action = ?)').join(' OR ');
    const params: string[] = [];
    uncachedChecks.forEach(check => {
      params.push(check.resource, check.action);
    });

    const batchQuery = `
      SELECT DISTINCT p.resource, p.action FROM permissions p
      WHERE (${conditions})
      AND p.id IN (
        -- Path 1: Direct role assignment
        SELECT rp.permissionId FROM role_permissions rp
        INNER JOIN user_roles ur ON ur.roleId = rp.roleId
        WHERE ur.userId = ?

        UNION

        -- Path 2: Group role assignment
        SELECT rp.permissionId FROM role_permissions rp
        INNER JOIN group_roles gr ON gr.roleId = rp.roleId
        INNER JOIN user_groups ug ON ug.groupId = gr.groupId
        WHERE ug.userId = ?
      )
    `;

    const allowedPermissions = await this.allQuery<{ resource: string; action: string }>(
      batchQuery,
      [...params, userId, userId]
    );

    // Create a set for fast lookup
    const allowedSet = new Set(
      allowedPermissions.map(p => `${p.resource}:${p.action}`)
    );

    // Step 4: Fill in results and update cache
    for (const check of uncachedChecks) {
      const allowed = allowedSet.has(`${check.resource}:${check.action}`);
      results[check.index] = { resource: check.resource, action: check.action, allowed };

      // Cache the result
      const cacheKey = `perm:${userId}:${check.resource}:${check.action}`;
      this.cache.set(cacheKey, { value: allowed, expiresAt: Date.now() + this.CACHE_TTL_MS });
    }

    const duration = Date.now() - startTime;
    performanceMonitor.recordPermissionCheck(duration, false);

    return results;
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
