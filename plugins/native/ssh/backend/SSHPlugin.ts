/**
 * SSH Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (command, inventory)
 * - SSH config file parsing for inventory
 * - Remote command execution via SSH
 * - RBAC-aware capability handlers
 *
 * @module plugins/native/ssh/backend/SSHPlugin
 * @version 1.0.0
 */

import type { ZodSchema } from "zod";
import { z } from "zod";
import type { SSHService, Node, ExecutionResult, StreamingCallback } from "./SSHService";

// =============================================================================
// Type-only imports - These are resolved at compile time, not runtime
// =============================================================================

/** Integration type enum values */
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
  getSummary?(): Promise<{
    pluginName: string;
    displayName: string;
    metrics: Record<string, number | string | boolean>;
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }>;
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

/** Schema for command execution parameters */
const CommandExecuteSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute"),
  targets: z.union([z.string(), z.array(z.string())]).describe("Target node(s) to execute on"),
  timeout: z.number().optional().describe("Execution timeout in milliseconds"),
  environment: z.record(z.string()).optional().describe("Environment variables"),
  async: z.boolean().optional().describe("Execute asynchronously"),
  debugMode: z.boolean().optional().describe("Enable debug mode"),
});

/** Schema for script execution parameters */
const ScriptExecuteSchema = z.object({
  script: z.string().min(1).describe("Script content or path"),
  targets: z.union([z.string(), z.array(z.string())]).describe("Target node(s)"),
  scriptType: z.enum(["bash", "powershell", "python", "ruby"]).optional().describe("Script type"),
  arguments: z.array(z.string()).optional().describe("Script arguments"),
  timeout: z.number().optional().describe("Execution timeout in milliseconds"),
  environment: z.record(z.string()).optional().describe("Environment variables"),
  async: z.boolean().optional().describe("Execute asynchronously"),
  debugMode: z.boolean().optional().describe("Enable debug mode"),
});

/** Schema for inventory listing parameters */
const InventoryListSchema = z.object({
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
  groups: z.array(z.string()).optional().describe("Filter by group membership"),
});

/** Schema for inventory get parameters */
const InventoryGetSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
});

/** Schema for inventory groups parameters */
const InventoryGroupsSchema = z.object({
  refresh: z.boolean().optional().default(false).describe("Force refresh from source"),
});

/** Schema for inventory filter parameters */
const InventoryFilterSchema = z.object({
  criteria: z.record(z.unknown()).describe("Filter criteria"),
  groups: z.array(z.string()).optional().describe("Filter by group membership"),
});

// =============================================================================
// Plugin Configuration
// =============================================================================

/** SSH plugin configuration schema */
export const SSHPluginConfigSchema = z.object({
  sshConfigPath: z.string().optional().describe("Path to SSH config file"),
  executionTimeout: z.number().optional().describe("Default execution timeout in ms"),
});

export type SSHPluginConfig = z.infer<typeof SSHPluginConfigSchema>;

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * SSH Plugin v1.0.0
 *
 * Provides SSH integration with capability-based architecture:
 * - command.execute: Run shell commands on target nodes via SSH
 * - script.execute: Execute scripts on target nodes via SSH
 * - inventory.list: List nodes from SSH config
 * - inventory.get: Get specific node details
 * - inventory.groups: List available groups
 * - inventory.filter: Filter nodes by criteria
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - RemoteExecutionCapability: command.execute, script.execute
 */
export class SSHPlugin implements BasePluginInterface {
  // =========================================================================
  // Plugin Metadata
  // =========================================================================

  readonly metadata: PluginMetadata = {
    name: "ssh",
    version: "1.0.0",
    author: "Pabawi Team",
    description: "SSH integration for remote command execution and inventory management",
    integrationType: IntegrationType.RemoteExecution,
    homepage: "https://www.openssh.com/",
    color: "#4A90E2",
    icon: "terminal",
    tags: ["ssh", "remote-execution", "commands", "inventory"],
    minPabawiVersion: "1.0.0",
  };

  // =========================================================================
  // Capabilities
  // =========================================================================

  readonly capabilities: PluginCapability[];

  // =========================================================================
  // Widgets
  // =========================================================================

  readonly widgets: PluginWidget[] = [];

  // =========================================================================
  // CLI Commands
  // =========================================================================

