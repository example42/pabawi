/**
 * Puppetserver Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (catalog, environments, facts, status)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (PuppetserverService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/puppetserver/backend/PuppetserverPlugin
 * @version 1.0.0
 */

import type { ZodSchema } from "zod";
import { z } from "zod";

// =============================================================================
// Type-only imports - These are resolved at compile time, not runtime
// The actual implementations are injected via constructor
// =============================================================================

/** Integration type enum values (duplicated to avoid runtime import) */
const IntegrationType = {
  InventorySource: "InventorySource",
  RemoteExecution: "RemoteExecution",
  Info: "Info",
  ConfigurationManagement: "ConfigurationManagement",
  Event: "Event",
  Monitoring: "Monitoring",
  Provisioning: "Provisioning",
  Deployment: "Deployment",
  SecretManagement: "SecretManagement", //pragma: allowlist secret
  Schedule: "Schedule",
  SoftwareInstall: "SoftwareInstall",
  Orchestration: "Orchestration",
  Logging: "Logging",
  AuditCompliance: "AuditCompliance",
  BackupRecovery: "BackupRecovery",
} as const;

/** Plugin metadata interface */
interface PluginMetadata {
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
}

/** Health status interface */
interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: string;
  details?: Record<string, unknown>;
  degraded?: boolean;
  workingCapabilities?: string[];
  failingCapabilities?: string[];
}

/** Execution context interface */
interface ExecutionContext {
  user?: {
    id: string;
    username: string;
    roles: string[];
  };
  correlationId?: string;
  widgetId?: string;
  metadata?: Record<string, unknown>;
}

/** Capability risk level */
type CapabilityRiskLevel = "read" | "write" | "execute" | "admin";

/** Argument definition */
interface ArgumentDefinition {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  default?: unknown;
  choices?: unknown[];
  validation?: ZodSchema;
}

/** Capability schema */
interface CapabilitySchema {
  arguments: Record<string, ArgumentDefinition>;
  returns: {
    type: string;
    description: string;
    schema?: ZodSchema;
  };
}

/** Plugin capability interface */
interface PluginCapability {
  category: string;
  name: string;
  description: string;
  handler: (params: Record<string, unknown>, context: ExecutionContext) => Promise<unknown>;
  requiredPermissions: string[];
  riskLevel: CapabilityRiskLevel;
  schema?: CapabilitySchema;
}

/** Widget slot type */
type WidgetSlot = "dashboard" | "node-detail" | "inventory-panel" | "standalone-page" | "sidebar" | "modal" | "home-summary";

/** Widget size type */
type WidgetSize = "small" | "medium" | "large" | "full";

/** Plugin widget interface */
interface PluginWidget {
  id: string;
  name: string;
  component: string;
  slots: WidgetSlot[];
  size: WidgetSize;
  requiredCapabilities: string[];
  config?: Record<string, unknown>;
  icon?: string;
  priority?: number;
}

/** CLI action interface */
interface CLIAction {
  name: string;
  capability: string;
  description: string;
  aliases?: string[];
  examples?: string[];
}

/** Plugin CLI command interface */
interface PluginCLICommand {
  name: string;
  actions: CLIAction[];
}

