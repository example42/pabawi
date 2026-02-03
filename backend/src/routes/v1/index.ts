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
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";

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
  const { integrationManager, logger } = options;

  // Apply API version header to all v1 routes
  router.use(apiVersionMiddleware);

  // Mount v1 routes
  router.use("/plugins", createV1PluginsRouter(integrationManager, logger));
  router.use("/capabilities", createV1CapabilitiesRouter(integrationManager, logger));
  router.use("/nodes", createV1NodesRouter(integrationManager, logger));
  router.use("/widgets", createV1WidgetsRouter(integrationManager, logger));

  // Health check endpoint for v1 API
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  logger.info("v1 API router initialized", {
    component: "V1Router",
    operation: "createV1Router",
    metadata: {
      version: API_VERSION,
      routes: ["/plugins", "/capabilities", "/nodes", "/widgets", "/health"],
    },
  });

  return router;
}

export default createV1Router;
