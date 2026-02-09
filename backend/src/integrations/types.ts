/**
 * Integration Plugin Types and Interfaces
 *
 * This module defines the core plugin architecture for integrating multiple
 * backend systems (execution tools and information sources) into Pabawi.
 *
 * v1.0.0 Architecture:
 * - Capability-based interface replacing type-based plugin categories
 * - Full-stack plugins: backend capabilities + frontend widgets + CLI commands
 * - RBAC integration with permission-aware capability execution
 * - Plugin metadata for versioning, dependencies, and discovery
 *
 * @module integrations/types
 * @version 1.0.0
 */

import type { ZodSchema } from "zod";

// =============================================================================
// v1.0.0 TYPES - New Plugin Architecture
// =============================================================================

/**
 * Integration types categorizing plugin functionality
 * Used for UI organization, menu grouping, and capability discovery
 *
 * Every integration type can potentially write entries to the Node Journal.
 * Journal logging is configurable per-plugin (when/what to write and logging level).
 */
export enum IntegrationType {
  /** Inventory and node discovery sources */
  InventorySource = "InventorySource",
  /** Remote command/task execution (Bolt, Ansible, SSH) */
  RemoteExecution = "RemoteExecution",
  /** Information retrieval (PuppetDB facts, inventory data, node metadata) */
  Info = "Info",
  /** Configuration management (Puppet, Ansible, Chef) */
  ConfigurationManagement = "ConfigurationManagement",
  /** Events that happened on systems (alerts, changes, incidents) */
  Event = "Event",
  /** Monitoring and metrics collection */
  Monitoring = "Monitoring",
  /** Infrastructure provisioning (Terraform, CloudFormation) */
  Provisioning = "Provisioning",
  /** Application deployment automation */
  Deployment = "Deployment",
  /** Secret and credential management */
  SecretManagement = "SecretManagement", // pragma: allowlist secret
  /** Scheduled operations and jobs */
  Schedule = "Schedule",
  /** Software installation via package managers */
  SoftwareInstall = "SoftwareInstall",
  /** Workflow orchestration */
  Orchestration = "Orchestration",
  /** Logging and analytics */
  Logging = "Logging",
  /** Audit and compliance */
  AuditCompliance = "AuditCompliance",
  /** Backup and recovery */
  BackupRecovery = "BackupRecovery",
}

/**
 * Risk level for a capability - used for permission defaults and UI warnings
 */
export type CapabilityRiskLevel = "read" | "write" | "execute" | "admin";

/**
 * Argument definition for capability schema
 * Describes a single parameter that a capability accepts
 */
export interface ArgumentDefinition {
  /** Data type of the argument */
  type: "string" | "number" | "boolean" | "array" | "object";
  /** Human-readable description */
  description: string;
  /** Whether the argument must be provided */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Allowed values for enum-like arguments */
  choices?: unknown[];
  /** Optional Zod schema for complex validation */
  validation?: ZodSchema;
}

/**
 * Schema definition for a capability's inputs and outputs
 * Enables auto-generation of CLI arguments, API validation, and UI forms
 */
export interface CapabilitySchema {
  /** Input argument definitions */
  arguments: Record<string, ArgumentDefinition>;
  /** Return value description */
  returns: {
    /** Type name of return value */
    type: string;
    /** Human-readable description */
    description: string;
    /** Optional Zod schema for return validation */
    schema?: ZodSchema;
  };
}

/**
 * Context passed to capability handlers during execution
 * Contains user info, debug context, and request metadata
 */