/** Base plugin interface */
interface BasePluginInterface {
  metadata: PluginMetadata;
  capabilities: PluginCapability[];
  widgets?: PluginWidget[];
  cliCommands?: PluginCLICommand[];
  configSchema?: ZodSchema;
  defaultPermissions?: Record<string, string[]>;
  initialize(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getConfig(): Record<string, unknown>;
  isInitialized(): boolean;
  shutdown?(): Promise<void>;
  /**
   * Get lightweight summary for home page tile
   * Must return in under 500ms with minimal data
   */
  getSummary(): Promise<{
    pluginName: string;
    displayName: string;
    metrics: Record<string, number | string | boolean>;
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }>;
  /**
   * Get full plugin data for plugin home page
   * Called on-demand when navigating to plugin page
   */
  getData(): Promise<{
    pluginName: string;
    displayName: string;
    data: unknown;
    healthy: boolean;
    lastUpdate: string;
    capabilities: string[];
    error?: string;
  }>;
}

// =============================================================================
// Service interfaces - Define what we need from injected services
// =============================================================================

/** Environment interface */
interface Environment {
  name: string;
  last_deployed?: string;
  status?: "deployed" | "deploying" | "failed";
  settings?: Record<string, unknown>;
}

/** Catalog interface */
interface Catalog {
  certname: string;
  version: string;
  environment: string;
  transaction_uuid?: string;
  producer_timestamp?: string;
  resources: CatalogResource[];
  edges?: CatalogEdge[];
}

/** Catalog resource interface */
interface CatalogResource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

/** Catalog edge interface */
interface CatalogEdge {
  source: { type: string; title: string };
  target: { type: string; title: string };
  relationship: string;
}

/** Catalog diff interface */
interface CatalogDiff {
  environment1: string;
  environment2: string;
  added: CatalogResource[];
  removed: CatalogResource[];
  modified: ResourceDiff[];
  unchanged: CatalogResource[];
}

/** Resource diff interface */
interface ResourceDiff {
  type: string;
  title: string;
  parameterChanges: ParameterDiff[];
}

/** Parameter diff interface */
interface ParameterDiff {
  parameter: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Deployment result interface */
interface DeploymentResult {
  environment: string;
  status: "success" | "failed";
  message?: string;
  timestamp: string;
}

/** Facts interface */
interface Facts {
  nodeId: string;
  gatheredAt: string;
  source: string;
  facts: Record<string, unknown>;
}

/** PuppetserverService interface - what we need from the injected service */
interface PuppetserverServiceInterface {
  initialize(config: unknown): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  compileCatalog(certname: string, environment: string): Promise<Catalog>;
  getNodeCatalog(certname: string): Promise<Catalog | null>;
  compareCatalogs(certname: string, env1: string, env2: string): Promise<CatalogDiff>;
  listEnvironments(): Promise<Environment[]>;
  getEnvironment(name: string): Promise<Environment | null>;
  deployEnvironment(name: string): Promise<DeploymentResult>;
  flushEnvironmentCache(name?: string): Promise<DeploymentResult>;
  getNodeFacts(nodeId: string): Promise<Facts>;
  getSimpleStatus(): Promise<unknown>;
  getServicesStatus(): Promise<unknown>;
  getMetrics(mbean?: string): Promise<unknown>;
  getAdminApiInfo(): Promise<unknown>;
  clearCache(): void;
}

/** LoggerService interface */
interface LoggerServiceInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

// =============================================================================
// Capability Parameter Schemas
// =============================================================================

const CompileCatalogSchema = z.object({
  node: z.string().min(1).describe("Node certname to compile catalog for"),
  environment: z.string().optional().default("production").describe("Environment name"),
});

const NodeCatalogSchema = z.object({
  node: z.string().min(1).describe("Node certname to get catalog for"),
});

const CompareCatalogsSchema = z.object({
  node: z.string().min(1).describe("Node certname"),
  environment1: z.string().min(1).describe("First environment to compare"),
  environment2: z.string().min(1).describe("Second environment to compare"),
});

const ListEnvironmentsSchema = z.object({
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
});

const GetEnvironmentSchema = z.object({
  name: z.string().min(1).describe("Environment name"),
});

const DeployEnvironmentSchema = z.object({
  name: z.string().min(1).describe("Environment name to deploy"),
});

const FlushEnvironmentCacheSchema = z.object({
  name: z.string().optional().describe("Environment name (optional - flush all if not provided)"),
});

const NodeFactsSchema = z.object({
  node: z.string().min(1).describe("Node certname to get facts for"),
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
});

const MetricsSchema = z.object({
  mbean: z.string().optional().describe("Optional MBean name to query specific metrics"),
});

// =============================================================================
// Plugin Configuration Schema
// =============================================================================

export const PuppetserverPluginConfigSchema = z.object({
  serverUrl: z.string().url().optional().describe("Puppetserver URL"),
  port: z.number().optional().describe("Puppetserver port"),
  token: z.string().optional().describe("Authentication token"),
  ssl: z.object({
    enabled: z.boolean().optional(),
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
    rejectUnauthorized: z.boolean().optional(),
  }).optional().describe("SSL/TLS configuration"),
  timeout: z.number().optional().describe("Request timeout in ms"),
  cache: z.object({
    ttl: z.number().optional().describe("Cache TTL in ms"),
  }).optional(),
  retryAttempts: z.number().optional().describe("Number of retry attempts"),
  retryDelay: z.number().optional().describe("Delay between retries in ms"),
});

export type PuppetserverPluginConfig = z.infer<typeof PuppetserverPluginConfigSchema>;

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Puppetserver Plugin v1.0.0
 *
 * Provides Puppetserver integration with capability-based architecture:
 * - puppetserver.catalog: Compile catalog for a node
 * - puppetserver.catalog.get: Get catalog for a node (default environment)
 * - puppetserver.catalog.compare: Compare catalogs between environments
 * - puppetserver.environments: List available environments
 * - puppetserver.environment: Get specific environment details
 * - puppetserver.environment.deploy: Deploy/refresh an environment
 * - puppetserver.environment.cache.flush: Flush environment cache
 * - puppetserver.facts: Get facts for a node
 * - puppetserver.status: Get Puppetserver status
 * - puppetserver.status.services: Get detailed services status
 * - puppetserver.metrics: Get Puppetserver metrics
 * - puppetserver.admin: Get admin API information
 */
export class PuppetserverPlugin implements BasePluginInterface {
  // =========================================================================
  // Plugin Metadata
  // =========================================================================

