/**
 * Hiera Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (lookup, keys, hierarchy, scan, analysis)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 * - Optional PuppetDB dependency for node facts
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (HieraService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/hiera/backend/HieraPlugin
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
  integrationTypes?: string[];
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
   * Get lightweight summary data for home page tile
   * Must return in under 500ms with minimal data
   */
  getSummary(): Promise<{
    pluginName: string;
    displayName: string;
    metrics: Record<string, number | string>;
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
    description: string;
    data: unknown;
    healthy: boolean;
    lastUpdate: string;
    capabilities: string[];
  }>;
}

// =============================================================================
// Service interfaces - Define what we need from injected services
// =============================================================================

/** Hiera key interface */
interface HieraKey {
  name: string;
  locations: HieraKeyLocation[];
  valueTypes: string[];
  firstSeen: string;
  lastModified: string;
}

/** Hiera key location interface */
interface HieraKeyLocation {
  file: string;
  line: number;
  value: unknown;
  valueType: string;
  hierarchyLevel: string;
}

/** Hiera key index interface */
interface HieraKeyIndex {
  keys: Map<string, HieraKey>;
  files: Map<string, unknown>;
  lastScan: string;
  totalKeys: number;
  totalFiles: number;
}

/** Hiera resolution interface */
interface HieraResolution {
  found: boolean;
  key: string;
  value?: unknown;
  source?: string;
  hierarchyLevel?: string;
  interpolated?: boolean;
  lookupPath?: string[];
}

/** Node Hiera data interface */
interface NodeHieraData {
  node: string;
  keys: Map<string, unknown>;
  hierarchyFiles: HierarchyFileInfo[];
  usedKeys: string[];
  unusedKeys: string[];
}

/** Hierarchy file info interface */
interface HierarchyFileInfo {
  path: string;
  exists: boolean;
  level: string;
  keyCount?: number;
}

/** Key node values interface */
interface KeyNodeValues {
  node: string;
  value: unknown;
  source: string;
  hierarchyLevel: string;
}

/** Code analysis result interface */
interface CodeAnalysisResult {
  lintIssues: unknown[];
  moduleUpdates: unknown[];
  unusedCode: unknown;
  statistics: unknown;
  lastAnalysis: string;
}

/** HieraService interface - what we need from the injected service */
interface HieraServiceInterface {
  isInitialized(): boolean;
  getAllKeys(): Promise<HieraKeyIndex>;
  searchKeys(query: string): Promise<HieraKey[]>;
  resolveKey(node: string, key: string, environment?: string): Promise<HieraResolution>;
  getNodeHieraData(node: string): Promise<NodeHieraData>;
  getKeyValuesAcrossNodes(key: string): Promise<KeyNodeValues[]>;
  getHieraConfig(): unknown;
  invalidateCache(): void;
  shutdown(): void;
}