export interface ExecutionContext {
  /** Authenticated user executing the capability */
  user?: {
    id: string;
    username: string;
    roles: string[];
  };
  /** Debug/correlation ID for request tracing */
  correlationId?: string;
  /** Widget ID if triggered from frontend */
  widgetId?: string;
  /** Additional request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A capability that a plugin provides
 * Capabilities are the fundamental unit of plugin functionality
 *
 * @example
 * ```typescript
 * const executeCommand: PluginCapability = {
 *   category: 'command',
 *   name: 'command.execute',
 *   description: 'Execute a command on target nodes',
 *   handler: async (params, context) => { ... },
 *   requiredPermissions: ['command.execute'],
 *   riskLevel: 'execute',
 *   schema: {
 *     arguments: {
 *       command: { type: 'string', required: true, description: 'Command to run' },
 *       targets: { type: 'array', required: true, description: 'Target nodes' }
 *     },
 *     returns: { type: 'ExecutionResult', description: 'Results per target' }
 *   }
 * };
 * ```
 */
/**
 * Standard capability categories for consistent organization
 * Plugins should use these categories when possible
 */
export type CapabilityCategory =
  | "command"    // Remote command execution (shell commands)
  | "task"       // Task execution (Bolt tasks, Ansible playbooks)
  | "info"       // Information retrieval (facts, reports, catalogs)
  | "config"     // Configuration management (Hiera lookups, node classification)
  | "inventory"  // Inventory operations (list nodes, query inventory)
  | "package"    // Package/software installation
  | "file"       // File operations (upload, download, manage)
  | "service"    // Service management (start, stop, restart)
  | "user"       // User/group management
  | "audit"      // Audit and compliance operations
  | "secret"     // Secret/credential operations
  | "custom";    // Plugin-specific custom category

export interface PluginCapability {
  /**
   * Category for grouping capabilities
   * Use CapabilityCategory values for standard categories:
   * - 'command': Remote command execution
   * - 'task': Task/playbook execution
   * - 'info': Information retrieval (facts, reports)
   * - 'config': Configuration management
   * - 'inventory': Inventory operations
   * - 'package': Software installation
   * - 'file': File operations
   * - 'service': Service management
   * - 'user': User/group management
   * - 'audit': Audit operations
   * - 'secret': Secret management
   * - 'custom': Plugin-specific
   */
  category: CapabilityCategory | string;
  /** Unique capability name (e.g., 'command.execute', 'facts.query') */
  name: string;
  /** Human-readable description */
  description: string;
  /**
   * Handler function that implements the capability
   * @param params - Parameters matching the schema arguments
   * @param context - Execution context with user, correlation ID, etc.
   * @returns Promise resolving to the capability result
   */
  handler: (
    params: Record<string, unknown>,
    context: ExecutionContext,
  ) => Promise<unknown>;
  /** Permissions required to invoke this capability */
  requiredPermissions: string[];
  /** Risk level for permission defaults and UI warnings */
  riskLevel: CapabilityRiskLevel;
  /** Optional schema for argument validation and CLI generation */
  schema?: CapabilitySchema;
}

/**
 * Slot where a widget can be rendered in the frontend
 */
export type WidgetSlot =
  | "dashboard"
  | "node-detail"
  | "inventory-panel"
  | "standalone-page"
  | "sidebar"
  | "modal";

/**
 * Widget size hint for layout
 */
export type WidgetSize = "small" | "medium" | "large" | "full";

/**
 * Frontend widget definition provided by a plugin
 * Widgets are Svelte components that render in designated UI slots
 *
 * @example
 * ```typescript
 * const commandWidget: PluginWidget = {
 *   id: 'bolt:command-executor',
 *   name: 'Command Executor',
 *   component: './components/CommandExecutor.svelte',
 *   slots: ['dashboard', 'node-detail'],
 *   size: 'medium',
 *   requiredCapabilities: ['command.execute']
 * };
 * ```
 */
export interface PluginWidget {
  /** Unique widget ID (format: 'pluginName:widgetName') */
  id: string;
  /** Display name for the widget */
  name: string;
  /** Path to Svelte component relative to plugin frontend */
  component: string;
  /** UI slots where this widget can render */
  slots: WidgetSlot[];
  /** Default size hint for layout */
  size: WidgetSize;
  /** Capabilities required - widget hidden if user lacks permissions */
  requiredCapabilities: string[];
  /** Optional widget-specific configuration */
  config?: Record<string, unknown>;
  /** Optional icon name or path */
  icon?: string;
  /** Priority for ordering within a slot (higher = first) */
  priority?: number;
}

/**
 * CLI action mapped to a capability
 * Actions become subcommands under the plugin's CLI namespace
 */
export interface CLIAction {
  /** Action name (becomes subcommand, e.g., 'run', 'query') */
  name: string;
  /** Capability this action invokes */
  capability: string;
  /** Description shown in help */
  description: string;
  /** Command aliases (e.g., ['cmd'] for 'run') */
  aliases?: string[];
  /** Usage examples shown in help */
  examples?: string[];
}

/**
 * CLI command definition for a plugin
 * Enables auto-generation of CLI commands from capabilities
 *
 * @example
 * ```typescript
 * const boltCLI: PluginCLICommand = {
 *   name: 'bolt',
 *   actions: [
 *     { name: 'run', capability: 'command.execute', description: 'Run a command' },
 *     { name: 'task', capability: 'task.execute', description: 'Run a task' }
 *   ]
 * };
 * // Generates: pab bolt run <command> --targets <targets>
 * //            pab bolt task <task> --targets <targets>
 * ```
 */
export interface PluginCLICommand {
  /** Command name (becomes top-level command, e.g., 'bolt', 'puppetdb') */
  name: string;
  /** Actions (subcommands) this command provides */
  actions: CLIAction[];
}

/**
 * Plugin metadata for discovery, versioning, and dependency management
 */
export interface PluginMetadata {
  /** Unique plugin name (lowercase, alphanumeric with hyphens) */
  name: string;
  /** Semantic version (e.g., '1.0.0') */
  version: string;
  /** Author name or organization */
  author: string;
  /** Human-readable description */
  description: string;
  /** Integration type for categorization */
  integrationType: IntegrationType;
  /** Multiple integration types for multi-category plugins (e.g., RemoteExecution + InventorySource) */
  integrationTypes?: IntegrationType[];
  /** Homepage or documentation URL */
  homepage?: string;
  /** Other plugins this plugin depends on */
  dependencies?: string[];
  /** Path to frontend bundle entry point */
  frontendEntryPoint?: string;
  /** Optional color for UI theming (hex, e.g., '#FFAE1A') */
  color?: string;
  /** Optional icon name or path */
  icon?: string;
  /** Minimum Pabawi version required */
  minPabawiVersion?: string;
  /** Tags for search and filtering */
  tags?: string[];
}

/**
 * Plugin color palette for UI theming
 */
export interface PluginColors {
  /** Primary brand color */
  primary: string;
  /** Light variant for backgrounds */
  light: string;
  /** Dark variant for text/borders */
  dark: string;
}

/**
 * Plugin route handler function
 * Handles HTTP requests for plugin-specific routes
 */
export type PluginRouteHandler = (
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  next: (error?: unknown) => void
) => void | Promise<void>;

/**
 * Plugin route definition
 * Defines a custom route that a plugin wants to register
 */
export interface PluginRoute {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Route path relative to /api/v1/plugins/:pluginName/ (e.g., 'custom-action', 'data/:id') */
  path: string;
  /** Handler function for this route */
  handler: PluginRouteHandler;
  /** Description of what this route does */
  description?: string;
  /** Required permissions to access this route */
  requiredPermissions?: string[];
}

/**
 * v1.0.0 Base Plugin Interface
 *
 * All plugins must implement this interface. It provides:
 * - Metadata for discovery and dependency resolution
 * - Capabilities for functionality
 * - Optional widgets for frontend UI
 * - Optional CLI commands
 * - Optional custom routes for plugin-specific endpoints
 * - Lifecycle methods (initialize, healthCheck)
 *
 * @example
 * ```typescript
 * class BoltPlugin implements BasePluginInterface {
 *   metadata = {
 *     name: 'bolt',
 *     version: '1.0.0',
 *     author: 'Pabawi Team',
 *     description: 'Puppet Bolt integration',
 *     integrationType: IntegrationType.RemoteExecution
 *   };
 *
 *   capabilities = [
 *     { name: 'command.execute', ... },
 *     { name: 'task.execute', ... }
 *   ];
 *
 *   widgets = [
 *     { id: 'bolt:command-executor', ... }
 *   ];
 *
 *   cliCommands = [
 *     { name: 'bolt', actions: [...] }
 *   ];
 *
 *   routes = [
 *     { method: 'GET', path: 'custom-data', handler: async (req, res) => { ... } }
 *   ];
 * }
 * ```
 */
export interface BasePluginInterface {
  /** Plugin metadata for discovery and versioning */
  metadata: PluginMetadata;

