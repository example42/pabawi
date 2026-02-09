/**
 * v1 Plugins Router
 *
 * Provides v1 API endpoints for plugin discovery and management.
 * Routes:
 * - GET /api/v1/plugins - List all plugins
 * - GET /api/v1/plugins/:name - Get plugin details
 * - GET /api/v1/plugins/:name/capabilities - Get plugin capabilities
 * - GET /api/v1/plugins/:name/widgets - Get plugin widgets
 * - GET /api/v1/plugins/:name/health - Get plugin health status
 * - GET /api/v1/plugins/:name/summary - Get lightweight plugin summary for home tiles
 * - GET /api/v1/plugins/:name/data - Get full plugin data for plugin home pages
 *
 * @module routes/v1/plugins
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import { asyncHandler } from "../asyncHandler";

/**
 * Frontend-facing plugin info structure (full details)
 * Matches frontend/src/lib/plugins/types.ts PluginInfo interface
 */
interface PluginInfo {
  metadata: {
    name: string;
    version: string;
    author: string;
    description: string;
    integrationType: string;
    homepage?: string;
    dependencies?: string[];
    frontendEntryPoint?: string;
    color?: string;
    icon?: string;
    minPabawiVersion?: string;
    tags?: string[];
  };
  enabled: boolean;
  healthy: boolean;
  widgets: {
    id: string;
    name: string;
    component: string;
    slots: string[];
    size: string;
    requiredCapabilities: string[];
    config?: Record<string, unknown>;
    icon?: string;
    priority?: number;
  }[];
  capabilities: {
    name: string;
    category: string;
    description: string;
    riskLevel: string;
    requiredPermissions: string[];
  }[];
  priority: number;
}

/**
 * Lightweight plugin metadata structure for menu building
 * No widgets or full capability details - just metadata for fast loading
 */
interface PluginMetadataResponse {
  name: string;
  displayName: string;
  description: string;
  integrationType: string;
  integrationTypes?: string[]; // Support for multi-type plugins
  color?: string;
  icon?: string;
  enabled: boolean;
  healthy: boolean;
  capabilities: Array<{
    name: string;
    category: string;
  }>;
}

/**
 * Create the v1 plugins router
 *
 * @param integrationManager - Integration manager instance
 * @param logger - Logger service instance
 * @returns Express router with v1 plugins endpoints
 */
