/**
 * PuppetDB Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (query, nodes, facts, reports, events, catalog)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 * - Circuit breaker and retry logic for resilience
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (PuppetDBService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/puppetdb/backend/PuppetDBPlugin
 * @version 1.0.0
 */

import type { ZodSchema } from "zod";
import { z } from "zod";

// Import standardized capability interfaces
import type {
  InventoryCapability,
  InventoryListParams,
  InventoryGetParams,
  InventoryGroupsParams,
  InventoryFilterParams,
} from "../../../backend/src/integrations/capability-types/inventory";
import type {
  FactsCapability,
  FactsGetParams,
  FactsRefreshParams,
  FactProvider,
} from "../../../backend/src/integrations/capability-types/facts";
import type {
  ReportsCapability,
  ReportsListParams,
  ReportsGetParams,
  ReportsQueryParams,
  Report as StandardReport,
  ReportListResult,
} from "../../../backend/src/integrations/capability-types/reports";
import type {
  EventsCapability,
  EventsListParams,
  EventsStreamParams,
  EventsQueryParams,
  Event as StandardEvent,
  EventListResult,
  EventStreamCallback,
} from "../../../backend/src/integrations/capability-types/events";

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
}

// =============================================================================
// Service interfaces - Define what we need from injected services
// =============================================================================

/** Node interface */
interface Node {
  id: string;
  name: string;
  uri: string;
  transport: string;
  config: Record<string, unknown>;
}

/** Facts interface */
interface Facts {
  nodeId: string;
  gatheredAt: string;
  facts: Record<string, unknown>;
}

/** Report interface */
interface Report {
  certname: string;
  hash: string;
  environment: string;
  status: "unchanged" | "changed" | "failed";
  noop: boolean;
  puppet_version: string;
  report_format: number;
  configuration_version: string;
  start_time: string;
  end_time: string;
  producer_timestamp: string;
  receive_time: string;
  transaction_uuid: string;
  metrics: unknown;
  logs: unknown[];
  resource_events: unknown[];
}

/** Catalog interface */
interface Catalog {
  certname: string;
  version: string;
  transaction_uuid: string;
  environment: string;
  producer_timestamp: string;
  hash: string;
  resources: unknown[];
  edges: unknown[];
}

/** Event interface */
interface Event {
  certname: string;
  timestamp: string;
  report: string;
  resource_type: string;
  resource_title: string;
  property: string;
  status: "success" | "failure" | "noop" | "skipped";
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
}

/** Event filters interface */
interface EventFilters {
  status?: "success" | "failure" | "noop" | "skipped";
  resourceType?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  reportHash?: string;
}

/** Resource interface */
interface Resource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

/** Resource type interface */
interface ResourceType {
  name: string;
  count: number;
  description?: string;
}

/** PuppetDBService interface - what we need from the injected service */
interface PuppetDBServiceInterface {
  initialize(config: unknown): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getInventory(pqlQuery?: string): Promise<Node[]>;
  queryInventory(pqlQuery: string): Promise<Node[]>;
  getNodeFacts(nodeId: string): Promise<Facts>;
  getNodeReports(nodeId: string, limit?: number, offset?: number): Promise<Report[]>;
  getReport(reportHash: string): Promise<Report | null>;
  getReportsSummary(limit?: number, hours?: number): Promise<{
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  }>;
  getAllReports(limit?: number, offset?: number): Promise<Report[]>;
  queryEvents(nodeId: string, filters: EventFilters): Promise<Event[]>;
  getNodeCatalog(nodeId: string): Promise<Catalog | null>;
  getCatalogResources(nodeId: string, resourceType?: string): Promise<Record<string, Resource[]>>;
  getSummaryStats(): Promise<unknown>;
  getResourceTypes(): Promise<ResourceType[]>;
  getResourcesByType(resourceType: string, limit?: number, offset?: number): Promise<Resource[]>;
  getResource(resourceType: string, resourceTitle: string): Promise<Resource | null>;
}

/** LoggerService interface */
interface LoggerServiceInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

// =============================================================================
// Capability Parameter Schemas
// =============================================================================

/**
 * Schema for PQL query execution
 */
const PqlQuerySchema = z.object({
  query: z.string().min(1).describe("PQL query string"),
  limit: z.number().optional().describe("Maximum number of results"),
  offset: z.number().optional().describe("Number of results to skip"),
});

/**
 * Schema for node listing
 */
const NodesListSchema = z.object({
  query: z.string().optional().describe("Optional PQL filter query"),
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
});

/**
 * Schema for node facts query
 */
const NodeFactsSchema = z.object({
  node: z.string().min(1).describe("Node certname to query facts for"),
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
});

/**
 * Schema for node reports query
 */
const NodeReportsSchema = z.object({
  node: z.string().min(1).describe("Node certname to get reports for"),
  limit: z.number().optional().default(10).describe("Maximum number of reports"),
  offset: z.number().optional().default(0).describe("Number of reports to skip"),
});

/**
 * Schema for specific report query
 */
const ReportSchema = z.object({
  hash: z.string().min(1).describe("Report hash identifier"),
});

/**
 * Schema for reports summary query
 */
const ReportsSummarySchema = z.object({
  limit: z.number().optional().default(100).describe("Maximum reports to analyze"),
  hours: z.number().optional().describe("Hours to look back"),
});

/**
 * Schema for all reports query
 */
const AllReportsSchema = z.object({
  limit: z.number().optional().default(100).describe("Maximum number of reports"),
  offset: z.number().optional().default(0).describe("Number of reports to skip"),
});

/**
 * Schema for node events query
 */
const NodeEventsSchema = z.object({
  node: z.string().min(1).describe("Node certname to get events for"),
  status: z.enum(["success", "failure", "noop", "skipped"]).optional().describe("Filter by event status"),
  resourceType: z.string().optional().describe("Filter by resource type"),
  startTime: z.string().optional().describe("Start time (ISO 8601)"),
  endTime: z.string().optional().describe("End time (ISO 8601)"),
  limit: z.number().optional().describe("Maximum number of events"),
  reportHash: z.string().optional().describe("Filter by report hash"),
});

/**
 * Schema for node catalog query
 */
const NodeCatalogSchema = z.object({
  node: z.string().min(1).describe("Node certname to get catalog for"),
});

/**
 * Schema for catalog resources query
 */
const CatalogResourcesSchema = z.object({
  node: z.string().min(1).describe("Node certname"),
  resourceType: z.string().optional().describe("Filter by resource type"),
});

/**
 * Schema for resource types query
 */
const ResourceTypesSchema = z.object({
  // No parameters needed for listing all resource types
});

/**
 * Schema for resources by type query
 */
const ResourcesByTypeSchema = z.object({
  resourceType: z.string().min(1).describe("Resource type to query"),
  limit: z.number().optional().default(100).describe("Maximum number of resources"),
  offset: z.number().optional().default(0).describe("Number of resources to skip"),
});

