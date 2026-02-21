import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Database } from 'sqlite3';
import crypto from 'crypto';
import { AuditLoggingService } from './AuditLoggingService';
import { performanceMonitor } from './PerformanceMonitor';

/**
 * Authentication result returned after successful authentication
 */
export interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: UserDTO;
  error?: string;
}

/**
 * JWT token payload structure
 */
export interface TokenPayload {
  userId: string;
  username: string;
  roles: string[];
  iat: number;
  exp: number;
  jti?: string; // Token ID for revocation tracking
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
 * Internal user model from database
 */
interface User {
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
 * Authentication service for user authentication, JWT token management, and password handling
 *
 * Responsibilities:
 * - Validate user credentials against database
 * - Generate and verify JWT tokens (access and refresh)
 * - Hash passwords using bcrypt
 * - Manage token revocation and refresh
 * - Enforce password policies
 */
export class AuthenticationService {
  private db: Database;
  private jwtSecret: string;
  private accessTokenLifetime: number = 3600; // 1 hour in seconds
  private refreshTokenLifetime: number = 604800; // 7 days in seconds
  private bcryptCostFactor: number = 10;
  private auditLogger?: AuditLoggingService;

  constructor(db: Database, jwtSecret?: string, auditLogger?: AuditLoggingService) {
    this.db = db;
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || this.generateDefaultSecret();
    this.auditLogger = auditLogger;

    if (!jwtSecret && !process.env.JWT_SECRET) {
      console.warn('WARNING: No JWT_SECRET provided. Using generated secret. This is insecure for production!');
    }
  }

