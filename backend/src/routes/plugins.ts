/**
 * Plugins Router
 *
 * Exposes plugin metadata, capabilities, and widgets to the frontend.
 * The frontend PluginLoader uses these endpoints to discover and load
 * plugin widgets and menu contributions.
 *
 * @module routes/plugins
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { LoggerService } from "../services/LoggerService";

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
 * Create the plugins router
 *
 * @param integrationManager - Integration manager instance
 * @returns Express router with plugins endpoints
 */
export function createPluginsRouter(
  integrationManager: IntegrationManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/plugins
   *
   * Returns list of all loaded plugins with their metadata, widgets, and capabilities.
   * Used by the frontend PluginLoader to discover available plugins.
   */
  router.get("/", (_req: Request, res: Response) => {
    try {
      logger.debug("Fetching all plugins for frontend", {
        component: "PluginsRouter",
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
            component: "PluginsRouter",
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

        // Determine plugin health (check if any capability is functional)
        // For now, assume healthy if plugin is loaded
        const healthy = true;

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
          enabled: true, // If loaded, it's enabled
          healthy,
          widgets: pluginWidgets,
          capabilities: pluginCapabilities,
          priority: 10, // Default priority for v1 plugins
        });
      }

      // Legacy plugin registration removed - only v1.x plugins are supported

      logger.info(`Returning ${plugins.length} plugins to frontend`, {
        component: "PluginsRouter",
        operation: "listPlugins",
        metadata: {
          pluginCount: plugins.length,
          v1PluginCount: v1PluginNames.length,
        },
      });

      res.json({ plugins });
    } catch (error) {
      logger.error("Failed to fetch plugins", {
        component: "PluginsRouter",
        operation: "listPlugins",
      }, error instanceof Error ? error : new Error(String(error)));

      res.status(500).json({
        error: "Failed to fetch plugins",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/plugins/:name
   *
   * Returns detailed information about a specific plugin.
   * Used by the frontend PluginLoader to get widget and capability details.
   */
  router.get("/:name", (req: Request, res: Response) => {
    const { name } = req.params;

    try {
      logger.debug(`Fetching plugin: ${name}`, {
        component: "PluginsRouter",
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

        logger.debug(`Returning v1 plugin: ${name}`, {
          component: "PluginsRouter",
          operation: "getPlugin",
          metadata: {
            pluginName: name,
            widgetCount: pluginWidgets.length,
            capabilityCount: pluginCapabilities.length,
          },
        });

        return res.json(pluginInfo);
      }

      // Legacy plugin lookup removed - only v1.x plugins are supported

      // Plugin not found
      logger.warn(`Plugin not found: ${name}`, {
        component: "PluginsRouter",
        operation: "getPlugin",
        metadata: { pluginName: name },
      });

      return res.status(404).json({
        error: "Plugin not found",
        message: `No plugin found with name: ${name}`,
      });
    } catch (error) {
      logger.error(`Failed to fetch plugin: ${name}`, {
        component: "PluginsRouter",
        operation: "getPlugin",
        metadata: { pluginName: name },
      }, error instanceof Error ? error : new Error(String(error)));

      return res.status(500).json({
        error: "Failed to fetch plugin",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/plugins/:name/widgets
   *
   * Returns all widgets for a specific plugin.
   */
  router.get("/:name/widgets", (req: Request, res: Response) => {
    const { name } = req.params;

    try {
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
    } catch (error) {
      logger.error(`Failed to fetch widgets for plugin: ${name}`, {
        component: "PluginsRouter",
        operation: "getPluginWidgets",
        metadata: { pluginName: name },
      }, error instanceof Error ? error : new Error(String(error)));

      res.status(500).json({
        error: "Failed to fetch widgets",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/plugins/:name/capabilities
   *
   * Returns all capabilities for a specific plugin.
   */
  router.get("/:name/capabilities", (req: Request, res: Response) => {
    const { name } = req.params;

    try {
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
    } catch (error) {
      logger.error(`Failed to fetch capabilities for plugin: ${name}`, {
        component: "PluginsRouter",
        operation: "getPluginCapabilities",
        metadata: { pluginName: name },
      }, error instanceof Error ? error : new Error(String(error)));

      res.status(500).json({
        error: "Failed to fetch capabilities",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