  readonly metadata: PluginMetadata = {
    name: "puppetserver",
    version: "1.0.0",
    author: "Pabawi Team",
    description: "Puppetserver integration for catalog compilation, environments, and facts",
    integrationType: IntegrationType.ConfigurationManagement,
    homepage: "https://puppet.com/docs/puppet/latest/server/",
    color: "#2E3A87", // Puppetserver blue
    icon: "server",
    tags: ["puppetserver", "puppet", "catalog", "environments", "facts", "configuration"],
    minPabawiVersion: "1.0.0",
  };

  // =========================================================================
  // Capabilities
  // =========================================================================

  readonly capabilities: PluginCapability[];

  // =========================================================================
  // Widgets
  // =========================================================================

  readonly widgets: PluginWidget[] = [
    {
      id: "puppetserver:home-widget",
      name: "Puppetserver Summary",
      component: "./frontend/HomeWidget.svelte",
      slots: ["home-summary"],
      size: "medium",
      requiredCapabilities: ["puppetserver.status"],
      icon: "server",
      priority: 15,
    },
    {
      id: "puppetserver:catalog-compilation",
      name: "Catalog Compilation",
      component: "./frontend/CatalogCompilation.svelte",
      slots: ["node-detail"],
      size: "large",
      requiredCapabilities: ["puppetserver.catalog"],
      icon: "file-code",
      priority: 80,
    },
    {
      id: "puppetserver:environment-info",
      name: "Environment Info",
      component: "./frontend/EnvironmentInfo.svelte",
      slots: ["node-detail", "dashboard"],
      size: "medium",
      requiredCapabilities: ["puppetserver.environments"],
      icon: "folder",
      priority: 70,
    },
    {
      id: "puppetserver:node-status",
      name: "Node Status",
      component: "./frontend/NodeStatus.svelte",
      slots: ["node-detail"],
      size: "small",
      requiredCapabilities: ["puppetserver.status"],
      icon: "activity",
      priority: 90,
    },
  ];