/** CodeAnalyzer interface - what we need from the injected service */
interface CodeAnalyzerInterface {
  analyze(): Promise<CodeAnalysisResult>;
  clearCache(): void;
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
 * Schema for Hiera key lookup
 */
const HieraLookupSchema = z.object({
  node: z.string().min(1).describe("Node certname to resolve key for"),
  key: z.string().min(1).describe("Hiera key to lookup"),
  environment: z.string().optional().describe("Puppet environment (default: production)"),
  lookupMethod: z.enum(["first", "unique", "hash", "deep"]).optional().default("first")
    .describe("Merge strategy for lookup"),
});

/**
 * Schema for listing/searching Hiera keys
 */
const HieraKeysSchema = z.object({
  query: z.string().optional().describe("Search query (regex or glob pattern)"),
  limit: z.number().optional().default(100).describe("Maximum number of keys to return"),
  offset: z.number().optional().default(0).describe("Number of keys to skip"),
});

/**
 * Schema for getting key details
 */
const HieraKeyDetailSchema = z.object({
  key: z.string().min(1).describe("Hiera key name"),
});

/**
 * Schema for hierarchy info
 */
const HieraHierarchySchema = z.object({
  node: z.string().optional().describe("Node to resolve hierarchy paths for"),
  environment: z.string().optional().describe("Puppet environment"),
});

/**
 * Schema for scanning hieradata
 */
const HieraScanSchema = z.object({
  refresh: z.boolean().optional().default(false).describe("Force rescan of hieradata"),
});

/**
 * Schema for node Hiera data
 */
const NodeHieraDataSchema = z.object({
  node: z.string().min(1).describe("Node certname"),
});

/**
 * Schema for key values across nodes
 */
const KeyValuesAcrossNodesSchema = z.object({
  key: z.string().min(1).describe("Hiera key to lookup across all nodes"),
});

/**
 * Schema for code analysis
 */
const CodeAnalysisSchema = z.object({
  refresh: z.boolean().optional().default(false).describe("Force re-analysis"),
  includeLint: z.boolean().optional().default(true).describe("Include lint issues"),
  includeModuleUpdates: z.boolean().optional().default(true).describe("Check for module updates"),
});

// =============================================================================
// Plugin Configuration
// =============================================================================

/**
 * Hiera plugin configuration schema
 */
export const HieraPluginConfigSchema = z.object({
  controlRepoPath: z.string().describe("Path to Puppet control repository"),
  hieraConfigPath: z.string().optional().default("hiera.yaml").describe("Path to hiera.yaml relative to control repo"),
  environments: z.array(z.string()).optional().default(["production"]).describe("Available Puppet environments"),
  factSources: z.object({
    preferPuppetDB: z.boolean().optional().default(true).describe("Prefer PuppetDB for facts"),
    localFactsPath: z.string().optional().describe("Path to local facts directory"),
  }).optional().default({ preferPuppetDB: true }),
  cache: z.object({
    enabled: z.boolean().optional().default(true),
    ttl: z.number().optional().default(300000).describe("Cache TTL in ms (default: 5 min)"),
    maxEntries: z.number().optional().default(1000).describe("Maximum cache entries"),
  }).optional().default({ enabled: true, ttl: 300000, maxEntries: 1000 }),
});

export type HieraPluginConfig = z.infer<typeof HieraPluginConfigSchema>;

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Hiera Plugin v1.0.0
 *
 * Provides Hiera integration with capability-based architecture:
 * - hiera.lookup: Resolve a Hiera key for a specific node
 * - hiera.keys: List or search Hiera keys
 * - hiera.key: Get details for a specific key
 * - hiera.hierarchy: Get hierarchy information
 * - hiera.scan: Scan hieradata files
 * - hiera.node: Get all Hiera data for a node
 * - hiera.values: Get key values across all nodes
 * - hiera.analysis: Get code analysis results
 */
export class HieraPlugin implements BasePluginInterface {
  // =========================================================================
  // Plugin Metadata
  // =========================================================================

