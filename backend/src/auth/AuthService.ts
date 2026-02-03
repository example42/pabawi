/**
 * Authentication Service - JWT-based Authentication
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 7)
 *
 * Provides JWT token generation, validation, and refresh functionality
 * with secure token management including revocation support.
 */

import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import type { User, UserPublic } from "./types.js";
import { UserService } from "./UserService.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * JWT token pair returned after successful authentication
 */
export interface AuthTokens {
  /** Short-lived access token (default: 1 hour) */
  accessToken: string;
  /** Long-lived refresh token (default: 7 days) */
  refreshToken: string;
  /** Token type (always "Bearer") */
  tokenType: "Bearer";
  /** Access token expiration time in seconds */
  expiresIn: number;
  /** Refresh token expiration time in seconds */
  refreshExpiresIn: number;
}

/**
 * JWT access token payload
 */
export interface JWTAccessPayload {
  /** Token type */
  type: "access";
  /** User ID */
  userId: string;
  /** Username */
  username: string;
  /** Direct role IDs */
  roles: string[];
  /** Group IDs */
  groups: string[];
  /** Token ID for revocation tracking */
  jti: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/**
 * JWT refresh token payload
 */
export interface JWTRefreshPayload {
  /** Token type */
  type: "refresh";
  /** User ID */
  userId: string;
  /** Token ID for revocation tracking */
  jti: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/**
 * Validated token result
 */
export interface ValidatedToken {
  /** Decoded payload */
  payload: JWTAccessPayload;
  /** Associated user */
  user: User;
}

/**
 * Token revocation record in database
 */
interface TokenRevocationRow {
  jti: string;
  user_id: string;
  token_type: string;
  revoked_at: string;
  expires_at: string;
  reason: string | null;
}

/**
 * Refresh token record in database
 */
interface RefreshTokenRow {
  jti: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  revoked: number;
}

/**
 * Authentication configuration
 */
export interface AuthServiceConfig {
  /** JWT signing secret (required) */
  jwtSecret: string;
  /** Access token expiration in seconds (default: 3600 = 1 hour) */
  accessTokenExpiry?: number;
  /** Refresh token expiration in seconds (default: 604800 = 7 days) */
  refreshTokenExpiry?: number;
  /** JWT issuer claim */
  issuer?: string;
  /** JWT audience claim */
  audience?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  accessTokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 604800, // 7 days
  issuer: "pabawi",
  audience: "pabawi-api",
};

/**
 * Service for handling JWT-based authentication
 */
export class AuthService {
  private logger: LoggerService;
  private config: Required<AuthServiceConfig>;
  private userService: UserService;
  private initialized = false;

  constructor(
    private db: DatabaseAdapter,
    config: AuthServiceConfig
  ) {
    this.logger = new LoggerService();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.userService = new UserService(db);
  }

  /**
   * Initialize the auth service (create required tables)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info("Initializing AuthService", {
      component: "AuthService",
      operation: "initialize",
    });

    // Create token-related tables if they don't exist
    await this.db.exec(`
      -- Refresh token tracking
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        jti TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Token revocation list (for both access and refresh tokens)
      CREATE TABLE IF NOT EXISTS token_revocations (
        jti TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_type TEXT NOT NULL,
        revoked_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_token_revocations_user ON token_revocations(user_id);
      CREATE INDEX IF NOT EXISTS idx_token_revocations_expires ON token_revocations(expires_at);
    `);

    this.initialized = true;
    this.logger.info("AuthService initialized successfully", {
      component: "AuthService",
      operation: "initialize",
    });
  }

  /**
   * Authenticate a user with username and password
   *
   * @param username - Username or email
   * @param password - Plain text password
   * @returns Auth tokens on success
   * @throws Error if authentication fails
   */
  async authenticate(
    username: string,
    password: string
  ): Promise<AuthTokens> {
    this.logger.info("Authentication attempt", {
      component: "AuthService",
      operation: "authenticate",
      metadata: { username },
    });

    // Find user by username or email
    const user = await this.userService.findByUsernameOrEmail(username);

    if (!user) {
      this.logger.warn("Authentication failed: user not found", {
        component: "AuthService",
        operation: "authenticate",
        metadata: { username },
      });
      throw new AuthenticationError("Invalid username or password");
    }

    if (!user.active) {
      this.logger.warn("Authentication failed: account disabled", {
        component: "AuthService",
        operation: "authenticate",
        metadata: { username, userId: user.id },
      });
      throw new AuthenticationError("Account is disabled");
    }

    // Verify password
    const isValid = await this.userService.verifyPassword(user.id, password);

    if (!isValid) {
      this.logger.warn("Authentication failed: invalid password", {
        component: "AuthService",
        operation: "authenticate",
        metadata: { username, userId: user.id },
      });
      throw new AuthenticationError("Invalid username or password");
    }

    // Update last login timestamp
    await this.userService.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    this.logger.info("Authentication successful", {
      component: "AuthService",
      operation: "authenticate",
      metadata: { username, userId: user.id },
    });

    return tokens;
  }

