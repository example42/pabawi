/**
 * AnsiblePlugin - Ansible integration for Pabawi
 *
 * Provides remote execution and inventory management capabilities using Ansible.
 */

import { AnsibleService } from "./services/AnsibleService";
import type { AnsibleServiceInterface } from "./services/AnsibleService";
import type {
  Node,
  Facts,
  ExecutionResult,
  AnsibleConfig,
  StreamingCallback,
} from "./types";

// Import capability type interfaces
import type {
  InventoryCapability,
  InventoryListParams,
  InventoryGetParams,
  InventoryGroupsParams,
  InventoryFilterParams,
} from "../../../../backend/src/integrations/capability-types/inventory";

import type {
  RemoteExecutionCapability,
  CommandExecuteParams,
  TaskExecuteParams,
  ScriptExecuteParams,
  OutputStreamCallback,
} from "../../../../backend/src/integrations/capability-types/remote-execution";

// Base plugin interfaces
interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  integrationType: string;
  capabilities: string[];
}

interface HealthStatus {
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface BasePluginInterface {
  metadata: PluginMetadata;
  initialize(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getConfig(): Record<string, unknown>;
  isInitialized(): boolean;
  shutdown?(): Promise<void>;
}

interface LoggerServiceInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface PerformanceMonitorServiceInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

/**
 * AnsiblePlugin class
 *
 * Implements:
 * - BasePluginInterface for plugin lifecycle
 * - InventoryCapability for inventory management
 * - RemoteExecutionCapability for command/playbook execution
 */
export class AnsiblePlugin
  implements
    BasePluginInterface,
    InventoryCapability,
    RemoteExecutionCapability
{
  public readonly metadata: PluginMetadata = {
    name: "ansible",
    version: "1.0.0",
    description: "Ansible integration for remote execution and inventory management",
    integrationType: "RemoteExecution",
    capabilities: [
      "command.execute",
      "task.execute",
      "script.execute",
      "inventory.list",
      "inventory.get",
      "inventory.groups",
      "inventory.filter",
    ],
  };

  private config: AnsibleConfig;
  private logger: LoggerServiceInterface;
  private performanceMonitor: PerformanceMonitorServiceInterface;
  private ansibleService: AnsibleServiceInterface;
  private initialized = false;
  private inventoryCache: Node[] | null = null;
  private inventoryCacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    config: Record<string, unknown>,
    logger: LoggerServiceInterface,
    performanceMonitor: PerformanceMonitorServiceInterface,
  ) {
    this.config = {
      inventoryPath:
        (config.inventoryPath as string) || "/etc/ansible/hosts",
      playbookPath:
        (config.playbookPath as string) || "/etc/ansible/playbooks",
      defaultTimeout: (config.defaultTimeout as number) || 300000,
      ansibleConfig: config.ansibleConfig as string | undefined,
    };

    this.logger = logger;
    this.performanceMonitor = performanceMonitor;
    this.ansibleService = new AnsibleService(this.config, this.logger);
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    const endTimer = this.performanceMonitor.startTimer("ansible.initialize");

    try {
      this.logger.info("Initializing Ansible plugin", {
        inventoryPath: this.config.inventoryPath,
        playbookPath: this.config.playbookPath,
      });

      // Verify Ansible is installed
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync("ansible --version");
        this.logger.info("Ansible version detected", {
          version: stdout.split("\n")[0],
        });
      } catch (error) {
        throw new Error(
          "Ansible is not installed or not accessible in PATH",
        );
      }

      // Verify inventory path exists
      const fs = await import("fs");
      if (!fs.existsSync(this.config.inventoryPath)) {
        this.logger.warn("Inventory path does not exist", {
          inventoryPath: this.config.inventoryPath,
        });
      }

      this.initialized = true;
      this.logger.info("Ansible plugin initialized successfully");
      endTimer({ success: true });
    } catch (error) {
      this.logger.error("Failed to initialize Ansible plugin", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.initialized) {
        return {
          healthy: false,
          message: "Plugin not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      // Check if Ansible is accessible
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      await execAsync("ansible --version");

      return {
        healthy: true,
        message: "Ansible is accessible and operational",
        details: {
          inventoryPath: this.config.inventoryPath,
          playbookPath: this.config.playbookPath,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  getConfig(): Record<string, unknown> {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down Ansible plugin");
    this.initialized = false;
    this.inventoryCache = null;
  }

  // ==========================================================================
  // Inventory Capability Implementation
  // ==========================================================================

  /**
   * List all nodes from Ansible inventory
   */
  async inventoryList(params: InventoryListParams): Promise<Node[]> {
    const endTimer = this.performanceMonitor.startTimer("ansible.inventory.list");

    try {
      this.logger.debug("Listing inventory", params);

      // Check cache
      if (
        !params.refresh &&
        this.inventoryCache &&
        Date.now() < this.inventoryCacheExpiry
      ) {
        this.logger.debug("Returning cached inventory");
        let nodes = this.inventoryCache;

        // Filter by groups if specified
        if (params.groups && params.groups.length > 0) {
          nodes = nodes.filter((node) =>
            node.groups?.some((g) => params.groups?.includes(g)),
          );
        }

        endTimer({ cached: true, count: nodes.length });
        return nodes;
      }

      // Fetch from Ansible
      const nodes = await this.ansibleService.getInventory();

      // Update cache
      this.inventoryCache = nodes;
      this.inventoryCacheExpiry = Date.now() + this.CACHE_TTL;

      // Filter by groups if specified
      let filteredNodes = nodes;
      if (params.groups && params.groups.length > 0) {
        filteredNodes = nodes.filter((node) =>
          node.groups?.some((g) => params.groups?.includes(g)),
        );
      }

      endTimer({ cached: false, count: filteredNodes.length });
      return filteredNodes;
    } catch (error) {
      this.logger.error("Failed to list inventory", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Get specific node details
   */
  async inventoryGet(params: InventoryGetParams): Promise<Node | null> {
    const endTimer = this.performanceMonitor.startTimer("ansible.inventory.get");

    try {
      this.logger.debug("Getting node details", params);

      const nodes = await this.inventoryList({ refresh: false });
      const node = nodes.find((n) => n.id === params.nodeId) || null;

      endTimer({ found: node !== null });
      return node;
    } catch (error) {
      this.logger.error("Failed to get node", {
        nodeId: params.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * List available groups
   */
  async inventoryGroups(params: InventoryGroupsParams): Promise<string[]> {
    const endTimer = this.performanceMonitor.startTimer("ansible.inventory.groups");

    try {
      this.logger.debug("Listing groups", params);

      const nodes = await this.inventoryList({ refresh: params.refresh });
      const groupsSet = new Set<string>();

      for (const node of nodes) {
        if (node.groups) {
          for (const group of node.groups) {
            groupsSet.add(group);
          }
        }
      }

      const groups = Array.from(groupsSet).sort();
      endTimer({ count: groups.length });
      return groups;
    } catch (error) {
      this.logger.error("Failed to list groups", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Filter nodes by criteria
   */
  async inventoryFilter(params: InventoryFilterParams): Promise<Node[]> {
    const endTimer = this.performanceMonitor.startTimer("ansible.inventory.filter");

    try {
      this.logger.debug("Filtering inventory", params);

      let nodes = await this.inventoryList({ groups: params.groups });

      // Apply additional criteria filters
      if (params.criteria && Object.keys(params.criteria).length > 0) {
        nodes = nodes.filter((node) => {
          for (const [key, value] of Object.entries(params.criteria)) {
            const nodeValue = node.metadata?.[key];
            if (nodeValue !== value) {
              return false;
            }
          }
          return true;
        });
      }

      endTimer({ count: nodes.length });
      return nodes;
    } catch (error) {
      this.logger.error("Failed to filter inventory", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  // ==========================================================================
  // Remote Execution Capability Implementation
  // ==========================================================================

  /**
   * Execute shell command on target nodes
   */
  async commandExecute(params: CommandExecuteParams): Promise<ExecutionResult> {
    const endTimer = this.performanceMonitor.startTimer("ansible.command.execute");

    try {
      this.logger.info("Executing command", {
        command: params.command,
        targets: params.targets,
      });

      // For simplicity, execute on first target
      // In production, this should handle multiple targets
      const target = params.targets[0];

      const streamingCallback: StreamingCallback | undefined = params.debugMode
        ? (chunk) => {
            this.logger.debug("Command output", chunk);
          }
        : undefined;

      const result = await this.ansibleService.runCommand(
        target,
        params.command,
        streamingCallback,
      );

      endTimer({ status: result.status });
      return result;
    } catch (error) {
      this.logger.error("Command execution failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Execute Ansible playbook on target nodes
   */
  async taskExecute(params: TaskExecuteParams): Promise<ExecutionResult> {
    const endTimer = this.performanceMonitor.startTimer("ansible.task.execute");

    try {
      this.logger.info("Executing playbook", {
        taskName: params.taskName,
        targets: params.targets,
        parameters: params.parameters,
      });

      // For simplicity, execute on first target
      const target = params.targets[0];

      const streamingCallback: StreamingCallback | undefined = params.debugMode
        ? (chunk) => {
            this.logger.debug("Playbook output", chunk);
          }
        : undefined;

      const result = await this.ansibleService.runPlaybook(
        target,
        params.taskName,
        params.parameters,
        streamingCallback,
      );

      endTimer({ status: result.status });
      return result;
    } catch (error) {
      this.logger.error("Playbook execution failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Execute script on target nodes
   */
  async scriptExecute(params: ScriptExecuteParams): Promise<ExecutionResult> {
    const endTimer = this.performanceMonitor.startTimer("ansible.script.execute");

    try {
      this.logger.info("Executing script", {
        script: params.script,
        targets: params.targets,
        scriptType: params.scriptType,
      });

      // Use Ansible script module or shell module depending on script type
      const target = params.targets[0];
      const command = params.script;

      const streamingCallback: StreamingCallback | undefined = params.debugMode
        ? (chunk) => {
            this.logger.debug("Script output", chunk);
          }
        : undefined;

      const result = await this.ansibleService.runCommand(
        target,
        command,
        streamingCallback,
      );

      endTimer({ status: result.status });
      return result;
    } catch (error) {
      this.logger.error("Script execution failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      endTimer({ success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Stream output from an execution
   */
  async streamOutput(
    executionId: string,
    callback: OutputStreamCallback,
  ): Promise<void> {
    this.logger.debug("Stream output requested", { executionId });
    // Streaming is handled inline during execution
    // This method is a placeholder for the interface
  }

  /**
   * Cancel an in-progress execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    this.logger.warn("Cancel execution not implemented", { executionId });
    return false;
  }

  /**
   * Get the Ansible service instance (for testing)
   */
  getAnsibleService(): AnsibleServiceInterface {
    return this.ansibleService;
  }
}

/**
 * Factory function to create AnsiblePlugin instance
 */
export function createAnsiblePlugin(
  config: Record<string, unknown>,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): AnsiblePlugin {
  return new AnsiblePlugin(config, logger, performanceMonitor);
}