/**
 * Schema for specific resource query
 */
const ResourceSchema = z.object({
  resourceType: z.string().min(1).describe("Resource type"),
  resourceTitle: z.string().min(1).describe("Resource title"),
});

// =============================================================================
// Plugin Configuration
// =============================================================================

/**
 * PuppetDB plugin configuration schema
 */
export const PuppetDBPluginConfigSchema = z.object({
  serverUrl: z.string().url().optional().describe("PuppetDB server URL"),
  port: z.number().optional().describe("PuppetDB port"),
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
  circuitBreaker: z.object({
    threshold: z.number().optional().describe("Failure threshold before opening"),
    resetTimeout: z.number().optional().describe("Time before attempting reset"),
    timeout: z.number().optional().describe("Request timeout"),
  }).optional().describe("Circuit breaker configuration"),
  retryAttempts: z.number().optional().describe("Number of retry attempts"),
  retryDelay: z.number().optional().describe("Delay between retries in ms"),
});

export type PuppetDBPluginConfig = z.infer<typeof PuppetDBPluginConfigSchema>;


// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * PuppetDB Plugin v1.0.0
 *
 * Provides PuppetDB integration with capability-based architecture:
 * - puppetdb.query: Execute arbitrary PQL queries
 * - puppetdb.nodes: List nodes from PuppetDB inventory
 * - puppetdb.facts: Get facts for a specific node
 * - puppetdb.reports: Get reports for a node
 * - puppetdb.report: Get a specific report by hash
 * - puppetdb.reports.summary: Get aggregated report statistics
 * - puppetdb.reports.all: Get all recent reports
 * - puppetdb.events: Get events for a node
 * - puppetdb.catalog: Get catalog for a node
 * - puppetdb.catalog.resources: Get catalog resources organized by type
 * - puppetdb.stats: Get summary statistics
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - FactsCapability: info.facts, info.refresh
 * - ReportsCapability: reports.list, reports.get, reports.query
 * - EventsCapability: events.list, events.stream, events.query
 */
export class PuppetDBPlugin implements BasePluginInterface, InventoryCapability, FactsCapability, ReportsCapability, EventsCapability {
  // =========================================================================
  // Plugin Metadata
  // =========================================================================

