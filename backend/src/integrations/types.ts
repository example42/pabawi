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
import type { Node, Facts, ExecutionResult } from "../bolt/types";

// =============================================================================
// v1.0.0 TYPES - New Plugin Architecture
// =============================================================================

/**
 * Integration types categorizing plugin functionality
 * Used for UI organization, menu grouping, and capability discovery
 */
export enum IntegrationType {
  /** Infrastructure provisioning (Terraform, CloudFormation) */
  Provisioning = "Provisioning",
  /** Configuration management (Puppet, Ansible, Chef) */
  ConfigurationManagement = "ConfigurationManagement",
  /** Inventory and node discovery sources */
  InventorySource = "InventorySource",
  /** Remote command/task execution (Bolt, Ansible, SSH) */
  RemoteExecution = "RemoteExecution",
  /** Software installation via package managers (Bolt, Ansible, remote-ssh with apt/yum/brew detection) */
  InstallSoftware = "InstallSoftware",
  /** Information retrieval (PuppetDB facts, inventory data, node metadata) */
  Info = "Info",
  /** Monitoring and metrics collection */
  Monitoring = "Monitoring",
  /** Workflow orchestration */
  Orchestration = "Orchestration",
  /** Secret and credential management */
  SecretManagement = "SecretManagement", #pragma: allowlist secret
  /** Reporting and analytics */
  ReportingAnalytics = "ReportingAnalytics",
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
 * v1.0.0 Base Plugin Interface
 *
 * All plugins must implement this interface. It provides:
 * - Metadata for discovery and dependency resolution
 * - Capabilities for functionality
 * - Optional widgets for frontend UI
 * - Optional CLI commands
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

// =============================================================================
// LEGACY TYPES - Deprecated in v1.0.0
// These interfaces are maintained for backward compatibility during migration
// They will be removed in v2.0.0
// =============================================================================

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
 * Configuration for an integration plugin
 * @deprecated Use BasePluginInterface with PluginMetadata in v1.0.0
 */
export interface IntegrationConfig {
  enabled: boolean;
  name: string;
  type: "execution" | "information" | "both";
  config: Record<string, unknown>;
  priority?: number; // For ordering when multiple sources provide same data
}

/**
 * Capability that an execution tool can perform
 * @deprecated Use PluginCapability in v1.0.0 for richer capability definitions
 */
export interface Capability {
  name: string;
  description: string;
  parameters?: CapabilityParameter[];
}

/**
 * Parameter definition for a capability
 * @deprecated Use ArgumentDefinition in v1.0.0
 */
export interface CapabilityParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description?: string;
  default?: unknown;
}

/**
 * Action to be executed by an execution tool
 * @deprecated Use capability handler params directly in v1.0.0
 */
export interface Action {
  type: "command" | "task" | "plan" | "script";
  target: string | string[];
  action: string;
  parameters?: Record<string, unknown>;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all integration plugins
 * @deprecated Use BasePluginInterface in v1.0.0
 */
export interface IntegrationPlugin {
  /** Unique name of the integration */
  name: string;

  /** Type of integration */
  type: "execution" | "information" | "both";

  /**
   * Initialize the plugin with configuration
   * @param config - Integration configuration
   */
  initialize(config: IntegrationConfig): Promise<void>;

  /**
   * Check the health status of the integration
   * @returns Health status information
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Get the current configuration
   * @returns Current integration configuration
   */
  getConfig(): IntegrationConfig;

  /**
   * Check if the plugin is initialized and ready
   * @returns true if initialized, false otherwise
   */
  isInitialized(): boolean;
}

/**
 * Interface for execution tool plugins (e.g., Bolt, Ansible)
 * @deprecated Use BasePluginInterface with capabilities in v1.0.0
 * Register capabilities with riskLevel: 'execute' instead
 */
export interface ExecutionToolPlugin extends IntegrationPlugin {
  type: "execution" | "both";

  /**
   * Execute an action on target nodes
   * @param action - Action to execute
   * @returns Execution result
   */
  executeAction(action: Action): Promise<ExecutionResult>;

  /**
   * List capabilities supported by this execution tool
   * @returns Array of capabilities
   */
  listCapabilities(): Capability[];
}

/**
 * Interface for information source plugins (e.g., PuppetDB, cloud APIs)
 * @deprecated Use BasePluginInterface with capabilities in v1.0.0
 * Register capabilities like 'inventory.list', 'facts.query' instead
 */
export interface InformationSourcePlugin extends IntegrationPlugin {
  type: "information" | "both";

  /**
   * Get inventory of nodes from this source
   * @returns Array of nodes
   */
  getInventory(): Promise<Node[]>;

  /**
   * Get facts for a specific node
   * @param nodeId - Node identifier
   * @returns Facts for the node
   */
  getNodeFacts(nodeId: string): Promise<Facts>;

  /**
   * Get arbitrary data for a node
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve (e.g., 'reports', 'catalog', 'events')
   * @returns Data of the requested type
   */
  getNodeData(nodeId: string, dataType: string): Promise<unknown>;
}

/**
 * Plugin registration information
 * @deprecated Use PluginRegistrationV1 in v1.0.0
 */
export interface PluginRegistration {
  plugin: IntegrationPlugin;
  config: IntegrationConfig;
  registeredAt: string;
}
