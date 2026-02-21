import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { UserService } from "../services/UserService";
import { AuthenticationService } from "../services/AuthenticationService";
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
 * Create users management router
 */
export function createUsersRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  const authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
  const userService = new UserService(databaseService.getConnection(), authService);
  const permissionService = new PermissionService(databaseService.getConnection());
  const authMiddleware = createAuthMiddleware(databaseService.getConnection(), jwtSecret);
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());

  /**
   * GET /api/users
   * Get paginated list of users
   *
   * Requirements: 12.1
   */
  router.get(
    "/",
    authMiddleware,
    rbacMiddleware("users", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing list users request", {
        component: "UsersRouter",
        operation: "listUsers",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate query parameters
        const validatedQuery = PaginationSchema.parse(req.query);

        logger.debug("List users query validated", {
          component: "UsersRouter",
          operation: "listUsers",
          metadata: { page: validatedQuery.page, limit: validatedQuery.limit },
        });

        // Calculate offset from page number
        const offset = (validatedQuery.page - 1) * validatedQuery.limit;

        // Fetch paginated users
        const result = await userService.listUsers({
          limit: validatedQuery.limit,
          offset: offset,
        });

        // Convert users to DTOs (remove passwords)
        const userDTOs = result.items.map(user => userService.toUserDTO(user));

        // Calculate total pages
        const totalPages = Math.ceil(result.total / validatedQuery.limit);

        logger.info("Users list retrieved successfully", {
          component: "UsersRouter",
          operation: "listUsers",
          metadata: {
            userId: req.user?.userId,
            total: result.total,
            page: validatedQuery.page,
            limit: validatedQuery.limit,
          },
        });

        // Return paginated response
        res.status(200).json({
          users: userDTOs,
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
          logger.warn("List users validation failed", {
            component: "UsersRouter",
            operation: "listUsers",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("List users failed with unexpected error", {
          component: "UsersRouter",
          operation: "listUsers",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve users",
          },
        });
      }
    })
  );

  /**
   * GET /api/users/:id
   * Get user by ID with groups and roles
   *
   * Requirements: 12.4
   */
  router.get(
    "/:id",
    authMiddleware,
    rbacMiddleware("users", "read"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing get user by ID request", {
        component: "UsersRouter",
        operation: "getUserById",
        metadata: { userId: req.user?.userId, targetUserId: req.params.id },
      });

      try {
        const userId = req.params.id;

        // Fetch user
        const user = await userService.getUserById(userId);

        if (!user) {
          logger.warn("User not found", {
            component: "UsersRouter",
            operation: "getUserById",
            metadata: { userId: req.user?.userId, targetUserId: userId },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User not found",
            },
          });
          return;
        }

        // Fetch user's groups and roles
        const groups = await userService.getUserGroups(userId);
        const roles = await userService.getUserRoles(userId);

        // Convert to DTO
        const userDTO = userService.toUserDTO(user);

        logger.info("User retrieved successfully", {
          component: "UsersRouter",
          operation: "getUserById",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            groupCount: groups.length,
            roleCount: roles.length,
          },
        });

        // Return user with groups and roles
        res.status(200).json({
          ...userDTO,
          groups: groups,
          roles: roles,
        });
      } catch (error) {
        // Handle unexpected errors
        logger.error("Get user by ID failed with unexpected error", {
          component: "UsersRouter",
          operation: "getUserById",
          metadata: { userId: req.user?.userId, targetUserId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve user",
          },
        });
      }
    })
  );

  /**
   * Zod schema for updating user
   */
  const UpdateUserSchema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    password: z.string().min(8).optional(),
    isActive: z.boolean().optional(),
    isAdmin: z.boolean().optional(),
  }).strict();

  /**
   * PUT /api/users/:id
   * Update user by ID
   *
   * Requirements: 2.6, 2.7, 2.8
   */
  router.put(
    "/:id",
    authMiddleware,
    rbacMiddleware("users", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing update user request", {
        component: "UsersRouter",
        operation: "updateUser",
        metadata: { userId: req.user?.userId, targetUserId: req.params.id },
      });

      try {
        const userId = req.params.id;

        // Validate request body
        const validatedData = UpdateUserSchema.parse(req.body);

        logger.debug("Update user data validated", {
          component: "UsersRouter",
          operation: "updateUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            fields: Object.keys(validatedData),
          },
        });

        // Update user
        const updatedUser = await userService.updateUser(userId, validatedData);

        // Convert to DTO
        const userDTO = userService.toUserDTO(updatedUser);

        logger.info("User updated successfully", {
          component: "UsersRouter",
          operation: "updateUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
          },
        });

        // Return updated user
        res.status(200).json(userDTO);
      } catch (error) {
        // Handle user not found
        if (error instanceof Error && error.message === 'User not found') {
          logger.warn("User not found for update", {
            component: "UsersRouter",
            operation: "updateUser",
            metadata: { userId: req.user?.userId, targetUserId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User not found",
            },
          });
          return;
        }

        // Handle duplicate email
        if (error instanceof Error && error.message === 'Email already exists') {
          logger.warn("Duplicate email in update user", {
            component: "UsersRouter",
            operation: "updateUser",
            metadata: { userId: req.user?.userId, targetUserId: req.params.id },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Email already exists",
              field: "email",
            },
          });
          return;
        }

        // Handle password validation errors
        if (error instanceof Error && error.message.includes('Password validation failed')) {
          logger.warn("Password validation failed in update user", {
            component: "UsersRouter",
            operation: "updateUser",
            metadata: { userId: req.user?.userId, targetUserId: req.params.id },
          });

          res.status(400).json({
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: error.message,
            },
          });
          return;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Update user validation failed", {
            component: "UsersRouter",
            operation: "updateUser",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle unexpected errors
        logger.error("Update user failed with unexpected error", {
          component: "UsersRouter",
          operation: "updateUser",
          metadata: { userId: req.user?.userId, targetUserId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to update user",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/users/:id
   * Soft delete user by ID
   *
   * Requirements: 2.8
   */
  router.delete(
    "/:id",
    authMiddleware,
    rbacMiddleware("users", "admin"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing delete user request", {
        component: "UsersRouter",
        operation: "deleteUser",
        metadata: { userId: req.user?.userId, targetUserId: req.params.id },
      });

      try {
        const userId = req.params.id;

        // Delete user (soft delete)
        await userService.deleteUser(userId);

        logger.info("User deleted successfully", {
          component: "UsersRouter",
          operation: "deleteUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle user not found
        if (error instanceof Error && error.message === 'User not found') {
          logger.warn("User not found for deletion", {
            component: "UsersRouter",
            operation: "deleteUser",
            metadata: { userId: req.user?.userId, targetUserId: req.params.id },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User not found",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Delete user failed with unexpected error", {
          component: "UsersRouter",
          operation: "deleteUser",
          metadata: { userId: req.user?.userId, targetUserId: req.params.id },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to delete user",
          },
        });
      }
    })
  );

  /**
   * POST /api/users/:id/groups/:groupId
   * Add user to group
   *
   * Requirements: 3.2, 3.4, 15.2
   */
  router.post(
    "/:id/groups/:groupId",
    authMiddleware,
    rbacMiddleware("users", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing add user to group request", {
        component: "UsersRouter",
        operation: "addUserToGroup",
        metadata: {
          userId: req.user?.userId,
          targetUserId: req.params.id,
          groupId: req.params.groupId,
        },
      });

      try {
        const userId = req.params.id;
        const groupId = req.params.groupId;

        // Add user to group
        await userService.addUserToGroup(userId, groupId);

        // Invalidate permission cache for the user
        permissionService.invalidateUserPermissionCache(userId);

        logger.info("User added to group successfully", {
          component: "UsersRouter",
          operation: "addUserToGroup",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            groupId: groupId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle user not found
        if (error instanceof Error && error.message === 'User not found') {
          logger.warn("User not found for add to group", {
            component: "UsersRouter",
            operation: "addUserToGroup",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              groupId: req.params.groupId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User not found",
            },
          });
          return;
        }

        // Handle group not found
        if (error instanceof Error && error.message === 'Group not found') {
          logger.warn("Group not found for add user", {
            component: "UsersRouter",
            operation: "addUserToGroup",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              groupId: req.params.groupId,
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

        // Handle user already in group
        if (error instanceof Error && error.message === 'User is already a member of this group') {
          logger.warn("User already in group", {
            component: "UsersRouter",
            operation: "addUserToGroup",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              groupId: req.params.groupId,
            },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "User is already a member of this group",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Add user to group failed with unexpected error", {
          component: "UsersRouter",
          operation: "addUserToGroup",
          metadata: {
            userId: req.user?.userId,
            targetUserId: req.params.id,
            groupId: req.params.groupId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to add user to group",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/users/:id/groups/:groupId
   * Remove user from group
   *
   * Requirements: 3.3, 3.5, 15.2
   */
  router.delete(
    "/:id/groups/:groupId",
    authMiddleware,
    rbacMiddleware("users", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing remove user from group request", {
        component: "UsersRouter",
        operation: "removeUserFromGroup",
        metadata: {
          userId: req.user?.userId,
          targetUserId: req.params.id,
          groupId: req.params.groupId,
        },
      });

      try {
        const userId = req.params.id;
        const groupId = req.params.groupId;

        // Remove user from group
        await userService.removeUserFromGroup(userId, groupId);

        // Invalidate permission cache for the user
        permissionService.invalidateUserPermissionCache(userId);

        logger.info("User removed from group successfully", {
          component: "UsersRouter",
          operation: "removeUserFromGroup",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            groupId: groupId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle user not in group
        if (error instanceof Error && error.message === 'User is not a member of this group') {
          logger.warn("User not in group for removal", {
            component: "UsersRouter",
            operation: "removeUserFromGroup",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              groupId: req.params.groupId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User is not a member of this group",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Remove user from group failed with unexpected error", {
          component: "UsersRouter",
          operation: "removeUserFromGroup",
          metadata: {
            userId: req.user?.userId,
            targetUserId: req.params.id,
            groupId: req.params.groupId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to remove user from group",
          },
        });
      }
    })
  );

  /**
   * POST /api/users/:id/roles/:roleId
   * Assign role to user
   *
   * Requirements: 4.6, 8.1, 15.2
   */
  router.post(
    "/:id/roles/:roleId",
    authMiddleware,
    rbacMiddleware("users", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing assign role to user request", {
        component: "UsersRouter",
        operation: "assignRoleToUser",
        metadata: {
          userId: req.user?.userId,
          targetUserId: req.params.id,
          roleId: req.params.roleId,
        },
      });

      try {
        const userId = req.params.id;
        const roleId = req.params.roleId;

        // Assign role to user
        await userService.assignRoleToUser(userId, roleId);

        // Invalidate permission cache for the user
        permissionService.invalidateUserPermissionCache(userId);

        logger.info("Role assigned to user successfully", {
          component: "UsersRouter",
          operation: "assignRoleToUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            roleId: roleId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle user not found
        if (error instanceof Error && error.message === 'User not found') {
          logger.warn("User not found for role assignment", {
            component: "UsersRouter",
            operation: "assignRoleToUser",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User not found",
            },
          });
          return;
        }

        // Handle role not found
        if (error instanceof Error && error.message === 'Role not found') {
          logger.warn("Role not found for assignment", {
            component: "UsersRouter",
            operation: "assignRoleToUser",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
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
        if (error instanceof Error && error.message === 'Role is already assigned to this user') {
          logger.warn("Role already assigned to user", {
            component: "UsersRouter",
            operation: "assignRoleToUser",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(409).json({
            error: {
              code: ERROR_CODES.CONFLICT,
              message: "Role is already assigned to this user",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Assign role to user failed with unexpected error", {
          component: "UsersRouter",
          operation: "assignRoleToUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: req.params.id,
            roleId: req.params.roleId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to assign role to user",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/users/:id/roles/:roleId
   * Remove role from user
   *
   * Requirements: 4.8, 8.5, 15.2
   */
  router.delete(
    "/:id/roles/:roleId",
    authMiddleware,
    rbacMiddleware("users", "write"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing remove role from user request", {
        component: "UsersRouter",
        operation: "removeRoleFromUser",
        metadata: {
          userId: req.user?.userId,
          targetUserId: req.params.id,
          roleId: req.params.roleId,
        },
      });

      try {
        const userId = req.params.id;
        const roleId = req.params.roleId;

        // Remove role from user
        await userService.removeRoleFromUser(userId, roleId);

        // Invalidate permission cache for the user
        permissionService.invalidateUserPermissionCache(userId);

        logger.info("Role removed from user successfully", {
          component: "UsersRouter",
          operation: "removeRoleFromUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: userId,
            roleId: roleId,
          },
        });

        // Return 204 No Content on success
        res.status(204).send();
      } catch (error) {
        // Handle user doesn't have role
        if (error instanceof Error && error.message === 'Role is not assigned to this user') {
          logger.warn("User doesn't have role for removal", {
            component: "UsersRouter",
            operation: "removeRoleFromUser",
            metadata: {
              userId: req.user?.userId,
              targetUserId: req.params.id,
              roleId: req.params.roleId,
            },
          });

          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND,
              message: "User does not have this role",
            },
          });
          return;
        }

        // Handle unexpected errors
        logger.error("Remove role from user failed with unexpected error", {
          component: "UsersRouter",
          operation: "removeRoleFromUser",
          metadata: {
            userId: req.user?.userId,
            targetUserId: req.params.id,
            roleId: req.params.roleId,
          },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to remove role from user",
          },
        });
      }
    })
  );

  return router;
}
