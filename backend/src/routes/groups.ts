/**
 * Group Management Routes
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 11)
 *
 * Provides REST API endpoints for group CRUD operations.
 * All endpoints require admin role.
 *
 * Endpoints:
 * - GET /api/groups - List groups (paginated)
 * - GET /api/groups/search - Search groups
 * - GET /api/groups/:id - Get group by ID
 * - POST /api/groups - Create group
 * - PUT /api/groups/:id - Update group
 * - DELETE /api/groups/:id - Delete group
 * - POST /api/groups/:id/members/:userId - Add member to group
 * - DELETE /api/groups/:id/members/:userId - Remove member from group
 * - POST /api/groups/:id/roles/:roleId - Add role to group
 * - DELETE /api/groups/:id/roles/:roleId - Remove role from group
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { GroupService } from "../auth/GroupService.js";
import { UserService } from "../auth/UserService.js";
import { RoleService } from "../auth/RoleService.js";
import type { CreateGroupInput, UpdateGroupInput, PaginationOptions } from "../auth/types.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { requireAdmin, invalidateAllCaches } from "../middleware/rbac.js";
import { LoggerService } from "../services/LoggerService.js";
import { ExpertModeService } from "../services/ExpertModeService.js";

/**
 * Configuration for group routes
 */
export interface GroupRoutesConfig {
  /** Database adapter */
  db: DatabaseAdapter;
  /** JWT secret for auth middleware */
  jwtSecret: string;
}

/**
 * Create group management router factory
 */
