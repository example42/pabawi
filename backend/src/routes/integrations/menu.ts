/**
 * Integration Menu Router
 *
 * Provides menu structure data for frontend navigation generation.
 * Groups integrations by type and generates tabs from capabilities.
 *
 * @module routes/integrations/menu
 * @version 1.0.0
 */

import { Router } from "express";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { LoggerService } from "../../services/LoggerService";
import { asyncHandler } from "../asyncHandler";
import type {
  IntegrationType,
  PluginCapability,
  PluginWidget,
} from "../../integrations/types";

/**
 * Tab definition for integration home page
 */
interface IntegrationTab {
  /** Unique tab identifier */
  id: string;
  /** Display label */
  label: string;
  /** Required capability to access this tab */
  capability: string;
  /** Widget ID to render in this tab */
  widget?: string;
  /** Icon for the tab */
  icon?: string;
  /** Priority for ordering (higher = first) */
  priority: number;
}

/**
 * Integration menu item
 */
interface IntegrationMenuItem {
  /** Plugin name (lowercase) */
  name: string;
  /** Display name (capitalized) */
  displayName: string;
  /** Description */
  description: string;
  /** Brand color (hex) */
  color?: string;
  /** Icon (SVG path or name) */
  icon?: string;
  /** Whether integration is enabled */
  enabled: boolean;
  /** Health status */
  healthy: boolean;
  /** Path to integration home page */
  path: string;
  /** Tabs for the integration home page */
  tabs: IntegrationTab[];
}

/**
 * Integration category (grouped by type)
 */
interface IntegrationCategory {
  /** Integration type */
  type: IntegrationType;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Icon */
  icon?: string;
  /** Priority for ordering (higher = first) */
  priority: number;
  /** Integrations in this category */
  integrations: IntegrationMenuItem[];
}

/**
 * Legacy route definition
 */
interface LegacyRoute {
  /** Display label */
  label: string;
  /** Route path */
  path: string;
  /** Icon */
  icon?: string;
}

/**
 * Menu response structure
 */
interface MenuResponse {
  /** Integration categories */
  categories: IntegrationCategory[];
  /** Legacy routes */
  legacy: LegacyRoute[];
}

/**
 * Integration type metadata for UI display
 */
const INTEGRATION_TYPE_METADATA: Record<
  IntegrationType,
  { label: string; description: string; icon: string; priority: number }
> = {
  RemoteExecution: {
    label: "Remote Execution",
    description: "Command and task execution on infrastructure",
    icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    priority: 100,
  },
  ConfigurationManagement: {
    label: "Configuration Management",
    description: "Infrastructure configuration and state management",
    icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
    priority: 90,
  },
  Info: {
    label: "Info & Reporting",
    description: "Infrastructure data and reporting",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    priority: 80,
  },
  InventorySource: {
    label: "Inventory Sources",
    description: "Infrastructure inventory and discovery",
    icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2",
    priority: 70,
  },
  InstallSoftware: {
    label: "Software Installation",
    description: "Package and software management",
    icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
    priority: 60,
  },
  Provisioning: {
    label: "Provisioning",
    description: "Infrastructure provisioning and deployment",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    priority: 50,
  },
  Monitoring: {
    label: "Monitoring",
    description: "Infrastructure monitoring and metrics",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    priority: 40,
  },
  Orchestration: {
    label: "Orchestration",
    description: "Workflow and process orchestration",
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    priority: 30,
  },
  SecretManagement: {
    label: "Secret Management", // pragma: allowlist secret
    description: "Credential and secret management", // pragma: allowlist secret
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    priority: 20,
  },
  ReportingAnalytics: {
    label: "Reporting & Analytics",
    description: "Data analysis and reporting",
    icon: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    priority: 15,
  },
  AuditCompliance: {
    label: "Audit & Compliance",
    description: "Compliance and audit operations",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    priority: 10,
  },
  BackupRecovery: {
    label: "Backup & Recovery",
    description: "Backup and disaster recovery",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
    priority: 5,
  },
};

/**
 * Generate tabs from plugin capabilities and widgets
 */
