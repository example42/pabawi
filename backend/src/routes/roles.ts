/**
 * Role Management Routes
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 11)
 *
 * Provides REST API endpoints for role and permission CRUD operations.
 * All endpoints require admin role.
 *
 * Endpoints:
 * - GET /api/roles - List roles (paginated)
 * - GET /api/roles/search - Search roles
 * - GET /api/roles/:id - Get role by ID
 * - POST /api/roles - Create role
 * - PUT /api/roles/:id - Update role
 * - DELETE /api/roles/:id - Delete role
 * - POST /api/roles/:id/permissions - Add permission to role
 * - DELETE /api/roles/:id/permissions/:capability - Remove permission from role
 * - GET /api/roles/:id/users - Get users with this role
 * - GET /api/roles/:id/groups - Get groups with this role
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { RoleService } from "../auth/RoleService.js";
import { UserService } from "../auth/UserService.js";
import { GroupService } from "../auth/GroupService.js";
import type { CreateRoleInput, UpdateRoleInput, Permission, PaginationOptions } from "../auth/types.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { requireAdmin, invalidateAllCaches } from "../middleware/rbac.js";
import { LoggerService } from "../services/LoggerService.js";
import { ExpertModeService } from "../services/ExpertModeService.js";

/**
 * Configuration for role routes
 */
export interface RoleRoutesConfig {
  /** Database adapter */
  db: DatabaseAdapter;
  /** JWT secret for auth middleware */
  jwtSecret: string;
}

/**
 * Create role management router factory
 */
