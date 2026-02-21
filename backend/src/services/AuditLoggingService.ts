import { Database } from 'sqlite3';
import { randomUUID } from 'crypto';

/**
 * Event types for audit logging
 */
export enum AuditEventType {
  AUTH = 'auth',           // Authentication events
  AUTHZ = 'authz',         // Authorization events
  ADMIN = 'admin',         // Administrative actions
  USER = 'user',           // User management
  ROLE = 'role',           // Role management
  PERMISSION = 'permission', // Permission management
  GROUP = 'group'          // Group management
}

/**
 * Specific actions within event types
 */
export enum AuditAction {
  // Authentication actions
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  PASSWORD_CHANGE = 'password_change',  // pragma: allowlist secret

  // Authorization actions
  PERMISSION_DENIED = 'permission_denied',
  PERMISSION_GRANTED = 'permission_granted',

  // User management actions
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',

  // Role management actions
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',

  // Permission management actions
  PERMISSION_CREATED = 'permission_created',
  PERMISSION_ASSIGNED = 'permission_assigned',
  PERMISSION_REMOVED = 'permission_removed',

  // Group management actions
  GROUP_CREATED = 'group_created',
  GROUP_UPDATED = 'group_updated',
  GROUP_DELETED = 'group_deleted',
  GROUP_MEMBER_ADDED = 'group_member_added',
  GROUP_MEMBER_REMOVED = 'group_member_removed'
}

/**
 * Result of an audited action
 */
export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  DENIED = 'denied'
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  action: AuditAction | string;
  userId: string | null;
  targetUserId?: string | null;
  targetResourceType?: string | null;
  targetResourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any>;
  result: AuditResult;
}

/**
 * Query filters for audit logs
 */
export interface AuditLogFilters {
  userId?: string;
  eventType?: AuditEventType;
  action?: AuditAction | string;
  result?: AuditResult;
  startDate?: string;
  endDate?: string;
  ipAddress?: string;
  limit?: number;
  offset?: number;
}

/**
 * AuditLoggingService
 *
 * Provides comprehensive audit logging for security monitoring and compliance.
 * Logs authentication attempts, authorization decisions, and administrative actions.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7
 */