  // =========================================================================
  // CLI Commands
  // =========================================================================

  readonly cliCommands: PluginCLICommand[] = [
    {
      name: "puppetserver",
      actions: [
        {
          name: "catalog",
          capability: "puppetserver.catalog",
          description: "Compile a catalog for a node",
          examples: [
            "pab puppetserver catalog web-01",
            "pab puppetserver catalog web-01 --environment staging",
          ],
        },
        {
          name: "catalog-diff",
          capability: "puppetserver.catalog.compare",
          description: "Compare catalogs between two environments",
          aliases: ["diff"],
          examples: [
            "pab puppetserver catalog-diff web-01 --environment1 production --environment2 staging",
          ],
        },
        {
          name: "environments",
          capability: "puppetserver.environments",
          description: "List available Puppet environments",
          aliases: ["envs"],
          examples: [
            "pab puppetserver environments",
            "pab puppetserver envs --format json",
          ],
        },
        {
          name: "environment",
          capability: "puppetserver.environment",
          description: "Get details of a specific environment",
          aliases: ["env"],
          examples: [
            "pab puppetserver environment production",
          ],
        },
        {
          name: "deploy",
          capability: "puppetserver.environment.deploy",
          description: "Deploy/refresh an environment",
          examples: [
            "pab puppetserver deploy production",
          ],
        },
        {
          name: "flush-cache",
          capability: "puppetserver.environment.cache.flush",
          description: "Flush environment cache",
          aliases: ["flush"],
          examples: [
            "pab puppetserver flush-cache",
            "pab puppetserver flush-cache --name production",
          ],
        },
        {
          name: "facts",
          capability: "puppetserver.facts",
          description: "Get facts for a node from Puppetserver",
          examples: [
            "pab puppetserver facts web-01",
          ],
        },
        {
          name: "status",
          capability: "puppetserver.status",
          description: "Get Puppetserver status",
          examples: [
            "pab puppetserver status",
          ],
        },
        {
          name: "services",
          capability: "puppetserver.status.services",
          description: "Get detailed services status",
          examples: [
            "pab puppetserver services",
          ],
        },
        {
          name: "metrics",
          capability: "puppetserver.metrics",
          description: "Get Puppetserver metrics (resource-intensive)",
          examples: [
            "pab puppetserver metrics",
            'pab puppetserver metrics --mbean "puppetlabs.puppetserver:name=memory"',
          ],
        },
        {
          name: "admin",
          capability: "puppetserver.admin",
          description: "Get admin API information",
          examples: [
            "pab puppetserver admin",
          ],
        },
      ],
    },
  ];

  // =========================================================================
  // Configuration
  // =========================================================================

  readonly configSchema: ZodSchema = PuppetserverPluginConfigSchema;

  readonly defaultPermissions: Record<string, string[]> = {
    "puppetserver.catalog": ["admin", "operator"],
    "puppetserver.catalog.get": ["admin", "operator", "viewer"],
    "puppetserver.catalog.compare": ["admin", "operator"],
    "puppetserver.environments": ["admin", "operator", "viewer"],
    "puppetserver.environment": ["admin", "operator", "viewer"],
    "puppetserver.environment.deploy": ["admin"],
    "puppetserver.environment.cache.flush": ["admin"],
    "puppetserver.facts": ["admin", "operator", "viewer"],
    "puppetserver.status": ["admin", "operator", "viewer"],
    "puppetserver.status.services": ["admin", "operator", "viewer"],
    "puppetserver.metrics": ["admin"],
    "puppetserver.admin": ["admin"],
  };

  // =========================================================================
  // Private State
  // =========================================================================

