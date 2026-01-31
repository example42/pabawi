/**
 * RBAC (Role-Based Access Control) Middleware
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 9)
 *
 * Provides capability-based authorization middleware for Express routes.
 * Checks user permissions against required capabilities.
 */

import type { Request, Response, NextFunction } from "express";
import type { User } from "../auth/types.js";
import {
  AuthorizationService,
  AuthorizationError,
  type ExecutionContext,
} from "../auth/AuthorizationService.js";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Configuration for RBAC middleware
 */
export interface RbacMiddlewareConfig {
  /** Database adapter for AuthorizationService */
  db: DatabaseAdapter;
  /** Cache TTL for permissions (default: 300000 = 5 minutes) */
  cacheTtl?: number;
}

/**
 * Options for require capability middleware
 */
export interface RequireCapabilityOptions {
  /** Extract execution context from request (for conditional permissions) */
  contextExtractor?: (req: Request) => ExecutionContext;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Shared AuthorizationService instance
 */
let authorizationService: AuthorizationService | null = null;

/**
 * Initialize the RBAC middleware with configuration
 *
 * @param config - RBAC middleware configuration
 */
export function initializeRbac(config: RbacMiddlewareConfig): void {
  authorizationService = new AuthorizationService(config.db, {
    cacheTtl: config.cacheTtl,
  });
}

/**
 * Get the authorization service instance
 * (for use outside middleware, e.g., in route handlers)
 */
export function getAuthorizationService(): AuthorizationService {
  if (!authorizationService) {
    throw new Error("RBAC middleware not initialized. Call initializeRbac() first.");
  }
  return authorizationService;
}

/**
 * Create middleware that requires a specific capability
 *
 * @param capability - Required capability (e.g., 'command.execute')
 * @param options - Additional options
 * @returns Express middleware function
 */
export function requireCapability(
  capability: string,
  options: RequireCapabilityOptions = {}
) {
  const logger = new LoggerService();

  return async function rbacMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Check if user is authenticated
    const user = req.user;

    if (!user) {
      logger.debug("RBAC check failed: no user", {
        component: "RbacMiddleware",
        operation: "requireCapability",
        metadata: { capability, path: req.path },
      });

      res.status(401).json({
        error: "Authentication required",
        code: "NO_USER",
      });
      return;
    }

    // Ensure authorization service is initialized
    if (!authorizationService) {
      logger.error("RBAC not initialized", {
        component: "RbacMiddleware",
        operation: "requireCapability",
      });

      res.status(500).json({
        error: "Authorization service not configured",
        code: "RBAC_NOT_CONFIGURED",
      });
      return;
    }

    // Extract execution context if provided
    const context = options.contextExtractor
      ? options.contextExtractor(req)
      : extractDefaultContext(req);

    try {
      // Check permission
      const result = await authorizationService.checkPermission(
        user,
        capability,
        context
      );

      if (!result.allowed) {
        logger.info("Permission denied", {
          component: "RbacMiddleware",
          operation: "requireCapability",
          metadata: {
            userId: user.id,
            username: user.username,
            capability,
            reason: result.reason,
            path: req.path,
          },
        });

        res.status(403).json({
          error: options.errorMessage || `Permission denied: requires '${capability}' capability`,
          code: "PERMISSION_DENIED",
          capability,
          reason: result.reason,
        });
        return;
      }

      logger.debug("Permission granted", {
        component: "RbacMiddleware",
        operation: "requireCapability",
        metadata: {
          userId: user.id,
          capability,
          path: req.path,
        },
      });

      next();
    } catch (error) {
      logger.error("Authorization check failed", {
        component: "RbacMiddleware",
        operation: "requireCapability",
        metadata: {
          userId: user.id,
          capability,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      res.status(500).json({
        error: "Authorization check failed",
        code: "RBAC_ERROR",
      });
    }
  };
}

/**
 * Create middleware that requires ANY of the specified capabilities
 *
 * @param capabilities - Array of capabilities (user needs at least one)
 * @param options - Additional options
 * @returns Express middleware function
 */
export function requireAnyCapability(
  capabilities: string[],
  options: RequireCapabilityOptions = {}
) {
  const logger = new LoggerService();

  return async function rbacAnyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: "Authentication required",
        code: "NO_USER",
      });
      return;
    }

    if (!authorizationService) {
      res.status(500).json({
        error: "Authorization service not configured",
        code: "RBAC_NOT_CONFIGURED",
      });
      return;
    }

    const context = options.contextExtractor
      ? options.contextExtractor(req)
      : extractDefaultContext(req);