  /** Capabilities this plugin provides */
  capabilities: PluginCapability[];

  /** Optional frontend widgets */
  widgets?: PluginWidget[];

  /** Optional CLI commands */
  cliCommands?: PluginCLICommand[];

  /** Optional custom routes for plugin-specific endpoints */
  routes?: PluginRoute[];

  /** Optional Zod schema for plugin configuration validation */
  configSchema?: ZodSchema;

  /**
   * Default permission mapping: capability name -> role names
   * Used when RBAC config doesn't explicitly define permissions
   */
  defaultPermissions?: Record<string, string[]>;

  /**
   * Initialize the plugin
   * Called once during server startup after configuration is loaded
   * @throws Error if initialization fails (plugin will be disabled)
   */
  initialize(): Promise<void>;

  /**
   * Perform health check
   * Called periodically and on-demand for status reporting
   * @returns Health status with details
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Get lightweight summary for home page tiles
   * Must return in under 500ms with minimal data (counts, status only)
   * Called by /api/plugins/:name/summary endpoint
   * @returns Plugin summary with metrics
   */
  getSummary(): Promise<PluginSummary>;

  /**
   * Get full plugin data for plugin home pages
   * Called on-demand when navigating to plugin page
   * Can load complete data (no strict time limit like getSummary)
   * Called by /api/plugins/:name/data endpoint
   * @returns Full plugin data
   */
  getData(): Promise<PluginData>;

