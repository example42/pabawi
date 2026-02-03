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
 *
 * @module routes/v1/plugins
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import { asyncHandler } from "../asyncHandler";

/**
 * Frontend-facing plugin info structure
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
  widgets: Array<{
    id: string;
    name: string;
    component: string;
    slots: string[];
    size: string;
    requiredCapabilities: string[];
    config?: Record<string, unknown>;
    icon?: string;
    priority?: number;
  }>;
  capabilities: Array<{
    name: string;
    category: string;
    description: string;
    riskLevel: string;
    requiredPermissions: string[];
  }>;
  priority: number;
}

/**
 * Get integration color based on name
 * Matches frontend integration color scheme
 */
function getIntegrationColor(name: string): string {
  const colors: Record<string, string> = {
    bolt: "#FFAE1A",
    puppetdb: "#9063CD",
    puppetserver: "#2E3A87",
    hiera: "#C1272D",
  };
  return colors[name.toLowerCase()] ?? "#6B7280";
}

/**
 * Get integration icon based on name
 */
function getIntegrationIcon(name: string): string {
  const icons: Record<string, string> = {
    bolt: "zap",
    puppetdb: "database",
    puppetserver: "server",
    hiera: "layers",
  };
  return icons[name.toLowerCase()] ?? "puzzle";
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
   * Returns list of all loaded plugins with their metadata, widgets, and capabilities.
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.debug("Fetching all plugins for v1 API", {
        component: "V1PluginsRouter",
        operation: "listPlugins",
      });

      const plugins: PluginInfo[] = [];
      const capabilityRegistry = integrationManager.getCapabilityRegistry();

      // Get v1.0.0 plugins
      const v1PluginNames = integrationManager.getV1PluginNames();

      for (const pluginName of v1PluginNames) {
        const metadata = integrationManager.getPluginMetadata(pluginName);
        if (!metadata) {
          logger.warn(`Plugin ${pluginName} has no metadata, skipping`, {
            component: "V1PluginsRouter",
            operation: "listPlugins",
          });
          continue;
        }

        // Get widgets for this plugin
        const allWidgets = capabilityRegistry.getAllWidgets();
        const pluginWidgets = allWidgets
          .filter((w) => w.pluginName === pluginName)
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
          .filter((c) => c.pluginName === pluginName)
          .map((c) => ({
            name: c.capability.name,
            category: c.capability.category,
            description: c.capability.description,
            riskLevel: c.capability.riskLevel,
            requiredPermissions: c.capability.requiredPermissions,
          }));

        // Determine plugin health
        const healthy = true; // TODO: Implement actual health check

        plugins.push({
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
          healthy,
          widgets: pluginWidgets,
          capabilities: pluginCapabilities,
          priority: 10,
        });
      }

      // Also include legacy plugins
      const legacyPlugins = integrationManager.getAllPlugins();
      for (const registration of legacyPlugins) {
        // Skip if already added from v1 plugins
        if (plugins.some((p) => p.metadata.name === registration.plugin.name)) {
          continue;
        }

        plugins.push({
          metadata: {
            name: registration.plugin.name,
            version: "1.0.0",
            author: "Pabawi",
            description: `${registration.plugin.name} integration (legacy)`,
            integrationType:
              registration.plugin.type === "execution"
                ? "RemoteExecution"
                : "InventorySource",
            color: getIntegrationColor(registration.plugin.name),
            icon: getIntegrationIcon(registration.plugin.name),
          },
          enabled: registration.config.enabled,
          healthy: registration.plugin.isInitialized(),
          widgets: [],
          capabilities: [],
          priority: registration.config.priority ?? 10,
        });
      }

      logger.info(`Returning ${plugins.length} plugins via v1 API`, {
        component: "V1PluginsRouter",
        operation: "listPlugins",
        metadata: {
          pluginCount: plugins.length,
          v1PluginCount: v1PluginNames.length,
        },
      });

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

      // Try legacy plugin
      const legacyPlugins = integrationManager.getAllPlugins();
      const legacyPlugin = legacyPlugins.find((p) => p.plugin.name === name);

      if (legacyPlugin) {
        const pluginInfo: PluginInfo = {
          metadata: {
            name: legacyPlugin.plugin.name,
            version: "1.0.0",
            author: "Pabawi",
            description: `${legacyPlugin.plugin.name} integration (legacy)`,
            integrationType:
              legacyPlugin.plugin.type === "execution"
                ? "RemoteExecution"
                : "InventorySource",
            color: getIntegrationColor(legacyPlugin.plugin.name),
            icon: getIntegrationIcon(legacyPlugin.plugin.name),
          },
          enabled: legacyPlugin.config.enabled,
          healthy: legacyPlugin.plugin.isInitialized(),
          widgets: [],
          capabilities: [],
          priority: legacyPlugin.config.priority ?? 10,
        };

        res.json(pluginInfo);
        return;
      }

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
      const legacyPlugins = integrationManager.getAllPlugins();
      const legacyPlugin = legacyPlugins.find((p) => p.plugin.name === name);

      if (!metadata && !legacyPlugin) {
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

  return router;
}
