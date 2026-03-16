import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ZodError } from "zod";
import { asyncHandler } from "./asyncHandler";
import { IntegrationConfigService } from "../services/IntegrationConfigService";
import type { DatabaseService } from "../database/DatabaseService";
import { LoggerService } from "../services/LoggerService";
import { sendValidationError, ERROR_CODES } from "../utils/errorHandling";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";

const logger = new LoggerService();

/**
 * Zod schema for the integration name route parameter
 */
const IntegrationNameSchema = z.object({
  name: z.string().min(1, "Integration name is required"),
});

/**
 * Zod schema for saving an integration config (PUT body)
 */
const SaveConfigSchema = z.object({
  config: z.record(z.unknown()),
});

/**
 * Create integration config routes
 *
 * Requirements: 18.1, 19.1, 21.2, 27.4
 */
export function createIntegrationConfigRouter(databaseService: DatabaseService): Router {
  const router = Router();
  const configService = new IntegrationConfigService(
    databaseService.getConnection(),
    process.env.JWT_SECRET ?? "",
  );
  const authMiddleware = createAuthMiddleware(databaseService.getConnection());
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());

  /**
   * GET /api/config/integrations
   * List all integration configs for the authenticated user
   *
   * Requirements: 18.1
   */
  router.get(
    "/",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("integration_config", "read")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.userId;

      logger.info("Processing list integration configs request", {
        component: "IntegrationConfigRouter",
        operation: "listConfigs",
        metadata: { userId },
      });

      if (!userId) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Authentication required",
          },
        });
        return;
      }

      try {
        const configs = await configService.listConfigs(userId);
        res.status(200).json({ configs });
      } catch (error) {
        logger.error("List integration configs failed", {
          component: "IntegrationConfigRouter",
          operation: "listConfigs",
          metadata: { userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to list integration configs",
          },
        });
      }
    })
  );

  /**
   * GET /api/config/integrations/:name
   * Get effective (merged) config for an integration
   *
   * Requirements: 19.1
   */
  router.get(
    "/:name",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("integration_config", "read")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing get effective config request", {
        component: "IntegrationConfigRouter",
        operation: "getEffectiveConfig",
        metadata: { userId: req.user?.userId, name: req.params.name },
      });

      try {
        const { name } = IntegrationNameSchema.parse(req.params);
        const config = await configService.getEffectiveConfig(name);
        res.status(200).json({ config });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Get effective config validation failed", {
            component: "IntegrationConfigRouter",
            operation: "getEffectiveConfig",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Get effective config failed", {
          component: "IntegrationConfigRouter",
          operation: "getEffectiveConfig",
          metadata: { userId: req.user?.userId, name: req.params.name },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to get effective config",
          },
        });
      }
    })
  );

  /**
   * PUT /api/config/integrations/:name
   * Save (upsert) an integration config for the authenticated user
   *
   * Requirements: 18.1, 21.2
   */
  router.put(
    "/:name",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("integration_config", "configure")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.userId;

      logger.info("Processing save integration config request", {
        component: "IntegrationConfigRouter",
        operation: "saveConfig",
        metadata: { userId, name: req.params.name },
      });

      if (!userId) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Authentication required",
          },
        });
        return;
      }

      try {
        const { name } = IntegrationNameSchema.parse(req.params);
        const { config } = SaveConfigSchema.parse(req.body);

        await configService.saveConfig(userId, name, config);

        logger.info("Integration config saved successfully", {
          component: "IntegrationConfigRouter",
          operation: "saveConfig",
          metadata: { userId, name },
        });

        res.status(200).json({ message: "Config saved successfully" });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Save config validation failed", {
            component: "IntegrationConfigRouter",
            operation: "saveConfig",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Save integration config failed", {
          component: "IntegrationConfigRouter",
          operation: "saveConfig",
          metadata: { userId, name: req.params.name },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to save integration config",
          },
        });
      }
    })
  );

  /**
   * DELETE /api/config/integrations/:name
   * Delete an integration config for the authenticated user
   *
   * Requirements: 18.1
   */
  router.delete(
    "/:name",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("integration_config", "configure")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.userId;

      logger.info("Processing delete integration config request", {
        component: "IntegrationConfigRouter",
        operation: "deleteConfig",
        metadata: { userId, name: req.params.name },
      });

      if (!userId) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Authentication required",
          },
        });
        return;
      }

      try {
        const { name } = IntegrationNameSchema.parse(req.params);

        await configService.deleteConfig(userId, name);

        logger.info("Integration config deleted successfully", {
          component: "IntegrationConfigRouter",
          operation: "deleteConfig",
          metadata: { userId, name },
        });

        res.status(200).json({ message: "Config deleted successfully" });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Delete config validation failed", {
            component: "IntegrationConfigRouter",
            operation: "deleteConfig",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Delete integration config failed", {
          component: "IntegrationConfigRouter",
          operation: "deleteConfig",
          metadata: { userId, name: req.params.name },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to delete integration config",
          },
        });
      }
    })
  );

  return router;
}