  readonly metadata: PluginMetadata = {
    name: "hiera",
    version: "1.0.0",
    author: "Pabawi Team",
    description: "Puppet Hiera integration for hierarchical data lookup, key resolution, and code analysis",
    integrationType: IntegrationType.ConfigurationManagement,
    integrationTypes: [IntegrationType.ConfigurationManagement, IntegrationType.Info],
    homepage: "https://puppet.com/docs/puppet/latest/hiera.html",
    color: "#C1272D", // Hiera red
    icon: "layers",
    tags: ["hiera", "puppet", "configuration", "hierarchy", "yaml", "eyaml"],
    minPabawiVersion: "1.0.0",
    dependencies: [], // PuppetDB is optional for facts
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
      id: "hiera:home-widget",
      name: "Hiera Summary",
      component: "./frontend/HomeWidget.svelte",
      slots: ["home-summary"],
      size: "medium",
      requiredCapabilities: ["hiera.keys"],
      icon: "layers",
      priority: 80,
    },
    {
      id: "hiera:explorer",
      name: "Hiera Explorer",
      component: "./frontend/HieraExplorer.svelte",
      slots: ["dashboard", "standalone-page"],
      size: "large",
      requiredCapabilities: ["hiera.keys", "hiera.lookup"],
      icon: "layers",
      priority: 100,
      config: {
        showSearch: true,
        showFilters: true,
        showHierarchy: true,
      },
    },
    {
      id: "hiera:key-lookup",
      name: "Key Lookup",
      component: "./frontend/KeyLookup.svelte",
      slots: ["node-detail", "modal", "sidebar"],
      size: "medium",
      requiredCapabilities: ["hiera.lookup"],
      icon: "search",
      priority: 90,
      config: {
        showHistory: true,
        showInterpolation: true,
      },
    },
    {
      id: "hiera:hierarchy-viewer",
      name: "Hierarchy Viewer",
      component: "./frontend/HierarchyViewer.svelte",
      slots: ["node-detail", "standalone-page"],
      size: "medium",
      requiredCapabilities: ["hiera.hierarchy"],
      icon: "git-branch",
      priority: 85,
    },
    {
      id: "hiera:node-data",
      name: "Node Hiera Data",
      component: "./frontend/NodeHieraData.svelte",
      slots: ["node-detail"],
      size: "large",
      requiredCapabilities: ["hiera.node"],
      icon: "file-text",
      priority: 80,
      config: {
        showUsedKeys: true,
        showUnusedKeys: true,
      },
    },
    {
      id: "hiera:code-analysis",
      name: "Code Analysis",
      component: "./frontend/CodeAnalysis.svelte",
      slots: ["dashboard", "standalone-page"],
      size: "large",
      requiredCapabilities: ["hiera.analysis"],
      icon: "check-circle",
      priority: 70,
      config: {
        showLintIssues: true,
        showModuleUpdates: true,
        showStatistics: true,
      },
    },
    {
      id: "hiera:key-values-grid",
      name: "Key Values Grid",
      component: "./frontend/KeyValuesGrid.svelte",
      slots: ["standalone-page", "modal"],
      size: "full",
      requiredCapabilities: ["hiera.values"],
      icon: "grid",
      priority: 75,
    },
  ];

  // =========================================================================
  // CLI Commands
  // =========================================================================

  readonly cliCommands: PluginCLICommand[] = [
    {
      name: "hiera",
      actions: [
        {
          name: "lookup",
          capability: "hiera.lookup",
          description: "Lookup a Hiera key for a specific node",
          aliases: ["get", "resolve"],
          examples: [
            "pab hiera lookup --node web-01 --key ntp_servers",
            "pab hiera lookup --node db-server --key mysql::config --environment production",
            "pab hiera lookup --node app-01 --key packages --lookup-method deep",
          ],
        },
        {
          name: "keys",
          capability: "hiera.keys",
          description: "List or search Hiera keys",
          aliases: ["list", "search"],
          examples: [
            "pab hiera keys",
            "pab hiera keys --query 'ntp*'",
            "pab hiera keys --query 'password' --limit 20",
          ],
        },
        {
          name: "key",
          capability: "hiera.key",
          description: "Get details for a specific Hiera key",
          aliases: ["show", "info"],
          examples: [
            "pab hiera key ntp_servers",
            "pab hiera key mysql::server::root_password",
          ],
        },
        {
          name: "hierarchy",
          capability: "hiera.hierarchy",
          description: "Show Hiera hierarchy configuration",
          examples: [
            "pab hiera hierarchy",
            "pab hiera hierarchy --node web-01",
          ],
        },
        {
          name: "scan",
          capability: "hiera.scan",
          description: "Scan hieradata files for keys",
          aliases: ["rescan", "index"],
          examples: [
            "pab hiera scan",
            "pab hiera scan --refresh",
          ],
        },
        {
          name: "node",
          capability: "hiera.node",
          description: "Get all Hiera data for a node",
          aliases: ["node-data"],
          examples: [
            "pab hiera node web-01",
            "pab hiera node db-server --format json",
          ],
        },
        {
          name: "values",
          capability: "hiera.values",
          description: "Get values for a key across all nodes",
          aliases: ["compare", "diff"],
          examples: [
            "pab hiera values ntp_servers",
            "pab hiera values mysql::config --format table",
          ],
        },
        {
          name: "analysis",
          capability: "hiera.analysis",
          description: "Run code analysis on control repository",
          aliases: ["analyze", "lint"],
          examples: [
            "pab hiera analysis",
            "pab hiera analysis --refresh --include-lint",
          ],
        },
      ],
    },
  ];