  readonly cliCommands: PluginCLICommand[] = [
    {
      name: "ssh",
      actions: [
        {
          name: "run",
          capability: "command.execute",
          description: "Execute a command on target nodes via SSH",
          aliases: ["cmd", "exec"],
          examples: [
            'pab ssh run "uptime" --targets server1',
            'pab ssh run "hostname" --targets all',
          ],
        },
        {
          name: "inventory",
          capability: "inventory.list",
          description: "List nodes from SSH config",
          aliases: ["nodes", "inv"],
          examples: ["pab ssh inventory", "pab ssh inventory --format json"],
        },
      ],
    },
  ];

  // =========================================================================
  // Configuration
  // =========================================================================

  readonly configSchema: ZodSchema = SSHPluginConfigSchema;

  readonly defaultPermissions: Record<string, string[]> = {
    "command.execute": ["admin", "operator"],
    "script.execute": ["admin", "operator"],
    "inventory.list": ["admin", "operator", "viewer"],
    "inventory.get": ["admin", "operator", "viewer"],
    "inventory.groups": ["admin", "operator", "viewer"],
    "inventory.filter": ["admin", "operator", "viewer"],
    "ssh.command.execute": ["admin", "operator"],
    "ssh.inventory.list": ["admin", "operator", "viewer"],
  };

  // =========================================================================
  // Private State
  // =========================================================================