function generateTabs(
  capabilities: PluginCapability[],
  widgets?: PluginWidget[],
): IntegrationTab[] {
  const tabs: IntegrationTab[] = [];
  const widgetMap = new Map<string, PluginWidget>();

  // Build widget map by required capability
  if (widgets) {
    for (const widget of widgets) {
      for (const cap of widget.requiredCapabilities) {
        widgetMap.set(cap, widget);
      }
    }
  }

  // Generate tabs from capabilities
  for (const capability of capabilities) {
    const widget = widgetMap.get(capability.name);

    // Skip if widget exists but doesn't have standalone-page slot
    if (widget && !widget.slots.includes("standalone-page")) {
      continue;
    }

    // Generate tab ID from capability name (last part after dot)
    const parts = capability.name.split(".");
    const tabId = parts[parts.length - 1] || capability.name;

    // Humanize capability description for label
    const label = humanizeLabel(capability.description || capability.name);

    tabs.push({
      id: tabId,
      label,
      capability: capability.name,
      widget: widget?.id,
      icon: widget?.icon,
      priority: widget?.priority ?? 50,
    });
  }

  // Sort by priority (highest first)
  return tabs.sort((a, b) => b.priority - a.priority);
}

/**
 * Humanize a string for display labels
 */
function humanizeLabel(text: string): string {
  // Remove common prefixes
  let label = text
    .replace(/^(Execute|Run|Get|List|Query|Show)\s+/i, "")
    .replace(/\s+(on|from|for)\s+.*$/i, "");

  // Capitalize first letter
  label = label.charAt(0).toUpperCase() + label.slice(1);

  return label;
}

/**
 * Create menu router
 */
export function createMenuRouter(
  integrationManager: IntegrationManager,
  logger: LoggerService,
): Router {
  const router = Router();

  /**
   * GET /api/integrations/menu
   *
   * Returns menu structure with integration categories, tabs, and legacy routes
   */
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      logger.info("Generating integration menu", {
        component: "MenuRouter",
        operation: "getMenu",
      });

      // Get all v1.0 plugins
      const plugins = integrationManager.getAllV1Plugins();

      logger.debug(`Found ${plugins.size} v1.0 plugins`, {
        component: "MenuRouter",
        operation: "getMenu",
        metadata: { pluginNames: Array.from(plugins.keys()) },
      });

      // Group by integration type
      const categoriesMap = new Map<
        IntegrationType,
        IntegrationCategory
      >();

      for (const [pluginName, loadedPlugin] of plugins) {
        logger.debug(`Processing plugin: ${pluginName}`, {
          component: "MenuRouter",
          metadata: {
            hasInstance: loadedPlugin?.instance != null,
            hasMetadata: loadedPlugin?.instance?.metadata != null,
          },
        });

        const plugin = loadedPlugin.instance;
        const { metadata, capabilities, widgets } = plugin;

        // Generate tabs from capabilities
        const tabs = generateTabs(capabilities, widgets);

        // Skip if no tabs (no accessible capabilities)
        if (tabs.length === 0) {
          logger.debug(`Skipping plugin with no tabs: ${pluginName}`);
          continue;
        }

        // Check health status
        let healthy = false;
        try {
          const healthStatus = await plugin.healthCheck();
          healthy = healthStatus.healthy;
        } catch (error) {
          logger.warn(`Health check failed for ${pluginName}`, {
            component: "MenuRouter",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          healthy = false;
        }

        // Get or create category
        let category = categoriesMap.get(metadata.integrationType);
        if (!category) {
          const typeMetadata =
            INTEGRATION_TYPE_METADATA[metadata.integrationType] ?? {
              label: String(metadata.integrationType),
              description: "",
              icon: "",
              priority: 0,
            };

          category = {
            type: metadata.integrationType,
            label: typeMetadata.label,
            description: typeMetadata.description,
            icon: typeMetadata.icon,
            priority: typeMetadata.priority,
            integrations: [],
          };

          categoriesMap.set(metadata.integrationType, category);
        }

        // Add integration to category
        category.integrations.push({
          name: metadata.name,
          displayName:
            metadata.name.charAt(0).toUpperCase() + metadata.name.slice(1),
          description: metadata.description,
          color: metadata.color,
          icon: metadata.icon,
          enabled: true,
          healthy,
          path: `/integrations/${metadata.name}`,
          tabs,
        });
      }

      // Convert to sorted array
      const categories = Array.from(categoriesMap.values())
        .sort((a, b) => b.priority - a.priority)
        .map((cat) => ({
          ...cat,
          // Sort integrations by name within each category
          integrations: cat.integrations.sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
          ),
        }));

      // Legacy routes
      const legacy: LegacyRoute[] = [
        {
          label: "Inventory",
          path: "/inventory",
          icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2",
        },
        {
          label: "Executions",
          path: "/executions",
          icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
        },
      ];

      const response: MenuResponse = {
        categories,
        legacy,
      };

      logger.info("Generated menu", {
        component: "MenuRouter",
        operation: "getMenu",
        metadata: {
          categoryCount: categories.length,
          integrationCount: categories.reduce(
            (sum, cat) => sum + cat.integrations.length,
            0
          ),
        },
      });

      res.json(response);
    })
  );

  return router;
}