  readonly metadata: PluginMetadata = {
    name: "puppetdb",
    version: "1.0.0",
    author: "Pabawi Team",
    description: "PuppetDB integration for infrastructure data, facts, reports, and catalogs",
    integrationType: IntegrationType.Info,
    homepage: "https://puppet.com/docs/puppetdb/latest/index.html",
    color: "#9063CD", // PuppetDB violet
    icon: "database",
    tags: ["puppetdb", "puppet", "facts", "reports", "catalogs", "inventory"],
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
      id: "puppetdb:home-widget",
      name: "PuppetDB Summary",
      component: "./frontend/HomeWidget.svelte",
      slots: ["home-summary"],
      size: "medium",
      requiredCapabilities: ["puppetdb.nodes"],
      icon: "database",
      priority: 90,
    },
    {
      id: "puppetdb:node-browser",
      name: "Node Browser",
      component: "./frontend/NodeBrowser.svelte",
      slots: ["dashboard", "inventory-panel", "standalone-page"],
      size: "large",
      requiredCapabilities: ["puppetdb.nodes"],
      icon: "server",
      priority: 100,
      config: {
        showSearch: true,
        showFilters: true,
      },
    },
    {
      id: "puppetdb:facts-explorer",
      name: "Facts Explorer",
      component: "./frontend/FactsExplorer.svelte",
      slots: ["node-detail", "standalone-page", "modal"],
      size: "large",
      requiredCapabilities: ["puppetdb.facts"],
      icon: "info",
      priority: 90,
      config: {
        showSearch: true,
        showExpandAll: true,
      },
    },
    {
      id: "puppetdb:reports-viewer",
      name: "Reports Viewer",
      component: "./frontend/ReportsViewer.svelte",
      slots: ["dashboard", "node-detail", "standalone-page"],
      size: "large",
      requiredCapabilities: ["puppetdb.reports"],
      icon: "file-text",
      priority: 85,
      config: {
        showStatusFilter: true,
        showTimeline: true,
      },
    },
    {
      id: "puppetdb:reports-summary",
      name: "Reports Summary",
      component: "./frontend/ReportsSummary.svelte",
      slots: ["dashboard", "sidebar"],
      size: "small",
      requiredCapabilities: ["puppetdb.reports.summary"],
      icon: "pie-chart",
      priority: 95,
    },
    {
      id: "puppetdb:events-viewer",
      name: "Events Viewer",
      component: "./frontend/EventsViewer.svelte",
      slots: ["node-detail", "standalone-page"],
      size: "large",
      requiredCapabilities: ["puppetdb.events"],
      icon: "activity",
      priority: 80,
      config: {
        showStatusFilter: true,
        showResourceFilter: true,
        defaultLimit: 100,
      },
    },
    {
      id: "puppetdb:catalog-viewer",
      name: "Catalog Viewer",
      component: "./frontend/CatalogViewer.svelte",
      slots: ["node-detail", "standalone-page"],
      size: "large",
      requiredCapabilities: ["puppetdb.catalog"],
      icon: "file-code",
      priority: 75,
      config: {
        showRelationships: true,
        showParameters: true,
      },
    },
    {
      id: "puppetdb:resource-types-viewer",
      name: "Resource Types",
      component: "./frontend/ResourceTypesViewer.svelte",
      slots: ["dashboard", "standalone-page"],
      size: "large",
      requiredCapabilities: ["resources.types"],
      icon: "layers",
      priority: 70,
      config: {
        showCounts: true,
        showSearch: true,
      },
    },
  ];

  // =========================================================================
  // CLI Commands
  // =========================================================================

  readonly cliCommands: PluginCLICommand[] = [
    {
      name: "puppetdb",
      actions: [
        {
          name: "query",
          capability: "puppetdb.query",
          description: "Execute a PQL query against PuppetDB",
          aliases: ["pql"],
          examples: [
            'pab puppetdb query "nodes { certname ~ \'web\' }"',
            'pab puppetdb query "facts { name = \'os\' }" --limit 10',
          ],
        },
        {
          name: "nodes",
          capability: "puppetdb.nodes",
          description: "List nodes from PuppetDB",
          aliases: ["list", "inventory"],
          examples: [
            "pab puppetdb nodes",
            'pab puppetdb nodes --query "certname ~ \'db\'"',
          ],
        },
        {
          name: "facts",
          capability: "puppetdb.facts",
          description: "Get facts for a specific node",
          examples: [
            "pab puppetdb facts web-01",
            "pab puppetdb facts db-server --format json",
          ],
        },
        {
          name: "reports",
          capability: "puppetdb.reports",
          description: "Get reports for a node",
          examples: [
            "pab puppetdb reports web-01",
            "pab puppetdb reports db-server --limit 20",
          ],
        },
        {
          name: "report",
          capability: "puppetdb.report",
          description: "Get a specific report by hash",
          examples: [
            "pab puppetdb report abc123def456",
          ],
        },
        {
          name: "events",
          capability: "puppetdb.events",
          description: "Get events for a node",
          examples: [
            "pab puppetdb events web-01",
            "pab puppetdb events web-01 --status failure",
          ],
        },
        {
          name: "catalog",
          capability: "puppetdb.catalog",
          description: "Get catalog for a node",
          examples: [
            "pab puppetdb catalog web-01",
            "pab puppetdb catalog db-server --format json",
          ],
        },
        {
          name: "stats",
          capability: "puppetdb.stats",
          description: "Get PuppetDB summary statistics",
          aliases: ["summary"],
          examples: [
            "pab puppetdb stats",
          ],
        },
      ],
    },
  ];

  // =========================================================================
  // Configuration
  // =========================================================================

  readonly configSchema: ZodSchema = PuppetDBPluginConfigSchema;

  readonly defaultPermissions: Record<string, string[]> = {
    "puppetdb.query": ["admin", "operator"],
    "puppetdb.nodes": ["admin", "operator", "viewer"],
    "puppetdb.facts": ["admin", "operator", "viewer"],
    "puppetdb.reports": ["admin", "operator", "viewer"],
    "puppetdb.report": ["admin", "operator", "viewer"],
    "puppetdb.reports.summary": ["admin", "operator", "viewer"],
    "puppetdb.reports.all": ["admin", "operator", "viewer"],
    "puppetdb.events": ["admin", "operator", "viewer"],
    "puppetdb.catalog": ["admin", "operator", "viewer"],
    "puppetdb.catalog.resources": ["admin", "operator", "viewer"],
    "puppetdb.stats": ["admin", "operator", "viewer"],
    "puppetdb.resources": ["admin", "operator", "viewer"],
    "resources.types": ["admin", "operator", "viewer"],
    "resources.list": ["admin", "operator", "viewer"],
    "resources.get": ["admin", "operator", "viewer"],
  };

  // =========================================================================
  // Private State
  // =========================================================================

  private puppetDBService: PuppetDBServiceInterface;
  private logger: LoggerServiceInterface;
  private performanceMonitor: PerformanceMonitorServiceInterface;
  private config: PuppetDBPluginConfig = {};
  private _initialized = false;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    puppetDBService: PuppetDBServiceInterface,
    logger: LoggerServiceInterface,
    performanceMonitor: PerformanceMonitorServiceInterface,
  ) {
    this.puppetDBService = puppetDBService;
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
      // Standardized Inventory Capabilities (Phase 1)
      {
        category: "inventory",
        name: "inventory.list",
        description: "List all nodes from PuppetDB inventory (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryList(params as InventoryListParams),
        requiredPermissions: ["puppetdb.nodes", "inventory.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            refresh: {
              type: "boolean",
              description: "Force refresh from source",
              required: false,
              default: false,
            },
            groups: {
              type: "array",
              description: "Filter by group membership",
              required: false,
            },
          },
          returns: {
            type: "Node[]",
            description: "Array of nodes from inventory",
          },
        },
      },

      {
        category: "inventory",
        name: "inventory.get",
        description: "Get specific node details (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryGet(params as InventoryGetParams),
        requiredPermissions: ["puppetdb.nodes", "inventory.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Node identifier",
              required: true,
            },
          },
          returns: {
            type: "Node",
            description: "Node details or null if not found",
          },
        },
      },

      {
        category: "inventory",
        name: "inventory.groups",
        description: "List available groups (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryGroups(params as InventoryGroupsParams),
        requiredPermissions: ["puppetdb.nodes", "inventory.read"],
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
            type: "string[]",
            description: "Array of group names",
          },
        },
      },

      {
        category: "inventory",
        name: "inventory.filter",
        description: "Filter nodes by criteria (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryFilter(params as InventoryFilterParams),
        requiredPermissions: ["puppetdb.nodes", "inventory.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            criteria: {
              type: "object",
              description: "Filter criteria as key-value pairs",
              required: true,
            },
            groups: {
              type: "array",
              description: "Filter by group membership",
              required: false,
            },
          },
          returns: {
            type: "Node[]",
            description: "Array of matching nodes",
          },
        },
      },

      // Standardized Facts Capabilities (Phase 1)
      {
        category: "info",
        name: "info.facts",
        description: "Get facts for a node (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.factsGet(params as FactsGetParams),
        requiredPermissions: ["puppetdb.facts", "facts.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Node identifier",
              required: true,
            },
            providers: {
              type: "array",
              description: "Specific fact providers to use",
              required: false,
            },
          },
          returns: {
            type: "Facts",
            description: "Facts object with key-value pairs",
          },
        },
      },

      {
        category: "info",
        name: "info.refresh",
        description: "Force refresh facts (bypass cache) (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.factsRefresh(params as FactsRefreshParams),
        requiredPermissions: ["puppetdb.facts", "facts.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Node identifier",
              required: true,
            },
            providers: {
              type: "array",
              description: "Specific fact providers to refresh",
              required: false,
            },
          },
          returns: {
            type: "Facts",
            description: "Refreshed facts object",
          },
        },
      },

      // Standardized Reports Capabilities (Phase 1)
      {
        category: "info",
        name: "reports.list",
        description: "List available reports (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.reportsList(params as ReportsListParams),
        requiredPermissions: ["puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Filter by node identifier",
              required: false,
            },
            limit: {
              type: "number",
              description: "Maximum number of reports to return",
              required: false,
            },
            offset: {
              type: "number",
              description: "Offset for pagination",
              required: false,
            },
            startTime: {
              type: "string",
              description: "Filter reports after this timestamp",
              required: false,
            },
            endTime: {
              type: "string",
              description: "Filter reports before this timestamp",
              required: false,
            },
            status: {
              type: "string",
              description: "Filter by report status",
              required: false,
              choices: ["success", "failed", "changed", "unchanged"],
            },
          },
          returns: {
            type: "ReportListResult",
            description: "Paginated report list result",
          },
        },
      },

      {
        category: "info",
        name: "reports.get",
        description: "Get specific report (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.reportsGet(params as ReportsGetParams),
        requiredPermissions: ["puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            reportId: {
              type: "string",
              description: "Report identifier",
              required: true,
            },
          },
          returns: {
            type: "Report",
            description: "Report details or null if not found",
          },
        },
      },

      {
        category: "info",
        name: "reports.query",
        description: "Query reports with filters (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.reportsQuery(params as ReportsQueryParams),
        requiredPermissions: ["puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            filters: {
              type: "object",
              description: "Query filters as key-value pairs",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of reports to return",
              required: false,
            },
            offset: {
              type: "number",
              description: "Offset for pagination",
              required: false,
            },
            orderBy: {
              type: "string",
              description: "Field to order results by",
              required: false,
            },
            orderDirection: {
              type: "string",
              description: "Order direction",
              required: false,
              choices: ["asc", "desc"],
            },
          },
          returns: {
            type: "ReportListResult",
            description: "Paginated report list result",
          },
        },
      },

      // Standardized Events Capabilities (Phase 1)
      {
        category: "info",
        name: "events.list",
        description: "List events for a node (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.eventsList(params as EventsListParams),
        requiredPermissions: ["puppetdb.events"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Node identifier",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of events to return",
              required: false,
            },
            offset: {
              type: "number",
              description: "Offset for pagination",
              required: false,
            },
            startTime: {
              type: "string",
              description: "Filter events after this timestamp",
              required: false,
            },
            endTime: {
              type: "string",
              description: "Filter events before this timestamp",
              required: false,
            },
            eventType: {
              type: "string",
              description: "Filter by event type",
              required: false,
            },
            status: {
              type: "string",
              description: "Filter by event status",
              required: false,
              choices: ["success", "failure", "noop", "skipped"],
            },
          },
          returns: {
            type: "EventListResult",
            description: "Paginated event list result",
          },
        },
      },

      {
        category: "info",
        name: "events.stream",
        description: "Stream live events (standardized interface)",
        handler: async (params: Record<string, unknown>) => {
          // Extract callback from context metadata
          const callback = (params as any).callback as EventStreamCallback;
          return this.eventsStream(params as EventsStreamParams, callback);
        },
        requiredPermissions: ["puppetdb.events"],
        riskLevel: "read",
        schema: {
          arguments: {
            nodeId: {
              type: "string",
              description: "Filter by node identifier",
              required: false,
            },
            eventTypes: {
              type: "array",
              description: "Filter by event types",
              required: false,
            },
          },
          returns: {
            type: "void",
            description: "Streams events via callback",
          },
        },
      },

      {
        category: "info",
        name: "events.query",
        description: "Query events with filters (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.eventsQuery(params as EventsQueryParams),
        requiredPermissions: ["puppetdb.events"],
        riskLevel: "read",
        schema: {
          arguments: {
            filters: {
              type: "object",
              description: "Query filters as key-value pairs",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of events to return",
              required: false,
            },
            offset: {
              type: "number",
              description: "Offset for pagination",
              required: false,
            },
            orderBy: {
              type: "string",
              description: "Field to order results by",
              required: false,
            },
            orderDirection: {
              type: "string",
              description: "Order direction",
              required: false,
              choices: ["asc", "desc"],
            },
          },
          returns: {
            type: "EventListResult",
            description: "Paginated event list result",
          },
        },
      },

      // Legacy PQL Query Execution
      {
        category: "info",
        name: "puppetdb.query",
        description: "Execute arbitrary PQL queries against PuppetDB",
        handler: this.executeQuery.bind(this),
        requiredPermissions: ["puppetdb.query"],
        riskLevel: "read",
        schema: {
          arguments: {
            query: {
              type: "string",
              description: "PQL query string",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of results",
              required: false,
            },
            offset: {
              type: "number",
              description: "Number of results to skip",
              required: false,
            },
          },
          returns: {
            type: "unknown[]",
            description: "Query results from PuppetDB",
          },
        },
      },

      // Legacy Node Listing
      {
        category: "inventory",
        name: "puppetdb.nodes",
        description: "List nodes from PuppetDB inventory (legacy)",
        handler: this.listNodes.bind(this),
        requiredPermissions: ["puppetdb.nodes", "inventory.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            query: {
              type: "string",
              description: "Optional PQL filter query",
              required: false,
            },
            refresh: {
              type: "boolean",
              description: "Force refresh from source",
              required: false,
              default: false,
            },
          },
          returns: {
            type: "Node[]",
            description: "Array of nodes from PuppetDB",
          },
        },
      },

      // Legacy Node Facts
      {
        category: "info",
        name: "puppetdb.facts",
        description: "Get facts for a specific node from PuppetDB (legacy)",
        handler: this.getNodeFacts.bind(this),
        requiredPermissions: ["puppetdb.facts", "facts.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to query facts for",
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

      // Legacy Node Reports
      {
        category: "info",
        name: "puppetdb.reports",
        description: "Get Puppet reports for a specific node (legacy)",
        handler: this.getNodeReports.bind(this),
        requiredPermissions: ["puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to get reports for",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of reports",
              required: false,
              default: 10,
            },
            offset: {
              type: "number",
              description: "Number of reports to skip",
              required: false,
              default: 0,
            },
          },
          returns: {
            type: "Report[]",
            description: "Array of reports for the node",
          },
        },
      },

      // Legacy Specific Report
      {
        category: "info",
        name: "puppetdb.report",
        description: "Get a specific Puppet report by hash (legacy)",
        handler: this.getReport.bind(this),
        requiredPermissions: ["puppetdb.report", "puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            hash: {
              type: "string",
              description: "Report hash identifier",
              required: true,
            },
          },
          returns: {
            type: "Report | null",
            description: "Report details or null if not found",
          },
        },
      },

      // Legacy Reports Summary
      {
        category: "info",
        name: "puppetdb.reports.summary",
        description: "Get aggregated summary of recent Puppet reports (legacy)",
        handler: this.getReportsSummary.bind(this),
        requiredPermissions: ["puppetdb.reports.summary", "puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            limit: {
              type: "number",
              description: "Maximum reports to analyze",
              required: false,
              default: 100,
            },
            hours: {
              type: "number",
              description: "Hours to look back",
              required: false,
            },
          },
          returns: {
            type: "ReportsSummary",
            description: "Aggregated report statistics",
          },
        },
      },

      // Legacy All Reports
      {
        category: "info",
        name: "puppetdb.reports.all",
        description: "Get all recent Puppet reports across all nodes (legacy)",
        handler: this.getAllReports.bind(this),
        requiredPermissions: ["puppetdb.reports.all", "puppetdb.reports"],
        riskLevel: "read",
        schema: {
          arguments: {
            limit: {
              type: "number",
              description: "Maximum number of reports",
              required: false,
              default: 100,
            },
            offset: {
              type: "number",
              description: "Number of reports to skip",
              required: false,
              default: 0,
            },
          },
          returns: {
            type: "Report[]",
            description: "Array of recent reports",
          },
        },
      },

      // Legacy Node Events
      {
        category: "info",
        name: "puppetdb.events",
        description: "Get Puppet events for a specific node (legacy)",
        handler: this.getNodeEvents.bind(this),
        requiredPermissions: ["puppetdb.events"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname to get events for",
              required: true,
            },
            status: {
              type: "string",
              description: "Filter by event status (success, failure, noop, skipped)",
              required: false,
              choices: ["success", "failure", "noop", "skipped"],
            },
            resourceType: {
              type: "string",
              description: "Filter by resource type",
              required: false,
            },
            startTime: {
              type: "string",
              description: "Start time (ISO 8601)",
              required: false,
            },
            endTime: {
              type: "string",
              description: "End time (ISO 8601)",
              required: false,
            },
            limit: {
              type: "number",
              description: "Maximum number of events",
              required: false,
            },
            reportHash: {
              type: "string",
              description: "Filter by report hash",
              required: false,
            },
          },
          returns: {
            type: "Event[]",
            description: "Array of events for the node",
          },
        },
      },

      // Legacy Node Catalog
      {
        category: "info",
        name: "puppetdb.catalog",
        description: "Get the Puppet catalog for a specific node (legacy)",
        handler: this.getNodeCatalog.bind(this),
        requiredPermissions: ["puppetdb.catalog"],
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

      // Legacy Catalog Resources
      {
        category: "info",
        name: "puppetdb.catalog.resources",
        description: "Get catalog resources organized by type (legacy)",
        handler: this.getCatalogResources.bind(this),
        requiredPermissions: ["puppetdb.catalog.resources", "puppetdb.catalog"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: {
              type: "string",
              description: "Node certname",
              required: true,
            },
            resourceType: {
              type: "string",
              description: "Filter by resource type",
              required: false,
            },
          },
          returns: {
            type: "Record<string, Resource[]>",
            description: "Resources organized by type",
          },
        },
      },

      // Summary Statistics
      {
        category: "info",
        name: "puppetdb.stats",
        description: "Get PuppetDB summary statistics",
        handler: this.getSummaryStats.bind(this),
        requiredPermissions: ["puppetdb.stats"],
        riskLevel: "read",
        schema: {
          arguments: {},
          returns: {
            type: "SummaryStats",
            description: "PuppetDB summary statistics",
          },
        },
      },

      // Resource Types Capabilities
      {
        category: "info",
        name: "resources.types",
        description: "List all resource types available in PuppetDB",
        handler: this.getResourceTypes.bind(this),
        requiredPermissions: ["puppetdb.resources", "resources.read"],
        riskLevel: "read",
        schema: {
          arguments: {},
          returns: {
            type: "ResourceType[]",
            description: "Array of resource types with counts",
          },
        },
      },

      {
        category: "info",
        name: "resources.list",
        description: "List resources by type",
        handler: this.getResourcesByType.bind(this),
        requiredPermissions: ["puppetdb.resources", "resources.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            resourceType: {
              type: "string",
              description: "Resource type to query",
              required: true,
            },
            limit: {
              type: "number",
              description: "Maximum number of resources",
              required: false,
              default: 100,
            },
            offset: {
              type: "number",
              description: "Number of resources to skip",
              required: false,
              default: 0,
            },
          },
          returns: {
            type: "Resource[]",
            description: "Array of resources of the specified type",
          },
        },
      },

      {
        category: "info",
        name: "resources.get",
        description: "Get specific resource details",
        handler: this.getResource.bind(this),
        requiredPermissions: ["puppetdb.resources", "resources.read"],
        riskLevel: "read",
        schema: {
          arguments: {
            resourceType: {
              type: "string",
              description: "Resource type",
              required: true,
            },
            resourceTitle: {
              type: "string",
              description: "Resource title",
              required: true,
            },
          },
          returns: {
            type: "Resource | null",
            description: "Resource details or null if not found",
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
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:initialization");

    try {
      this.logger.info("Initializing PuppetDBPlugin", {
        component: "PuppetDBPlugin",
        operation: "initialize",
      });

      // Initialize the underlying PuppetDB service
      await this.puppetDBService.initialize({
        enabled: true,
        name: "puppetdb",
        type: "information",
        priority: 10,
        config: this.config,
      });

      this._initialized = true;

      this.logger.info("PuppetDBPlugin initialized successfully", {
        component: "PuppetDBPlugin",
        operation: "initialize",
        metadata: {
          capabilitiesCount: this.capabilities.length,
          widgetsCount: this.widgets.length,
        },
      });

      complete({ success: true });
    } catch (error) {
      this.logger.warn("PuppetDBPlugin initialization completed with issues", {
        component: "PuppetDBPlugin",
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
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:healthCheck");
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
      const serviceHealth = await this.puppetDBService.healthCheck();

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
        message: `PuppetDB health check failed: ${errorMessage}`,
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
    this.logger.info("PuppetDBPlugin shutting down", {
      component: "PuppetDBPlugin",
      operation: "shutdown",
    });
    this._initialized = false;
  }

  // =========================================================================
  // Capability Handlers
  // =========================================================================

  /**
   * Execute a PQL query
   */
  private async executeQuery(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:executeQuery");

    try {
      const validated = PqlQuerySchema.parse(params);

      this.logger.info("Executing PQL query", {
        component: "PuppetDBPlugin",
        operation: "executeQuery",
        metadata: {
          queryLength: validated.query.length,
          limit: validated.limit,
          offset: validated.offset,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      // Use queryInventory for now since it supports PQL
      const result = await this.puppetDBService.queryInventory(validated.query);

      complete({ resultCount: result.length });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List nodes from PuppetDB
   */
  private async listNodes(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Node[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:listNodes");

    try {
      const validated = NodesListSchema.parse(params);

      this.logger.debug("Listing nodes", {
        component: "PuppetDBPlugin",
        operation: "listNodes",
        metadata: {
          hasQuery: !!validated.query,
          refresh: validated.refresh,
          correlationId: context.correlationId,
        },
      });

      const nodes = await this.puppetDBService.getInventory(validated.query);

      complete({ nodeCount: nodes.length });
      return nodes;
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
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getNodeFacts");

    try {
      const validated = NodeFactsSchema.parse(params);

      this.logger.debug("Getting node facts", {
        component: "PuppetDBPlugin",
        operation: "getNodeFacts",
        metadata: {
          node: validated.node,
          refresh: validated.refresh,
          correlationId: context.correlationId,
        },
      });

      const facts = await this.puppetDBService.getNodeFacts(validated.node);

      complete({ node: validated.node });
      return facts;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get reports for a node
   */
  private async getNodeReports(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Report[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getNodeReports");

    try {
      const validated = NodeReportsSchema.parse(params);

      this.logger.debug("Getting node reports", {
        component: "PuppetDBPlugin",
        operation: "getNodeReports",
        metadata: {
          node: validated.node,
          limit: validated.limit,
          offset: validated.offset,
          correlationId: context.correlationId,
        },
      });

      const reports = await this.puppetDBService.getNodeReports(
        validated.node,
        validated.limit,
        validated.offset,
      );

      complete({ node: validated.node, reportCount: reports.length });
      return reports;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get a specific report by hash
   */
  private async getReport(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Report | null> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getReport");

    try {
      const validated = ReportSchema.parse(params);

      this.logger.debug("Getting report", {
        component: "PuppetDBPlugin",
        operation: "getReport",
        metadata: {
          hash: validated.hash,
          correlationId: context.correlationId,
        },
      });

      const report = await this.puppetDBService.getReport(validated.hash);

      complete({ hash: validated.hash, found: !!report });
      return report;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get reports summary statistics
   */
  private async getReportsSummary(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<{
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  }> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getReportsSummary");

    try {
      const validated = ReportsSummarySchema.parse(params);

      this.logger.debug("Getting reports summary", {
        component: "PuppetDBPlugin",
        operation: "getReportsSummary",
        metadata: {
          limit: validated.limit,
          hours: validated.hours,
          correlationId: context.correlationId,
        },
      });

      const summary = await this.puppetDBService.getReportsSummary(
        validated.limit,
        validated.hours,
      );

      complete({ total: summary.total });
      return summary;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get all recent reports
   */
  private async getAllReports(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Report[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getAllReports");

    try {
      const validated = AllReportsSchema.parse(params);

      this.logger.debug("Getting all reports", {
        component: "PuppetDBPlugin",
        operation: "getAllReports",
        metadata: {
          limit: validated.limit,
          offset: validated.offset,
          correlationId: context.correlationId,
        },
      });

      const reports = await this.puppetDBService.getAllReports(
        validated.limit,
        validated.offset,
      );

      complete({ reportCount: reports.length });
      return reports;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get events for a node
   */
  private async getNodeEvents(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Event[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getNodeEvents");

    try {
      const validated = NodeEventsSchema.parse(params);

      this.logger.debug("Getting node events", {
        component: "PuppetDBPlugin",
        operation: "getNodeEvents",
        metadata: {
          node: validated.node,
          status: validated.status,
          resourceType: validated.resourceType,
          correlationId: context.correlationId,
        },
      });

      const filters: EventFilters = {
        status: validated.status,
        resourceType: validated.resourceType,
        startTime: validated.startTime,
        endTime: validated.endTime,
        limit: validated.limit,
        reportHash: validated.reportHash,
      };

      const events = await this.puppetDBService.queryEvents(validated.node, filters);

      complete({ node: validated.node, eventCount: events.length });
      return events;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get catalog for a node
   */
  private async getNodeCatalog(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Catalog | null> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getNodeCatalog");

    try {
      const validated = NodeCatalogSchema.parse(params);

      this.logger.debug("Getting node catalog", {
        component: "PuppetDBPlugin",
        operation: "getNodeCatalog",
        metadata: {
          node: validated.node,
          correlationId: context.correlationId,
        },
      });

      const catalog = await this.puppetDBService.getNodeCatalog(validated.node);

      complete({ node: validated.node, found: !!catalog });
      return catalog;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get catalog resources organized by type
   */
  private async getCatalogResources(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Record<string, Resource[]>> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getCatalogResources");

    try {
      const validated = CatalogResourcesSchema.parse(params);

      this.logger.debug("Getting catalog resources", {
        component: "PuppetDBPlugin",
        operation: "getCatalogResources",
        metadata: {
          node: validated.node,
          resourceType: validated.resourceType,
          correlationId: context.correlationId,
        },
      });

      const resources = await this.puppetDBService.getCatalogResources(
        validated.node,
        validated.resourceType,
      );

      const typeCount = Object.keys(resources).length;
      complete({ node: validated.node, typeCount });
      return resources;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get summary statistics
   */
  private async getSummaryStats(
    _params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getSummaryStats");

    try {
      this.logger.debug("Getting summary stats", {
        component: "PuppetDBPlugin",
        operation: "getSummaryStats",
        metadata: {
          correlationId: context.correlationId,
        },
      });

      const stats = await this.puppetDBService.getSummaryStats();

      complete({ success: true });
      return stats;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get all resource types
   */
  private async getResourceTypes(
    _params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ResourceType[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getResourceTypes");

    try {
      this.logger.debug("Getting resource types", {
        component: "PuppetDBPlugin",
        operation: "getResourceTypes",
        metadata: {
          correlationId: context.correlationId,
        },
      });

      const resourceTypes = await this.puppetDBService.getResourceTypes();

      complete({ typeCount: resourceTypes.length });
      return resourceTypes;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get resources by type
   */
  private async getResourcesByType(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Resource[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getResourcesByType");

    try {
      const validated = ResourcesByTypeSchema.parse(params);

      this.logger.debug("Getting resources by type", {
        component: "PuppetDBPlugin",
        operation: "getResourcesByType",
        metadata: {
          resourceType: validated.resourceType,
          limit: validated.limit,
          offset: validated.offset,
          correlationId: context.correlationId,
        },
      });

      const resources = await this.puppetDBService.getResourcesByType(
        validated.resourceType,
        validated.limit,
        validated.offset,
      );

      complete({ resourceType: validated.resourceType, resourceCount: resources.length });
      return resources;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get specific resource details
   */
  private async getResource(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<Resource | null> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:getResource");

    try {
      const validated = ResourceSchema.parse(params);

      this.logger.debug("Getting resource", {
        component: "PuppetDBPlugin",
        operation: "getResource",
        metadata: {
          resourceType: validated.resourceType,
          resourceTitle: validated.resourceTitle,
          correlationId: context.correlationId,
        },
      });

      const resource = await this.puppetDBService.getResource(
        validated.resourceType,
        validated.resourceTitle,
      );

      complete({
        resourceType: validated.resourceType,
        resourceTitle: validated.resourceTitle,
        found: !!resource
      });
      return resource;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // =========================================================================
  // Standardized Capability Interface Methods (Phase 1)
  // =========================================================================

  /**
   * List all nodes from PuppetDB inventory
   * Implements InventoryCapability.inventoryList
   */
  async inventoryList(params: InventoryListParams): Promise<Node[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:inventoryList");

    try {
      this.logger.debug("Listing inventory (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "inventoryList",
        metadata: { refresh: params.refresh, groups: params.groups },
      });

      let nodes = await this.puppetDBService.getInventory();

      // Filter by groups if specified
      if (params.groups && params.groups.length > 0) {
        nodes = nodes.filter(node =>
          node.config.groups &&
          Array.isArray(node.config.groups) &&
          params.groups!.some(g => (node.config.groups as string[]).includes(g))
        );
      }

      complete({ nodeCount: nodes.length, filtered: !!params.groups });
      return nodes;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get specific node details
   * Implements InventoryCapability.inventoryGet
   */
  async inventoryGet(params: InventoryGetParams): Promise<Node | null> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:inventoryGet");

    try {
      this.logger.debug("Getting node details (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "inventoryGet",
        metadata: { nodeId: params.nodeId },
      });

      const nodes = await this.puppetDBService.getInventory();
      const node = nodes.find(n => n.id === params.nodeId || n.name === params.nodeId);

      complete({ nodeId: params.nodeId, found: !!node });
      return node ?? null;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List available groups
   * Implements InventoryCapability.inventoryGroups
   */
  async inventoryGroups(params: InventoryGroupsParams): Promise<string[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:inventoryGroups");

    try {
      this.logger.debug("Listing inventory groups (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "inventoryGroups",
        metadata: { refresh: params.refresh },
      });

      const nodes = await this.puppetDBService.getInventory();
      const groupsSet = new Set<string>();

      // Extract groups from node configs
      for (const node of nodes) {
        if (node.config.groups && Array.isArray(node.config.groups)) {
          for (const group of node.config.groups as string[]) {
            groupsSet.add(group);
          }
        }
      }

      const groups = Array.from(groupsSet).sort();
      complete({ groupCount: groups.length });
      return groups;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Filter nodes by criteria
   * Implements InventoryCapability.inventoryFilter
   */
  async inventoryFilter(params: InventoryFilterParams): Promise<Node[]> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:inventoryFilter");

    try {
      this.logger.debug("Filtering inventory (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "inventoryFilter",
        metadata: { criteria: params.criteria, groups: params.groups },
      });

      let nodes = await this.puppetDBService.getInventory();

      // Filter by groups first if specified
      if (params.groups && params.groups.length > 0) {
        nodes = nodes.filter(node =>
          node.config.groups &&
          Array.isArray(node.config.groups) &&
          params.groups!.some(g => (node.config.groups as string[]).includes(g))
        );
      }

      // Filter by criteria
      nodes = nodes.filter(node => {
        for (const [key, value] of Object.entries(params.criteria)) {
          // Check in node config
          if (node.config[key] !== value) {
            // Also check nested paths (e.g., "transport" or "config.user")
            const parts = key.split(".");
            let current: unknown = node;
            for (const part of parts) {
              if (current && typeof current === "object" && part in current) {
                current = (current as Record<string, unknown>)[part];
              } else {
                return false;
              }
            }
            if (current !== value) {
              return false;
            }
          }
        }
        return true;
      });

      complete({ matchCount: nodes.length, criteriaCount: Object.keys(params.criteria).length });
      return nodes;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get facts for a node
   * Implements FactsCapability.factsGet
   */
  async factsGet(params: FactsGetParams): Promise<Facts> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:factsGet");

    try {
      this.logger.debug("Getting facts (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "factsGet",
        metadata: { nodeId: params.nodeId, providers: params.providers },
      });

      const facts = await this.puppetDBService.getNodeFacts(params.nodeId);

      complete({ nodeId: params.nodeId });
      return facts;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Force refresh facts (bypass cache)
   * Implements FactsCapability.factsRefresh
   */
  async factsRefresh(params: FactsRefreshParams): Promise<Facts> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:factsRefresh");

    try {
      this.logger.debug("Refreshing facts (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "factsRefresh",
        metadata: { nodeId: params.nodeId, providers: params.providers },
      });

      // For PuppetDB, refresh is the same as get since we always query live
      const facts = await this.puppetDBService.getNodeFacts(params.nodeId);

      complete({ nodeId: params.nodeId });
      return facts;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get fact provider information for this plugin
   * Implements FactsCapability.getFactProvider
   */
  getFactProvider(): FactProvider {
    return {
      name: "puppetdb",
      priority: 100, // Highest priority (PuppetDB is authoritative source)
      supportedFactKeys: [
        "os",
        "kernel",
        "processors",
        "memory",
        "networking",
        "hostname",
        "fqdn",
        "ipaddress",
        "macaddress",
        "architecture",
        "operatingsystem",
        "operatingsystemrelease",
        "osfamily",
        "puppetversion",
        "clientversion",
        "aio_agent_version",
        "facterversion",
        "virtual",
        "is_virtual",
        "timezone",
        "uptime",
        "uptime_seconds",
        "uptime_days",
      ],
    };
  }

  /**
   * List available reports
   * Implements ReportsCapability.reportsList
   */
  async reportsList(params: ReportsListParams): Promise<ReportListResult> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:reportsList");

    try {
      this.logger.debug("Listing reports (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "reportsList",
        metadata: { nodeId: params.nodeId, limit: params.limit, offset: params.offset },
      });

      let reports: Report[];

      if (params.nodeId) {
        // Get reports for specific node
        reports = await this.puppetDBService.getNodeReports(
          params.nodeId,
          params.limit || 100,
          params.offset || 0
        );
      } else {
        // Get all reports
        reports = await this.puppetDBService.getAllReports(
          params.limit || 100,
          params.offset || 0
        );
      }

      // Filter by status if specified
      if (params.status) {
        reports = reports.filter(r => r.status === params.status);
      }

      // Filter by time range if specified
      if (params.startTime) {
        const startTime = new Date(params.startTime);
        reports = reports.filter(r => new Date(r.start_time) >= startTime);
      }
      if (params.endTime) {
        const endTime = new Date(params.endTime);
        reports = reports.filter(r => new Date(r.end_time) <= endTime);
      }

      // Convert to standardized format
      const standardReports: StandardReport[] = reports.map(r => ({
        id: r.hash,
        nodeId: r.certname,
        nodeName: r.certname,
        timestamp: r.end_time,
        status: r.status as "success" | "failed" | "changed" | "unchanged",
        environment: r.environment,
        configurationVersion: r.configuration_version,
        metrics: {
          total: r.resource_events?.length,
          executionTime: (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000,
        },
        metadata: {
          noop: r.noop,
          puppet_version: r.puppet_version,
          report_format: r.report_format,
          transaction_uuid: r.transaction_uuid,
        },
      }));

      complete({ reportCount: standardReports.length });
      return {
        reports: standardReports,
        total: standardReports.length,
        offset: params.offset || 0,
        limit: params.limit || 100,
      };
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get specific report by ID
   * Implements ReportsCapability.reportsGet
   */
  async reportsGet(params: ReportsGetParams): Promise<StandardReport | null> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:reportsGet");

    try {
      this.logger.debug("Getting report (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "reportsGet",
        metadata: { reportId: params.reportId },
      });

      const report = await this.puppetDBService.getReport(params.reportId);

      if (!report) {
        complete({ reportId: params.reportId, found: false });
        return null;
      }

      // Convert to standardized format
      const standardReport: StandardReport = {
        id: report.hash,
        nodeId: report.certname,
        nodeName: report.certname,
        timestamp: report.end_time,
        status: report.status as "success" | "failed" | "changed" | "unchanged",
        environment: report.environment,
        configurationVersion: report.configuration_version,
        metrics: {
          total: report.resource_events?.length,
          executionTime: (new Date(report.end_time).getTime() - new Date(report.start_time).getTime()) / 1000,
        },
        resourceChanges: report.resource_events?.map((e: any) => ({
          resourceType: e.resource_type,
          resourceTitle: e.resource_title,
          status: e.status,
          changed: e.status === "success" && e.old_value !== e.new_value,
          events: [{
            message: e.message || "",
            status: e.status,
            timestamp: e.timestamp,
          }],
        })),
        logs: report.logs?.map((l: any) => l.message || String(l)),
        metadata: {
          noop: report.noop,
          puppet_version: report.puppet_version,
          report_format: report.report_format,
          transaction_uuid: report.transaction_uuid,
        },
      };

      complete({ reportId: params.reportId, found: true });
      return standardReport;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Query reports with advanced filters
   * Implements ReportsCapability.reportsQuery
   */
  async reportsQuery(params: ReportsQueryParams): Promise<ReportListResult> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:reportsQuery");

    try {
      this.logger.debug("Querying reports (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "reportsQuery",
        metadata: { filters: params.filters, limit: params.limit, offset: params.offset },
      });

      // Get all reports and filter in memory
      // In a production implementation, this would use PQL queries for efficiency
      let reports = await this.puppetDBService.getAllReports(
        params.limit || 100,
        params.offset || 0
      );

      // Apply filters
      reports = reports.filter(report => {
        for (const [key, value] of Object.entries(params.filters)) {
          if ((report as any)[key] !== value) {
            return false;
          }
        }
        return true;
      });

      // Convert to standardized format
      const standardReports: StandardReport[] = reports.map(r => ({
        id: r.hash,
        nodeId: r.certname,
        nodeName: r.certname,
        timestamp: r.end_time,
        status: r.status as "success" | "failed" | "changed" | "unchanged",
        environment: r.environment,
        configurationVersion: r.configuration_version,
        metrics: {
          total: r.resource_events?.length,
          executionTime: (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000,
        },
        metadata: {
          noop: r.noop,
          puppet_version: r.puppet_version,
          report_format: r.report_format,
          transaction_uuid: r.transaction_uuid,
        },
      }));

      complete({ reportCount: standardReports.length });
      return {
        reports: standardReports,
        total: standardReports.length,
        offset: params.offset || 0,
        limit: params.limit || 100,
      };
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List events for a node
   * Implements EventsCapability.eventsList
   */
  async eventsList(params: EventsListParams): Promise<EventListResult> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:eventsList");

    try {
      this.logger.debug("Listing events (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "eventsList",
        metadata: { nodeId: params.nodeId, limit: params.limit, offset: params.offset },
      });

      const filters: EventFilters = {
        status: params.status,
        resourceType: params.eventType, // Map eventType to resourceType
        startTime: params.startTime,
        endTime: params.endTime,
        limit: params.limit,
      };

      const events = await this.puppetDBService.queryEvents(params.nodeId, filters);

      // Convert to standardized format
      const standardEvents: StandardEvent[] = events.map(e => ({
        id: `${e.certname}-${e.timestamp}-${e.resource_type}-${e.resource_title}`,
        nodeId: e.certname,
        nodeName: e.certname,
        timestamp: e.timestamp,
        eventType: e.resource_type,
        status: e.status as "success" | "failure" | "noop" | "skipped",
        resourceType: e.resource_type,
        resourceTitle: e.resource_title,
        message: e.message,
        property: e.property,
        oldValue: e.old_value,
        newValue: e.new_value,
        reportId: e.report,
        metadata: {
          file: e.file,
          line: e.line,
        },
      }));

      complete({ eventCount: standardEvents.length });
      return {
        events: standardEvents,
        total: standardEvents.length,
        offset: params.offset || 0,
        limit: params.limit || 100,
      };
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Stream live events
   * Implements EventsCapability.eventsStream
   *
   * Note: PuppetDB doesn't support real-time streaming, so this polls for new events
   */
  async eventsStream(params: EventsStreamParams, callback: EventStreamCallback): Promise<void> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:eventsStream");

    try {
      this.logger.debug("Streaming events (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "eventsStream",
        metadata: { nodeId: params.nodeId, eventTypes: params.eventTypes },
      });

      // PuppetDB doesn't support real-time streaming
      // This is a placeholder that would need to be implemented with polling or webhooks
      this.logger.warn("Event streaming not yet implemented for PuppetDB", {
        component: "PuppetDBPlugin",
        operation: "eventsStream",
      });

      complete({ implemented: false });
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Query events with advanced filters
   * Implements EventsCapability.eventsQuery
   */
  async eventsQuery(params: EventsQueryParams): Promise<EventListResult> {
    const complete = this.performanceMonitor.startTimer("puppetdb:v1:eventsQuery");

    try {
      this.logger.debug("Querying events (standardized interface)", {
        component: "PuppetDBPlugin",
        operation: "eventsQuery",
        metadata: { filters: params.filters, limit: params.limit, offset: params.offset },
      });

      // Extract nodeId from filters if present
      const nodeId = params.filters.nodeId as string || params.filters.certname as string;

      if (!nodeId) {
        throw new Error("nodeId or certname is required in filters");
      }

      const filters: EventFilters = {
        status: params.filters.status as any,
        resourceType: params.filters.resourceType as string,
        startTime: params.filters.startTime as string,
        endTime: params.filters.endTime as string,
        limit: params.limit,
      };

      const events = await this.puppetDBService.queryEvents(nodeId, filters);

      // Convert to standardized format
      const standardEvents: StandardEvent[] = events.map(e => ({
        id: `${e.certname}-${e.timestamp}-${e.resource_type}-${e.resource_title}`,
        nodeId: e.certname,
        nodeName: e.certname,
        timestamp: e.timestamp,
        eventType: e.resource_type,
        status: e.status as "success" | "failure" | "noop" | "skipped",
        resourceType: e.resource_type,
        resourceTitle: e.resource_title,
        message: e.message,
        property: e.property,
        oldValue: e.old_value,
        newValue: e.new_value,
        reportId: e.report,
        metadata: {
          file: e.file,
          line: e.line,
        },
      }));

      complete({ eventCount: standardEvents.length });
      return {
        events: standardEvents,
        total: standardEvents.length,
        offset: params.offset || 0,
        limit: params.limit || 100,
      };
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // =========================================================================
  // Legacy Bridge Methods (for backward compatibility)
  // =========================================================================

  /**
   * Get the underlying PuppetDBService instance
   * @deprecated Use capability handlers instead
   */
  getPuppetDBService(): PuppetDBServiceInterface {
    return this.puppetDBService;
  }
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for creating PuppetDBPlugin instances
 */
export function createPuppetDBPlugin(
  puppetDBService: PuppetDBServiceInterface,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): PuppetDBPlugin {
  return new PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}

export default PuppetDBPlugin;