  private sshService: SSHService;
  private logger: LoggerServiceInterface;
  private performanceMonitor: PerformanceMonitorServiceInterface;
  private config: SSHPluginConfig = {};
  private _initialized = false;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    sshService: SSHService,
    logger: LoggerServiceInterface,
    performanceMonitor: PerformanceMonitorServiceInterface,
  ) {
    this.sshService = sshService;
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
      // Standardized Remote Execution Capabilities
      {
        category: "command",
        name: "command.execute",
        description: "Execute shell command on target nodes via SSH (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.commandExecute(params as {
          command: string;
          targets: string[];
          timeout?: number;
          environment?: Record<string, string>;
          async?: boolean;
          debugMode?: boolean;
        }),
        requiredPermissions: ["ssh.command.execute", "command.execute"],
        riskLevel: "execute",
        schema: {
          arguments: {
            command: {
              type: "string",
              description: "Shell command to execute",
              required: true,
            },
            targets: {
              type: "array",
              description: "Target node identifiers",
              required: true,
            },
            timeout: {
              type: "number",
              description: "Execution timeout in milliseconds",
              required: false,
            },
            environment: {
              type: "object",
              description: "Environment variables",
              required: false,
            },
            async: {
              type: "boolean",
              description: "Execute asynchronously",
              required: false,
            },
            debugMode: {
              type: "boolean",
              description: "Enable debug mode for detailed output",
              required: false,
            },
          },
          returns: {
            type: "ExecutionResult",
            description: "Execution result with per-node results",
          },
        },
      },

      // Script Execution
      {
        category: "command",
        name: "script.execute",
        description: "Execute script on target nodes via SSH (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.scriptExecute(params as {
          script: string;
          targets: string[];
          scriptType?: "bash" | "powershell" | "python" | "ruby";
          arguments?: string[];
          timeout?: number;
          environment?: Record<string, string>;
          async?: boolean;
          debugMode?: boolean;
        }),
        requiredPermissions: ["ssh.command.execute", "command.execute"],
        riskLevel: "execute",
        schema: {
          arguments: {
            script: {
              type: "string",
              description: "Script content or path",
              required: true,
            },
            targets: {
              type: "array",
              description: "Target node identifiers",
              required: true,
            },
            scriptType: {
              type: "string",
              description: "Script interpreter type",
              required: false,
            },
            arguments: {
              type: "array",
              description: "Script arguments",
              required: false,
            },
            timeout: {
              type: "number",
              description: "Execution timeout in milliseconds",
              required: false,
            },
            environment: {
              type: "object",
              description: "Environment variables",
              required: false,
            },
            async: {
              type: "boolean",
              description: "Execute asynchronously",
              required: false,
            },
            debugMode: {
              type: "boolean",
              description: "Enable debug mode for detailed output",
              required: false,
            },
          },
          returns: {
            type: "ExecutionResult",
            description: "Script execution result with per-node results",
          },
        },
      },

      // Standardized Inventory Capabilities
      {
        category: "inventory",
        name: "inventory.list",
        description: "List all nodes from SSH config (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryList(params as { refresh?: boolean; groups?: string[] }),
        requiredPermissions: ["ssh.inventory.list", "inventory.read"],
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
            description: "Array of nodes from SSH config",
          },
        },
      },

      {
        category: "inventory",
        name: "inventory.get",
        description: "Get specific node details from SSH config (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryGet(params as { nodeId: string }),
        requiredPermissions: ["ssh.inventory.list", "inventory.read"],
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
        description: "List available groups from SSH config (standardized interface)",
        handler: async (params: Record<string, unknown>) => this.inventoryGroups(params as { refresh?: boolean }),
        requiredPermissions: ["ssh.inventory.list", "inventory.read"],
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
        handler: async (params: Record<string, unknown>) => this.inventoryFilter(params as { criteria: Record<string, unknown>; groups?: string[] }),
        requiredPermissions: ["ssh.inventory.list", "inventory.read"],
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
    ];
  }

  // =========================================================================
  // Lifecycle Methods
  // =========================================================================

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:initialization");

    try {
      this.logger.info("Initializing SSHPlugin", {
        component: "SSHPlugin",
        operation: "initialize",
      });

      // Verify SSH config is accessible
      await this.sshService.getInventory();

      this._initialized = true;

      this.logger.info("SSHPlugin initialized successfully", {
        component: "SSHPlugin",
        operation: "initialize",
        metadata: {
          sshConfigPath: this.sshService.getSSHConfigPath(),
          capabilitiesCount: this.capabilities.length,
        },
      });

      complete({ success: true });
    } catch (error) {
      this.logger.warn("SSHPlugin initialization completed with issues", {
        component: "SSHPlugin",
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
    const complete = this.performanceMonitor.startTimer("ssh:v1:healthCheck");
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
      // Check if SSH command is available
      const { spawn } = await import("child_process");

      const sshCheck = spawn("ssh", ["-V"], { stdio: "pipe" });

      const sshAvailable = await new Promise<boolean>((resolve) => {
        let resolved = false;

        const handleClose = (code: number | null): void => {
          if (!resolved) {
            resolved = true;
            resolve(code === 0 || code === 255); // SSH -V returns 255 on some systems
          }
        };

        const handleError = (): void => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        };

        sshCheck.on("close", handleClose);
        sshCheck.on("error", handleError);

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            sshCheck.kill();
            resolve(false);
          }
        }, 5000);
      });

      if (!sshAvailable) {
        complete({ available: false });
        return {
          healthy: false,
          message: "SSH command is not available. Please install OpenSSH client.",
          lastCheck: now,
          details: {
            error: "ssh command not found",
            sshConfigPath: this.sshService.getSSHConfigPath(),
          },
        };
      }

      // Try to load inventory
      const inventory = await this.sshService.getInventory();

      complete({ available: true, nodeCount: inventory.length });
      return {
        healthy: true,
        message: `SSH is healthy. ${inventory.length} nodes in SSH config.`,
        lastCheck: now,
        details: {
          nodeCount: inventory.length,
          sshConfigPath: this.sshService.getSSHConfigPath(),
          capabilities: this.capabilities.map((c) => c.name),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      complete({ error: errorMessage });

      return {
        healthy: false,
        message: `SSH health check failed: ${errorMessage}`,
        lastCheck: now,
        details: {
          error: errorMessage,
          sshConfigPath: this.sshService.getSSHConfigPath(),
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
      sshConfigPath: this.sshService.getSSHConfigPath(),
      defaultTimeout: this.sshService.getDefaultTimeout(),
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
    this.logger.info("SSHPlugin shutting down", {
      component: "SSHPlugin",
      operation: "shutdown",
    });
    this._initialized = false;
  }

  /**
   * Get lightweight summary for home page tiles
   * Must return in under 500ms with minimal data (counts, status only)
   */
  async getSummary(): Promise<{
    pluginName: string;
    displayName: string;
    metrics: Record<string, number | string | boolean>;
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:getSummary");
    const startTime = Date.now();

    try {
      this.logger.debug("Getting plugin summary", {
        component: "SSHPlugin",
        operation: "getSummary",
      });

      // Check if plugin is initialized
      if (!this._initialized) {
        complete({ healthy: false, duration: Date.now() - startTime });
        return {
          pluginName: "ssh",
          displayName: "SSH",
          metrics: {},
          healthy: false,
          lastUpdate: new Date().toISOString(),
          error: "Plugin not initialized",
        };
      }

      // Get health status first
      const healthStatus = await this.healthCheck();

      // If unhealthy, return minimal summary
      if (!healthStatus.healthy) {
        complete({ healthy: false, duration: Date.now() - startTime });
        return {
          pluginName: "ssh",
          displayName: "SSH",
          metrics: {
            connectionCount: 0,
            activeSessions: 0,
          },
          healthy: false,
          lastUpdate: new Date().toISOString(),
          error: healthStatus.message || "SSH is unhealthy",
        };
      }

      // Fetch lightweight data - just count nodes from SSH config
      const nodes = await this.sshService.getInventory();
      const connectionCount = nodes.length;

      // Get groups count
      const groupsSet = new Set<string>();
      for (const node of nodes) {
        if (node.config.groups && Array.isArray(node.config.groups)) {
          for (const group of node.config.groups as string[]) {
            groupsSet.add(group);
          }
        }
      }
      const groupCount = groupsSet.size;

      const duration = Date.now() - startTime;

      // Log warning if exceeds target time
      if (duration > 500) {
        this.logger.warn("getSummary exceeded target response time", {
          component: "SSHPlugin",
          operation: "getSummary",
          metadata: { durationMs: duration },
        });
      }

      complete({ healthy: true, duration, connectionCount });

      return {
        pluginName: "ssh",
        displayName: "SSH",
        metrics: {
          connectionCount,
          groupCount,
          activeSessions: 0, // SSH doesn't track active sessions in this implementation
          sshConfigPath: this.sshService.getSSHConfigPath(),
        },
        healthy: true,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Failed to get plugin summary", {
        component: "SSHPlugin",
        operation: "getSummary",
        metadata: { error: errorMessage, duration },
      });

      complete({ error: errorMessage, duration });

      return {
        pluginName: "ssh",
        displayName: "SSH",
        metrics: {},
        healthy: false,
        lastUpdate: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  // =========================================================================
  // Standardized Capability Interface Methods
  // =========================================================================

  /**
   * Execute shell command on target nodes via SSH
   * Implements RemoteExecutionCapability.commandExecute
   */
  async commandExecute(params: {
    command: string;
    targets: string[];
    timeout?: number;
    environment?: Record<string, string>;
    async?: boolean;
    debugMode?: boolean;
  }): Promise<ExecutionResult> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:commandExecute");
    const executionId = `ssh-cmd-${Date.now()}`;

    try {
      this.logger.info("Executing command via SSH (standardized interface)", {
        component: "SSHPlugin",
        operation: "commandExecute",
        metadata: {
          executionId,
          command: params.command,
          targets: params.targets,
          async: params.async,
          debugMode: params.debugMode,
        },
      });

      // For now, execute on first target (multi-target support would require ExecutionQueue integration)
      const target = params.targets[0];

      // Extract streaming callback from environment if present
      const streamingCallback = params.environment?.streamingCallback as StreamingCallback | undefined;

      const result = await this.sshService.runCommand(
        target,
        params.command,
        streamingCallback,
      );

      // Set debug mode flag if requested
      if (params.debugMode) {
        result.expertMode = true;
      }

      complete({ status: result.status, targets: params.targets.length });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Execute script on target nodes via SSH
   * Implements RemoteExecutionCapability.scriptExecute
   */
  async scriptExecute(params: {
    script: string;
    targets: string[];
    scriptType?: "bash" | "powershell" | "python" | "ruby";
    arguments?: string[];
    timeout?: number;
    environment?: Record<string, string>;
    async?: boolean;
    debugMode?: boolean;
  }): Promise<ExecutionResult> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:scriptExecute");

    try {
      this.logger.info("Executing script via SSH (standardized interface)", {
        component: "SSHPlugin",
        operation: "scriptExecute",
        metadata: {
          scriptType: params.scriptType,
          targets: params.targets,
          hasArguments: !!params.arguments,
          async: params.async,
          debugMode: params.debugMode,
        },
      });

      // Build the command based on script type
      let command = params.script;
      if (params.scriptType === "bash") {
        command = `bash -c '${params.script.replace(/'/g, "'\\''")}'`;
      } else if (params.scriptType === "python") {
        command = `python -c '${params.script.replace(/'/g, "'\\''")}'`;
      } else if (params.scriptType === "ruby") {
        command = `ruby -e '${params.script.replace(/'/g, "'\\''")}'`;
      }

      // Add arguments if provided
      if (params.arguments && params.arguments.length > 0) {
        command += " " + params.arguments.join(" ");
      }

      // Execute as command
      const target = params.targets[0];
      const streamingCallback = params.environment?.streamingCallback as StreamingCallback | undefined;

      const result = await this.sshService.runCommand(
        target,
        command,
        streamingCallback,
      );

      // Set debug mode flag if requested
      if (params.debugMode) {
        result.expertMode = true;
      }

      complete({ status: result.status, targets: params.targets.length, scriptType: params.scriptType });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Stream output from an execution
   * Implements RemoteExecutionCapability.streamOutput
   *
   * Note: SSH executions are synchronous, so streaming happens during execution.
   * This method is a placeholder for future async execution support.
   */
  async streamOutput(executionId: string, callback: (chunk: { nodeId: string; stream: "stdout" | "stderr"; data: string; timestamp: string }) => void): Promise<void> {
    this.logger.debug("Stream output requested (not yet implemented for SSH)", {
      component: "SSHPlugin",
      operation: "streamOutput",
      metadata: { executionId },
    });

    // For SSH, streaming happens during execution via StreamingCallback
    // This method would be used with ExecutionQueue for async executions
    throw new Error("Stream output not yet implemented for SSH - use streaming callback during execution");
  }

  /**
   * Cancel an in-progress execution
   * Implements RemoteExecutionCapability.cancelExecution
   *
   * Note: SSH executions are synchronous and cannot be cancelled mid-execution.
   * This method is a placeholder for future async execution support.
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    this.logger.debug("Cancel execution requested (not yet implemented for SSH)", {
      component: "SSHPlugin",
      operation: "cancelExecution",
      metadata: { executionId },
    });

    // For SSH, executions are synchronous and cannot be cancelled
    // This would require ExecutionQueue integration for async executions
    return false;
  }

  /**
   * List all nodes from SSH config
   * Implements InventoryCapability.inventoryList
   */
  async inventoryList(params: { refresh?: boolean; groups?: string[] }): Promise<Node[]> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryList");

    try {
      this.logger.debug("Listing inventory from SSH config (standardized interface)", {
        component: "SSHPlugin",
        operation: "inventoryList",
        metadata: { refresh: params.refresh, groups: params.groups },
      });

      let nodes = await this.sshService.getInventory();

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
   * Get specific node details from SSH config
   * Implements InventoryCapability.inventoryGet
   */
  async inventoryGet(params: { nodeId: string }): Promise<Node | null> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryGet");

    try {
      this.logger.debug("Getting node details from SSH config (standardized interface)", {
        component: "SSHPlugin",
        operation: "inventoryGet",
        metadata: { nodeId: params.nodeId },
      });

      const nodes = await this.sshService.getInventory();
      const node = nodes.find(n => n.id === params.nodeId || n.name === params.nodeId);

      complete({ nodeId: params.nodeId, found: !!node });
      return node ?? null;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * List available groups from SSH config
   * Implements InventoryCapability.inventoryGroups
   */
  async inventoryGroups(params: { refresh?: boolean }): Promise<string[]> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryGroups");

    try {
      this.logger.debug("Listing inventory groups from SSH config (standardized interface)", {
        component: "SSHPlugin",
        operation: "inventoryGroups",
        metadata: { refresh: params.refresh },
      });

      const nodes = await this.sshService.getInventory();
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
  async inventoryFilter(params: { criteria: Record<string, unknown>; groups?: string[] }): Promise<Node[]> {
    const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryFilter");

    try {
      this.logger.debug("Filtering inventory from SSH config (standardized interface)", {
        component: "SSHPlugin",
        operation: "inventoryFilter",
        metadata: { criteria: params.criteria, groups: params.groups },
      });

      let nodes = await this.sshService.getInventory();

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
}
