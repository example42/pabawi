import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { GroupService } from "../services/GroupService";
import { PermissionService } from "../services/PermissionService";
import { DatabaseService } from "../database/DatabaseService";
import { LoggerService } from "../services/LoggerService";
import { sendValidationError, ERROR_CODES } from "../utils/errorHandling";
import { ZodError } from "zod";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";

const logger = new LoggerService();

/**
 * Zod schema for pagination query parameters
 */
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Zod schema for creating a group
 */
const CreateGroupSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500),
}).strict();

/**
 * Zod schema for updating a group
 */
const UpdateGroupSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
}).strict();

/**
 * Create groups management router
 */
export function createGroupsRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  const groupService = new GroupService(databaseService.getConnection());
  const permissionService = new PermissionService(databaseService.getConnection());
  const authMiddleware = createAuthMiddleware(databaseService.getConnection(), jwtSecret);
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());

  /**
   * POST /api/groups
   * Create a new group
   *
   * Requirements: 3.1
   */
  router.post(
    "/",
    authMiddleware,
    rbacMiddleware("groups", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing create group request", {
        component: "GroupsRouter",
        operation: "createGroup",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate request body
        const validatedData = CreateGroupSchema.parse(req.body);

        logger.debug("Create group data validated", {
          component: "GroupsRouter",
          operation: "createGroup",
          metadata: {
            userId: req.user?.userId,
            groupName: validatedData.name,
          },
        });

        // Create group
        const group = await groupService.createGroup({
          name: validatedData.name,
          description: validatedData.description,
        });

        logger.info("Group created successfully", {
          component: "GroupsRouter",
          operation: "createGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: group.id,
            groupName: group.name,
          },
        });

        // Return created group with 201 status
        res.status(201).json(group);
      } catch (error) {
        // Handle duplicate group name
        if (error instanceof Error && error.message === 'Group name already exists') {
          logger.warn("Duplicate group name in create group", {
            component: "GroupsRouter",
            operation: "createGroup",
            metadata: { userId: req.user?.userId },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Group name already exists",
              field: "name",
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Create group validation failed", {
            component: "GroupsRouter",
            operation: "createGroup",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Create group failed with unexpected error", {
          component: "GroupsRouter",
          operation: "createGroup",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to create group",
          },
        });
      }
    })
  );

  /**
   * GET /api/groups
   * Get paginated list of groups
   *
   * Requirements: 12.2
   */
  router.get(
    "/",
    authMiddleware,
    rbacMiddleware("groups", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing list groups request", {
        component: "GroupsRouter",
        operation: "listGroups",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate query parameters
        const validatedQuery = PaginationSchema.parse(req.query);

        logger.debug("List groups query validated", {
          component: "GroupsRouter",
          operation: "listGroups",
          metadata: { page: validatedQuery.page, limit: validatedQuery.limit },
        });

        // Calculate offset from page number
        const offset = (validatedQuery.page - 1) * validatedQuery.limit;

        // Fetch paginated groups
        const result = await groupService.listGroups({
          limit: validatedQuery.limit,
          offset: offset,
        });

        // Calculate total pages
        const totalPages = Math.ceil(result.total / validatedQuery.limit);

        logger.info("Groups list retrieved successfully", {
          component: "GroupsRouter",
          operation: "listGroups",
          metadata: {
            userId: req.user?.userId,
            total: result.total,
            page: validatedQuery.page,
            limit: validatedQuery.limit,
          },
        });

        // Return paginated response
        res.status(200).json({
          groups: result.items,
          pagination: {
            total: result.total,
            page: validatedQuery.page,
            limit: validatedQuery.limit,
            totalPages: totalPages,
          },
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("List groups validation failed", {
            component: "GroupsRouter",
            operation: "listGroups",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("List groups failed with unexpected error", {
          component: "GroupsRouter",
          operation: "listGroups",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve groups",
          },
        });
      }
    })
  );

  /**
   * GET /api/groups/:id
   * Get group by ID with members and roles
   *
   * Requirements: 12.5
   */
  router.get(
    "/:id",
    authMiddleware,
    rbacMiddleware("groups", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing get group by ID request", {
        component: "GroupsRouter",
        operation: "getGroupById",
        metadata: { userId: req.user?.userId, groupId: req.params.id },
      });

      try {
        const groupId = req.params.id;

        // Fetch group
        const group = await groupService.getGroupById(groupId);

        if (!group) {
          logger.warn("Group not found", {
            component: "GroupsRouter",
            operation: "getGroupById",
            metadata: { userId: req.user?.userId, groupId: groupId },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Group not found",
            },
          });
          return;
        }

        // Fetch group's members and roles
        const members = await groupService.getGroupMembers(groupId);
        const roles = await groupService.getGroupRoles(groupId);

        logger.info("Group retrieved successfully", {
          component: "GroupsRouter",
          operation: "getGroupById",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
            memberCount: members.length,
            roleCount: roles.length,
          },
        });

        // Return group with members and roles
        res.status(200).json({
          ...group,
          members: members,
          roles: roles,
        });
      } catch (error) {
        // Handle unexpected errors
        logger.error("Get group by ID failed with unexpected error", {
          component: "GroupsRouter",
          operation: "getGroupById",
          metadata: { userId: req.user?.userId, groupId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve group",
          },
        });
      }
    })
  );

  /**
   * PUT /api/groups/:id
   * Update group by ID
   *
   * Requirements: 3.6
   */
  router.put(
    "/:id",
    authMiddleware,
    rbacMiddleware("groups", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing update group request", {
        component: "GroupsRouter",
        operation: "updateGroup",
        metadata: { userId: req.user?.userId, groupId: req.params.id },
      });

      try {
        const groupId = req.params.id;

        // Validate request body
        const validatedData = UpdateGroupSchema.parse(req.body);

        logger.debug("Update group data validated", {
          component: "GroupsRouter",
          operation: "updateGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
            fields: Object.keys(validatedData),
          },
        });

        // Update group
        const updatedGroup = await groupService.updateGroup(groupId, validatedData);

        logger.info("Group updated successfully", {
          component: "GroupsRouter",
          operation: "updateGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
          },
        });

        // Return updated group
        res.status(200).json(updatedGroup);
      } catch (error) {
        // Handle group not found
        if (error instanceof Error && error.message === 'Group not found') {
          logger.warn("Group not found for update", {
            component: "GroupsRouter",
            operation: "updateGroup",
            metadata: { userId: req.user?.userId, groupId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Group not found",
            },
          });
          return;
        }

        // Handle duplicate group name
        if (error instanceof Error && error.message === 'Group name already exists') {
          logger.warn("Duplicate group name in update group", {
            component: "GroupsRouter",
            operation: "updateGroup",
            metadata: { userId: req.user?.userId, groupId: req.params.id },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Group name already exists",
              field: "name",
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Update group validation failed", {
            component: "GroupsRouter",
            operation: "updateGroup",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Update group failed with unexpected error", {
          component: "GroupsRouter",
          operation: "updateGroup",
          metadata: { userId: req.user?.userId, groupId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to update group",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/groups/:id
   * Delete group by ID
   *
   * Requirements: 3.6
   */
  router.delete(
    "/:id",
    authMiddleware,
    rbacMiddleware("groups", "admin"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing delete group request", {
        component: "GroupsRouter",
        operation: "deleteGroup",
        metadata: { userId: req.user?.userId, groupId: req.params.id },
      });

      try {
        const groupId = req.params.id;

        // Delete group
        await groupService.deleteGroup(groupId);

        logger.info("Group deleted successfully", {
          component: "GroupsRouter",
          operation: "deleteGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle group not found
        if (error instanceof Error && error.message === 'Group not found') {
          logger.warn("Group not found for deletion", {
            component: "GroupsRouter",
            operation: "deleteGroup",
            metadata: { userId: req.user?.userId, groupId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Group not found",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Delete group failed with unexpected error", {
          component: "GroupsRouter",
          operation: "deleteGroup",
          metadata: { userId: req.user?.userId, groupId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to delete group",
          },
        });
      }
    })
  );

  /**
   * POST /api/groups/:id/roles/:roleId
   * Assign role to group
   *
   * Requirements: 4.7, 8.2
   */
  router.post(
    "/:id/roles/:roleId",
    authMiddleware,
    rbacMiddleware("groups", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing assign role to group request", {
        component: "GroupsRouter",
        operation: "assignRoleToGroup",
        metadata: {
          userId: req.user?.userId,
          groupId: req.params.id,
          roleId: req.params.roleId,
        },
      });

      try {
        const groupId = req.params.id;
        const roleId = req.params.roleId;

        // Assign role to group
        await groupService.assignRoleToGroup(groupId, roleId);

        // Invalidate permission cache for all users in the group
        const groupMembers = await groupService.getGroupMembers(groupId);
        for (const member of groupMembers) {
          permissionService.invalidateUserPermissionCache(member.id);
        }

        logger.info("Role assigned to group successfully", {
          component: "GroupsRouter",
          operation: "assignRoleToGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
            roleId: roleId,
            affectedUsers: groupMembers.length,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle group not found
        if (error instanceof Error && error.message === 'Group not found') {
          logger.warn("Group not found for role assignment", {
            component: "GroupsRouter",
            operation: "assignRoleToGroup",
            metadata: {
              userId: req.user?.userId,
              groupId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Group not found",
            },
          });
          return;
        }

        // Handle role not found
        if (error instanceof Error && error.message === 'Role not found') {
          logger.warn("Role not found for assignment", {
            component: "GroupsRouter",
            operation: "assignRoleToGroup",
            metadata: {
              userId: req.user?.userId,
              groupId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Role not found",
            },
          });
          return;
        }

        // Handle role already assigned
        if (error instanceof Error && error.message === 'Role is already assigned to this group') {
          logger.warn("Role already assigned to group", {
            component: "GroupsRouter",
            operation: "assignRoleToGroup",
            metadata: {
              userId: req.user?.userId,
              groupId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Role is already assigned to this group",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Assign role to group failed with unexpected error", {
          component: "GroupsRouter",
          operation: "assignRoleToGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: req.params.id,
            roleId: req.params.roleId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to assign role to group",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/groups/:id/roles/:roleId
   * Remove role from group
   *
   * Requirements: 4.7, 8.2
   */
  router.delete(
    "/:id/roles/:roleId",
    authMiddleware,
    rbacMiddleware("groups", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing remove role from group request", {
        component: "GroupsRouter",
        operation: "removeRoleFromGroup",
        metadata: {
          userId: req.user?.userId,
          groupId: req.params.id,
          roleId: req.params.roleId,
        },
      });

      try {
        const groupId = req.params.id;
        const roleId = req.params.roleId;

        // Remove role from group
        await groupService.removeRoleFromGroup(groupId, roleId);

        // Invalidate permission cache for all users in the group
        const groupMembers = await groupService.getGroupMembers(groupId);
        for (const member of groupMembers) {
          permissionService.invalidateUserPermissionCache(member.id);
        }

        logger.info("Role removed from group successfully", {
          component: "GroupsRouter",
          operation: "removeRoleFromGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: groupId,
            roleId: roleId,
            affectedUsers: groupMembers.length,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle role not assigned to group
        if (error instanceof Error && error.message === 'Role is not assigned to this group') {
          logger.warn("Role not assigned to group for removal", {
            component: "GroupsRouter",
            operation: "removeRoleFromGroup",
            metadata: {
              userId: req.user?.userId,
              groupId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Role is not assigned to this group",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Remove role from group failed with unexpected error", {
          component: "GroupsRouter",
          operation: "removeRoleFromGroup",
          metadata: {
            userId: req.user?.userId,
            groupId: req.params.id,
            roleId: req.params.roleId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to remove role from group",
          },
        });
      }
    })
  );

  return router;
}
