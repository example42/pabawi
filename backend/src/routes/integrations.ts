import { Router } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createPuppetDBRouter } from "./integrations/puppetdb";
import { createPuppetserverRouter } from "./integrations/puppetserver";
import { createProxmoxRouter } from "./integrations/proxmox";
import { createProvisioningRouter } from "./integrations/provisioning";
import type { PermissionMiddlewareFactory } from "../middleware/routeAuthorization";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

/** Create integration routes with the caller's authorization policy. */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  requirePermission: PermissionMiddlewareFactory,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
  options?: { allowDestructiveProvisioning?: boolean },
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  router.use("/colors", createColorsRouter(container));
  router.use("/status", createStatusRouter(integrationManager, container));
  router.use("/puppetdb", requirePermission("puppetdb", "read"), createPuppetDBRouter(puppetDBService, container));
  router.use("/puppetserver", createPuppetserverRouter(requirePermission, puppetserverService, puppetDBService, container));
  router.use("/proxmox", createProxmoxRouter(integrationManager, requirePermission, {
    allowDestructiveActions: options?.allowDestructiveProvisioning ?? false,
  }, container));
  router.use("/provisioning", requirePermission("provisioning", "read"), createProvisioningRouter(integrationManager, container));
  return router;
}
