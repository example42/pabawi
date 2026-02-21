import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { UserService } from "../services/UserService";
import { AuthenticationService } from "../services/AuthenticationService";
import { SetupService } from "../services/SetupService";
import { AuditLoggingService } from "../services/AuditLoggingService";
import { DatabaseService } from "../database/DatabaseService";
import { LoggerService } from "../services/LoggerService";
import {
  sendValidationError,
  ERROR_CODES,
  sendDuplicateError,
  sendDatabaseError,
  sendInputValidationError,
  isDatabaseConnectionError,
  isDuplicateError,
  extractDuplicateField
} from "../utils/errorHandling";
import { ZodError } from "zod";

const logger = new LoggerService();

/**
 * Zod schema for initial setup
 */
const InitialSetupSchema = z.object({
  // Admin user details
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

  // Configuration
  allowSelfRegistration: z.boolean(),
  defaultNewUserRole: z.string().nullable(), // Role ID or null
});

/**
 * Create setup router
 */
export function createSetupRouter(
  databaseService: DatabaseService
): Router {
  const router = Router();
  const jwtSecret = process.env.JWT_SECRET;
  const auditLogger = new AuditLoggingService(databaseService.getConnection());
  const authService = new AuthenticationService(databaseService.getConnection(), jwtSecret, auditLogger);
  const userService = new UserService(databaseService.getConnection(), authService);
  const setupService = new SetupService(databaseService.getConnection());

  /**
   * GET /api/setup/status
   * Check if initial setup is complete
   */
  router.get(
    "/status",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.info("Checking setup status", {
        component: "SetupRouter",
        operation: "status",
      });

      try {
        const status = await setupService.getSetupStatus();

        logger.debug("Setup status retrieved", {
          component: "SetupRouter",
          operation: "status",
          metadata: { isComplete: status.isComplete },
        });

        res.status(200).json(status);
      } catch (error) {
        // Handle database connection errors
        if (isDatabaseConnectionError(error)) {
          logger.error("Setup status check failed: database connection error", {
            component: "SetupRouter",
            operation: "status",
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Setup status check temporarily unavailable");
          return;
        }

        // Handle unexpected errors
        logger.error("Setup status check failed with unexpected error", {
          component: "SetupRouter",
          operation: "status",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to check setup status",
          },
        });
      }
    })
  );

  /**
   * POST /api/setup/initialize
   * Complete initial setup by creating admin user and saving configuration
   */
  router.post(
    "/initialize",
    asyncHandler(async (req: Request, res: Response) => {
      logger.info("Processing initial setup request", {
        component: "SetupRouter",
        operation: "initialize",
      });

      try {
        // Check if setup is already complete
        const isComplete = await setupService.isSetupComplete();
        if (isComplete) {
          logger.warn("Setup already complete", {
            component: "SetupRouter",
            operation: "initialize",
          });
          res.status(409).json({
            error: {
              code: "SETUP_ALREADY_COMPLETE",
              message: "Initial setup has already been completed",
            },
          });
          return;
        }

        // Validate request body
        const validatedData = InitialSetupSchema.parse(req.body);

        logger.debug("Setup data validated", {
          component: "SetupRouter",
          operation: "initialize",
          metadata: { username: validatedData.username, email: validatedData.email },
        });

        // Create admin user account
        const adminUser = await userService.createUser({
          username: validatedData.username,
          email: validatedData.email,
          password: validatedData.password,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          isAdmin: true,
        });

        // Save configuration
        await setupService.saveConfig({
          allowSelfRegistration: validatedData.allowSelfRegistration,
          defaultNewUserRole: validatedData.defaultNewUserRole,
        });

        // Convert to DTO (excludes password)
        const userDTO = userService.toUserDTO(adminUser);

        logger.info("Initial setup completed successfully", {
          component: "SetupRouter",
          operation: "initialize",
          metadata: { userId: adminUser.id, username: adminUser.username },
        });

        // Return 201 Created with admin user DTO
        res.status(201).json({
          user: userDTO,
          message: "Initial setup completed successfully",
        });
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
          logger.warn("Setup validation failed", {
            component: "SetupRouter",
            operation: "initialize",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        // Handle database connection errors
        if (isDatabaseConnectionError(error)) {
          logger.error("Setup failed: database connection error", {
            component: "SetupRouter",
            operation: "initialize",
          }, error instanceof Error ? error : undefined);
          sendDatabaseError(res, error, "Setup service temporarily unavailable");
          return;
        }

        // Handle duplicate username/email errors
        if (isDuplicateError(error) && error instanceof Error) {
          const field = extractDuplicateField(error);

          if (field === "username") {
            logger.warn("Setup failed: duplicate username", {
              component: "SetupRouter",
              operation: "initialize",
            });
            sendDuplicateError(res, "username");
            return;
          }

          if (field === "email") {
            logger.warn("Setup failed: duplicate email", {
              component: "SetupRouter",
              operation: "initialize",
            });
            sendDuplicateError(res, "email");
            return;
          }
        }

        // Handle explicit duplicate errors from service layer
        if (error instanceof Error) {
          if (error.message.includes("Username already exists")) {
            logger.warn("Setup failed: duplicate username", {
              component: "SetupRouter",
              operation: "initialize",
            });
            sendDuplicateError(res, "username");
            return;
          }

          if (error.message.includes("Email already exists")) {
            logger.warn("Setup failed: duplicate email", {
              component: "SetupRouter",
              operation: "initialize",
            });
            sendDuplicateError(res, "email");
            return;
          }

          // Handle password validation errors
          if (error.message.includes("Password validation failed")) {
            logger.warn("Setup failed: password validation", {
              component: "SetupRouter",
              operation: "initialize",
            });
            sendInputValidationError(res, error.message);
            return;
          }
        }

        // Handle unexpected errors
        logger.error("Setup failed with unexpected error", {
          component: "SetupRouter",
          operation: "initialize",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to complete initial setup",
          },
        });
      }
    })
  );

  return router;
}
