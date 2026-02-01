import { Router } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import type { LoggerService } from "../services/LoggerService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createPuppetDBRouter } from "./integrations/puppetdb";
import { createPuppetserverRouter } from "./integrations/puppetserver";
import { createMenuRouter } from "./integrations/menu";

/**
 * Create integrations router
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
): Router {
  const router = Router();

  // Mount menu router
  router.use("/menu", createMenuRouter(integrationManager, logger));

  // Mount colors router
  router.use("/colors", createColorsRouter());

  // Mount status router
  router.use("/status", createStatusRouter(
    integrationManager,
    puppetDBService,
    puppetserverService
  ));

  // Mount PuppetDB router (handles not configured case internally)
  router.use("/puppetdb", createPuppetDBRouter(puppetDBService));

  // Mount Puppetserver router (handles not configured case internally)
  router.use("/puppetserver", createPuppetserverRouter(puppetserverService, puppetDBService));

  return router;
}