  // =========================================================================
  // Configuration
  // =========================================================================

  readonly configSchema: ZodSchema = HieraPluginConfigSchema;

  readonly defaultPermissions: Record<string, string[]> = {
    "hiera.lookup": ["admin", "operator", "viewer"],
    "hiera.keys": ["admin", "operator", "viewer"],
    "hiera.key": ["admin", "operator", "viewer"],
    "hiera.hierarchy": ["admin", "operator", "viewer"],
    "hiera.scan": ["admin", "operator"],
    "hiera.node": ["admin", "operator", "viewer"],
    "hiera.values": ["admin", "operator", "viewer"],
    "hiera.analysis": ["admin", "operator"],
  };

  // =========================================================================
  // Private State
  // =========================================================================

  private hieraService: HieraServiceInterface | null = null;
  private codeAnalyzer: CodeAnalyzerInterface | null = null;
  private logger: LoggerServiceInterface;
  private performanceMonitor: PerformanceMonitorServiceInterface;
  private config: HieraPluginConfig = {} as HieraPluginConfig;
  private _initialized = false;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    logger: LoggerServiceInterface,
    performanceMonitor: PerformanceMonitorServiceInterface,
  ) {
    this.logger = logger;
    this.performanceMonitor = performanceMonitor;

    // Initialize capabilities array with bound handlers
    this.capabilities = this.createCapabilities();
  }

  // =========================================================================
  // Dependency Injection
  // =========================================================================

  /**
   * Set the HieraService instance
   */
  setHieraService(service: HieraServiceInterface): void {
    this.hieraService = service;
  }

  /**
   * Set the CodeAnalyzer instance
   */
  setCodeAnalyzer(analyzer: CodeAnalyzerInterface): void {
    this.codeAnalyzer = analyzer;
  }

  // =========================================================================
  // Capability Factory
  // =========================================================================

  /**
   * Create capability definitions with bound handlers
   */
  private createCapabilities(): PluginCapability[] {
    return [
      // Hiera Key Lookup
      {
        category: "config",
        name: "hiera.lookup",
        description: "Resolve a Hiera key for a specific node using the hierarchy",
        handler: this.lookupKey.bind(this),
        requiredPermissions: ["hiera.lookup"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: { type: "string", description: "Node certname to resolve key for", required: true },
            key: { type: "string", description: "Hiera key to lookup", required: true },
            environment: { type: "string", description: "Puppet environment (default: production)", required: false, default: "production" },
            lookupMethod: { type: "string", description: "Merge strategy: first, unique, hash, deep", required: false, default: "first", choices: ["first", "unique", "hash", "deep"] },
          },
          returns: { type: "HieraResolution", description: "Resolution result with value, source file, and hierarchy level" },
        },
      },

      // List/Search Keys
      {
        category: "config",
        name: "hiera.keys",
        description: "List or search Hiera keys in the hieradata",
        handler: this.listKeys.bind(this),
        requiredPermissions: ["hiera.keys"],
        riskLevel: "read",
        schema: {
          arguments: {
            query: { type: "string", description: "Search query (regex or glob pattern)", required: false },
            limit: { type: "number", description: "Maximum number of keys to return", required: false, default: 100 },
            offset: { type: "number", description: "Number of keys to skip", required: false, default: 0 },
          },
          returns: { type: "HieraKeyIndex", description: "Index of matching Hiera keys" },
        },
      },

      // Get Key Details
      {
        category: "config",
        name: "hiera.key",
        description: "Get detailed information about a specific Hiera key",
        handler: this.getKeyDetails.bind(this),
        requiredPermissions: ["hiera.key", "hiera.keys"],
        riskLevel: "read",
        schema: {
          arguments: {
            key: { type: "string", description: "Hiera key name", required: true },
          },
          returns: { type: "HieraKey", description: "Key details including all locations and values" },
        },
      },

      // Hierarchy Information
      {
        category: "config",
        name: "hiera.hierarchy",
        description: "Get Hiera hierarchy configuration and resolved paths",
        handler: this.getHierarchy.bind(this),
        requiredPermissions: ["hiera.hierarchy"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: { type: "string", description: "Node to resolve hierarchy paths for (optional)", required: false },
            environment: { type: "string", description: "Puppet environment", required: false, default: "production" },
          },
          returns: { type: "HierarchyInfo", description: "Hierarchy configuration and resolved file paths" },
        },
      },

      // Scan Hieradata
      {
        category: "config",
        name: "hiera.scan",
        description: "Scan hieradata files and build key index",
        handler: this.scanHieradata.bind(this),
        requiredPermissions: ["hiera.scan"],
        riskLevel: "read",
        schema: {
          arguments: {
            refresh: { type: "boolean", description: "Force rescan even if cache is valid", required: false, default: false },
          },
          returns: { type: "HieraKeyIndex", description: "Complete key index from scan" },
        },
      },

      // Node Hiera Data
      {
        category: "config",
        name: "hiera.node",
        description: "Get all Hiera data resolved for a specific node",
        handler: this.getNodeData.bind(this),
        requiredPermissions: ["hiera.node", "hiera.lookup"],
        riskLevel: "read",
        schema: {
          arguments: {
            node: { type: "string", description: "Node certname", required: true },
          },
          returns: { type: "NodeHieraData", description: "All Hiera data for the node including used/unused keys" },
        },
      },

      // Key Values Across Nodes
      {
        category: "config",
        name: "hiera.values",
        description: "Get values for a Hiera key across all nodes",
        handler: this.getKeyValuesAcrossNodes.bind(this),
        requiredPermissions: ["hiera.values", "hiera.lookup"],
        riskLevel: "read",
        schema: {
          arguments: {
            key: { type: "string", description: "Hiera key to lookup across nodes", required: true },
          },
          returns: { type: "KeyNodeValues[]", description: "Array of values per node" },
        },
      },

      // Code Analysis
      {
        category: "audit",
        name: "hiera.analysis",
        description: "Run code analysis on the Puppet control repository",
        handler: this.runCodeAnalysis.bind(this),
        requiredPermissions: ["hiera.analysis"],
        riskLevel: "read",
        schema: {
          arguments: {
            refresh: { type: "boolean", description: "Force re-analysis", required: false, default: false },
            includeLint: { type: "boolean", description: "Include lint issues in results", required: false, default: true },
            includeModuleUpdates: { type: "boolean", description: "Check for module updates", required: false, default: true },
          },
          returns: { type: "CodeAnalysisResult", description: "Analysis results including unused code, lint issues, and module updates" },
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
    const complete = this.performanceMonitor.startTimer("hiera:v1:initialization");

    try {
      this.logger.info("Initializing HieraPlugin", {
        component: "HieraPlugin",
        operation: "initialize",
      });

      // Services should be injected before initialization
      if (!this.hieraService) {
        this.logger.warn("HieraService not set - plugin will operate in limited mode", {
          component: "HieraPlugin",
          operation: "initialize",
        });
      }

      this._initialized = true;

      this.logger.info("HieraPlugin initialized successfully", {
        component: "HieraPlugin",
        operation: "initialize",
        metadata: {
          capabilitiesCount: this.capabilities.length,
          widgetsCount: this.widgets.length,
          hasHieraService: !!this.hieraService,
          hasCodeAnalyzer: !!this.codeAnalyzer,
        },
      });

      complete({ success: true });
    } catch (error) {
      this.logger.error("HieraPlugin initialization failed", {
        component: "HieraPlugin",
        operation: "initialize",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      complete({ success: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthStatus> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:healthCheck");
    const now = new Date().toISOString();

    if (!this._initialized) {
      complete({ healthy: false });
      return {
        healthy: false,
        message: "Plugin is not initialized",
        lastCheck: now,
      };
    }

    if (!this.hieraService) {
      complete({ healthy: false });
      return {
        healthy: false,
        message: "HieraService is not configured",
        lastCheck: now,
        details: {
          status: "not_configured",
        },
      };
    }

    try {
      // Check if HieraService is initialized
      if (!this.hieraService.isInitialized()) {
        complete({ healthy: false });
        return {
          healthy: false,
          message: "HieraService is not initialized",
          lastCheck: now,
          details: {
            status: "not_initialized",
          },
        };
      }

      // Get key index stats
      const keyIndex = await this.hieraService.getAllKeys();
      const hieraConfig = this.hieraService.getHieraConfig();

      complete({ healthy: true });
      return {
        healthy: true,
        message: "Hiera integration is healthy",
        lastCheck: now,
        details: {
          status: "connected",
          keyCount: keyIndex.totalKeys,
          fileCount: keyIndex.totalFiles,
          lastScan: keyIndex.lastScan,
          hieraConfigValid: !!hieraConfig,
          capabilities: this.capabilities.map((c) => c.name),
          widgetsCount: this.widgets.length,
          hasCodeAnalyzer: !!this.codeAnalyzer,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      complete({ error: errorMessage });

      return {
        healthy: false,
        message: `Hiera health check failed: ${errorMessage}`,
        lastCheck: now,
        details: {
          status: "error",
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
    this.logger.info("HieraPlugin shutting down", {
      component: "HieraPlugin",
      operation: "shutdown",
    });

    if (this.hieraService) {
      this.hieraService.shutdown();
    }

    this._initialized = false;
  }

  /**
   * Get lightweight summary data for home page tile
   * Must return in under 500ms with minimal data
   */
  async getSummary(): Promise<{
    pluginName: string;
    displayName: string;
    metrics: Record<string, number | string>;
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getSummary");
    const startTime = Date.now();
    const now = new Date().toISOString();

    try {
      this.logger.debug("Getting Hiera summary", {
        component: "HieraPlugin",
        operation: "getSummary",
      });

      // Check if service is available
      if (!this.hieraService || !this.hieraService.isInitialized()) {
        complete({ healthy: false });
        return {
          pluginName: "hiera",
          displayName: "Hiera",
          metrics: {
            keyCount: 0,
            fileCount: 0,
          },
          healthy: false,
          lastUpdate: now,
          error: "Hiera service not initialized",
        };
      }

      // Get key index (should be cached, fast)
      const keyIndex = await this.hieraService.getAllKeys();

      const duration = Date.now() - startTime;

      // Log warning if exceeds target time
      if (duration > 500) {
        this.logger.warn("getSummary exceeded target response time", {
          component: "HieraPlugin",
          operation: "getSummary",
          metadata: { durationMs: duration, targetMs: 500 },
        });
      }

      complete({ healthy: true, durationMs: duration });

      return {
        pluginName: "hiera",
        displayName: "Hiera",
        metrics: {
          keyCount: keyIndex.totalKeys,
          fileCount: keyIndex.totalFiles,
          lastScan: keyIndex.lastScan,
        },
        healthy: true,
        lastUpdate: now,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to get Hiera summary", {
        component: "HieraPlugin",
        operation: "getSummary",
        metadata: { error: errorMessage, durationMs: duration },
      });

      complete({ healthy: false, error: errorMessage });

      return {
        pluginName: "hiera",
        displayName: "Hiera",
        metrics: {
          keyCount: 0,
          fileCount: 0,
        },
        healthy: false,
        lastUpdate: now,
        error: errorMessage,
      };
    }
  }

  /**
   * Get full plugin data for plugin home page
   * Called on-demand when navigating to plugin page
   */
  async getData(): Promise<{
    pluginName: string;
    displayName: string;
    description: string;
    data: unknown;
    healthy: boolean;
    lastUpdate: string;
    capabilities: string[];
  }> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getData");
    const now = new Date().toISOString();

    try {
      this.logger.debug("Getting full Hiera data", {
        component: "HieraPlugin",
        operation: "getData",
      });

      // Check if service is available
      if (!this.hieraService || !this.hieraService.isInitialized()) {
        complete({ healthy: false });
        return {
          pluginName: "hiera",
          displayName: "Hiera",
          description: this.metadata.description,
          data: {},
          healthy: false,
          lastUpdate: now,
          capabilities: this.capabilities.map((c) => c.name),
        };
      }

      // Get comprehensive data
      const [keyIndex, hieraConfig] = await Promise.all([
        this.hieraService.getAllKeys(),
        Promise.resolve(this.hieraService.getHieraConfig()),
      ]);

      complete({ healthy: true });

      return {
        pluginName: "hiera",
        displayName: "Hiera",
        description: this.metadata.description,
        data: {
          keyIndex: {
            totalKeys: keyIndex.totalKeys,
            totalFiles: keyIndex.totalFiles,
            lastScan: keyIndex.lastScan,
            keys: Array.from(keyIndex.keys.values()).slice(0, 100), // Limit to first 100 keys
          },
          hieraConfig,
          hasCodeAnalyzer: !!this.codeAnalyzer,
        },
        healthy: true,
        lastUpdate: now,
        capabilities: this.capabilities.map((c) => c.name),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to get full Hiera data", {
        component: "HieraPlugin",
        operation: "getData",
        metadata: { error: errorMessage },
      });

      complete({ healthy: false, error: errorMessage });

      return {
        pluginName: "hiera",
        displayName: "Hiera",
        description: this.metadata.description,
        data: {},
        healthy: false,
        lastUpdate: now,
        capabilities: this.capabilities.map((c) => c.name),
      };
    }
  }

  // =========================================================================
  // Capability Handlers
  // =========================================================================

  /**
   * Lookup a Hiera key for a node
   */
  private async lookupKey(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<HieraResolution> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:lookupKey");

    try {
      this.ensureService();
      const validated = HieraLookupSchema.parse(params);

      this.logger.info("Looking up Hiera key", {
        component: "HieraPlugin",
        operation: "lookupKey",
        metadata: {
          node: validated.node,
          key: validated.key,
          environment: validated.environment,
          lookupMethod: validated.lookupMethod,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      const result = await this.hieraService!.resolveKey(
        validated.node,
        validated.key,
        validated.environment,
      );

      complete({ found: result.found });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List or search Hiera keys
   */
  private async listKeys(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<HieraKeyIndex> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:listKeys");

    try {
      this.ensureService();
      const validated = HieraKeysSchema.parse(params);

      this.logger.debug("Listing Hiera keys", {
        component: "HieraPlugin",
        operation: "listKeys",
        metadata: {
          hasQuery: !!validated.query,
          limit: validated.limit,
          offset: validated.offset,
          correlationId: context.correlationId,
        },
      });

      if (validated.query) {
        // Search keys
        const keys = await this.hieraService!.searchKeys(validated.query);
        const keyMap = new Map<string, HieraKey>();
        for (const key of keys) {
          keyMap.set(key.name, key);
        }

        complete({ keyCount: keys.length });
        return {
          keys: keyMap,
          files: new Map(),
          lastScan: new Date().toISOString(),
          totalKeys: keys.length,
          totalFiles: 0,
        };
      } else {
        // Get all keys
        const keyIndex = await this.hieraService!.getAllKeys();
        complete({ keyCount: keyIndex.totalKeys });
        return keyIndex;
      }
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get details for a specific key
   */
  private async getKeyDetails(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<HieraKey | null> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getKeyDetails");

    try {
      this.ensureService();
      const validated = HieraKeyDetailSchema.parse(params);

      this.logger.debug("Getting key details", {
        component: "HieraPlugin",
        operation: "getKeyDetails",
        metadata: {
          key: validated.key,
          correlationId: context.correlationId,
        },
      });

      const keyIndex = await this.hieraService!.getAllKeys();
      const key = keyIndex.keys.get(validated.key);

      complete({ found: !!key });
      return key ?? null;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get hierarchy information
   */
  private async getHierarchy(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<{ hierarchy: unknown; resolvedPaths?: HierarchyFileInfo[] }> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getHierarchy");

    try {
      this.ensureService();
      const validated = HieraHierarchySchema.parse(params);

      this.logger.debug("Getting hierarchy info", {
        component: "HieraPlugin",
        operation: "getHierarchy",
        metadata: {
          node: validated.node,
          environment: validated.environment,
          correlationId: context.correlationId,
        },
      });

      const hieraConfig = this.hieraService!.getHieraConfig();

      if (validated.node) {
        // Get node-specific hierarchy with resolved paths
        const nodeData = await this.hieraService!.getNodeHieraData(validated.node);
        complete({ hasNode: true });
        return {
          hierarchy: hieraConfig,
          resolvedPaths: nodeData.hierarchyFiles,
        };
      }

      complete({ hasNode: false });
      return {
        hierarchy: hieraConfig,
      };
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Scan hieradata files
   */
  private async scanHieradata(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<HieraKeyIndex> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:scanHieradata");

    try {
      this.ensureService();
      const validated = HieraScanSchema.parse(params);

      this.logger.info("Scanning hieradata", {
        component: "HieraPlugin",
        operation: "scanHieradata",
        metadata: {
          refresh: validated.refresh,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      if (validated.refresh) {
        this.hieraService!.invalidateCache();
      }

      const keyIndex = await this.hieraService!.getAllKeys();

      complete({ keyCount: keyIndex.totalKeys, fileCount: keyIndex.totalFiles });
      return keyIndex;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get all Hiera data for a node
   */
  private async getNodeData(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<NodeHieraData> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getNodeData");

    try {
      this.ensureService();
      const validated = NodeHieraDataSchema.parse(params);

      this.logger.debug("Getting node Hiera data", {
        component: "HieraPlugin",
        operation: "getNodeData",
        metadata: {
          node: validated.node,
          correlationId: context.correlationId,
        },
      });

      const nodeData = await this.hieraService!.getNodeHieraData(validated.node);

      complete({ node: validated.node, keyCount: nodeData.keys.size });
      return nodeData;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get key values across all nodes
   */
  private async getKeyValuesAcrossNodes(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<KeyNodeValues[]> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:getKeyValuesAcrossNodes");

    try {
      this.ensureService();
      const validated = KeyValuesAcrossNodesSchema.parse(params);

      this.logger.debug("Getting key values across nodes", {
        component: "HieraPlugin",
        operation: "getKeyValuesAcrossNodes",
        metadata: {
          key: validated.key,
          correlationId: context.correlationId,
        },
      });

      const values = await this.hieraService!.getKeyValuesAcrossNodes(validated.key);

      complete({ key: validated.key, nodeCount: values.length });
      return values;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Run code analysis
   */
  private async runCodeAnalysis(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<CodeAnalysisResult> {
    const complete = this.performanceMonitor.startTimer("hiera:v1:runCodeAnalysis");

    try {
      if (!this.codeAnalyzer) {
        throw new Error("CodeAnalyzer is not configured");
      }

      const validated = CodeAnalysisSchema.parse(params);

      this.logger.info("Running code analysis", {
        component: "HieraPlugin",
        operation: "runCodeAnalysis",
        metadata: {
          refresh: validated.refresh,
          includeLint: validated.includeLint,
          includeModuleUpdates: validated.includeModuleUpdates,
          correlationId: context.correlationId,
          userId: context.user?.id,
        },
      });

      if (validated.refresh) {
        this.codeAnalyzer.clearCache();
      }

      const result = await this.codeAnalyzer.analyze();

      complete({
        lintIssueCount: result.lintIssues.length,
        moduleUpdateCount: result.moduleUpdates.length,
      });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Ensure HieraService is available
   */
  private ensureService(): void {
    if (!this.hieraService) {
      throw new Error("HieraService is not configured");
    }
    if (!this.hieraService.isInitialized()) {
      throw new Error("HieraService is not initialized");
    }
  }

  // =========================================================================
  // Legacy Bridge Methods (for backward compatibility)
  // =========================================================================

  /**
   * Get the underlying HieraService instance
   * @deprecated Use capability handlers instead
   */
  getHieraService(): HieraServiceInterface | null {
    return this.hieraService;
  }

  /**
   * Get the underlying CodeAnalyzer instance
   * @deprecated Use hiera.analysis capability instead
   */
  getCodeAnalyzer(): CodeAnalyzerInterface | null {
    return this.codeAnalyzer;
  }
}

export default HieraPlugin;
