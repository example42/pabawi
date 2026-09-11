import { createSourceAuthorization } from "../middleware/sourceAuthorization";
import { createInventoryRouter } from "./inventory";
import { createFactsRouter } from "./facts";
import { createCommandsRouter } from "./commands";
import { createTasksRouter } from "./tasks";
import { createPlaybooksRouter } from "./playbooks";
import { createPlaybookBrowserRouter } from "./playbookBrowser";
import { createExecutionsRouter } from "./executions";
import { createPuppetRouter } from "./puppet";
import { createPuppetHistoryRouter } from "./puppetHistory";
import { createPackagesRouter } from "./packages";
import { createStreamingRouter, streamAuthMiddleware } from "./streaming";
import { createIntegrationsRouter } from "./integrations";
import { createHieraRouter } from "./hiera";
import { createAWSRouter } from "./integrations/aws";
import { createAzureRouter } from "./integrations/azure";
import { createMonitoringRouter } from "./integrations/monitoring";
import type { AWSPlugin } from "../integrations/aws/AWSPlugin";
import type { AzurePlugin } from "../integrations/azure/AzurePlugin";
import type { Express, RequestHandler } from "express";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { BoltService } from "../integrations/bolt/BoltService";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { BoltCommandWhitelistService } from "../validation/CommandWhitelistService";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { ExecutionQueue } from "../services/ExecutionQueue";
import type { BatchExecutionService } from "../services/BatchExecutionService";
import type { RequestIdempotencyService } from "../services/RequestIdempotencyService";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { PuppetserverService } from "../integrations/puppetserver/PuppetserverService";
import type { PuppetRunHistoryService } from "../services/PuppetRunHistoryService";
import type { JournalService } from "../services/journal/JournalService";
import type { DIContainer } from "../container/DIContainer";
import type { AppConfig } from "../config/schema";
import type { PermissionMiddlewareFactory } from "../middleware/routeAuthorization";

interface InfrastructureRouteDependencies {
  db: DatabaseAdapter;
  integrationManager: IntegrationManager;
  boltService: BoltService;
  executionRepository: ExecutionRepository;
  commandWhitelistService: BoltCommandWhitelistService;
  streamingManager: StreamingExecutionManager;
  executionQueue?: ExecutionQueue;
  batchExecutionService?: BatchExecutionService;
  /** Durable idempotency store for the batch and Puppet run admission routes. */
  requestIdempotency?: RequestIdempotencyService;
  puppetDBService?: PuppetDBService;
  puppetserverService?: PuppetserverService;
  puppetRunHistoryService?: PuppetRunHistoryService;
  journalService?: JournalService;
  container: DIContainer;
  config: Pick<AppConfig, "provisioning" | "packageTasks">;
  authMiddleware: RequestHandler;
  rbacMiddleware: PermissionMiddlewareFactory;
  rateLimitMiddleware: RequestHandler;
}