export function createRoleRouter(config: RoleRoutesConfig): Router {
  const router = Router();
  const logger = new LoggerService();
  const expertModeService = new ExpertModeService();

  const roleService = new RoleService(config.db);
  const userService = new UserService(config.db);
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
   * GET /api/roles
   * List all roles with pagination
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Listing roles", {
        component: "RoleRouter",
        operation: "list",
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        sortBy: (req.query.sortBy as string) || "priority",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
      };

      const result = await roleService.listRoles(options);

      logger.debug("Roles listed", {
        component: "RoleRouter",
        operation: "list",
        metadata: { total: result.total, returned: result.items.length },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/roles",
          req.correlationId || "roles-list",
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
   * GET /api/roles/search
   * Search roles by name or description
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

      logger.info("Searching roles", {
        component: "RoleRouter",
        operation: "search",
        metadata: { query },
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await roleService.searchRoles(query, options);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/roles/search",
          req.correlationId || "roles-search",
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
   * GET /api/roles/:id
   * Get role by ID
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting role", {
        component: "RoleRouter",
        operation: "get",
        metadata: { roleId: id },
      });

      const role = await roleService.getRoleById(id);

      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/roles/${id}`,
          req.correlationId || "roles-get",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ role }, debugInfo));
        return;
      }

      res.json({ role });
    })
  );

  /**
   * POST /api/roles
   * Create a new role
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Creating role", {
        component: "RoleRouter",
        operation: "create",
        metadata: { name: req.body?.name },
      });

      const input = req.body as CreateRoleInput;

      // Validate required fields
      if (!input.name) {
        res.status(400).json({
          error: "Role name is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      try {
        const role = await roleService.createRole(input);

        logger.info("Role created", {
          component: "RoleRouter",
          operation: "create",
          metadata: { roleId: role.id, name: role.name },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/roles",
            req.correlationId || "roles-create",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(201).json(expertModeService.attachDebugInfo({ role }, debugInfo));
          return;
        }

        res.status(201).json({ role });
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
   * PUT /api/roles/:id
   * Update an existing role
   */
  router.put(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Updating role", {
        component: "RoleRouter",
        operation: "update",
        metadata: { roleId: id },
      });

      const input = req.body as UpdateRoleInput;

      try {
        const role = await roleService.updateRole(id, input);

        if (!role) {
          res.status(404).json({
            error: "Role not found",
            code: "NOT_FOUND",
          });
          return;
        }

        // Invalidate all caches since role changes affect all users with this role
        invalidateAllCaches();

        logger.info("Role updated", {
          component: "RoleRouter",
          operation: "update",
          metadata: { roleId: id },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            `PUT /api/roles/${id}`,
            req.correlationId || "roles-update",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo({ role }, debugInfo));
          return;
        }

        res.json({ role });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("already in use")) {
            res.status(409).json({
              error: error.message,
              code: "CONFLICT",
            });
            return;
          }
          if (error.message.includes("system roles")) {
            res.status(403).json({
              error: error.message,
              code: "SYSTEM_ROLE_PROTECTED",
            });
            return;
          }
        }
        throw error;
      }
    })
  );

  /**
   * DELETE /api/roles/:id
   * Delete a role
   */
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Deleting role", {
        component: "RoleRouter",
        operation: "delete",
        metadata: { roleId: id },
      });

      try {
        const deleted = await roleService.deleteRole(id);

        if (!deleted) {
          res.status(404).json({
            error: "Role not found",
            code: "NOT_FOUND",
          });
          return;
        }

        // Invalidate all caches since role deletion affects users
        invalidateAllCaches();

        logger.info("Role deleted", {
          component: "RoleRouter",
          operation: "delete",
          metadata: { roleId: id },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            `DELETE /api/roles/${id}`,
            req.correlationId || "roles-delete",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(
            { success: true, message: "Role deleted" },
            debugInfo
          ));
          return;
        }

        res.json({ success: true, message: "Role deleted" });
      } catch (error) {
        if (error instanceof Error && error.message.includes("system roles")) {
          res.status(403).json({
            error: error.message,
            code: "SYSTEM_ROLE_PROTECTED",
          });
          return;
        }
        throw error;
      }
    })
  );

  /**
   * POST /api/roles/:id/permissions
   * Add a permission to a role
   */
  router.post(
    "/:id/permissions",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Adding permission to role", {
        component: "RoleRouter",
        operation: "addPermission",
        metadata: { roleId: id },
      });

      const permission = req.body as Permission;

      // Validate required fields
      if (!permission.capability || !permission.action) {
        res.status(400).json({
          error: "Capability and action are required",
          code: "INVALID_INPUT",
        });
        return;
      }

      if (!["allow", "deny"].includes(permission.action)) {
        res.status(400).json({
          error: "Action must be 'allow' or 'deny'",
          code: "INVALID_INPUT",
        });
        return;
      }

      // Verify role exists
      const role = await roleService.getRoleById(id);
      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await roleService.addPermission(id, permission);

      // Invalidate all caches since permission changes affect users
      invalidateAllCaches();

      logger.info("Permission added to role", {
        component: "RoleRouter",
        operation: "addPermission",
        metadata: { roleId: id, capability: permission.capability },
      });

      // Get updated role
      const updatedRole = await roleService.getRoleById(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `POST /api/roles/${id}/permissions`,
          req.correlationId || "roles-addPermission",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, role: updatedRole },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, role: updatedRole });
    })
  );

  /**
   * DELETE /api/roles/:id/permissions/:capability
   * Remove a permission from a role
   */
  router.delete(
    "/:id/permissions/:capability",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id, capability } = req.params;

      // Decode capability (it may contain special characters like '.')
      const decodedCapability = decodeURIComponent(capability);

      logger.info("Removing permission from role", {
        component: "RoleRouter",
        operation: "removePermission",
        metadata: { roleId: id, capability: decodedCapability },
      });

      // Verify role exists
      const role = await roleService.getRoleById(id);
      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await roleService.removePermission(id, decodedCapability);

      // Invalidate all caches since permission changes affect users
      invalidateAllCaches();

      logger.info("Permission removed from role", {
        component: "RoleRouter",
        operation: "removePermission",
        metadata: { roleId: id, capability: decodedCapability },
      });

      // Get updated role
      const updatedRole = await roleService.getRoleById(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `DELETE /api/roles/${id}/permissions/${capability}`,
          req.correlationId || "roles-removePermission",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, role: updatedRole },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, role: updatedRole });
    })
  );

  /**
   * GET /api/roles/:id/users
   * Get all users that have this role (directly assigned)
   */
  router.get(
    "/:id/users",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting role users", {
        component: "RoleRouter",
        operation: "getUsers",
        metadata: { roleId: id },
      });

      // Verify role exists
      const role = await roleService.getRoleById(id);
      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      const users = await userService.getUsersByRole(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/roles/${id}/users`,
          req.correlationId || "roles-users",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ users }, debugInfo));
        return;
      }

      res.json({ users });
    })
  );

  /**
   * GET /api/roles/:id/groups
   * Get all groups that have this role assigned
   */
  router.get(
    "/:id/groups",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting role groups", {
        component: "RoleRouter",
        operation: "getGroups",
        metadata: { roleId: id },
      });

      // Verify role exists
      const role = await roleService.getRoleById(id);
      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Get all groups and filter those that have this role
      const allGroups = await groupService.listGroups({ limit: 1000 });
      const groupsWithRole = allGroups.items.filter((group) =>
        group.roles.includes(id)
      );

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/roles/${id}/groups`,
          req.correlationId || "roles-groups",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ groups: groupsWithRole }, debugInfo));
        return;
      }

      res.json({ groups: groupsWithRole });
    })
  );

  /**
   * POST /api/roles/initialize
   * Initialize built-in system roles (admin endpoint)
   */
  router.post(
    "/initialize",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Initializing built-in roles", {
        component: "RoleRouter",
        operation: "initialize",
      });

      await roleService.initializeBuiltInRoles();

      logger.info("Built-in roles initialized", {
        component: "RoleRouter",
        operation: "initialize",
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "POST /api/roles/initialize",
          req.correlationId || "roles-initialize",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Built-in roles initialized" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Built-in roles initialized" });
    })
  );

  return router;
}

export default createRoleRouter;