  /**
   * Get current plugin configuration
   * @returns Configuration object
   */
  getConfig(): Record<string, unknown>;

  /**
   * Check if plugin is initialized and ready
   * @returns true if ready to handle requests
   */
  isInitialized(): boolean;

  /**
   * Optional cleanup method called during shutdown
   */
  shutdown?(): Promise<void>;
}

/**
 * Plugin registration with runtime state
 */
export interface PluginRegistrationV1 {
  /** Plugin instance */
  plugin: BasePluginInterface;
  /** When the plugin was registered */
  registeredAt: string;
  /** Whether initialization succeeded */
  initialized: boolean;
  /** Initialization error if failed */
  initError?: string;
  /** Last health check result */
  lastHealthCheck?: HealthStatus;
}

/**
 * Health status for an integration
 */
export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: string;
  details?: Record<string, unknown>;
  /**
   * Degraded indicates partial functionality
   * When true, some features work but others fail (e.g., auth issues)
   */
  degraded?: boolean;
  /**
   * List of working capabilities when degraded
   */
  workingCapabilities?: string[];
  /**
   * List of failing capabilities when degraded
   */
  failingCapabilities?: string[];
}

/**
 * Lightweight plugin summary for home page tiles
 * Must return in under 500ms with minimal data
 */
export interface PluginSummary {
  /** Plugin identifier */
  pluginName: string;

  /** Human-readable plugin name */
  displayName: string;

  /** Summary metrics (plugin-specific counts, status, etc.) */
  metrics: Record<string, number | string | boolean>;

  /** Health status */
  healthy: boolean;

  /** Last update timestamp (ISO 8601) */
  lastUpdate: string;

  /** Optional error message if summary generation failed */
  error?: string;
}

/**
 * Full plugin data for plugin home pages
 * Called on-demand when navigating to plugin page
 * Can take longer than summary (no strict time limit)
 */
export interface PluginData {
  /** Plugin identifier */
  pluginName: string;

  /** Human-readable plugin name */
  displayName: string;

  /** Full plugin-specific data (structure varies by plugin) */
  data: unknown;

  /** Health status */
  healthy: boolean;

  /** Last update timestamp (ISO 8601) */
  lastUpdate: string;

  /** List of available capabilities */
  capabilities: string[];

  /** Optional error message if data loading failed */
  error?: string;
}

/**
 * User type for capability execution context
 * Re-exported for convenience
 */
export interface User {
  id: string;
  username: string;
  roles: string[];
}

/**
 * Facts type for node data
 * Generic key-value store for node facts
 */
export type Facts = Record<string, unknown>;

/**
 * Generic Node interface for inventory
 * Represents a node/system in the inventory from any source
 */
export interface Node {
  /** Unique node identifier */
  id: string;
  /** Display name */
  name: string;
  /** Connection URI (optional, depends on source) */
  uri?: string;
  /** Transport/connection method (optional) */
  transport?: string;
  /** Node configuration (source-specific) */
  config?: Record<string, unknown>;
  /** Source plugin that provided this node data */
  source?: string;
  /** Certificate status (for Puppet-managed nodes) */
  certificateStatus?: "signed" | "requested" | "revoked";
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of executing a command or task on a single node
 */
export interface NodeResult {
  /** Node identifier */
  nodeId: string;
  /** Execution status */
  status: "success" | "failed";
  /** Output from the execution */
  output?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  /** Return value (for tasks) */
  value?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Result of executing a command or task on target nodes
 * Generic execution result that can be used by any plugin
 */
export interface ExecutionResult {
  /** Unique execution identifier */
  id: string;
  /** Type of execution */
  type: "command" | "task" | "facts" | "puppet" | "package" | "playbook" | "script";
  /** Target node identifiers */
  targetNodes: string[];
  /** Action/command that was executed */
  action: string;
  /** Parameters passed to the action */
  parameters?: Record<string, unknown>;
  /** Overall execution status */
  status: "running" | "success" | "failed" | "partial";
  /** When execution started */
  startedAt: string;
  /** When execution completed (if finished) */
  completedAt?: string;
  /** Per-node results */
  results: NodeResult[];
  /** Error message if execution failed */
  error?: string;
  /** Original command (if applicable) */
  command?: string;
  /** Whether expert mode was enabled */
  expertMode?: boolean;
  /** Complete stdout output (when expert mode enabled) */
  stdout?: string;
  /** Complete stderr output (when expert mode enabled) */
  stderr?: string;
}