export function mountInfrastructureRoutes(app: Express, dependencies: InfrastructureRouteDependencies): void {
  const { db, integrationManager, boltService, executionRepository, commandWhitelistService, streamingManager, executionQueue, batchExecutionService, requestIdempotency, puppetDBService, puppetserverService, puppetRunHistoryService, journalService, container, config, authMiddleware, rbacMiddleware, rateLimitMiddleware } = dependencies;
  const authorizeSources = createSourceAuthorization(db, integrationManager);

  // API Routes - Inventory routes (protected with RBAC)
  app.use(
    "/api/inventory",
    authMiddleware,
    rateLimitMiddleware,
    createInventoryRouter(boltService, authorizeSources, rbacMiddleware, integrationManager, {
      allowDestructiveActions: config.provisioning.allowDestructiveActions,
    }, container),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createFactsRouter(integrationManager, authorizeSources, container),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createCommandsRouter(
      integrationManager,
      executionRepository,
      commandWhitelistService,
      rbacMiddleware,
      streamingManager,
      container,
    ),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createTasksRouter(
      integrationManager,
      rbacMiddleware,
      executionRepository,
      streamingManager,
      container,
    ),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createPlaybooksRouter(
      integrationManager,
      rbacMiddleware,
      executionRepository,
      streamingManager,
      container,
    ),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createPuppetRouter(integrationManager, rbacMiddleware, executionRepository, journalService, streamingManager, container, requestIdempotency),
  );
  app.use(
    "/api/nodes",
    authMiddleware,
    rateLimitMiddleware,
    createMonitoringRouter(integrationManager, rbacMiddleware, container),
  );
  // Multi-node puppet run endpoint (global action)
  app.use(
    "/api/puppet-run",
    authMiddleware,
    rateLimitMiddleware,
    createPuppetRouter(integrationManager, rbacMiddleware, executionRepository, journalService, streamingManager, container, requestIdempotency),
  );
  // Add puppet history routes if PuppetDB is available
  if (puppetRunHistoryService) {
    app.use(
      "/api/puppet",
      authMiddleware,
      rateLimitMiddleware,
      createPuppetHistoryRouter(puppetRunHistoryService, rbacMiddleware, container),
    );
  }
  app.use(
    "/api/packages",
    authMiddleware,
    rateLimitMiddleware,
    createPackagesRouter(
      integrationManager,
      rbacMiddleware,
      boltService,
      executionRepository,
      config.packageTasks,
      streamingManager,
      container,
    ),
  );
  app.use(
    "/api/tasks",
    authMiddleware,
    rateLimitMiddleware,
    createTasksRouter(
      integrationManager,
      rbacMiddleware,
      executionRepository,
      streamingManager,
      container,
    ),
  );
  app.use(
    "/api/playbooks",
    authMiddleware,
    rateLimitMiddleware,
    rbacMiddleware("ansible", "read"),
    createPlaybookBrowserRouter(integrationManager, container),
  );
  // Resolve a single-use `?ticket=` into an Authorization header before ANY
  // /api/executions chain authenticates. Both chains match this prefix, so the
  // conversion has to happen ahead of the first one or an EventSource request
  // (which cannot set headers) is rejected by the executions chain before it
  // ever reaches the streaming router.
  app.use("/api/executions", streamAuthMiddleware);
  app.use(
    "/api/executions",
    authMiddleware,
    rateLimitMiddleware,
    createExecutionsRouter(executionRepository, rbacMiddleware, executionQueue, batchExecutionService, container, commandWhitelistService, requestIdempotency),
  );
  app.use(
    "/api/executions",
    authMiddleware,
    rateLimitMiddleware,
    createStreamingRouter(streamingManager, executionRepository, rbacMiddleware, container),
  );
  app.use(
    "/api/streaming",
    streamAuthMiddleware, // resolve single-use ?ticket= before auth check
    authMiddleware,
    rateLimitMiddleware,
    createStreamingRouter(streamingManager, executionRepository, rbacMiddleware, container),
  );
  app.use(
    "/api/integrations",
    authMiddleware,
    rateLimitMiddleware,
    createIntegrationsRouter(
      integrationManager,
      rbacMiddleware,
      puppetDBService,
      puppetserverService,
      { allowDestructiveProvisioning: config.provisioning.allowDestructiveActions },
      container,
    ),
  );
  app.use(
    "/api/integrations/hiera",
    authMiddleware,
    rateLimitMiddleware,
    createHieraRouter(integrationManager, rbacMiddleware, container),
  );

  // AWS integration routes (conditional on plugin availability)
  const awsPluginInstance = integrationManager.getExecutionTool("aws") as AWSPlugin | null;
  if (awsPluginInstance) {
    app.use(
      "/api/integrations/aws",
      authMiddleware,
      rateLimitMiddleware,
      createAWSRouter(awsPluginInstance, rbacMiddleware, integrationManager, {
        allowDestructiveActions: config.provisioning.allowDestructiveActions,
      }, container),
    );
  }

  // Azure integration routes (conditional on plugin availability)
  const azurePluginInstance = integrationManager.getExecutionTool("azure") as AzurePlugin | null;
  if (azurePluginInstance) {
    app.use(
      "/api/integrations/azure",
      authMiddleware,
      rateLimitMiddleware,
      createAzureRouter(azurePluginInstance, rbacMiddleware, integrationManager, {
        allowDestructiveActions: config.provisioning.allowDestructiveActions,
      }, container),
    );
  }

}