    try {
      // Check if user has any of the capabilities
      for (const capability of capabilities) {
        const result = await authorizationService.checkPermission(
          user,
          capability,
          context
        );

        if (result.allowed) {
          logger.debug("Permission granted (any)", {
            component: "RbacMiddleware",
            operation: "requireAnyCapability",
            metadata: { userId: user.id, capability, path: req.path },
          });
          next(); return;
        }
      }

      // None of the capabilities were allowed
      logger.info("Permission denied (none matched)", {
        component: "RbacMiddleware",
        operation: "requireAnyCapability",
        metadata: {
          userId: user.id,
          capabilities,
          path: req.path,
        },
      });

      res.status(403).json({
        error: options.errorMessage || `Permission denied: requires one of [${capabilities.join(", ")}]`,
        code: "PERMISSION_DENIED",
        capabilities,
      });
    } catch (error) {
      logger.error("Authorization check failed", {
        component: "RbacMiddleware",
        operation: "requireAnyCapability",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      res.status(500).json({
        error: "Authorization check failed",
        code: "RBAC_ERROR",
      });
    }
  };
}

/**
 * Create middleware that requires ALL of the specified capabilities
 *
 * @param capabilities - Array of capabilities (user needs all of them)
 * @param options - Additional options
 * @returns Express middleware function
 */
export function requireAllCapabilities(
  capabilities: string[],
  options: RequireCapabilityOptions = {}
) {
  const logger = new LoggerService();

  return async function rbacAllMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: "Authentication required",
        code: "NO_USER",
      });
      return;
    }

    if (!authorizationService) {
      res.status(500).json({
        error: "Authorization service not configured",
        code: "RBAC_NOT_CONFIGURED",
      });
      return;
    }

    const context = options.contextExtractor
      ? options.contextExtractor(req)
      : extractDefaultContext(req);

    try {
      const missingCapabilities: string[] = [];

      // Check all capabilities
      for (const capability of capabilities) {
        const result = await authorizationService.checkPermission(
          user,
          capability,
          context
        );

        if (!result.allowed) {
          missingCapabilities.push(capability);
        }
      }

      if (missingCapabilities.length > 0) {
        logger.info("Permission denied (missing capabilities)", {
          component: "RbacMiddleware",
          operation: "requireAllCapabilities",
          metadata: {
            userId: user.id,
            missingCapabilities,
            path: req.path,
          },
        });

        res.status(403).json({
          error: options.errorMessage || `Permission denied: missing capabilities [${missingCapabilities.join(", ")}]`,
          code: "PERMISSION_DENIED",
          missingCapabilities,
        });
        return;
      }

      logger.debug("Permission granted (all)", {
        component: "RbacMiddleware",
        operation: "requireAllCapabilities",
        metadata: { userId: user.id, capabilities, path: req.path },
      });

      next();
    } catch (error) {
      logger.error("Authorization check failed", {
        component: "RbacMiddleware",
        operation: "requireAllCapabilities",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      res.status(500).json({
        error: "Authorization check failed",
        code: "RBAC_ERROR",
      });
    }
  };
}

/**
 * Middleware that requires user to be an admin
 * (Shorthand for requireCapability('*'))
 */
export function requireAdmin(options: Omit<RequireCapabilityOptions, "contextExtractor"> = {}) {
  return requireCapability("admin.*", {
    ...options,
    errorMessage: options.errorMessage || "Admin access required",
  });
}

/**
 * Extract default execution context from request
 */
function extractDefaultContext(req: Request): ExecutionContext {
  // Get client IP
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "";

  // Try to extract node information from request
  const node = extractNodeFromRequest(req);

  return {
    clientIp,
    node,
    metadata: {
      method: req.method,
      path: req.path,
    },
  };
}

/**
 * Extract node/target information from request
 */
function extractNodeFromRequest(req: Request): string | undefined {
  // Check common parameter names for node/target
  const possibleParams = ["node", "target", "targets", "certname", "hostname"];

  // Check route params
  for (const param of possibleParams) {
    if (req.params?.[param]) {
      return String(req.params[param]);
    }
  }

  // Check query params
  for (const param of possibleParams) {
    if (req.query?.[param]) {
      return String(req.query[param]);
    }
  }

  // Check body (for POST requests)
  if (req.body && typeof req.body === "object") {
    for (const param of possibleParams) {
      if (req.body[param]) {
        // Handle both string and array of targets
        const value = req.body[param];
        if (typeof value === "string") {
          return value;
        }
        if (Array.isArray(value) && value.length > 0) {
          return String(value[0]);
        }
      }
    }
  }

  return undefined;
}

/**
 * Invalidate permission cache for a user
 * (Use when roles/permissions change)
 */
export function invalidateUserCache(userId: string): void {
  authorizationService?.invalidateCache(userId);
}

/**
 * Invalidate all permission caches
 * (Use when roles/permissions are modified globally)
 */
export function invalidateAllCaches(): void {
  authorizationService?.invalidateAllCaches();
}
