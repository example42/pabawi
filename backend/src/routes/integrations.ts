import { Router, type RequestHandler } from "express";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import { createColorsRouter } from "./integrations/colors";
import { createStatusRouter } from "./integrations/status";
import { createPuppetDBRouter } from "./integrations/puppetdb";
import { createPuppetserverRouter } from "./integrations/puppetserver";
import { createProxmoxRouter } from "./integrations/proxmox";
import { createProvisioningRouter } from "./integrations/provisioning";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";
import { noPermissionCheck, type PermissionMiddlewareFactory } from "../middleware/routeAuthorization";
import { asyncHandler } from "./asyncHandler";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

/**
 * Create integrations router
 */
export function createIntegrationsRouter(
  integrationManager: IntegrationManager,
  puppetDBService?: PuppetDBService,
  puppetserverService?: PuppetserverService,
  db?: DatabaseAdapter,
  jwtSecret?: string,
  options?: { allowDestructiveProvisioning?: boolean },
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();

  // Mount colors router
  router.use("/colors", createColorsRouter(container));

  // Mount status router
  router.use("/status", createStatusRouter(
    integrationManager,
    container
  ));

  // Mount PuppetDB router with authentication and RBAC (Requirements 11.1, 11.2, 11.3, 11.4)
  // All PuppetDB routes are GET (read operations), so they require 'puppetdb:read' permission
  if (db) {
    const authMiddleware = createAuthMiddleware(db, jwtSecret);
    const rbacMiddleware = createRbacMiddleware(db);

    router.use(
      "/puppetdb",
      asyncHandler(authMiddleware),
      asyncHandler(rbacMiddleware('puppetdb', 'read')),
      createPuppetDBRouter(puppetDBService, container)
    );
  } else {
    // Fallback for cases where database is not available (e.g., tests)
    router.use("/puppetdb", createPuppetDBRouter(puppetDBService, container));
  }

  // Authorization factory for the sub-routers mounted below (finding S01).
  // `rbacMiddleware` returns 401 when no principal is attached and 403 when the
  // principal lacks the permission, so these routers fail closed even if a
  // caller mounts them without the auth middleware. Without a database there is
  // no principal store at all, so the fallback is test-only; the assembled
  // application always supplies `db`.
  const rawRbac = db ? createRbacMiddleware(db) : null;
  const requirePermission: PermissionMiddlewareFactory = rawRbac
    ? (resource, action): RequestHandler => asyncHandler(rawRbac(resource, action))
    : noPermissionCheck;

  // Mount Puppetserver router (handles the not-configured case internally).
  // Every route is gated on puppetserver:read, with write/admin on deployment
  // and cache flush.
  router.use(
    "/puppetserver",
    createPuppetserverRouter(requirePermission, puppetserverService, puppetDBService, container),
  );

  // Mount Proxmox router. Every route is gated on proxmox:read, with
  // provision/destroy/lifecycle on the mutating routes.
  router.use(
    "/proxmox",
    createProxmoxRouter(integrationManager, requirePermission, {
      allowDestructiveActions: options?.allowDestructiveProvisioning ?? true,
    }, container),
  );

  // Mount Provisioning router (integration discovery) with authentication
  // Validates Requirements: 1.3, 2.1, 9.1, 9.2
  if (db) {
    const authMiddleware = createAuthMiddleware(db, jwtSecret);
    const rbacMiddleware = createRbacMiddleware(db);

    router.use(
      "/provisioning",
      asyncHandler(authMiddleware),
      asyncHandler(rbacMiddleware('provisioning', 'read')),
      createProvisioningRouter(integrationManager, container)
    );
  } else {
    // Fallback for cases where database is not available (e.g., tests)
    router.use("/provisioning", createProvisioningRouter(integrationManager, container));
  }

  return router;
}