export class AuditLoggingService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Log an authentication attempt
   * Requirement 13.1: Log authentication attempts with timestamp, username, and source IP
   */
  public async logAuthenticationAttempt(
    username: string,
    success: boolean,
    userId: string | null,
    ipAddress?: string,
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    const action = success ? AuditAction.LOGIN_SUCCESS : AuditAction.LOGIN_FAILURE;
    const result = success ? AuditResult.SUCCESS : AuditResult.FAILURE;

    const details: Record<string, any> = { username };
    if (reason) {
      details.reason = reason;
    }

    await this.log({
      eventType: AuditEventType.AUTH,
      action,
      userId,
      ipAddress,
      userAgent,
      details,
      result
    });
  }

  /**
   * Log an authorization failure
   * Requirement 13.3: Log authorization decisions with user, resource, and result
   */
  public async logAuthorizationFailure(
    userId: string,
    resource: string,
    action: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.AUTHZ,
      action: AuditAction.PERMISSION_DENIED,
      userId,
      ipAddress,
      userAgent,
      details: {
        resource,
        requiredAction: action
      },
      result: AuditResult.DENIED
    });
  }

  /**
   * Log an authorization success
   * Requirement 13.3: Log authorization decisions
   */
  public async logAuthorizationSuccess(
    userId: string,
    resource: string,
    action: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.AUTHZ,
      action: AuditAction.PERMISSION_GRANTED,
      userId,
      ipAddress,
      userAgent,
      details: {
        resource,
        action
      },
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Log user account changes
   * Requirement 13.4: Log user/role/permission changes with admin identity
   */
  public async logUserChange(
    action: AuditAction,
    adminUserId: string,
    targetUserId: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.USER,
      action,
      userId: adminUserId,
      targetUserId,
      targetResourceType: 'user',
      targetResourceId: targetUserId,
      ipAddress,
      userAgent,
      details,
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Log role changes
   * Requirement 13.4: Log role changes with admin identity
   */
  public async logRoleChange(
    action: AuditAction,
    adminUserId: string,
    roleId: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.ROLE,
      action,
      userId: adminUserId,
      targetResourceType: 'role',
      targetResourceId: roleId,
      ipAddress,
      userAgent,
      details,
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Log permission changes
   * Requirement 13.4: Log permission changes with admin identity
   */
  public async logPermissionChange(
    action: AuditAction,
    adminUserId: string,
    permissionId: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.PERMISSION,
      action,
      userId: adminUserId,
      targetResourceType: 'permission',
      targetResourceId: permissionId,
      ipAddress,
      userAgent,
      details,
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Log group changes
   * Requirement 13.4: Log group changes with admin identity
   */
  public async logGroupChange(
    action: AuditAction,
    adminUserId: string,
    groupId: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.GROUP,
      action,
      userId: adminUserId,
      targetResourceType: 'group',
      targetResourceId: groupId,
      ipAddress,
      userAgent,
      details,
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Log an admin action
   * Requirement 13.4: Log admin actions with identity
   */
  public async logAdminAction(
    action: string,
    adminUserId: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.ADMIN,
      action,
      userId: adminUserId,
      ipAddress,
      userAgent,
      details,
      result: AuditResult.SUCCESS
    });
  }

  /**
   * Core logging method
   * Requirement 13.6: Include user ID, action, resource, timestamp, and result
   */
  private async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const detailsJson = entry.details ? JSON.stringify(entry.details) : null;

    const sql = `
      INSERT INTO audit_logs (
        id, timestamp, eventType, action, userId, targetUserId,
        targetResourceType, targetResourceId, ipAddress, userAgent,
        details, result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      timestamp,
      entry.eventType,
      entry.action,
      entry.userId || null,
      entry.targetUserId || null,
      entry.targetResourceType || null,
      entry.targetResourceId || null,
      entry.ipAddress || null,
      entry.userAgent || null,
      detailsJson,
      entry.result
    ];

    await this.runQuery(sql, params);
  }

  /**
   * Query audit logs with filters
   * Requirement 13.5: Retain audit logs for at least 1 year
   */
  public async queryLogs(filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      sql += ' AND userId = ?';
      params.push(filters.userId);
    }

    if (filters.eventType) {
      sql += ' AND eventType = ?';
      params.push(filters.eventType);
    }

    if (filters.action) {
      sql += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.result) {
      sql += ' AND result = ?';
      params.push(filters.result);
    }

    if (filters.startDate) {
      sql += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    if (filters.ipAddress) {
      sql += ' AND ipAddress = ?';
      params.push(filters.ipAddress);
    }

    sql += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = await this.allQuery<any>(sql, params);

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.eventType,
      action: row.action,
      userId: row.userId,
      targetUserId: row.targetUserId,
      targetResourceType: row.targetResourceType,
      targetResourceId: row.targetResourceId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      details: row.details ? JSON.parse(row.details) : undefined,
      result: row.result
    }));
  }

  /**
   * Get audit logs for a specific user
   */
  public async getUserAuditLogs(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({ userId, limit, offset });
  }

  /**
   * Get recent failed authentication attempts
   */
  public async getRecentFailedLogins(
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({
      eventType: AuditEventType.AUTH,
      action: AuditAction.LOGIN_FAILURE,
      limit
    });
  }

  /**
   * Get authorization failures for security monitoring
   */
  public async getAuthorizationFailures(
    startDate?: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({
      eventType: AuditEventType.AUTHZ,
      result: AuditResult.DENIED,
      startDate,
      limit
    });
  }

  /**
   * Get admin actions for compliance auditing
   */
  public async getAdminActions(
    startDate?: string,
    endDate?: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    return this.queryLogs({
      eventType: AuditEventType.ADMIN,
      startDate,
      endDate,
      limit
    });
  }

  /**
   * Clean up old audit logs (for maintenance)
   * Requirement 13.5: Retain audit logs for at least 1 year
   */
  public async cleanupOldLogs(retentionDays: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffTimestamp = cutoffDate.toISOString();

    const sql = 'DELETE FROM audit_logs WHERE timestamp < ?';

    return new Promise((resolve, reject) => {
      this.db.run(sql, [cutoffTimestamp], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Get audit log statistics
   */
  public async getStatistics(startDate?: string, endDate?: string): Promise<{
    totalLogs: number;
    authenticationAttempts: number;
    authenticationFailures: number;
    authorizationFailures: number;
    adminActions: number;
  }> {
    let whereClause = '1=1';
    const params: any[] = [];

    if (startDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND timestamp <= ?';
      params.push(endDate);
    }

    const sql = `
      SELECT
        COUNT(*) as totalLogs,
        SUM(CASE WHEN eventType = 'auth' THEN 1 ELSE 0 END) as authenticationAttempts,
        SUM(CASE WHEN eventType = 'auth' AND result = 'failure' THEN 1 ELSE 0 END) as authenticationFailures,
        SUM(CASE WHEN eventType = 'authz' AND result = 'denied' THEN 1 ELSE 0 END) as authorizationFailures,
        SUM(CASE WHEN eventType = 'admin' THEN 1 ELSE 0 END) as adminActions
      FROM audit_logs
      WHERE ${whereClause}
    `;

    const result = await this.getQuery<any>(sql, params);

    return {
      totalLogs: result?.totalLogs || 0,
      authenticationAttempts: result?.authenticationAttempts || 0,
      authenticationFailures: result?.authenticationFailures || 0,
      authorizationFailures: result?.authorizationFailures || 0,
      adminActions: result?.adminActions || 0
    };
  }

  // Database helper methods
  private runQuery(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private getQuery<T>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T || null);
      });
    });
  }

  private allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }
}