  private puppetserverService: PuppetserverServiceInterface;
  private logger: LoggerServiceInterface;
  private performanceMonitor: PerformanceMonitorServiceInterface;
  private config: PuppetserverPluginConfig = {};
  private _initialized = false;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    puppetserverService: PuppetserverServiceInterface,
    logger: LoggerServiceInterface,
    performanceMonitor: PerformanceMonitorServiceInterface,
  ) {
    this.puppetserverService = puppetserverService;
    this.logger = logger;
    this.performanceMonitor = performanceMonitor;

    // Initialize capabilities array with bound handlers
    this.capabilities = this.createCapabilities();
  }


  // =========================================================================
  // Capability Factory
  // =========================================================================

  /**
   * Create capability definitions with bound handlers
   */
  private createCapabilities(): PluginCapability[] {
    return [
      // Catalog Compilation
      {
        category: "config",
        name: "puppetserver.catalog",
        description: "Compile a Puppet catalog for a node in a specific environment",
        handler: this.compileCatalog.bind(this),
        requiredPermissions: ["puppetserver.catalog"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to compile catalog for",
              required: true,
            },
            environment: {
              type: "string",
              description: "Environment name",
              required: false,
              default: "production",
            },
          },
          returns: {
            type: "Catalog",
            description: "Compiled catalog with resources and edges",
          },
        },
      },

