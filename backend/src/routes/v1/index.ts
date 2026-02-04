/**
 * v1 API Router
 *
 * Main router for the v1.0.0 API. Mounts all v1 routes under /api/v1
 * and adds the X-API-Version response header middleware.
 *
 * @module routes/v1
 * @version 1.0.0
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { createV1PluginsRouter } from "./plugins";
import { createV1CapabilitiesRouter } from "./capabilities";
import { createV1NodesRouter } from "./nodes";
import { createV1WidgetsRouter } from "./widgets";
import { createPluginRoutesRouter } from "./pluginRoutes";
import { createInventoryRouterV1 } from "../inventory.v1";
import { createFactsRouterV1 } from "../facts.v1";
import { createCommandsRouterV1 } from "../commands.v1";
import { createTasksRouterV1 } from "../tasks.v1";
// TODO: These files don't exist yet - will be created in future tasks
// import { createPuppetRouterV1 } from "../puppet.v1";
// import { createHieraRouterV1 } from "../hiera.v1";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import type { ExecutionRepository } from "../../database/ExecutionRepository";
import type { CommandWhitelistService } from "../../validation/CommandWhitelistService";
import type { StreamingExecutionManager } from "../../services/StreamingExecutionManager";

/**
 * API Version constant
 */
export const API_VERSION = "1.0.0";

/**
 * Middleware to add X-API-Version header to all responses
 */
export function apiVersionMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("X-API-Version", API_VERSION);
  next();
}

/**
 * Options for creating the v1 router
 */
export interface V1RouterOptions {
  integrationManager: IntegrationManager;
  logger: LoggerService;
  executionRepository?: ExecutionRepository;
  commandWhitelistService?: CommandWhitelistService;
  streamingManager?: StreamingExecutionManager;
}

/**
 * Create the v1 API router
 *
 * Mounts all v1 routes and applies the API version header middleware.
 *
 * @param options - Router configuration options
 * @returns Express router with all v1 routes
 */
export function createV1Router(options: V1RouterOptions): Router {
  const router = Router();
  const { integrationManager, logger, executionRepository, commandWhitelistService, streamingManager } = options;

  // Apply API version header to all v1 routes
  router.use(apiVersionMiddleware);

  // Mount v1 routes - core plugin/capability routes
  router.use("/plugins", createV1PluginsRouter(integrationManager, logger));
  router.use("/capabilities", createV1CapabilitiesRouter(integrationManager, logger));
  router.use("/nodes", createV1NodesRouter(integrationManager, logger));
  router.use("/widgets", createV1WidgetsRouter(integrationManager, logger));

  // Mount generic plugin routes (must be after /plugins info routes)
  // This handles /api/v1/plugins/:pluginName/* for custom plugin endpoints
  router.use("/plugins", createPluginRoutesRouter(integrationManager, logger));

  // Mount v1 capability-based routes
  router.use("/inventory", createInventoryRouterV1(integrationManager));
  router.use("/nodes", createFactsRouterV1(integrationManager));

  // Mount command, task, and puppet routes if dependencies are provided
  if (executionRepository && commandWhitelistService) {
    router.use("/nodes", createCommandsRouterV1(
      integrationManager,
      executionRepository,
      commandWhitelistService,
      streamingManager
    ));
  }

  if (executionRepository) {
    router.use("/tasks", createTasksRouterV1(
      integrationManager,
      executionRepository,
      streamingManager
    ));
    // TODO: Puppet routes will be added in future task
    // router.use("/nodes", createPuppetRouterV1(
    //   integrationManager,
    //   executionRepository,
    //   streamingManager
    // ));
  }

  // TODO: Hiera routes will be added in future task
  // Mount Hiera routes
  // router.use("/integrations/hiera", createHieraRouterV1(integrationManager));

  // Health check endpoint for v1 API
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  const mountedRoutes = ["/plugins", "/capabilities", "/nodes", "/widgets", "/inventory", "/health", "/plugins/:pluginName/*"];
  if (executionRepository && commandWhitelistService) {
    mountedRoutes.push("/nodes/:id/command");
  }
  if (executionRepository) {
    mountedRoutes.push("/tasks");
    // mountedRoutes.push("/nodes/:id/puppet-run"); // TODO: Add when puppet.v1.ts is created
  }
  // mountedRoutes.push("/integrations/hiera"); // TODO: Add when hiera.v1.ts is created

  logger.info("v1 API router initialized", {
    component: "V1Router",
    operation: "createV1Router",
    metadata: {
      version: API_VERSION,
      routes: mountedRoutes,
    },
  });

  return router;
}

export default createV1Router;
