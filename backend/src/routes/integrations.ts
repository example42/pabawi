import { Router } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { LoggerService } from "../services/LoggerService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createMenuRouter } from "./integrations/menu";

/**
 * Create integrations router
 * Generic router for integration-related endpoints
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService,
): Router {
  const router = Router();

  // Mount menu router
  router.use("/menu", createMenuRouter(integrationManager, logger));

  // Mount colors router
  router.use("/colors", createColorsRouter());

  // Mount status router
  router.use("/status", createStatusRouter(integrationManager));

  return router;
}
