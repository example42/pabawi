/**
 * User Management Routes
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 11)
 *
 * Provides REST API endpoints for user CRUD operations.
 * All endpoints require admin role.
 *
 * Endpoints:
 * - GET /api/users - List users (paginated)
 * - GET /api/users/search - Search users
 * - GET /api/users/:id - Get user by ID
 * - POST /api/users - Create user
 * - PUT /api/users/:id - Update user
 * - DELETE /api/users/:id - Delete user
 * - GET /api/users/:id/groups - Get user's groups
 * - GET /api/users/:id/roles - Get user's roles (effective)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { UserService } from "../auth/UserService.js";
import { RoleService } from "../auth/RoleService.js";
import { GroupService } from "../auth/GroupService.js";
import type { CreateUserInput, UpdateUserInput, PaginationOptions } from "../auth/types.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { requireAdmin, invalidateUserCache } from "../middleware/rbac.js";
import { LoggerService } from "../services/LoggerService.js";
import { ExpertModeService } from "../services/ExpertModeService.js";

/**
 * Configuration for user routes
 */
export interface UserRoutesConfig {
  /** Database adapter */
  db: DatabaseAdapter;
  /** JWT secret for auth middleware */
  jwtSecret: string;
}

/**
 * Create user management router factory
 */
export function createUserRouter(config: UserRoutesConfig): Router {
  const router = Router();
  const logger = new LoggerService();
  const expertModeService = new ExpertModeService();

  const userService = new UserService(config.db);
  const roleService = new RoleService(config.db);
  const groupService = new GroupService(config.db);

  // Auth middleware for all routes
  const authMiddleware = createAuthMiddleware({
    db: config.db,
    jwtSecret: config.jwtSecret,
  });

  // Apply auth and admin check to all routes
  router.use(authMiddleware);
  router.use(requireAdmin());

  // Async handler wrapper
  const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  /**
   * GET /api/users
   * List all users with pagination
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Listing users", {
        component: "UserRouter",
        operation: "list",
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        sortBy: (req.query.sortBy as string) || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
      };

      const result = await userService.listUsers(options);

      logger.debug("Users listed", {
        component: "UserRouter",
        operation: "list",
        metadata: { total: result.total, returned: result.items.length },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/users",
          req.correlationId || "users-list",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(result, debugInfo));
        return;
      }

      res.json(result);
    })
  );

  /**
   * GET /api/users/search
   * Search users by username, email, or display name
   */
  router.get(
    "/search",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({
          error: "Search query (q) is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      logger.info("Searching users", {
        component: "UserRouter",
        operation: "search",
        metadata: { query },
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await userService.searchUsers(query, options);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/users/search",
          req.correlationId || "users-search",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(result, debugInfo));
        return;
      }

      res.json(result);
    })
  );

  /**
   * GET /api/users/:id
   * Get user by ID
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting user", {
        component: "UserRouter",
        operation: "get",
        metadata: { userId: id },
      });

      const user = await userService.getUserById(id);

      if (!user) {
        res.status(404).json({
          error: "User not found",
          code: "NOT_FOUND",
        });
        return;
      }

      const userPublic = userService.toPublicUser(user);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/users/${id}`,
          req.correlationId || "users-get",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ user: userPublic }, debugInfo));
        return;
      }

      res.json({ user: userPublic });
    })
  );

  /**
   * POST /api/users
   * Create a new user
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Creating user", {
        component: "UserRouter",
        operation: "create",
        metadata: { username: req.body?.username },
      });

      const input = req.body as CreateUserInput;

      // Validate required fields
      if (!input.username || !input.email || !input.password) {
        res.status(400).json({
          error: "Username, email, and password are required",
          code: "INVALID_INPUT",
        });
        return;
      }

      try {
        const user = await userService.createUser(input);
        const userPublic = userService.toPublicUser(user);

        logger.info("User created", {
          component: "UserRouter",
          operation: "create",
          metadata: { userId: user.id, username: user.username },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/users",
            req.correlationId || "users-create",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(201).json(expertModeService.attachDebugInfo({ user: userPublic }, debugInfo));
          return;
        }

        res.status(201).json({ user: userPublic });
      } catch (error) {
        if (error instanceof Error && error.message.includes("already exists")) {
          res.status(409).json({
            error: error.message,
            code: "CONFLICT",
          });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * PUT /api/users/:id
   * Update an existing user
   */
  router.put(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Updating user", {
        component: "UserRouter",
        operation: "update",
        metadata: { userId: id },
      });

      const input = req.body as UpdateUserInput;

      try {
        const user = await userService.updateUser(id, input);

        if (!user) {
          res.status(404).json({
            error: "User not found",
            code: "NOT_FOUND",
          });
          return;
        }

        // Invalidate permission cache for updated user
        invalidateUserCache(id);

        const userPublic = userService.toPublicUser(user);

        logger.info("User updated", {
          component: "UserRouter",
          operation: "update",
          metadata: { userId: id },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            `PUT /api/users/${id}`,
            req.correlationId || "users-update",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo({ user: userPublic }, debugInfo));
          return;
        }

        res.json({ user: userPublic });
      } catch (error) {
        if (error instanceof Error && error.message.includes("already in use")) {
          res.status(409).json({
            error: error.message,
            code: "CONFLICT",
          });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * DELETE /api/users/:id
   * Delete a user
   */
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      // Prevent self-deletion
      const currentUser = req.user!;
      if (currentUser.id === id) {
        res.status(400).json({
          error: "Cannot delete your own account",
          code: "SELF_DELETE_FORBIDDEN",
        });
        return;
      }

      logger.info("Deleting user", {
        component: "UserRouter",
        operation: "delete",
        metadata: { userId: id },
      });

      const deleted = await userService.deleteUser(id);

      if (!deleted) {
        res.status(404).json({
          error: "User not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Invalidate permission cache for deleted user
      invalidateUserCache(id);

      logger.info("User deleted", {
        component: "UserRouter",
        operation: "delete",
        metadata: { userId: id },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `DELETE /api/users/${id}`,
          req.correlationId || "users-delete",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "User deleted" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "User deleted" });
    })
  );

  /**
   * GET /api/users/:id/groups
   * Get groups a user belongs to
   */
  router.get(
    "/:id/groups",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting user groups", {
        component: "UserRouter",
        operation: "getGroups",
        metadata: { userId: id },
      });

      // Verify user exists
      const user = await userService.getUserById(id);
      if (!user) {
        res.status(404).json({
          error: "User not found",
          code: "NOT_FOUND",
        });
        return;
      }

      const groups = await groupService.getGroupsForUser(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/users/${id}/groups`,
          req.correlationId || "users-groups",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ groups }, debugInfo));
        return;
      }

      res.json({ groups });
    })
  );

  /**
   * GET /api/users/:id/roles
   * Get effective roles for a user (direct + from groups)
   */
  router.get(
    "/:id/roles",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting user roles", {
        component: "UserRouter",
        operation: "getRoles",
        metadata: { userId: id },
      });

      // Verify user exists
      const user = await userService.getUserById(id);
      if (!user) {
        res.status(404).json({
          error: "User not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Get effective roles (including from groups)
      const effectiveRoles = await roleService.getEffectiveRolesForUser(id, user.groups);
      const directRoles = await roleService.getRolesForUser(id);

      const response = {
        effectiveRoles,
        directRoles,
        fromGroups: effectiveRoles.filter(
          (er) => !directRoles.some((dr) => dr.id === er.id)
        ),
      };

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/users/${id}/roles`,
          req.correlationId || "users-roles",
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

  return router;
}

export default createUserRouter;
