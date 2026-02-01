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
 * @module integrations/puppetdb/PuppetDBPlugin
 * @version 1.0.0
 */

import type { ZodSchema } from "zod";
import { z } from "zod";
import {
  IntegrationType,
  type BasePluginInterface,
  type PluginMetadata,
  type PluginCapability,
  type PluginWidget,
  type PluginCLICommand,
  type ExecutionContext,
  type HealthStatus,
} from "../types";
import type { PuppetDBService } from "./PuppetDBService";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import type { Node, Facts } from "../../bolt/types";
import type { Report, Catalog, Event, EventFilters, Resource } from "./types";

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

// Note: Summary stats has no parameters, so no schema needed

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
      id: "puppetdb:node-browser",
      name: "Node Browser",
      component: "./components/NodeBrowser.svelte",
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
      component: "./components/FactsExplorer.svelte",
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
      component: "./components/ReportsViewer.svelte",
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
      component: "./components/ReportsSummary.svelte",
      slots: ["dashboard", "sidebar"],
      size: "small",
      requiredCapabilities: ["puppetdb.reports.summary"],
      icon: "pie-chart",
      priority: 95,
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

  private puppetDBService: PuppetDBService;
  private logger: LoggerService;
  private performanceMonitor: PerformanceMonitorService;
  private config: PuppetDBPluginConfig = {};
  private _initialized = false;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    puppetDBService: PuppetDBService,
    logger: LoggerService,
    performanceMonitor: PerformanceMonitorService,
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
      // PQL Query Execution
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

      // Node Listing
      {
        category: "inventory",
        name: "puppetdb.nodes",
        description: "List nodes from PuppetDB inventory",
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

      // Node Facts
      {
        category: "info",
        name: "puppetdb.facts",
        description: "Get facts for a specific node from PuppetDB",
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

      // Node Reports
      {
        category: "info",
        name: "puppetdb.reports",
        description: "Get Puppet reports for a specific node",
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

      // Specific Report
      {
        category: "info",
        name: "puppetdb.report",
        description: "Get a specific Puppet report by hash",
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

      // Reports Summary
      {
        category: "info",
        name: "puppetdb.reports.summary",
        description: "Get aggregated summary of recent Puppet reports",
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

      // All Reports
      {
        category: "info",
        name: "puppetdb.reports.all",
        description: "Get all recent Puppet reports across all nodes",
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

      // Node Events
      {
        category: "info",
        name: "puppetdb.events",
        description: "Get Puppet events for a specific node",
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

      // Node Catalog
      {
        category: "info",
        name: "puppetdb.catalog",
        description: "Get the Puppet catalog for a specific node",
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

      // Catalog Resources
      {
        category: "info",
        name: "puppetdb.catalog.resources",
        description: "Get catalog resources organized by type",
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

  // =========================================================================
  // Legacy Bridge Methods (for backward compatibility)
  // =========================================================================

  /**
   * Get the underlying PuppetDBService instance
   * @deprecated Use capability handlers instead
   */
  getPuppetDBService(): PuppetDBService {
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
  puppetDBService: PuppetDBService,
  logger: LoggerService,
  performanceMonitor: PerformanceMonitorService,
): PuppetDBPlugin {
  return new PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}

export default PuppetDBPlugin;
