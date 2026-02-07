/**
 * Generic Plugin Routes (v1.0.0)
 *
 * Provides a generic route pattern `/api/v1/plugins/:pluginName/*` that
 * dynamically routes requests to plugin-registered route handlers.
 *
 * This enables plugins to register custom endpoints without hardcoding
 * routes in the core application.
 *
 * Routes:
 * - ALL /api/v1/plugins/:pluginName/* - Forward to plugin route handlers
 *
 * @module routes/v1/pluginRoutes
 * @version 1.0.0
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import type { PluginRoute } from "../../integrations/types";

/**
 * Create the generic plugin routes router
 *
 * This router handles all requests to `/api/v1/plugins/:pluginName/*` and
 * forwards them to the appropriate plugin route handler.
 *
 * @param integrationManager - Integration manager instance
 * @param logger - Logger service instance
 * @returns Express router
 */
export function createPluginRoutesRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService
): Router {
  const router = Router();

  /**
   * Generic catch-all route handler
   * Matches: /api/v1/plugins/:pluginName/*
   *
   * Extracts the plugin name and remaining path, then forwards to the
   * plugin's registered route handler if one exists.
   */
  router.all("/:pluginName/*", async (req: Request, res: Response, next: NextFunction) => {
    const pluginName = req.params.pluginName;
    const remainingPath = req.params[0]; // The * wildcard capture
    const method = req.method.toUpperCase();

    logger.debug(`Plugin route request: ${method} /plugins/${pluginName}/${remainingPath}`, {
      component: "PluginRoutes",
      operation: "routeHandler",
      metadata: {
        pluginName,
        method,
        path: remainingPath,
      },
    });

    try {
      // Get the plugin
      const plugins = integrationManager.getAllV1Plugins();
      const loadedPlugin = plugins.get(pluginName);

      if (!loadedPlugin) {
        logger.warn(`Plugin '${pluginName}' not found`, {
          component: "PluginRoutes",
          operation: "routeHandler",
          metadata: { pluginName },
        });
        res.status(404).json({
          success: false,
          error: {
            code: "PLUGIN_NOT_FOUND",
            message: `Plugin '${pluginName}' not found`,
          },
        });
        return;
      }

      // Check if plugin has routes
      const pluginRoutes = loadedPlugin.instance.routes;
      if (!pluginRoutes || pluginRoutes.length === 0) {
        logger.warn(`Plugin '${pluginName}' has no registered routes`, {
          component: "PluginRoutes",
          operation: "routeHandler",
          metadata: { pluginName },
        });
        res.status(404).json({
          success: false,
          error: {
            code: "NO_ROUTES",
            message: `Plugin '${pluginName}' does not provide custom routes`,
          },
        });
        return;
      }

      // Find matching route
      const matchResult = findMatchingRoute(pluginRoutes, method, remainingPath);

      if (!matchResult) {
        logger.warn(`No matching route found for ${method} /${remainingPath} in plugin '${pluginName}'`, {
          component: "PluginRoutes",
          operation: "routeHandler",
          metadata: {
            pluginName,
            method,
            path: remainingPath,
            availableRoutes: pluginRoutes.map(r => `${r.method} ${r.path}`),
          },
        });
        res.status(404).json({
          success: false,
          error: {
            code: "ROUTE_NOT_FOUND",
            message: `No route found for ${method} /${remainingPath}`,
            availableRoutes: pluginRoutes.map(r => `${r.method} ${r.path}`),
          },
        });
        return;
      }

      const { route: matchingRoute, params } = matchResult;

      // Merge extracted params into req.params
      Object.assign(req.params, params);

      // TODO: Check permissions if route has requiredPermissions
      // This would integrate with RBAC system

      logger.debug(`Forwarding to plugin route handler: ${method} /${remainingPath}`, {
        component: "PluginRoutes",
        operation: "routeHandler",
        metadata: {
          pluginName,
          method,
          path: remainingPath,
        },
      });

      // Call the plugin's route handler
      // Note: We pass req, res, next as-is to maintain Express compatibility
      await matchingRoute.handler(req as unknown as Record<string, unknown>, res as unknown as Record<string, unknown>, next);

    } catch (error) {
      logger.error(`Error handling plugin route for '${pluginName}'`, {
        component: "PluginRoutes",
        operation: "routeHandler",
        metadata: {
          pluginName,
          method,
          path: remainingPath,
        },
      }, error instanceof Error ? error : undefined);

      // Pass error to Express error handler
      next(error);
    }
  });

  logger.info("Generic plugin routes initialized", {
    component: "PluginRoutes",
    operation: "createPluginRoutesRouter",
  });

  return router;
}

/**
 * Find a matching route from plugin routes
 *
 * Matches based on HTTP method and path pattern.
 * Supports exact matches and simple path parameters (e.g., 'data/:id')
 * Extracts parameter values and returns them.
 *
 * @param routes - Array of plugin routes
 * @param method - HTTP method
 * @param path - Request path (without /api/v1/plugins/:pluginName/ prefix)
 * @returns Matching route with extracted params, or undefined
 */
function findMatchingRoute(
  routes: PluginRoute[],
  method: string,
  path: string
): { route: PluginRoute; params: Record<string, string> } | undefined {
  // Normalize path (remove leading/trailing slashes)
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");

  for (const route of routes) {
    // Check method match
    if (route.method !== method) {
      continue;
    }

    // Normalize route path
    const normalizedRoutePath = route.path.replace(/^\/+|\/+$/g, "");

    // Exact match
    if (normalizedRoutePath === normalizedPath) {
      return { route, params: {} };
    }

    // Pattern match (simple implementation for :param style)
    // Extract parameter names
    const paramNames: string[] = [];
    const routePattern = normalizedRoutePath.replace(/:([^/]+)/g, (_match, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });

    const regex = new RegExp(`^${routePattern}$`);
    const match = normalizedPath.match(regex);

    if (match) {
      // Extract parameter values
      const params: Record<string, string> = {};
      for (let i = 0; i < paramNames.length; i++) {
        params[paramNames[i]] = match[i + 1]; // match[0] is the full match
      }
      return { route, params };
    }
  }

  return undefined;
}
