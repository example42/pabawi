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
 */
export class PuppetDBPlugin implements BasePluginInterface {
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