export function createV1PluginsRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService
): Router {
  const router = Router();

  /**
   * GET /api/v1/plugins
   *
   * Returns lightweight metadata for all loaded plugins.
   * This endpoint is optimized for fast menu building - it returns only
   * essential metadata without widgets or full capability details.
   * Target response time: < 100ms
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();

      logger.debug("Fetching plugin metadata for v1 API", {
        component: "V1PluginsRouter",
        operation: "listPluginsMetadata",
      });

      const plugins: PluginMetadataResponse[] = [];
      const capabilityRegistry = integrationManager.getCapabilityRegistry();

      // Get v1.0.0 plugins
      const v1PluginNames = integrationManager.getV1PluginNames();

      for (const pluginName of v1PluginNames) {
        const metadata = integrationManager.getPluginMetadata(pluginName);
        if (!metadata) {
          logger.warn(`Plugin ${pluginName} has no metadata, skipping`, {
            component: "V1PluginsRouter",
            operation: "listPluginsMetadata",
          });
          continue;
        }

        // Get lightweight capability list (name and category only)
        const allCapabilities = capabilityRegistry.getAllCapabilities();
        const pluginCapabilities = allCapabilities
          .filter((c) => c.pluginName === pluginName)
          .map((c) => ({
            name: c.capability.name,
            category: c.capability.category,
          }));

        // Determine plugin health (simple check, no expensive operations)
        const healthy = true; // TODO: Implement actual health check

        plugins.push({
          name: metadata.name,
          displayName: metadata.name, // Use name as displayName for now
          description: metadata.description,
          integrationType: metadata.integrationType,
          integrationTypes: metadata.integrationTypes, // Include multi-type support
          color: metadata.color,
          icon: metadata.icon,
          enabled: true,
          healthy,
          capabilities: pluginCapabilities,
        });
      }

      const duration = Date.now() - startTime;

      logger.info(`Returning ${plugins.length} plugin metadata via v1 API`, {
        component: "V1PluginsRouter",
        operation: "listPluginsMetadata",
        metadata: {
          pluginCount: plugins.length,
          v1PluginCount: v1PluginNames.length,
          durationMs: duration,
        },
      });

      // Log warning if response time exceeds target
      if (duration > 100) {
        logger.warn(`Plugin metadata endpoint exceeded target response time`, {
          component: "V1PluginsRouter",
          operation: "listPluginsMetadata",
          metadata: {
            durationMs: duration,
            targetMs: 100,
          },
        });
      }

      res.json({ plugins });
    })
  );

  /**
   * GET /api/v1/plugins/:name
   *
   * Returns detailed information about a specific plugin.
   */
  router.get(
    "/:name",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      logger.debug(`Fetching plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPlugin",
        metadata: { pluginName: name },
      });

      const capabilityRegistry = integrationManager.getCapabilityRegistry();

      // Try v1 plugin first
      const metadata = integrationManager.getPluginMetadata(name);

      if (metadata) {
        // Get widgets for this plugin
        const allWidgets = capabilityRegistry.getAllWidgets();
        const pluginWidgets = allWidgets
          .filter((w) => w.pluginName === name)
          .map((w) => ({
            id: w.widgetId,
            name: w.widget.name,
            component: w.widget.component,
            slots: w.widget.slots,
            size: w.widget.size,
            requiredCapabilities: w.widget.requiredCapabilities,
            config: w.widget.config,
            icon: w.widget.icon,
            priority: w.widget.priority,
          }));

        // Get capabilities for this plugin
        const allCapabilities = capabilityRegistry.getAllCapabilities();
        const pluginCapabilities = allCapabilities
          .filter((c) => c.pluginName === name)
          .map((c) => ({
            name: c.capability.name,
            category: c.capability.category,
            description: c.capability.description,
            riskLevel: c.capability.riskLevel,
            requiredPermissions: c.capability.requiredPermissions,
          }));

        const pluginInfo: PluginInfo = {
          metadata: {
            name: metadata.name,
            version: metadata.version,
            author: metadata.author,
            description: metadata.description,
            integrationType: metadata.integrationType,
            homepage: metadata.homepage,
            dependencies: metadata.dependencies,
            frontendEntryPoint: metadata.frontendEntryPoint,
            color: metadata.color,
            icon: metadata.icon,
            minPabawiVersion: metadata.minPabawiVersion,
            tags: metadata.tags,
          },
          enabled: true,
          healthy: true,
          widgets: pluginWidgets,
          capabilities: pluginCapabilities,
          priority: 10,
        };

        res.json(pluginInfo);
        return;
      }

      // Legacy plugin lookup removed - only v1.x plugins are supported

      // Plugin not found
      logger.warn(`Plugin not found: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPlugin",
        metadata: { pluginName: name },
      });

      res.status(404).json({
        error: {
          code: "PLUGIN_NOT_FOUND",
          message: `No plugin found with name: ${name}`,
        },
      });
    })
  );

  /**
   * GET /api/v1/plugins/:name/capabilities
   *
   * Returns all capabilities for a specific plugin.
   */
  router.get(
    "/:name/capabilities",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      logger.debug(`Fetching capabilities for plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPluginCapabilities",
        metadata: { pluginName: name },
      });

      const capabilityRegistry = integrationManager.getCapabilityRegistry();
      const allCapabilities = capabilityRegistry.getAllCapabilities();
      const pluginCapabilities = allCapabilities
        .filter((c) => c.pluginName === name)
        .map((c) => ({
          name: c.capability.name,
          category: c.capability.category,
          description: c.capability.description,
          riskLevel: c.capability.riskLevel,
          requiredPermissions: c.capability.requiredPermissions,
        }));

      res.json({ capabilities: pluginCapabilities });
    })
  );

  /**
   * GET /api/v1/plugins/:name/widgets
   *
   * Returns all widgets for a specific plugin.
   */
  router.get(
    "/:name/widgets",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      logger.debug(`Fetching widgets for plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPluginWidgets",
        metadata: { pluginName: name },
      });

      const capabilityRegistry = integrationManager.getCapabilityRegistry();
      const allWidgets = capabilityRegistry.getAllWidgets();
      const pluginWidgets = allWidgets
        .filter((w) => w.pluginName === name)
        .map((w) => ({
          id: w.widgetId,
          name: w.widget.name,
          component: w.widget.component,
          slots: w.widget.slots,
          size: w.widget.size,
          requiredCapabilities: w.widget.requiredCapabilities,
          config: w.widget.config,
          icon: w.widget.icon,
          priority: w.widget.priority,
        }));

      res.json({ widgets: pluginWidgets });
    })
  );

  /**
   * GET /api/v1/plugins/:name/health
   *
   * Returns health status for a specific plugin.
   */
  router.get(
    "/:name/health",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      logger.debug(`Fetching health for plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPluginHealth",
        metadata: { pluginName: name },
      });

      // Check if plugin exists
      const metadata = integrationManager.getPluginMetadata(name);

      if (!metadata) {
        res.status(404).json({
          error: {
            code: "PLUGIN_NOT_FOUND",
            message: `No plugin found with name: ${name}`,
          },
        });
        return;
      }

      // Get health status
      const healthStatuses = await integrationManager.healthCheckAll(true);
      const health = healthStatuses.get(name);

      if (health) {
        res.json({
          plugin: name,
          healthy: health.healthy,
          message: health.message,
          lastCheck: health.lastCheck,
          workingCapabilities: health.workingCapabilities,
          failingCapabilities: health.failingCapabilities,
        });
      } else {
        // Plugin exists but no health check available
        res.json({
          plugin: name,
          healthy: true,
          message: "Plugin is loaded",
          lastCheck: new Date().toISOString(),
        });
      }
    })
  );

  /**
   * GET /api/v1/plugins/:name/summary
   *
   * Returns lightweight summary data for home page tiles.
   * Calls the plugin's getSummary() method to get plugin-specific metrics.
   * Target response time: < 500ms
   */
  router.get(
    "/:name/summary",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;
      const startTime = Date.now();

      logger.debug(`Fetching summary for plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPluginSummary",
        metadata: { pluginName: name },
      });

      // Check if plugin exists
      const metadata = integrationManager.getPluginMetadata(name);

      if (!metadata) {
        logger.warn(`Plugin not found: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginSummary",
          metadata: { pluginName: name },
        });

        res.status(404).json({
          error: {
            code: "PLUGIN_NOT_FOUND",
            message: `No plugin found with name: ${name}`,
          },
        });
        return;
      }

      try {
        // Get plugin instance
        const pluginRegistration = integrationManager.getPlugin(name);

        if (!pluginRegistration) {
          logger.warn(`Plugin instance not found: ${name}`, {
            component: "V1PluginsRouter",
            operation: "getPluginSummary",
            metadata: { pluginName: name },
          });

          // Return error in response (don't throw - graceful degradation)
          res.json({
            pluginName: name,
            displayName: metadata.name,
            metrics: {},
            healthy: false,
            lastUpdate: new Date().toISOString(),
            error: "Plugin not initialized",
          });
          return;
        }

        // Call plugin's getSummary() method
        const summary = await pluginRegistration.plugin.getSummary();

        const duration = Date.now() - startTime;

        logger.info(`Returning summary for plugin: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginSummary",
          metadata: {
            pluginName: name,
            durationMs: duration,
            healthy: summary.healthy,
          },
        });

        // Log warning if response time exceeds target
        if (duration > 500) {
          logger.warn(`Plugin summary endpoint exceeded target response time`, {
            component: "V1PluginsRouter",
            operation: "getPluginSummary",
            metadata: {
              pluginName: name,
              durationMs: duration,
              targetMs: 500,
            },
          });
        }

        res.json(summary);
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(`Failed to get summary for plugin: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginSummary",
          metadata: {
            pluginName: name,
            durationMs: duration,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        // Return error in response (don't throw - graceful degradation)
        res.json({
          pluginName: name,
          displayName: metadata.name,
          metrics: {},
          healthy: false,
          lastUpdate: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Failed to get plugin summary",
        });
      }
    })
  );

  /**
   * GET /api/v1/plugins/:name/data
   *
   * Returns full plugin data for plugin home pages.
   * Calls the plugin's getData() method to get complete plugin-specific data.
   * This endpoint is only called on-demand when navigating to a plugin's home page,
   * not during app initialization.
   */
  router.get(
    "/:name/data",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;
      const startTime = Date.now();

      logger.debug(`Fetching full data for plugin: ${name}`, {
        component: "V1PluginsRouter",
        operation: "getPluginData",
        metadata: { pluginName: name },
      });

      // Check if plugin exists
      const metadata = integrationManager.getPluginMetadata(name);

      if (!metadata) {
        logger.warn(`Plugin not found: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginData",
          metadata: { pluginName: name },
        });

        res.status(404).json({
          error: {
            code: "PLUGIN_NOT_FOUND",
            message: `No plugin found with name: ${name}`,
          },
        });
        return;
      }

      try {
        // Get plugin instance
        const pluginRegistration = integrationManager.getPlugin(name);

        if (!pluginRegistration) {
          logger.warn(`Plugin instance not found: ${name}`, {
            component: "V1PluginsRouter",
            operation: "getPluginData",
            metadata: { pluginName: name },
          });

          // Return error in response (don't throw - graceful degradation)
          res.json({
            pluginName: name,
            displayName: metadata.name,
            data: null,
            healthy: false,
            lastUpdate: new Date().toISOString(),
            capabilities: [],
            error: "Plugin not initialized",
          });
          return;
        }

        // Call plugin's getData() method
        const pluginData = await pluginRegistration.plugin.getData();

        const duration = Date.now() - startTime;

        logger.info(`Returning full data for plugin: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginData",
          metadata: {
            pluginName: name,
            durationMs: duration,
            healthy: pluginData.healthy,
          },
        });

        res.json(pluginData);
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(`Failed to get data for plugin: ${name}`, {
          component: "V1PluginsRouter",
          operation: "getPluginData",
          metadata: {
            pluginName: name,
            durationMs: duration,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        // Return error in response (don't throw - graceful degradation)
        res.json({
          pluginName: name,
          displayName: metadata.name,
          data: null,
          healthy: false,
          lastUpdate: new Date().toISOString(),
          capabilities: [],
          error: error instanceof Error ? error.message : "Failed to get plugin data",
        });
      }
    })
  );

  return router;
}