export function createGroupRouter(config: GroupRoutesConfig): Router {
  const router = Router();
  const logger = new LoggerService();
  const expertModeService = new ExpertModeService();

  const groupService = new GroupService(config.db);
  const userService = new UserService(config.db);
  const roleService = new RoleService(config.db);

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
   * GET /api/groups
   * List all groups with pagination
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Listing groups", {
        component: "GroupRouter",
        operation: "list",
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
        sortBy: (req.query.sortBy as string) || "name",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "asc",
      };

      const result = await groupService.listGroups(options);

      logger.debug("Groups listed", {
        component: "GroupRouter",
        operation: "list",
        metadata: { total: result.total, returned: result.items.length },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/groups",
          req.correlationId || "groups-list",
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
   * GET /api/groups/search
   * Search groups by name or description
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

      logger.info("Searching groups", {
        component: "GroupRouter",
        operation: "search",
        metadata: { query },
      });

      const options: PaginationOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await groupService.searchGroups(query, options);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          "GET /api/groups/search",
          req.correlationId || "groups-search",
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
   * GET /api/groups/:id
   * Get group by ID
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting group", {
        component: "GroupRouter",
        operation: "get",
        metadata: { groupId: id },
      });

      const group = await groupService.getGroupById(id);

      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/groups/${id}`,
          req.correlationId || "groups-get",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ group }, debugInfo));
        return;
      }

      res.json({ group });
    })
  );

  /**
   * POST /api/groups
   * Create a new group
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();

      logger.info("Creating group", {
        component: "GroupRouter",
        operation: "create",
        metadata: { name: req.body?.name },
      });

      const input = req.body as CreateGroupInput;

      // Validate required fields
      if (!input.name) {
        res.status(400).json({
          error: "Group name is required",
          code: "INVALID_INPUT",
        });
        return;
      }

      try {
        const group = await groupService.createGroup(input);

        logger.info("Group created", {
          component: "GroupRouter",
          operation: "create",
          metadata: { groupId: group.id, name: group.name },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/groups",
            req.correlationId || "groups-create",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(201).json(expertModeService.attachDebugInfo({ group }, debugInfo));
          return;
        }

        res.status(201).json({ group });
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
   * PUT /api/groups/:id
   * Update an existing group
   */
  router.put(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Updating group", {
        component: "GroupRouter",
        operation: "update",
        metadata: { groupId: id },
      });

      const input = req.body as UpdateGroupInput;

      try {
        const group = await groupService.updateGroup(id, input);

        if (!group) {
          res.status(404).json({
            error: "Group not found",
            code: "NOT_FOUND",
          });
          return;
        }

        // Invalidate all caches since group roles affect all members
        invalidateAllCaches();

        logger.info("Group updated", {
          component: "GroupRouter",
          operation: "update",
          metadata: { groupId: id },
        });

        // Add debug info if expert mode
        if (req.expertMode) {
          const duration = Date.now() - startTime;
          const debugInfo = expertModeService.createDebugInfo(
            `PUT /api/groups/${id}`,
            req.correlationId || "groups-update",
            duration
          );
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo({ group }, debugInfo));
          return;
        }

        res.json({ group });
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
   * DELETE /api/groups/:id
   * Delete a group
   */
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Deleting group", {
        component: "GroupRouter",
        operation: "delete",
        metadata: { groupId: id },
      });

      const deleted = await groupService.deleteGroup(id);

      if (!deleted) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Invalidate all caches since group deletion affects members
      invalidateAllCaches();

      logger.info("Group deleted", {
        component: "GroupRouter",
        operation: "delete",
        metadata: { groupId: id },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `DELETE /api/groups/${id}`,
          req.correlationId || "groups-delete",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Group deleted" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Group deleted" });
    })
  );

  /**
   * POST /api/groups/:id/members/:userId
   * Add a user to a group
   */
  router.post(
    "/:id/members/:userId",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id, userId } = req.params;

      logger.info("Adding member to group", {
        component: "GroupRouter",
        operation: "addMember",
        metadata: { groupId: id, userId },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Verify user exists
      const user = await userService.getUserById(userId);
      if (!user) {
        res.status(404).json({
          error: "User not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await groupService.addMember(id, userId);

      // Invalidate cache for affected user
      invalidateAllCaches();

      logger.info("Member added to group", {
        component: "GroupRouter",
        operation: "addMember",
        metadata: { groupId: id, userId },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `POST /api/groups/${id}/members/${userId}`,
          req.correlationId || "groups-addMember",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Member added to group" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Member added to group" });
    })
  );

  /**
   * DELETE /api/groups/:id/members/:userId
   * Remove a user from a group
   */
  router.delete(
    "/:id/members/:userId",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id, userId } = req.params;

      logger.info("Removing member from group", {
        component: "GroupRouter",
        operation: "removeMember",
        metadata: { groupId: id, userId },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await groupService.removeMember(id, userId);

      // Invalidate cache for affected user
      invalidateAllCaches();

      logger.info("Member removed from group", {
        component: "GroupRouter",
        operation: "removeMember",
        metadata: { groupId: id, userId },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `DELETE /api/groups/${id}/members/${userId}`,
          req.correlationId || "groups-removeMember",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Member removed from group" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Member removed from group" });
    })
  );

  /**
   * POST /api/groups/:id/roles/:roleId
   * Add a role to a group
   */
  router.post(
    "/:id/roles/:roleId",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id, roleId } = req.params;

      logger.info("Adding role to group", {
        component: "GroupRouter",
        operation: "addRole",
        metadata: { groupId: id, roleId },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      // Verify role exists
      const role = await roleService.getRoleById(roleId);
      if (!role) {
        res.status(404).json({
          error: "Role not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await groupService.addRole(id, roleId);

      // Invalidate all caches since this affects all group members
      invalidateAllCaches();

      logger.info("Role added to group", {
        component: "GroupRouter",
        operation: "addRole",
        metadata: { groupId: id, roleId },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `POST /api/groups/${id}/roles/${roleId}`,
          req.correlationId || "groups-addRole",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Role added to group" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Role added to group" });
    })
  );

  /**
   * DELETE /api/groups/:id/roles/:roleId
   * Remove a role from a group
   */
  router.delete(
    "/:id/roles/:roleId",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id, roleId } = req.params;

      logger.info("Removing role from group", {
        component: "GroupRouter",
        operation: "removeRole",
        metadata: { groupId: id, roleId },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      await groupService.removeRole(id, roleId);

      // Invalidate all caches since this affects all group members
      invalidateAllCaches();

      logger.info("Role removed from group", {
        component: "GroupRouter",
        operation: "removeRole",
        metadata: { groupId: id, roleId },
      });

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `DELETE /api/groups/${id}/roles/${roleId}`,
          req.correlationId || "groups-removeRole",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo(
          { success: true, message: "Role removed from group" },
          debugInfo
        ));
        return;
      }

      res.json({ success: true, message: "Role removed from group" });
    })
  );

  /**
   * GET /api/groups/:id/members
   * Get all members of a group
   */
  router.get(
    "/:id/members",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting group members", {
        component: "GroupRouter",
        operation: "getMembers",
        metadata: { groupId: id },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      const members = await userService.getUsersByGroup(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/groups/${id}/members`,
          req.correlationId || "groups-members",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ members }, debugInfo));
        return;
      }

      res.json({ members });
    })
  );

  /**
   * GET /api/groups/:id/roles
   * Get all roles assigned to a group
   */
  router.get(
    "/:id/roles",
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      const { id } = req.params;

      logger.info("Getting group roles", {
        component: "GroupRouter",
        operation: "getRoles",
        metadata: { groupId: id },
      });

      // Verify group exists
      const group = await groupService.getGroupById(id);
      if (!group) {
        res.status(404).json({
          error: "Group not found",
          code: "NOT_FOUND",
        });
        return;
      }

      const roles = await roleService.getRolesForGroup(id);

      // Add debug info if expert mode
      if (req.expertMode) {
        const duration = Date.now() - startTime;
        const debugInfo = expertModeService.createDebugInfo(
          `GET /api/groups/${id}/roles`,
          req.correlationId || "groups-roles",
          duration
        );
        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);
        res.json(expertModeService.attachDebugInfo({ roles }, debugInfo));
        return;
      }

      res.json({ roles });
    })
  );

  return router;
}

export default createGroupRouter;
