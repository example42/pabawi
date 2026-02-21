import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { UserService } from "../services/UserService";
import { AuthenticationService } from "../services/AuthenticationService";
import { AuditLoggingService } from "../services/AuditLoggingService";
import { DatabaseService } from "../database/DatabaseService";
import { LoggerService } from "../services/LoggerService";
import {
  sendValidationError,
  ERROR_CODES,
  sendAuthenticationError,
  sendDuplicateError,
  sendDatabaseError,
  sendInputValidationError,
  isDatabaseConnectionError,
  isDuplicateError,
  extractDuplicateField
} from "../utils/errorHandling";
import { ZodError } from "zod";
import { createAuthMiddleware } from "../middleware/authMiddleware";

const logger = new LoggerService();

/**
 * Zod schema for user registration
 * Validates all required fields according to requirements 2.1-2.5
 */
const RegisterSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must not exceed 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must contain only alphanumeric characters and underscores"),
  email: z
    .string()
    .email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character"),
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must not exceed 100 characters"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must not exceed 100 characters"),
});

/**
 * Zod schema for user login
 * Validates username and password
 */
const LoginSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(1, "Username is required"),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

/**
 * Create authentication router
 */
export function createAuthRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET; // Use same secret for both
  const auditLogger = new AuditLoggingService(databaseService.getConnection());
  const authService = new AuthenticationService(databaseService.getConnection(), jwtSecret, auditLogger);
  const userService = new UserService(databaseService.getConnection(), authService);
  const authMiddleware = createAuthMiddleware(databaseService.getConnection(), jwtSecret);

  /**
   * POST /api/auth/register
   * Register a new user account
   *
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   */
  router.post(
    "/register",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing user registration request", {
        component: "AuthRouter",
        operation: "register",
      });

      try {
        // Validate request body
        const validatedData = RegisterSchema.parse(req.body);

        logger.debug("Registration data validated", {
          component: "AuthRouter",
          operation: "register",
          metadata: { username: validatedData.username, email: validatedData.email },
        });

        // Create user account
        const user = await userService.createUser({
          username: validatedData.username,
          email: validatedData.email,
          password: validatedData.password,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
        });

        // Convert to DTO (excludes password)
        const userDTO = userService.toUserDTO(user);

        logger.info("User registered successfully", {
          component: "AuthRouter",
          operation: "register",
          metadata: { userId: user.id, username: user.username },
        });

        // Return 201 Created with user DTO
        res.status(201).json({
          user: userDTO,
        });
      } catch (error) {
        // Handle Zod validation errors (Requirement 16.3)
        if (error instanceof ZodError) {
          logger.warn("Registration validation failed", {
            component: "AuthRouter",
            operation: "register",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          logger.error("Registration failed: database connection error", {
            component: "AuthRouter",
            operation: "register",
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "User registration service temporarily unavailable");
          return;
        }

        // Handle duplicate username/email errors (Requirement 16.4)
        if (isDuplicateError(error) && error instanceof Error) {
          const field = extractDuplicateField(error);

          if (field === "username") {
            logger.warn("Registration failed: duplicate username", {
              component: "AuthRouter",
              operation: "register",
            });
            sendDuplicateError(res, "username");
            return;
          }

          if (field === "email") {
            logger.warn("Registration failed: duplicate email", {
              component: "AuthRouter",
              operation: "register",
            });
            sendDuplicateError(res, "email");
            return;
          }
        }

        // Handle explicit duplicate errors from service layer
        if (error instanceof Error) {
          if (error.message.includes("Username already exists")) {
            logger.warn("Registration failed: duplicate username", {
              component: "AuthRouter",
              operation: "register",
            });
            sendDuplicateError(res, "username");
            return;
          }

          if (error.message.includes("Email already exists")) {
            logger.warn("Registration failed: duplicate email", {
              component: "AuthRouter",
              operation: "register",
            });
            sendDuplicateError(res, "email");
            return;
          }

          // Handle password validation errors (Requirement 16.3)
          if (error.message.includes("Password validation failed")) {
            logger.warn("Registration failed: password validation", {
              component: "AuthRouter",
              operation: "register",
            });
            sendInputValidationError(res, error.message);
            return;
          }
        }

        // Handle unexpected errors
        logger.error("Registration failed with unexpected error", {
          component: "AuthRouter",
          operation: "register",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to register user",
          },
        });
      }
    })
  );

  /**
   * POST /api/auth/login
   * Authenticate user credentials and return tokens
   *
   * Requirements: 1.1, 1.2, 1.3, 6.1, 6.2
   */
  router.post(
    "/login",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing user login request", {
        component: "AuthRouter",
        operation: "login",
      });

      try {
        // Validate request body
        const loginData = LoginSchema.parse(req.body);

        logger.debug("Login data validated", {
          component: "AuthRouter",
          operation: "login",
          metadata: { username: loginData.username },
        });

        // Authenticate user credentials
        const authResult = await authService.authenticate(
          loginData.username,
          loginData.password,
          req.ip || req.socket.remoteAddress,
          req.headers['user-agent']
        );

        if (!authResult.success) {
          logger.warn("Login failed", {
            component: "AuthRouter",
            operation: "login",
            metadata: { username: loginData.username, error: authResult.error },
          });

          // Return 401 Unauthorized for invalid credentials (Requirement 16.1)
          sendAuthenticationError(res, authResult.error || "Invalid credentials");
          return;
        }

        logger.info("User logged in successfully", {
          component: "AuthRouter",
          operation: "login",
          metadata: { userId: authResult.user?.id, username: loginData.username },
        });

        // Return 200 OK with tokens and user DTO
        res.status(200).json({
          token: authResult.token,
          refreshToken: authResult.refreshToken,
          user: authResult.user,
        });
      } catch (error) {
        // Handle Zod validation errors (Requirement 16.3)
        if (error instanceof ZodError) {
          logger.warn("Login validation failed", {
            component: "AuthRouter",
            operation: "login",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          logger.error("Login failed: database connection error", {
            component: "AuthRouter",
            operation: "login",
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Authentication service temporarily unavailable");
          return;
        }

        // Handle unexpected errors
        logger.error("Login failed with unexpected error", {
          component: "AuthRouter",
          operation: "login",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to authenticate user",
          },
        });
      }
    })
  );

  /**
   * POST /api/auth/logout
   * Revoke user's tokens and end session
   *
   * Requirements: 1.6, 6.4
   */
  router.post(
    "/logout",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing user logout request", {
        component: "AuthRouter",
        operation: "logout",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const token = authHeader?.substring(7); // Remove "Bearer " prefix

        if (!token) {
          logger.warn("Logout failed: missing token", {
            component: "AuthRouter",
            operation: "logout",
          });
          res.status(400).json({
            error: {
              code: "MISSING_TOKEN",
              message: "Token is required for logout",
            },
          });
          return;
        }

        // Revoke the access token
        await authService.revokeToken(token);

        logger.info("User logged out successfully", {
          component: "AuthRouter",
          operation: "logout",
          metadata: { userId: req.user?.userId, username: req.user?.username },
        });

        // Return 200 OK with success message
        res.status(200).json({
          message: "Logout successful",
        });
      } catch (error) {
        // Handle database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          logger.error("Logout failed: database connection error", {
            component: "AuthRouter",
            operation: "logout",
            metadata: { userId: req.user?.userId },
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Logout service temporarily unavailable");
          return;
        }

        // Handle unexpected errors
        logger.error("Logout failed with unexpected error", {
          component: "AuthRouter",
          operation: "logout",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to logout user",
          },
        });
      }
    })
  );

  /**
   * Zod schema for token refresh
   * Validates refresh token
   */
  const RefreshTokenSchema = z.object({
    refreshToken: z
      .string({ required_error: "Refresh token is required" })
      .min(1, "Refresh token is required"),
  });

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   *
   * Requirements: 6.3, 19.2
   */
  router.post(
    "/refresh",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing token refresh request", {
        component: "AuthRouter",
        operation: "refresh",
      });

      try {
        // Validate request body
        const validatedData = RefreshTokenSchema.parse(req.body);

        logger.debug("Refresh token data validated", {
          component: "AuthRouter",
          operation: "refresh",
        });

        // Refresh the token
        const authResult = await authService.refreshToken(validatedData.refreshToken);

        if (!authResult.success) {
          logger.warn("Token refresh failed", {
            component: "AuthRouter",
            operation: "refresh",
            metadata: { error: authResult.error },
          });

          // Determine appropriate status code based on error
          let statusCode = 401;
          if (authResult.error?.includes("Invalid") || authResult.error?.includes("invalid")) {
            statusCode = 400;
          }

          // Return error response
          res.status(statusCode).json({
            error: {
              code: statusCode === 400 ? "INVALID_REFRESH_TOKEN" : "REFRESH_TOKEN_EXPIRED",
              message: authResult.error || "Token refresh failed",
            },
          });
          return;
        }

        logger.info("Token refreshed successfully", {
          component: "AuthRouter",
          operation: "refresh",
          metadata: { userId: authResult.user?.id },
        });

        // Return 200 OK with new access token and user DTO
        res.status(200).json({
          token: authResult.token,
          user: authResult.user,
        });
      } catch (error) {
        // Handle Zod validation errors (Requirement 16.3)
        if (error instanceof ZodError) {
          logger.warn("Refresh token validation failed", {
            component: "AuthRouter",
            operation: "refresh",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          logger.error("Token refresh failed: database connection error", {
            component: "AuthRouter",
            operation: "refresh",
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Token refresh service temporarily unavailable");
          return;
        }

        // Handle unexpected errors
        logger.error("Token refresh failed with unexpected error", {
          component: "AuthRouter",
          operation: "refresh",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to refresh token",
          },
        });
      }
    })
  );

  /**
   * Zod schema for password change
   * Validates current and new passwords
   */
  const ChangePasswordSchema = z.object({
    currentPassword: z
      .string({ required_error: "Current password is required" })
      .min(1, "Current password is required"),
    newPassword: z
      .string({ required_error: "New password is required" })
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character"),
  });

  /**
   * POST /api/auth/change-password
   * Change user's password
   *
   * Requirements: 20.1, 20.2, 20.3, 20.4
   */
  router.post(
    "/change-password",
    authMiddleware,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing password change request", {
        component: "AuthRouter",
        operation: "change-password",
        metadata: { userId: req.user?.userId },
      });

      try {
        // Validate request body
        const validatedData = ChangePasswordSchema.parse(req.body);

        logger.debug("Password change data validated", {
          component: "AuthRouter",
          operation: "change-password",
          metadata: { userId: req.user?.userId },
        });

        // Get user from database
        const user = await userService.getUserById(req.user!.userId);
        if (!user) {
          logger.warn("Password change failed: user not found", {
            component: "AuthRouter",
            operation: "change-password",
            metadata: { userId: req.user?.userId },
          });
          res.status(404).json({
            error: {
              code: "USER_NOT_FOUND",
              message: "User not found",
            },
          });
          return;
        }

        // Verify current password
        const isCurrentPasswordValid = await authService.verifyPassword(
          validatedData.currentPassword,
          user.passwordHash
        );

        if (!isCurrentPasswordValid) {
          logger.warn("Password change failed: incorrect current password", {
            component: "AuthRouter",
            operation: "change-password",
            metadata: { userId: req.user?.userId },
          });
          res.status(401).json({
            error: {
              code: "INCORRECT_PASSWORD",
              message: "Current password is incorrect",
            },
          });
          return;
        }

        // Update password in database
        await userService.updateUser(user.id, {
          password: validatedData.newPassword,
        });

        // Revoke all existing tokens for the user
        await authService.revokeAllUserTokens(user.id);

        logger.info("Password changed successfully", {
          component: "AuthRouter",
          operation: "change-password",
          metadata: { userId: req.user?.userId },
        });

        // Return 200 OK with success message
        res.status(200).json({
          message: "Password changed successfully. Please log in again with your new password.",
        });
      } catch (error) {
        // Handle Zod validation errors (Requirement 16.3)
        if (error instanceof ZodError) {
          logger.warn("Password change validation failed", {
            component: "AuthRouter",
            operation: "change-password",
            metadata: { errors: error.errors, userId: req.user?.userId },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle database connection errors (Requirement 16.5)
        if (isDatabaseConnectionError(error)) {
          logger.error("Password change failed: database connection error", {
            component: "AuthRouter",
            operation: "change-password",
            metadata: { userId: req.user?.userId },
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Password change service temporarily unavailable");
          return;
        }

        // Handle unexpected errors
        logger.error("Password change failed with unexpected error", {
          component: "AuthRouter",
          operation: "change-password",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to change password",
          },
        });
      }
    })
  );

  return router;
}
