import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { RoleService } from "../services/RoleService";
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
 * Zod schema for creating a role
 */
const CreateRoleSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500),
}).strict();

/**
 * Zod schema for updating a role
 */
const UpdateRoleSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
}).strict();

/**
 * Create roles management router
 */
export function createRolesRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  const roleService = new RoleService(databaseService.getConnection());
  const authMiddleware = createAuthMiddleware(databaseService.getConnection(), jwtSecret);
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());

  /**
   * POST /api/roles
   * Create a new role
   *
   * Requirements: 4.1
   */
  router.post(
    "/",
    authMiddleware,
    rbacMiddleware("roles", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing create role request", {
        component: "RolesRouter",
        operation: "createRole",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate request body
        const validatedData = CreateRoleSchema.parse(req.body);

        logger.debug("Create role data validated", {
          component: "RolesRouter",
          operation: "createRole",
          metadata: {
            userId: req.user?.userId,
            roleName: validatedData.name,
          },
        });

        // Create role
        const role = await roleService.createRole({
          name: validatedData.name,
          description: validatedData.description,
        });

        logger.info("Role created successfully", {
          component: "RolesRouter",
          operation: "createRole",
          metadata: {
            userId: req.user?.userId,
            roleId: role.id,
            roleName: role.name,
          },
        });

        // Return created role with 201 status
        res.status(201).json(role);
      } catch (error) {
        // Handle duplicate role name
        if (error instanceof Error && error.message === 'Role name already exists') {
          logger.warn("Duplicate role name in create role", {
            component: "RolesRouter",
            operation: "createRole",
            metadata: { userId: req.user?.userId },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Role name already exists",
              field: "name",
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Create role validation failed", {
            component: "RolesRouter",
            operation: "createRole",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Create role failed with unexpected error", {
          component: "RolesRouter",
          operation: "createRole",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to create role",
          },
        });
      }
    })
  );

  /**
   * GET /api/roles
   * Get paginated list of roles
   *
   * Requirements: 12.3
   */
  router.get(
    "/",
    authMiddleware,
    rbacMiddleware("roles", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing list roles request", {
        component: "RolesRouter",
        operation: "listRoles",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate query parameters
        const validatedQuery = PaginationSchema.parse(req.query);

        logger.debug("List roles query validated", {
          component: "RolesRouter",
          operation: "listRoles",
          metadata: { page: validatedQuery.page, limit: validatedQuery.limit },
        });

        // Calculate offset from page number
        const offset = (validatedQuery.page - 1) * validatedQuery.limit;

        // Fetch paginated roles
        const result = await roleService.listRoles({
          limit: validatedQuery.limit,
          offset: offset,
        });

        // Calculate total pages
        const totalPages = Math.ceil(result.total / validatedQuery.limit);

        logger.info("Roles list retrieved successfully", {
          component: "RolesRouter",
          operation: "listRoles",
          metadata: {
            userId: req.user?.userId,
            total: result.total,
            page: validatedQuery.page,
            limit: validatedQuery.limit,
          },
        });

        // Return paginated response
        res.status(200).json({
          roles: result.items,
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
          logger.warn("List roles validation failed", {
            component: "RolesRouter",
            operation: "listRoles",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("List roles failed with unexpected error", {
          component: "RolesRouter",
          operation: "listRoles",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve roles",
          },
        });
      }
    })
  );

  /**
   * GET /api/roles/:id
   * Get role by ID with permissions
   *
   * Requirements: 12.6
   */
  router.get(
    "/:id",
    authMiddleware,
    rbacMiddleware("roles", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing get role by ID request", {
        component: "RolesRouter",
        operation: "getRoleById",
        metadata: { userId: req.user?.userId, roleId: req.params.id },
      });

      try {
        const roleId = req.params.id;

        // Fetch role
        const role = await roleService.getRoleById(roleId);

        if (!role) {
          logger.warn("Role not found", {
            component: "RolesRouter",
            operation: "getRoleById",
            metadata: { userId: req.user?.userId, roleId: roleId },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Role not found",
            },
          });
          return;
        }

        // Fetch role's permissions
        const permissions = await roleService.getRolePermissions(roleId);

        logger.info("Role retrieved successfully", {
          component: "RolesRouter",
          operation: "getRoleById",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
            permissionCount: permissions.length,
          },
        });

        // Return role with permissions
        res.status(200).json({
          ...role,
          permissions: permissions,
        });
      } catch (error) {
        // Handle unexpected errors
        logger.error("Get role by ID failed with unexpected error", {
          component: "RolesRouter",
          operation: "getRoleById",
          metadata: { userId: req.user?.userId, roleId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve role",
          },
        });
      }
    })
  );

  /**
   * PUT /api/roles/:id
   * Update role by ID
   *
   * Requirements: 4.5, 17.4, 17.5
   */
  router.put(
    "/:id",
    authMiddleware,
    rbacMiddleware("roles", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing update role request", {
        component: "RolesRouter",
        operation: "updateRole",
        metadata: { userId: req.user?.userId, roleId: req.params.id },
      });

      try {
        const roleId = req.params.id;

        // Validate request body
        const validatedData = UpdateRoleSchema.parse(req.body);

        logger.debug("Update role data validated", {
          component: "RolesRouter",
          operation: "updateRole",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
            fields: Object.keys(validatedData),
          },
        });

        // Update role
        const updatedRole = await roleService.updateRole(roleId, validatedData);

        logger.info("Role updated successfully", {
          component: "RolesRouter",
          operation: "updateRole",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
          },
        });

        // Return updated role
        res.status(200).json(updatedRole);
      } catch (error) {
        // Handle role not found
        if (error instanceof Error && error.message === 'Role not found') {
          logger.warn("Role not found for update", {
            component: "RolesRouter",
            operation: "updateRole",
            metadata: { userId: req.user?.userId, roleId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Role not found",
            },
          });
          return;
        }

        // Handle built-in role modification attempt
        if (error instanceof Error && error.message === 'Cannot modify built-in role') {
          logger.warn("Attempt to modify built-in role", {
            component: "RolesRouter",
            operation: "updateRole",
            metadata: { userId: req.user?.userId, roleId: req.params.id },
          });

          res.status(400).json({
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: "Cannot modify built-in system role",
            },
          });
          return;
        }

        // Handle duplicate role name
        if (error instanceof Error && error.message === 'Role name already exists') {
          logger.warn("Duplicate role name in update role", {
            component: "RolesRouter",
            operation: "updateRole",
            metadata: { userId: req.user?.userId, roleId: req.params.id },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Role name already exists",
              field: "name",
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Update role validation failed", {
            component: "RolesRouter",
            operation: "updateRole",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Update role failed with unexpected error", {
          component: "RolesRouter",
          operation: "updateRole",
          metadata: { userId: req.user?.userId, roleId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to update role",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/roles/:id
   * Delete role by ID (protect built-in roles)
   *
   * Requirements: 4.5, 17.4, 17.5
   */
  router.delete(
    "/:id",
    authMiddleware,
    rbacMiddleware("roles", "admin"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing delete role request", {
        component: "RolesRouter",
        operation: "deleteRole",
        metadata: { userId: req.user?.userId, roleId: req.params.id },
      });

      try {
        const roleId = req.params.id;

        // Delete role
        await roleService.deleteRole(roleId);

        logger.info("Role deleted successfully", {
          component: "RolesRouter",
          operation: "deleteRole",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle role not found
        if (error instanceof Error && error.message === 'Role not found') {
          logger.warn("Role not found for deletion", {
            component: "RolesRouter",
            operation: "deleteRole",
            metadata: { userId: req.user?.userId, roleId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Role not found",
            },
          });
          return;
        }

        // Handle built-in role deletion attempt
        if (error instanceof Error && error.message === 'Cannot delete built-in role') {
          logger.warn("Attempt to delete built-in role", {
            component: "RolesRouter",
            operation: "deleteRole",
            metadata: { userId: req.user?.userId, roleId: req.params.id },
          });

          res.status(400).json({
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: "Cannot delete built-in system role",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Delete role failed with unexpected error", {
          component: "RolesRouter",
          operation: "deleteRole",
          metadata: { userId: req.user?.userId, roleId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to delete role",
          },
        });
      }
    })
  );

  /**
   * POST /api/roles/:id/permissions/:permissionId
   * Assign permission to role
   *
   * Requirements: 4.2, 4.3, 8.4
   */
  router.post(
    "/:id/permissions/:permissionId",
    authMiddleware,
    rbacMiddleware("roles", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing assign permission to role request", {
        component: "RolesRouter",
        operation: "assignPermissionToRole",
        metadata: {
          userId: req.user?.userId,
          roleId: req.params.id,
          permissionId: req.params.permissionId,
        },
      });

      try {
        const roleId = req.params.id;
        const permissionId = req.params.permissionId;

        // Assign permission to role
        await roleService.assignPermissionToRole(roleId, permissionId);

        logger.info("Permission assigned to role successfully", {
          component: "RolesRouter",
          operation: "assignPermissionToRole",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
            permissionId: permissionId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle role not found
        if (error instanceof Error && error.message === 'Role not found') {
          logger.warn("Role not found for permission assignment", {
            component: "RolesRouter",
            operation: "assignPermissionToRole",
            metadata: {
              userId: req.user?.userId,
              roleId: req.params.id,
              permissionId: req.params.permissionId,
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

        // Handle permission not found
        if (error instanceof Error && error.message === 'Permission not found') {
          logger.warn("Permission not found for assignment", {
            component: "RolesRouter",
            operation: "assignPermissionToRole",
            metadata: {
              userId: req.user?.userId,
              roleId: req.params.id,
              permissionId: req.params.permissionId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "Permission not found",
            },
          });
          return;
        }

        // Handle duplicate assignment (idempotent - treat as success)
        if (error instanceof Error && error.message === 'Permission is already assigned to this role') {
          logger.debug("Permission already assigned to role (idempotent)", {
            component: "RolesRouter",
            operation: "assignPermissionToRole",
            metadata: {
              userId: req.user?.userId,
              roleId: req.params.id,
              permissionId: req.params.permissionId,
            },
          });

          res.status(204).send();
          return;
        }

        // Handle unexpected errors
        logger.error("Assign permission to role failed with unexpected error", {
          component: "RolesRouter",
          operation: "assignPermissionToRole",
          metadata: {
            userId: req.user?.userId,
            roleId: req.params.id,
            permissionId: req.params.permissionId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to assign permission to role",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/roles/:id/permissions/:permissionId
   * Remove permission from role
   *
   * Requirements: 4.2, 4.3, 8.4
   */
  router.delete(
    "/:id/permissions/:permissionId",
    authMiddleware,
    rbacMiddleware("roles", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing remove permission from role request", {
        component: "RolesRouter",
        operation: "removePermissionFromRole",
        metadata: {
          userId: req.user?.userId,
          roleId: req.params.id,
          permissionId: req.params.permissionId,
        },
      });

      try {
        const roleId = req.params.id;
        const permissionId = req.params.permissionId;

        // Remove permission from role
        await roleService.removePermissionFromRole(roleId, permissionId);

        logger.info("Permission removed from role successfully", {
          component: "RolesRouter",
          operation: "removePermissionFromRole",
          metadata: {
            userId: req.user?.userId,
            roleId: roleId,
            permissionId: permissionId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle permission not assigned (idempotent - treat as success)
        if (error instanceof Error && error.message === 'Permission is not assigned to this role') {
          logger.debug("Permission not assigned to role (idempotent)", {
            component: "RolesRouter",
            operation: "removePermissionFromRole",
            metadata: {
              userId: req.user?.userId,
              roleId: req.params.id,
              permissionId: req.params.permissionId,
            },
          });

          res.status(204).send();
          return;
        }

        // Handle unexpected errors
        logger.error("Remove permission from role failed with unexpected error", {
          component: "RolesRouter",
          operation: "removePermissionFromRole",
          metadata: {
            userId: req.user?.userId,
            roleId: req.params.id,
            permissionId: req.params.permissionId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to remove permission from role",
          },
        });
      }
    })
  );

  return router;
}
