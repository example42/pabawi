/**
 * Authentication Routes
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 10)
 *
 * Provides REST API endpoints for authentication:
 * - POST /api/auth/login - Authenticate with username/password
 * - POST /api/auth/refresh - Refresh tokens
 * - POST /api/auth/logout - Logout (revoke tokens)
 * - GET /api/auth/me - Get current user and permissions
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { AuthService, AuthenticationError, type AuthTokens } from "../auth/AuthService.js";
import { AuthorizationService } from "../auth/AuthorizationService.js";
import type { User, UserPublic } from "../auth/types.js";
import { createAuthMiddleware, optionalAuth } from "../middleware/auth.js";
import { LoggerService } from "../services/LoggerService.js";
import { ExpertModeService } from "../services/ExpertModeService.js";

/**
 * Configuration for auth routes
 */
export interface AuthRoutesConfig {
  /** Database adapter */
  db: DatabaseAdapter;
  /** JWT secret */
  jwtSecret: string;
  /** Access token expiry in seconds (default: 3600) */
  accessTokenExpiry?: number;
  /** Refresh token expiry in seconds (default: 604800) */
  refreshTokenExpiry?: number;
}

/**
 * Login request body
 */
interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Refresh request body
 */
interface RefreshRequest {
  refreshToken: string;
}

/**
 * Logout request body
 */
interface LogoutRequest {
  /** Access token to revoke (optional - if not provided, uses current session) */
  accessToken?: string;
  /** Refresh token to revoke (optional) */
  refreshToken?: string;
  /** Logout from all sessions */
  allSessions?: boolean;
}

/**
 * Login response
 */
interface LoginResponse {
  tokens: AuthTokens;
  user: UserPublic;
}

/**
 * Me response (current user info)
 */
interface MeResponse {
  user: UserPublic;
  permissions: {
    allowed: string[];
    denied: string[];
    roles: string[];
  };
}

/**
 * Create authentication router factory
 */
