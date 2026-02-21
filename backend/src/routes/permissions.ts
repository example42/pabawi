import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
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
 * Zod schema for creating a permission
 */
const CreatePermissionSchema = z.object({
  resource: z.string().min(3).max(100).regex(/^[a-z0-9_]+$/, "Resource must be lowercase alphanumeric with underscores"),
  action: z.string().min(3).max(50).regex(/^[a-z0-9_]+$/, "Action must be lowercase alphanumeric with underscores"),
  description: z.string().max(500),
}).strict();

/**
 * Create permissions management router
 */
export function createPermissionsRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  const permissionService = new PermissionService(databaseService.getConnection());
  const authMiddleware = createAuthMiddleware(databaseService.getConnection(), jwtSecret);
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());

  /**
   * POST /api/permissions
   * Create a new permission
   *
   * Requirements: 4.4, 18.1, 18.4
   */
  router.post(
    "/",
    authMiddleware,
    rbacMiddleware("permissions", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing create permission request", {
        component: "PermissionsRouter",
        operation: "createPermission",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate request body
        const validatedData = CreatePermissionSchema.parse(req.body);

        logger.debug("Create permission data validated", {
          component: "PermissionsRouter",
          operation: "createPermission",
          metadata: {
            userId: req.user?.userId,
            resource: validatedData.resource,
            action: validatedData.action,
          },
        });

        // Create permission
        const permission = await permissionService.createPermission({
          resource: validatedData.resource,
          action: validatedData.action,
          description: validatedData.description,
        });

        logger.info("Permission created successfully", {
          component: "PermissionsRouter",
          operation: "createPermission",
          metadata: {
            userId: req.user?.userId,
            permissionId: permission.id,
            resource: permission.resource,
            action: permission.action,
          },
        });

        // Return created permission with 201 status
        res.status(201).json(permission);
      } catch (error) {
        // Handle duplicate resource-action combination
        if (error instanceof Error && error.message === 'Permission with this resource-action combination already exists') {
          logger.warn("Duplicate permission in create permission", {
            component: "PermissionsRouter",
            operation: "createPermission",
            metadata: { userId: req.user?.userId },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Permission with this resource and action already exists",
              field: "resource-action",
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Create permission validation failed", {
            component: "PermissionsRouter",
            operation: "createPermission",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Create permission failed with unexpected error", {
          component: "PermissionsRouter",
          operation: "createPermission",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to create permission",
          },
        });
      }
    })
  );

  /**
   * GET /api/permissions
   * Get paginated list of permissions
   *
   * Requirements: 4.4, 18.1, 18.4
   */
  router.get(
    "/",
    authMiddleware,
    rbacMiddleware("permissions", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing list permissions request", {
        component: "PermissionsRouter",
        operation: "listPermissions",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate query parameters
        const validatedQuery = PaginationSchema.parse(req.query);

        logger.debug("List permissions query validated", {
          component: "PermissionsRouter",
          operation: "listPermissions",
          metadata: { page: validatedQuery.page, limit: validatedQuery.limit },
        });

        // Calculate offset from page number
        const offset = (validatedQuery.page - 1) * validatedQuery.limit;

        // Fetch paginated permissions
        const result = await permissionService.listPermissions({
          limit: validatedQuery.limit,
          offset: offset,
        });

        // Calculate total pages
        const totalPages = Math.ceil(result.total / validatedQuery.limit);

        logger.info("Permissions list retrieved successfully", {
          component: "PermissionsRouter",
          operation: "listPermissions",
          metadata: {
            userId: req.user?.userId,
            total: result.total,
            page: validatedQuery.page,
            limit: validatedQuery.limit,
          },
        });

        // Return paginated response
        res.status(200).json({
          permissions: result.items,
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
          logger.warn("List permissions validation failed", {
            component: "PermissionsRouter",
            operation: "listPermissions",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("List permissions failed with unexpected error", {
          component: "PermissionsRouter",
          operation: "listPermissions",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve permissions",
          },
        });
      }
    })
  );

  return router;
}
