import { Router } from "express";
import type { Database } from "sqlite3";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createPuppetDBRouter } from "./integrations/puppetdb";
import { createPuppetserverRouter } from "./integrations/puppetserver";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";

/**
 * Create integrations router
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
  db?: Database,
  jwtSecret?: string,
): Router {
  const router = Router();

  // Mount colors router
  router.use("/colors", createColorsRouter());

  // Mount status router
  router.use("/status", createStatusRouter(
    integrationManager,
    puppetDBService,
    puppetserverService
  ));

  // Mount PuppetDB router with authentication and RBAC (Requirements 11.1, 11.2, 11.3, 11.4)
  // All PuppetDB routes are GET (read operations), so they require 'puppetdb:read' permission
  if (db) {
    const authMiddleware = createAuthMiddleware(db, jwtSecret);
    const rbacMiddleware = createRbacMiddleware(db);

    router.use(
      "/puppetdb",
      authMiddleware,
      rbacMiddleware('puppetdb', 'read'),
      createPuppetDBRouter(puppetDBService)
    );
  } else {
    // Fallback for cases where database is not available (e.g., tests)
    router.use("/puppetdb", createPuppetDBRouter(puppetDBService));
  }

  // Mount Puppetserver router (handles not configured case internally)
  router.use("/puppetserver", createPuppetserverRouter(puppetserverService, puppetDBService));

  return router;
}
