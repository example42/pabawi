/**
 * Authentication Middleware
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 9)
 *
 * Provides JWT-based authentication middleware for Express routes.
 * Extracts and validates Bearer tokens from Authorization header.
 */

import type { Request, Response, NextFunction } from "express";
import type { User } from "../auth/types.js";
import { AuthService, AuthenticationError } from "../auth/AuthService.js";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { LoggerService } from "../services/LoggerService.js";

// Extend Express Request to include authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Authenticated user (set by auth middleware) */
      user?: User;
      /** Authentication status */
      isAuthenticated?: boolean;
    }
  }
}

/**
 * Configuration for authentication middleware
 */
export interface AuthMiddlewareConfig {
  /** Database adapter for AuthService */
  db: DatabaseAdapter;
  /** JWT secret for token validation */
  jwtSecret: string;
  /** Whether authentication is optional (for public routes with optional auth) */
  optional?: boolean;
}

/**
 * Create authentication middleware
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const authService = new AuthService(config.db, {
    jwtSecret: config.jwtSecret,
  });
  const logger = new LoggerService();

  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (config.optional) {
        req.isAuthenticated = false;
        return next();
      }

      logger.debug("No authorization header", {
        component: "AuthMiddleware",
        operation: "authenticate",
        metadata: { path: req.path, method: req.method },
      });

      res.status(401).json({
        error: "Authentication required",
        code: "NO_TOKEN",
      });
      return;
    }

    // Check for Bearer token format
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      if (config.optional) {
        req.isAuthenticated = false;
        return next();
      }

      logger.debug("Invalid authorization header format", {
        component: "AuthMiddleware",
        operation: "authenticate",
        metadata: { path: req.path, method: req.method },
      });

      res.status(401).json({
        error: "Invalid authorization header format",
        code: "INVALID_TOKEN_FORMAT",
      });
      return;
    }

    const token = parts[1];

    try {
      // Initialize auth service if not already done
      await authService.initialize();

      // Validate the token
      const { user } = await authService.validateToken(token);

      // Attach user to request
      req.user = user;
      req.isAuthenticated = true;

      logger.debug("Authentication successful", {
        component: "AuthMiddleware",
        operation: "authenticate",
        metadata: {
          userId: user.id,
          username: user.username,
          path: req.path,
        },
      });

      next();
    } catch (error) {
      if (config.optional) {
        req.isAuthenticated = false;
        return next();
      }

      if (error instanceof AuthenticationError) {
        logger.debug("Authentication failed", {
          component: "AuthMiddleware",
          operation: "authenticate",
          metadata: {
            path: req.path,
            method: req.method,
            error: error.message,
          },
        });

        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      // Unexpected error
      logger.error("Authentication error", {
        component: "AuthMiddleware",
        operation: "authenticate",
        metadata: {
          path: req.path,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      res.status(500).json({
        error: "Authentication error",
        code: "AUTH_ERROR",
      });
    }
  };
}

/**
 * Convenience middleware for required authentication
 */
export function requireAuth(config: Omit<AuthMiddlewareConfig, "optional">) {
  return createAuthMiddleware({ ...config, optional: false });
}

/**
 * Convenience middleware for optional authentication
 * (User will be attached if token is valid, but request continues if no token)
 */
export function optionalAuth(config: Omit<AuthMiddlewareConfig, "optional">) {
  return createAuthMiddleware({ ...config, optional: true });
}