  /**
   * Validate an access token and return the user
   *
   * @param token - JWT access token
   * @returns Validated token with user
   * @throws Error if token is invalid or revoked
   */
  async validateToken(token: string): Promise<ValidatedToken> {
    try {
      // Verify and decode the token
      const payload = jwt.verify(token, this.config.jwtSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JWTAccessPayload;

      // Check token type
      if (payload.type !== "access") {
        throw new AuthenticationError("Invalid token type");
      }

      // Check if token is revoked
      const isRevoked = await this.isTokenRevoked(payload.jti);
      if (isRevoked) {
        throw new AuthenticationError("Token has been revoked");
      }

      // Get the user
      const user = await this.userService.getById(payload.userId);
      if (!user) {
        throw new AuthenticationError("User not found");
      }

      if (!user.active) {
        throw new AuthenticationError("Account is disabled");
      }

      return { payload, user };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError("Token has expired");
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError("Invalid token");
      }

      throw new AuthenticationError("Token validation failed");
    }
  }

  /**
   * Refresh tokens using a valid refresh token
   *
   * @param refreshToken - JWT refresh token
   * @returns New auth tokens
   * @throws Error if refresh token is invalid or revoked
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify and decode the refresh token
      const payload = jwt.verify(refreshToken, this.config.jwtSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JWTRefreshPayload;

      // Check token type
      if (payload.type !== "refresh") {
        throw new AuthenticationError("Invalid token type");
      }

      // Check if refresh token is revoked
      const tokenRecord = await this.db.queryOne<RefreshTokenRow>(
        "SELECT * FROM refresh_tokens WHERE jti = ?",
        [payload.jti]
      );

      if (!tokenRecord) {
        throw new AuthenticationError("Refresh token not found");
      }

      if (tokenRecord.revoked === 1) {
        throw new AuthenticationError("Refresh token has been revoked");
      }

      // Get the user
      const user = await this.userService.getById(payload.userId);
      if (!user) {
        throw new AuthenticationError("User not found");
      }

      if (!user.active) {
        throw new AuthenticationError("Account is disabled");
      }

      // Revoke the old refresh token (rotation)
      await this.db.execute(
        "UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?",
        [payload.jti]
      );

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      this.logger.info("Token refresh successful", {
        component: "AuthService",
        operation: "refreshToken",
        metadata: { userId: user.id },
      });

      return tokens;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError("Refresh token has expired");
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError("Invalid refresh token");
      }

      throw new AuthenticationError("Token refresh failed");
    }
  }

  /**
   * Revoke a specific token
   *
   * @param token - JWT token to revoke
   * @param reason - Optional reason for revocation
   */
  async revokeToken(token: string, reason?: string): Promise<void> {
    try {
      // Decode without verification to get the jti and exp
      const decoded = jwt.decode(token) as JWTAccessPayload | JWTRefreshPayload | null;

      if (!decoded?.jti) {
        throw new AuthenticationError("Invalid token format");
      }

      const tokenType = decoded.type;
      const expiresAt = new Date(decoded.exp * 1000);

      // Add to revocation list
      await this.db.execute(
        `INSERT OR REPLACE INTO token_revocations (jti, user_id, token_type, revoked_at, expires_at, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          decoded.jti,
          decoded.userId,
          tokenType,
          new Date().toISOString(),
          expiresAt.toISOString(),
          reason || null,
        ]
      );

      // If it's a refresh token, also mark it as revoked in refresh_tokens table
      if (tokenType === "refresh") {
        await this.db.execute(
          "UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?",
          [decoded.jti]
        );
      }

      this.logger.info("Token revoked", {
        component: "AuthService",
        operation: "revokeToken",
        metadata: { jti: decoded.jti, tokenType, reason },
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError("Failed to revoke token");
    }
  }

  /**
   * Revoke all tokens for a user (logout from all devices)
   *
   * @param userId - User ID
   * @param reason - Optional reason for revocation
   */
  async revokeAllUserTokens(userId: string, reason?: string): Promise<void> {
    this.logger.info("Revoking all tokens for user", {
      component: "AuthService",
      operation: "revokeAllUserTokens",
      metadata: { userId, reason },
    });

    // Revoke all refresh tokens
    await this.db.execute(
      "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0",
      [userId]
    );

    // Note: Access tokens will naturally expire, but we can't revoke them all
    // without storing every access token JTI. For a full logout, we rely on
    // the short access token expiry and revoked refresh tokens.

    this.logger.info("All user tokens revoked", {
      component: "AuthService",
      operation: "revokeAllUserTokens",
      metadata: { userId },
    });
  }

  /**
   * Generate new access and refresh tokens for a user
   *
   * @param user - User to generate tokens for
   * @returns Auth tokens
   */
  async generateTokens(user: User): Promise<AuthTokens> {
    const now = Math.floor(Date.now() / 1000);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    // Access token payload
    const accessPayload: Omit<JWTAccessPayload, "iat" | "exp"> = {
      type: "access",
      userId: user.id,
      username: user.username,
      roles: user.roles,
      groups: user.groups,
      jti: accessJti,
    };

    // Refresh token payload
    const refreshPayload: Omit<JWTRefreshPayload, "iat" | "exp"> = {
      type: "refresh",
      userId: user.id,
      jti: refreshJti,
    };

    // Sign tokens
    const accessToken = jwt.sign(accessPayload, this.config.jwtSecret, {
      expiresIn: this.config.accessTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
    });

    const refreshToken = jwt.sign(refreshPayload, this.config.jwtSecret, {
      expiresIn: this.config.refreshTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
    });

    // Store refresh token for tracking
    const refreshExpiresAt = new Date(
      (now + this.config.refreshTokenExpiry) * 1000
    );
    await this.db.execute(
      `INSERT INTO refresh_tokens (jti, user_id, issued_at, expires_at, revoked)
       VALUES (?, ?, ?, ?, 0)`,
      [
        refreshJti,
        user.id,
        new Date(now * 1000).toISOString(),
        refreshExpiresAt.toISOString(),
      ]
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: this.config.accessTokenExpiry,
      refreshExpiresIn: this.config.refreshTokenExpiry,
    };
  }

  /**
   * Check if a token JTI has been revoked
   *
   * @param jti - Token ID
   * @returns True if revoked
   */
  private async isTokenRevoked(jti: string): Promise<boolean> {
    const revocation = await this.db.queryOne<TokenRevocationRow>(
      "SELECT jti FROM token_revocations WHERE jti = ?",
      [jti]
    );
    return revocation !== null;
  }

  /**
   * Clean up expired tokens from revocation list
   * Should be called periodically (e.g., daily via cron)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date().toISOString();

    // Clean up expired revocation records
    const revocationResult = await this.db.execute(
      "DELETE FROM token_revocations WHERE expires_at < ?",
      [now]
    );

    // Clean up expired refresh tokens
    const refreshResult = await this.db.execute(
      "DELETE FROM refresh_tokens WHERE expires_at < ?",
      [now]
    );

    const totalDeleted =
      revocationResult.changes + refreshResult.changes;

    this.logger.info("Cleaned up expired tokens", {
      component: "AuthService",
      operation: "cleanupExpiredTokens",
      metadata: {
        revocationsDeleted: revocationResult.changes,
        refreshTokensDeleted: refreshResult.changes,
        totalDeleted,
      },
    });

    return totalDeleted;
  }

  /**
   * Get active sessions (refresh tokens) for a user
   *
   * @param userId - User ID
   * @returns Active session count
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM refresh_tokens
       WHERE user_id = ? AND revoked = 0 AND expires_at > ?`,
      [userId, now]
    );
    return result?.count ?? 0;
  }

  /**
   * Decode a token without verification (for inspection)
   *
   * @param token - JWT token
   * @returns Decoded payload or null
   */
  decodeToken(token: string): JWTAccessPayload | JWTRefreshPayload | null {
    return jwt.decode(token) as JWTAccessPayload | JWTRefreshPayload | null;
  }

  /**
   * Convert User to UserPublic (strip sensitive fields)
   */
  toPublicUser(user: User): UserPublic {
    return this.userService.toPublicUser(user);
  }
}

/**
 * Authentication-specific error class
 */
export class AuthenticationError extends Error {
  public readonly statusCode = 401;
  public readonly code = "AUTHENTICATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