      // Get Node Catalog (default environment)
      {
        category: "config",
        name: "puppetserver.catalog.get",
        description: "Get the Puppet catalog for a node using its default environment",
        handler: this.getNodeCatalog.bind(this),
        requiredPermissions: ["puppetserver.catalog.get", "puppetserver.catalog"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to get catalog for",
              required: true,
            },
          },
          returns: {
            type: "Catalog | null",
            description: "Catalog for the node or null if not found",
          },
        },
      },

      // Compare Catalogs
      {
        category: "config",
        name: "puppetserver.catalog.compare",
        description: "Compare catalogs between two environments for a node",
        handler: this.compareCatalogs.bind(this),
        requiredPermissions: ["puppetserver.catalog.compare", "puppetserver.catalog"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname",
              required: true,
            },
            environment1: {
              type: "string",
              description: "First environment to compare",
              required: true,
            },
            environment2: {
              type: "string",
              description: "Second environment to compare",
              required: true,
            },
          },
          returns: {
            type: "CatalogDiff",
            description: "Diff showing added, removed, and modified resources",
          },
        },
      },

      // List Environments
      {
        category: "config",
        name: "puppetserver.environments",
        description: "List available Puppet environments",
        handler: this.listEnvironments.bind(this),
        requiredPermissions: ["puppetserver.environments"],
        riskLevel: "read",
        schema: {
          arguments: {
            refresh: {
              type: "boolean",
              description: "Force refresh from source",
              required: false,
              default: false,
            },
          },
          returns: {
            type: "Environment[]",
            description: "Array of available environments",
          },
        },
      },

      // Get Environment
      {
        category: "config",
        name: "puppetserver.environment",
        description: "Get details of a specific environment",
        handler: this.getEnvironment.bind(this),
        requiredPermissions: ["puppetserver.environment", "puppetserver.environments"],
        riskLevel: "read",
        schema: {
          arguments: {
            name: {
              type: "string",
              description: "Environment name",
              required: true,
            },
          },
          returns: {
            type: "Environment | null",
            description: "Environment details or null if not found",
          },
        },
      },

      // Deploy Environment
      {
        category: "config",
        name: "puppetserver.environment.deploy",
        description: "Deploy/refresh a Puppet environment",
        handler: this.deployEnvironment.bind(this),
        requiredPermissions: ["puppetserver.environment.deploy"],
        riskLevel: "write",
        schema: {
          arguments: {
            name: {
              type: "string",
              description: "Environment name to deploy",
              required: true,
            },
          },
          returns: {
            type: "DeploymentResult",
            description: "Result of the deployment operation",
          },
        },
      },

      // Flush Environment Cache
      {
        category: "config",
        name: "puppetserver.environment.cache.flush",
        description: "Flush environment cache (optionally for a specific environment)",
        handler: this.flushEnvironmentCache.bind(this),
        requiredPermissions: ["puppetserver.environment.cache.flush"],
        riskLevel: "write",
        schema: {
          arguments: {
            name: {
              type: "string",
              description: "Environment name (optional - flush all if not provided)",
              required: false,
            },
          },
          returns: {
            type: "DeploymentResult",
            description: "Result of the flush operation",
          },
        },
      },

      // Node Facts
      {
        category: "info",
        name: "puppetserver.facts",
        description: "Get facts for a specific node from Puppetserver",
        handler: this.getNodeFacts.bind(this),
        requiredPermissions: ["puppetserver.facts", "facts.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to get facts for",
              required: true,
            },
            refresh: {
              type: "boolean",
              description: "Force refresh from source",
              required: false,
              default: false,
            },
          },
          returns: {
            type: "Facts",
            description: "Facts for the specified node",
          },
        },
      },

      // Simple Status
      {
        category: "info",
        name: "puppetserver.status",
        description: "Get Puppetserver simple status",
        handler: this.getSimpleStatus.bind(this),
        requiredPermissions: ["puppetserver.status"],
        riskLevel: "read",
        schema: {
          arguments: {},
          returns: {
            type: "unknown",
            description: "Simple status (typically 'running' or error message)",
          },
        },
      },

      // Services Status
      {
        category: "info",
        name: "puppetserver.status.services",
        description: "Get detailed Puppetserver services status",
        handler: this.getServicesStatus.bind(this),
        requiredPermissions: ["puppetserver.status.services", "puppetserver.status"],
        riskLevel: "read",
        schema: {
          arguments: {},
          returns: {
            type: "unknown",
            description: "Detailed status of all Puppetserver services",
          },
        },
      },

      // Metrics
      {
        category: "info",
        name: "puppetserver.metrics",
        description: "Get Puppetserver metrics (resource-intensive)",
        handler: this.getMetrics.bind(this),
        requiredPermissions: ["puppetserver.metrics"],
        riskLevel: "read",
        schema: {
          arguments: {
            mbean: {
              type: "string",
              description: "Optional MBean name to query specific metrics",
              required: false,
            },
          },
          returns: {
            type: "unknown",
            description: "Metrics data from Puppetserver",
          },
        },
      },

      // Admin API Info
      {
        category: "info",
        name: "puppetserver.admin",
        description: "Get Puppetserver admin API information",
        handler: this.getAdminApiInfo.bind(this),
        requiredPermissions: ["puppetserver.admin"],
        riskLevel: "read",
        schema: {
          arguments: {},
          returns: {
            type: "unknown",
            description: "Admin API information",
          },
        },
      },
    ];
  }

  // =========================================================================
  // Lifecycle Methods
  // =========================================================================

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:initialization");

    try {
      this.logger.info("Initializing PuppetserverPlugin", {
        component: "PuppetserverPlugin",
        operation: "initialize",
      });

      // Initialize the underlying Puppetserver service
      await this.puppetserverService.initialize({
        enabled: true,
        name: "puppetserver",
        type: "information",
        priority: 20,
        config: this.config,
      });

      this._initialized = true;

      this.logger.info("PuppetserverPlugin initialized successfully", {
        component: "PuppetserverPlugin",
        operation: "initialize",
        metadata: {
          capabilitiesCount: this.capabilities.length,
          widgetsCount: this.widgets.length,
        },
      });

      complete({ success: true });
    } catch (error) {
      this.logger.warn("PuppetserverPlugin initialization completed with issues", {
        component: "PuppetserverPlugin",
        operation: "initialize",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      // Don't throw - allow plugin to start in degraded mode
      this._initialized = true;

      complete({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthStatus> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:healthCheck");
    const now = new Date().toISOString();

    if (!this._initialized) {
      complete({ healthy: false });
      return {
        healthy: false,
        message: "Plugin is not initialized",
        lastCheck: now,
      };
    }

    try {
      // Delegate to the underlying service health check
      const serviceHealth = await this.puppetserverService.healthCheck();

      complete({ healthy: serviceHealth.healthy });
      return {
        ...serviceHealth,
        lastCheck: now,
        details: {
          ...serviceHealth.details,
          capabilities: this.capabilities.map((c) => c.name),
          widgetsCount: this.widgets.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      complete({ error: errorMessage });

      return {
        healthy: false,
        message: `Puppetserver health check failed: ${errorMessage}`,
        lastCheck: now,
        details: {
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Get current plugin configuration
   */
  getConfig(): Record<string, unknown> {
    return {
      ...this.config,
    };
  }

  /**
   * Check if plugin is initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info("PuppetserverPlugin shutting down", {
      component: "PuppetserverPlugin",
      operation: "shutdown",
    });
    this._initialized = false;
  }


  // =========================================================================
  // Capability Handlers
  // =========================================================================

  /**
   * Compile a catalog for a node
   */
  private async compileCatalog(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Catalog> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:compileCatalog");

    try {
      const validated = CompileCatalogSchema.parse(params);

      this.logger.info("Compiling catalog", {
        component: "PuppetserverPlugin",
        operation: "compileCatalog",
        metadata: {
          node: validated.node,
          environment: validated.environment,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      const catalog = await this.puppetserverService.compileCatalog(
        validated.node,
        validated.environment,
      );

      complete({ node: validated.node, environment: validated.environment, resourceCount: catalog.resources.length });
      return catalog;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get catalog for a node using default environment
   */
  private async getNodeCatalog(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Catalog | null> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getNodeCatalog");

    try {
      const validated = NodeCatalogSchema.parse(params);

      this.logger.debug("Getting node catalog", {
        component: "PuppetserverPlugin",
        operation: "getNodeCatalog",
        metadata: {
          node: validated.node,
          correlationId: context.correlationId,
        },
      });

      const catalog = await this.puppetserverService.getNodeCatalog(validated.node);

      complete({ node: validated.node, found: !!catalog });
      return catalog;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Compare catalogs between two environments
   */
  private async compareCatalogs(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<CatalogDiff> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:compareCatalogs");

    try {
      const validated = CompareCatalogsSchema.parse(params);

      this.logger.info("Comparing catalogs", {
        component: "PuppetserverPlugin",
        operation: "compareCatalogs",
        metadata: {
          node: validated.node,
          environment1: validated.environment1,
          environment2: validated.environment2,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      const diff = await this.puppetserverService.compareCatalogs(
        validated.node,
        validated.environment1,
        validated.environment2,
      );

      complete({
        node: validated.node,
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
      });
      return diff;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List available environments
   */
  private async listEnvironments(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Environment[]> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:listEnvironments");

    try {
      const validated = ListEnvironmentsSchema.parse(params);

      this.logger.debug("Listing environments", {
        component: "PuppetserverPlugin",
        operation: "listEnvironments",
        metadata: {
          refresh: validated.refresh,
          correlationId: context.correlationId,
        },
      });

      // Clear cache if refresh requested
      if (validated.refresh) {
        this.puppetserverService.clearCache();
      }

      const environments = await this.puppetserverService.listEnvironments();

      complete({ environmentCount: environments.length });
      return environments;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get specific environment details
   */
  private async getEnvironment(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Environment | null> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getEnvironment");

    try {
      const validated = GetEnvironmentSchema.parse(params);

      this.logger.debug("Getting environment", {
        component: "PuppetserverPlugin",
        operation: "getEnvironment",
        metadata: {
          name: validated.name,
          correlationId: context.correlationId,
        },
      });

      const environment = await this.puppetserverService.getEnvironment(validated.name);

      complete({ name: validated.name, found: !!environment });
      return environment;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Deploy an environment
   */
  private async deployEnvironment(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<DeploymentResult> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:deployEnvironment");

    try {
      const validated = DeployEnvironmentSchema.parse(params);

      this.logger.info("Deploying environment", {
        component: "PuppetserverPlugin",
        operation: "deployEnvironment",
        metadata: {
          name: validated.name,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      const result = await this.puppetserverService.deployEnvironment(validated.name);

      complete({ name: validated.name, status: result.status });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Flush environment cache
   */
  private async flushEnvironmentCache(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<DeploymentResult> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:flushEnvironmentCache");

    try {
      const validated = FlushEnvironmentCacheSchema.parse(params);

      this.logger.info("Flushing environment cache", {
        component: "PuppetserverPlugin",
        operation: "flushEnvironmentCache",
        metadata: {
          name: validated.name ?? "all",
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      const result = await this.puppetserverService.flushEnvironmentCache(validated.name);

      complete({ name: validated.name ?? "all", status: result.status });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get facts for a node
   */
  private async getNodeFacts(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Facts> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getNodeFacts");

    try {
      const validated = NodeFactsSchema.parse(params);

      this.logger.debug("Getting node facts", {
        component: "PuppetserverPlugin",
        operation: "getNodeFacts",
        metadata: {
          node: validated.node,
          refresh: validated.refresh,
          correlationId: context.correlationId,
        },
      });

      // Clear cache if refresh requested
      if (validated.refresh) {
        this.puppetserverService.clearCache();
      }

      const facts = await this.puppetserverService.getNodeFacts(validated.node);

      complete({ node: validated.node });
      return facts;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get simple status
   */
  private async getSimpleStatus(
    _params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getSimpleStatus");

    try {
      this.logger.debug("Getting simple status", {
        component: "PuppetserverPlugin",
        operation: "getSimpleStatus",
        metadata: {
          correlationId: context.correlationId,
        },
      });

      const status = await this.puppetserverService.getSimpleStatus();

      complete({ success: true });
      return status;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get services status
   */
  private async getServicesStatus(
    _params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getServicesStatus");

    try {
      this.logger.debug("Getting services status", {
        component: "PuppetserverPlugin",
        operation: "getServicesStatus",
        metadata: {
          correlationId: context.correlationId,
        },
      });

      const status = await this.puppetserverService.getServicesStatus();

      complete({ success: true });
      return status;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get metrics
   */
  private async getMetrics(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getMetrics");

    try {
      const validated = MetricsSchema.parse(params);

      this.logger.info("Getting metrics", {
        component: "PuppetserverPlugin",
        operation: "getMetrics",
        metadata: {
          mbean: validated.mbean,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      // Log warning about resource intensity
      this.logger.warn("Metrics endpoint can be resource-intensive on Puppetserver", {
        component: "PuppetserverPlugin",
        operation: "getMetrics",
      });

      const metrics = await this.puppetserverService.getMetrics(validated.mbean);

      complete({ mbean: validated.mbean, success: true });
      return metrics;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get admin API info
   */
  private async getAdminApiInfo(
    _params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    const complete = this.performanceMonitor.startTimer("puppetserver:v1:getAdminApiInfo");

    try {
      this.logger.debug("Getting admin API info", {
        component: "PuppetserverPlugin",
        operation: "getAdminApiInfo",
        metadata: {
          correlationId: context.correlationId,
        },
      });

      const info = await this.puppetserverService.getAdminApiInfo();

      complete({ success: true });
      return info;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // =========================================================================
  // Legacy Bridge Methods (for backward compatibility)
  // =========================================================================

  /**
   * Get the underlying PuppetserverService instance
   * @deprecated Use capability handlers instead
   */
  getPuppetserverService(): PuppetserverServiceInterface {
    return this.puppetserverService;
  }
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for creating PuppetserverPlugin instances
 */
export function createPuppetserverPlugin(
  puppetserverService: PuppetserverServiceInterface,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): PuppetserverPlugin {
  return new PuppetserverPlugin(puppetserverService, logger, performanceMonitor);
}

export default PuppetserverPlugin;