export function createAuthRouter(config: AuthRoutesConfig): Router {
  const router = Router();
  const logger = new LoggerService();
  const expertModeService = new ExpertModeService();

  const authService = new AuthService(config.db, {
    jwtSecret: config.jwtSecret,
    accessTokenExpiry: config.accessTokenExpiry,
    refreshTokenExpiry: config.refreshTokenExpiry,
  });

  const authorizationService = new AuthorizationService(config.db);

  // Initialize auth service on first request
  let initialized = false;
  const ensureInitialized = async () => {
    if (!initialized) {
      await authService.initialize();
      initialized = true;
    }
  };

  // Async handler wrapper
  const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  /**
   * POST /api/auth/login
   * Authenticate with username and password
   */
  router.post(
    "/login",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      await ensureInitialized();

      logger.info("Login attempt", {
        component: "AuthRouter",
        operation: "login",
        metadata: { username: req.body?.username },
      });

      const { username, password } = req.body as LoginRequest;

      // Validate input
      if (!username || !password) {
        res.status(400).json({
          error: "Username and password are required",
          code: "INVALID_INPUT",
        });
        return;
      }

      try {
        // Authenticate
        const tokens = await authService.authenticate(username, password);

        // Get user for response
        const validated = await authService.validateToken(tokens.accessToken);
        const userPublic = authService.toPublicUser(validated.user);

        const response: LoginResponse = {
          tokens,
          user: userPublic,
        };

        logger.info("Login successful", {
          component: "AuthRouter",
          operation: "login",
          metadata: { userId: userPublic.id, username: userPublic.username },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/auth/login",
            req.correlationId || "auth-login",
            duration
          );
          expertModeService.addInfo(debugInfo, {
            message: "Login successful",
            context: JSON.stringify({ userId: userPublic.id, username: userPublic.username }),
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(response, debugInfo));
          return;
        }

        res.json(response);
      } catch (error) {
        if (error instanceof AuthenticationError) {
          logger.warn("Login failed", {
            component: "AuthRouter",
            operation: "login",
            metadata: { username, error: error.message },
          });

          res.status(401).json({
            error: error.message,
            code: error.code,
          });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  router.post(
    "/refresh",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      await ensureInitialized();

      const { refreshToken } = req.body as RefreshRequest;

      if (!refreshToken) {
        res.status(400).json({
          error: "Refresh token is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      try {
        const tokens = await authService.refreshToken(refreshToken);

        logger.info("Token refresh successful", {
          component: "AuthRouter",
          operation: "refresh",
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/auth/refresh",
            req.correlationId || "auth-refresh",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo({ tokens }, debugInfo));
          return;
        }

        res.json({ tokens });
      } catch (error) {
        if (error instanceof AuthenticationError) {
          logger.warn("Token refresh failed", {
            component: "AuthRouter",
            operation: "refresh",
            metadata: { error: error.message },
          });

          res.status(401).json({
            error: error.message,
            code: error.code,
          });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * POST /api/auth/logout
   * Logout and revoke tokens
   */
  router.post(
    "/logout",
    optionalAuth({ db: config.db, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      await ensureInitialized();

      const { accessToken, refreshToken, allSessions } = req.body as LogoutRequest;
      const user = req.user as User | undefined;

      try {
        // If logout all sessions and we have a user
        if (allSessions && user) {
          await authService.revokeAllUserTokens(user.id, "Logout all sessions");
          logger.info("All sessions logged out", {
            component: "AuthRouter",
            operation: "logout",
            metadata: { userId: user.id },
          });
        } else {
          // Revoke specific tokens
          if (accessToken) {
            await authService.revokeToken(accessToken, "Logout");
          }
          if (refreshToken) {
            await authService.revokeToken(refreshToken, "Logout");
          }

          // If no tokens provided, try to revoke current token from header
          const authHeader = req.headers.authorization;
          if (!accessToken && !refreshToken && authHeader?.startsWith("Bearer ")) {
            const token = authHeader.slice(7);
            await authService.revokeToken(token, "Logout");
          }

          logger.info("Logout successful", {
            component: "AuthRouter",
            operation: "logout",
            metadata: { userId: user?.id },
          });
        }

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/auth/logout",
            req.correlationId || "auth-logout",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(
            { success: true, message: "Logged out successfully" },
            debugInfo
          ));
          return;
        }

        res.json({ success: true, message: "Logged out successfully" });
      } catch (error) {
        if (error instanceof AuthenticationError) {
          // Token might already be invalid/revoked, still return success
          logger.warn("Logout with invalid token", {
            component: "AuthRouter",
            operation: "logout",
            metadata: { error: error.message },
          });

          res.json({ success: true, message: "Logged out" });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * GET /api/auth/me
   * Get current authenticated user and permissions
   */
  router.get(
    "/me",
    createAuthMiddleware({ db: config.db, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      await ensureInitialized();

      const user = req.user as User;

      // Get effective permissions
      const effectivePermissions = await authorizationService.getEffectivePermissions(user);

      const response: MeResponse = {
        user: authService.toPublicUser(user),
        permissions: {
          allowed: effectivePermissions.allowedCapabilities,
          denied: effectivePermissions.deniedCapabilities,
          roles: effectivePermissions.sourceRoles,
        },
      };

      logger.debug("Retrieved current user info", {
        component: "AuthRouter",
        operation: "me",
        metadata: { userId: user.id },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/auth/me",
          req.correlationId || "auth-me",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(response, debugInfo));
        return;
      }

      res.json(response);
    })
  );

  /**
   * GET /api/auth/sessions
   * Get active session count for current user
   */
  router.get(
    "/sessions",
    createAuthMiddleware({ db: config.db, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      await ensureInitialized();

      const user = req.user as User;
      const count = await authService.getActiveSessionCount(user.id);

      res.json({
        activeSessions: count,
        userId: user.id,
      });
    })
  );

  /**
   * POST /api/auth/check
   * Check if a specific capability is allowed
   */
  router.post(
    "/check",
    createAuthMiddleware({ db: config.db, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const user = req.user as User;
      const { capability, context } = req.body as {
        capability: string;
        context?: Record<string, unknown>;
      };

      if (!capability) {
        res.status(400).json({
          error: "Capability is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      const result = await authorizationService.checkPermission(
        user,
        capability,
        context as any
      );

      res.json({
        capability,
        allowed: result.allowed,
        reason: result.reason,
      });
    })
  );

  return router;
}

export default createAuthRouter;