  /**
   * Generate a default JWT secret (for development only)
   */
  private generateDefaultSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Authenticate user with username and password
   *
   * @param username - User's username
   * @param password - User's plain text password
   * @param ipAddress - Optional IP address of the request
   * @param userAgent - Optional user agent string
   * @returns AuthResult with tokens and user data on success, error on failure
   */
  public async authenticate(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
          // Start performance timing
          const startTime = Date.now();

          // Validate input
          if (!username || !password) {
            return { success: false, error: 'Username and password required' };
          }

          try {
            // Check for account lockout BEFORE attempting authentication
            const lockoutStatus = await this.checkAccountLockout(username);
            if (lockoutStatus.isLocked) {
              // Still record the attempt even when locked (for permanent lockout tracking)
              await this.recordFailedLoginAttempt(username, lockoutStatus.reason || 'Account locked');
              await this.logFailedAuthentication(username, lockoutStatus.reason || 'Account locked');

              // Audit log: authentication failure (account locked)
              if (this.auditLogger) {
                await this.auditLogger.logAuthenticationAttempt(
                  username,
                  false,
                  null,
                  ipAddress,
                  userAgent,
                  lockoutStatus.reason || 'Account locked'
                );
              }

              return { success: false, error: lockoutStatus.reason || 'Account is locked' };
            }

            // Fetch user from database (including inactive users for proper error handling)
            const user = await this.getUserByUsernameIncludingInactive(username);

            if (!user) {
              // Log failed attempt - user not found
              await this.recordFailedLoginAttempt(username, 'User not found');
              await this.logFailedAuthentication(username, 'User not found');

              // Audit log: authentication failure (user not found)
              if (this.auditLogger) {
                await this.auditLogger.logAuthenticationAttempt(
                  username,
                  false,
                  null,
                  ipAddress,
                  userAgent,
                  'User not found'
                );
              }

              // Use generic error to prevent username enumeration
              return { success: false, error: 'Invalid credentials' };
            }

            // Verify password first (constant-time operation to prevent timing attacks)
            const isPasswordValid = await this.comparePassword(password, user.passwordHash);

            if (!isPasswordValid) {
              // Record and log failed attempt - invalid password
              await this.recordFailedLoginAttempt(username, 'Invalid password');
              await this.logFailedAuthentication(username, 'Invalid password');

              // Audit log: authentication failure (invalid password)
              if (this.auditLogger) {
                await this.auditLogger.logAuthenticationAttempt(
                  username,
                  false,
                  user.id,
                  ipAddress,
                  userAgent,
                  'Invalid password'
                );
              }

              return { success: false, error: 'Invalid credentials' };
            }

            // Check if user is active (after password verification)
            if (!user.isActive) {
              // Log failed attempt - inactive account
              await this.logFailedAuthentication(username, 'Account inactive');

              // Audit log: authentication failure (inactive account)
              if (this.auditLogger) {
                await this.auditLogger.logAuthenticationAttempt(
                  username,
                  false,
                  user.id,
                  ipAddress,
                  userAgent,
                  'Account inactive'
                );
              }

              return { success: false, error: 'Account is inactive' };
            }

            // Authentication successful - clear failed attempts
            await this.clearFailedLoginAttempts(username);

            // Generate tokens
            const token = await this.generateToken(user);
            const refreshToken = await this.generateRefreshToken(user);

            // Update last login timestamp
            await this.updateLastLogin(user.id);

            // Update user object with new lastLoginAt
            user.lastLoginAt = new Date().toISOString();

            // Audit log: authentication success
            if (this.auditLogger) {
              await this.auditLogger.logAuthenticationAttempt(
                username,
                true,
                user.id,
                ipAddress,
                userAgent
              );
            }

            // Record authentication timing
            const duration = Date.now() - startTime;
            performanceMonitor.recordAuthentication(duration);

            // Return success result
            return {
              success: true,
              token,
              refreshToken,
              user: this.toUserDTO(user)
            };
          } catch (error) {
            console.error('Authentication error:', error);
            // Log failed attempt - system error
            await this.logFailedAuthentication(username, `System error: ${error instanceof Error ? error.message : 'Unknown error'}`);

            // Audit log: authentication failure (system error)
            if (this.auditLogger) {
              await this.auditLogger.logAuthenticationAttempt(
                username,
                false,
                null,
                ipAddress,
                userAgent,
                `System error: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }

            return {
              success: false,
              error: 'Authentication failed'
            };
          }
        }

  /**
   * Generate JWT access token for user
   *
   * @param user - User object
   * @returns JWT access token string
   */
  public async generateToken(user: User): Promise<string> {
    // Fetch user roles for token
    const roles = await this.getUserRoles(user.id);

    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      roles: roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.accessTokenLifetime,
      jti: crypto.randomBytes(16).toString('hex') // Token ID for revocation
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256'
    });
  }

  /**
   * Generate JWT refresh token for user
   *
   * @param user - User object
   * @returns JWT refresh token string
   */
  public async generateRefreshToken(user: User): Promise<string> {
    const payload = {
      userId: user.id,
      username: user.username,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.refreshTokenLifetime,
      jti: crypto.randomBytes(16).toString('hex')
    };

    return jwt.sign(payload, this.jwtSecret, {
      algorithm: 'HS256'
    });
  }

  /**
   * Verify JWT token and return payload
   *
   * @param token - JWT token string
   * @returns Token payload if valid
   * @throws Error if token is invalid, expired, or revoked
   */
  public async verifyToken(token: string): Promise<TokenPayload> {
    try {
      // Verify token signature and expiration
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256']
      }) as TokenPayload;

      // Check if token is revoked
      const isRevoked = await this.isTokenRevoked(token);
      if (isRevoked) {
        throw new Error('Token has been revoked');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token string
   * @returns AuthResult with new access token
   */
  public async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, this.jwtSecret, {
        algorithms: ['HS256']
      }) as any;

      // Check if it's a refresh token
      if (payload.type !== 'refresh') {
        return { success: false, error: 'Invalid refresh token' };
      }

      // Check if token is revoked
      const isRevoked = await this.isTokenRevoked(refreshToken);
      if (isRevoked) {
        return { success: false, error: 'Refresh token has been revoked' };
      }

      // Fetch user
      const user = await this.getUserById(payload.userId);
      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' };
      }

      // Generate new access token
      const newToken = await this.generateToken(user);

      return {
        success: true,
        token: newToken,
        user: this.toUserDTO(user)
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { success: false, error: 'Refresh token expired' };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { success: false, error: 'Invalid refresh token' };
      }
      return { success: false, error: 'Token refresh failed' };
    }
  }

  /**
   * Hash password using bcrypt
   *
   * @param password - Plain text password
   * @returns Bcrypt hash
   */
  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptCostFactor);
  }

  /**
   * Compare password with hash
   *
   * @param password - Plain text password
   * @param hash - Bcrypt hash
   * @returns True if password matches hash
   */
  public async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Verify password against hash (alias for comparePassword)
   *
   * @param password - Plain text password
   * @param hash - Bcrypt hash
   * @returns True if password matches hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return this.comparePassword(password, hash);
  }

  /**
   * Revoke a specific token
   *
   * @param token - JWT token to revoke
   */
  public async revokeToken(token: string): Promise<void> {
    try {
      // Decode token to get expiration (don't verify, as it might be expired)
      const decoded = jwt.decode(token) as any;
      if (!decoded) {
        throw new Error('Invalid token format');
      }

      // Hash token for storage (don't store raw tokens)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date(decoded.exp * 1000).toISOString();
      const revokedAt = new Date().toISOString();

      await this.runQuery(
        `INSERT INTO revoked_tokens (token, userId, revokedAt, expiresAt)
         VALUES (?, ?, ?, ?)`,
        [tokenHash, decoded.userId, revokedAt, expiresAt]
      );
    } catch (error) {
      console.error('Error revoking token:', error);
      throw new Error('Failed to revoke token');
    }
  }

  /**
   * Revoke all tokens for a specific user
   *
   * @param userId - User ID
   */
  public async revokeAllUserTokens(userId: string): Promise<void> {
    // This is a simplified implementation
    // In production, you might want to track all active tokens per user
    // For now, we'll add a marker that invalidates all tokens issued before this time
    const revokedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.refreshTokenLifetime * 1000).toISOString();
    const markerToken = `user_revoke_all_${userId}`;

    // First, try to update existing marker
    const existing = await this.getQuery<{ token: string }>(
      'SELECT token FROM revoked_tokens WHERE token = ?',
      [markerToken]
    );

    if (existing) {
      // Update existing marker with new revocation time
      await this.runQuery(
        `UPDATE revoked_tokens SET revokedAt = ?, expiresAt = ? WHERE token = ?`,
        [revokedAt, expiresAt, markerToken]
      );
    } else {
      // Insert new marker
      await this.runQuery(
        `INSERT INTO revoked_tokens (token, userId, revokedAt, expiresAt)
         VALUES (?, ?, ?, ?)`,
        [markerToken, userId, revokedAt, expiresAt]
      );
    }
  }

  /**
   * Check if token is revoked
   *
   * @param token - JWT token
   * @returns True if token is revoked
   */
  private async isTokenRevoked(token: string): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded) {
        return true;
      }

      // Hash token for lookup
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Check if specific token is revoked
      const revokedToken = await this.getQuery<{ token: string }>(
        'SELECT token FROM revoked_tokens WHERE token = ? AND expiresAt > ?',
        [tokenHash, new Date().toISOString()]
      );

      if (revokedToken) {
        return true;
      }

      // Check if all user tokens are revoked
      const userRevocation = await this.getQuery<{ revokedAt: string }>(
        `SELECT revokedAt FROM revoked_tokens
         WHERE token = ? AND expiresAt > ?`,
        [`user_revoke_all_${decoded.userId}`, new Date().toISOString()]
      );

      if (userRevocation) {
        // Check if token was issued before the revocation
        const tokenIssuedAt = decoded.iat * 1000;
        const revokedAt = new Date(userRevocation.revokedAt).getTime();
        return tokenIssuedAt < revokedAt;
      }

      return false;
    } catch (error) {
      console.error('Error checking token revocation:', error);
      return true; // Fail secure: treat as revoked if check fails
    }
  }

  /**
   * Get user by username (including inactive users)
   */
  private async getUserByUsernameIncludingInactive(username: string): Promise<User | null> {
    return this.getQuery<User>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
  }

  /**
   * Get user by ID
   */
  private async getUserById(userId: string): Promise<User | null> {
    return this.getQuery<User>(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
  }

  /**
   * Get user roles
   */
  private async getUserRoles(userId: string): Promise<string[]> {
    const roles = await this.allQuery<{ name: string }>(
      `SELECT DISTINCT r.name FROM roles r
       WHERE r.id IN (
         SELECT roleId FROM user_roles WHERE userId = ?
         UNION
         SELECT gr.roleId FROM group_roles gr
         INNER JOIN user_groups ug ON ug.groupId = gr.groupId
         WHERE ug.userId = ?
       )`,
      [userId, userId]
    );

    return roles.map(r => r.name);
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.runQuery(
      'UPDATE users SET lastLoginAt = ? WHERE id = ?',
      [now, userId]
    );
  }
  /**
   * Log failed authentication attempt
   *
   * @param username - Username that failed authentication
   * @param reason - Reason for authentication failure
   * @private
   */
  private async logFailedAuthentication(username: string, reason: string): Promise<void> {
    const timestamp = new Date().toISOString();

    // Log to console for now (can be extended to database or external logging service)
    console.warn(`[AUTH FAILURE] ${timestamp} - Username: ${username} - Reason: ${reason}`);

    // TODO: Store in audit log table for security monitoring
    // This could be extended to:
    // 1. Store in database audit_logs table
    // 2. Send to external logging service (e.g., Splunk, ELK)
    // 3. Trigger security alerts for suspicious patterns
    //
    // Note: IP address logging should be done at the API layer where
    // request context is available, then passed to this method
  }
  /**
   * Check if account is locked due to failed login attempts
   *
   * @param username - Username to check
   * @returns Object with isLocked status and reason
   */
  private async checkAccountLockout(username: string): Promise<{ isLocked: boolean; reason?: string }> {
    try {
      // Check for existing lockout
      const lockout = await this.getQuery<{
        lockoutType: string;
        lockedUntil: string | null;
        failedAttempts: number;
      }>(
        'SELECT lockoutType, lockedUntil, failedAttempts FROM account_lockouts WHERE username = ?',
        [username]
      );

      if (lockout) {
        // Check permanent lockout
        if (lockout.lockoutType === 'permanent') {
          return {
            isLocked: true,
            reason: 'Account is permanently locked. Please contact an administrator.'
          };
        }

        // Check temporary lockout
        if (lockout.lockoutType === 'temporary' && lockout.lockedUntil) {
          const lockedUntil = new Date(lockout.lockedUntil);
          const now = new Date();

          if (now < lockedUntil) {
            const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
            return {
              isLocked: true,
              reason: `Account is temporarily locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`
            };
          } else {
            // Temporary lockout expired - remove it
            await this.runQuery('DELETE FROM account_lockouts WHERE username = ?', [username]);
          }
        }
      }

      return { isLocked: false };
    } catch (error) {
      console.error('Error checking account lockout:', error);
      // Fail secure: don't lock account on error
      return { isLocked: false };
    }
  }

  /**
   * Record a failed login attempt and apply lockout if necessary
   *
   * @param username - Username that failed authentication
   * @param reason - Reason for failure
   * @param ipAddress - Optional IP address of the attempt
   */
  /**
     * Record a failed login attempt and apply lockout if necessary
     *
     * @param username - Username that failed authentication
     * @param reason - Reason for failure
     * @param ipAddress - Optional IP address of the attempt
     */
    private async recordFailedLoginAttempt(
      username: string,
      reason: string,
      ipAddress?: string
    ): Promise<void> {
      try {
        const now = new Date();
        const timestamp = now.toISOString();

        // Record the failed attempt
        await this.runQuery(
          `INSERT INTO failed_login_attempts (username, attemptedAt, ipAddress, reason)
           VALUES (?, ?, ?, ?)`,
          [username, timestamp, ipAddress || null, reason]
        );

        // Count total failed attempts (not just within window, for permanent lockout)
        const totalAttempts = await this.getQuery<{ count: number }>(
          `SELECT COUNT(*) as count FROM failed_login_attempts
           WHERE username = ?`,
          [username]
        );

        const totalCount = totalAttempts?.count || 0;

        // Check for permanent lockout first (10 attempts total)
        if (totalCount >= this.PERMANENT_LOCKOUT_ATTEMPTS) {
          await this.applyPermanentLockout(username, totalCount);
          return;
        }

        // Count recent failed attempts (within the lockout window) for temporary lockout
        const windowStart = new Date(now.getTime() - this.TEMP_LOCKOUT_WINDOW_MINUTES * 60000);
        const recentAttempts = await this.getQuery<{ count: number }>(
          `SELECT COUNT(*) as count FROM failed_login_attempts
           WHERE username = ? AND attemptedAt >= ?`,
          [username, windowStart.toISOString()]
        );

        const recentCount = recentAttempts?.count || 0;

        // Check for temporary lockout (5 attempts in 15 minutes)
        if (recentCount >= this.TEMP_LOCKOUT_ATTEMPTS) {
          await this.applyTemporaryLockout(username, recentCount);
        }
      } catch (error) {
        console.error('Error recording failed login attempt:', error);
        // Don't throw - authentication flow should continue
      }
    }

  /**
   * Apply temporary account lockout
   *
   * @param username - Username to lock
   * @param failedAttempts - Number of failed attempts
   */
  private async applyTemporaryLockout(username: string, failedAttempts: number): Promise<void> {
    try {
      const now = new Date();
      const lockedAt = now.toISOString();
      const lockedUntil = new Date(now.getTime() + this.TEMP_LOCKOUT_DURATION_MINUTES * 60000).toISOString();

      // Check if lockout already exists
      const existing = await this.getQuery<{ username: string }>(
        'SELECT username FROM account_lockouts WHERE username = ?',
        [username]
      );

      if (existing) {
        // Update existing lockout
        await this.runQuery(
          `UPDATE account_lockouts
           SET lockoutType = ?, lockedAt = ?, lockedUntil = ?, failedAttempts = ?, lastAttemptAt = ?
           WHERE username = ?`,
          ['temporary', lockedAt, lockedUntil, failedAttempts, lockedAt, username]
        );
      } else {
        // Insert new lockout
        await this.runQuery(
          `INSERT INTO account_lockouts (username, lockoutType, lockedAt, lockedUntil, failedAttempts, lastAttemptAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [username, 'temporary', lockedAt, lockedUntil, failedAttempts, lockedAt]
        );
      }

      console.warn(`[SECURITY] Temporary lockout applied to username: ${username} (${failedAttempts} failed attempts)`);
    } catch (error) {
      console.error('Error applying temporary lockout:', error);
    }
  }

  /**
   * Apply permanent account lockout
   *
   * @param username - Username to lock
   * @param failedAttempts - Number of failed attempts
   */
  private async applyPermanentLockout(username: string, failedAttempts: number): Promise<void> {
    try {
      const now = new Date();
      const lockedAt = now.toISOString();

      // Check if lockout already exists
      const existing = await this.getQuery<{ username: string }>(
        'SELECT username FROM account_lockouts WHERE username = ?',
        [username]
      );

      if (existing) {
        // Update to permanent lockout
        await this.runQuery(
          `UPDATE account_lockouts
           SET lockoutType = ?, lockedAt = ?, lockedUntil = NULL, failedAttempts = ?, lastAttemptAt = ?
           WHERE username = ?`,
          ['permanent', lockedAt, failedAttempts, lockedAt, username]
        );
      } else {
        // Insert new permanent lockout
        await this.runQuery(
          `INSERT INTO account_lockouts (username, lockoutType, lockedAt, lockedUntil, failedAttempts, lastAttemptAt)
           VALUES (?, ?, ?, NULL, ?, ?)`,
          [username, 'permanent', lockedAt, failedAttempts, lockedAt]
        );
      }

      console.error(`[SECURITY ALERT] Permanent lockout applied to username: ${username} (${failedAttempts} failed attempts)`);
    } catch (error) {
      console.error('Error applying permanent lockout:', error);
    }
  }

  /**
   * Clear failed login attempts for a user (called on successful authentication)
   *
   * @param username - Username to clear attempts for
   */
  private async clearFailedLoginAttempts(username: string): Promise<void> {
    try {
      // Remove failed attempts
      await this.runQuery(
        'DELETE FROM failed_login_attempts WHERE username = ?',
        [username]
      );

      // Remove any temporary lockouts (permanent lockouts remain)
      await this.runQuery(
        `DELETE FROM account_lockouts WHERE username = ? AND lockoutType = 'temporary'`,
        [username]
      );
    } catch (error) {
      console.error('Error clearing failed login attempts:', error);
      // Don't throw - successful authentication should proceed
    }
  }

  /**
   * Unlock a user account (admin function)
   *
   * @param username - Username to unlock
   */
  public async unlockAccount(username: string): Promise<void> {
    try {
      // Remove all lockouts
      await this.runQuery('DELETE FROM account_lockouts WHERE username = ?', [username]);

      // Clear failed attempts
      await this.runQuery('DELETE FROM failed_login_attempts WHERE username = ?', [username]);

      console.info(`[ADMIN] Account unlocked: ${username}`);
    } catch (error) {
      console.error('Error unlocking account:', error);
      throw new Error('Failed to unlock account');
    }
  }

  /**
   * Get failed login attempts for a user (admin function)
   *
   * @param username - Username to check
   * @returns Array of failed login attempts
   */
  public async getFailedLoginAttempts(username: string): Promise<Array<{
    attemptedAt: string;
    ipAddress: string | null;
    reason: string;
  }>> {
    try {
      return await this.allQuery<{
        attemptedAt: string;
        ipAddress: string | null;
        reason: string;
      }>(
        `SELECT attemptedAt, ipAddress, reason FROM failed_login_attempts
         WHERE username = ?
         ORDER BY attemptedAt DESC
         LIMIT 50`,
        [username]
      );
    } catch (error) {
      console.error('Error getting failed login attempts:', error);
      return [];
    }
  }

  /**
   * Get account lockout status (admin function)
   *
   * @param username - Username to check
   * @returns Lockout information or null if not locked
   */
  public async getAccountLockoutStatus(username: string): Promise<{
    lockoutType: string;
    lockedAt: string;
    lockedUntil: string | null;
    failedAttempts: number;
  } | null> {
    try {
      return await this.getQuery<{
        lockoutType: string;
        lockedAt: string;
        lockedUntil: string | null;
        failedAttempts: number;
      }>(
        'SELECT lockoutType, lockedAt, lockedUntil, failedAttempts FROM account_lockouts WHERE username = ?',
        [username]
      );
    } catch (error) {
      console.error('Error getting account lockout status:', error);
      return null;
    }
  }


  /**
   * Convert User to UserDTO (remove password hash)
   */
  private toUserDTO(user: User): UserDTO {
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

  // Brute force protection constants
  private readonly TEMP_LOCKOUT_ATTEMPTS = 5;
  private readonly TEMP_LOCKOUT_WINDOW_MINUTES = 15;
  private readonly TEMP_LOCKOUT_DURATION_MINUTES = 15;
  private readonly PERMANENT_LOCKOUT_ATTEMPTS = 10;

}
