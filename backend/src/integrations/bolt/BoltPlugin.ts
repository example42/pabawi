/**
 * Bolt Integration Plugin
 *
 * Wraps BoltService to provide integration plugin interface for the IntegrationManager.
 * This allows Bolt to be monitored alongside other integrations like PuppetDB.
 */

import { BasePlugin } from "../BasePlugin";
import type {
  HealthStatus,
  ExecutionToolPlugin,
  InformationSourcePlugin,
  Action,
  Capability,
} from "../types";
import type { BoltService } from "../../bolt/BoltService";
import type { ExecutionResult, Node, Facts } from "../../bolt/types";

/**
 * Bolt Plugin
 *
 * Provides execution tool capabilities, inventory information, and health monitoring for Bolt.
 */
export class BoltPlugin
  extends BasePlugin
  implements ExecutionToolPlugin, InformationSourcePlugin
{
  readonly type = "both" as const;
  private boltService: BoltService;

  constructor(boltService: BoltService) {
    super("bolt", "both");
    this.boltService = boltService;
  }

  /**
   * Perform plugin-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    try {
      // Verify Bolt is accessible by checking inventory
      await this.boltService.getInventory();
      this.log("Bolt is accessible and inventory loaded");
    } catch (error) {
      this.logError("Failed to verify Bolt accessibility during initialization", error);
      // Don't throw error during initialization - let health checks handle this
      // This allows the server to start even if Bolt is not properly configured
      this.log("Bolt plugin initialized with configuration issues - will report in health checks");
    }
  }

  /**
   * Perform plugin-specific health check
   *
   * Verifies that Bolt CLI is accessible and project-specific configuration exists.
   *
   * @returns Health status (without lastCheck timestamp)
   */
  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    const fs = await import("fs");
    const path = await import("path");

    try {
      // First check if Bolt command is available
      const childProcess = await import("child_process");
      const boltCheck = childProcess.spawn("bolt", ["--version"], { stdio: "pipe" });

      const boltAvailable = await new Promise<boolean>((resolve) => {
        let resolved = false;

        const handleClose = (code: number | null): void => {
          if (!resolved) {
            resolved = true;
            resolve(code === 0);
          }
        };

        const handleError = (): void => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        };

        boltCheck.on("close", handleClose);
        boltCheck.on("error", handleError);

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            boltCheck.kill();
            resolve(false);
          }
        }, 5000);
      });

      if (!boltAvailable) {
        return {
          healthy: false,
          message: "Bolt command is not available. Please install Puppet Bolt.",
          details: {
            error: "bolt command not found",
            projectPath: this.boltService.getBoltProjectPath(),
          },
        };
      }

      // Check for project-specific configuration files
      const projectPath = this.boltService.getBoltProjectPath();
      const inventoryYaml = path.join(projectPath, "inventory.yaml");
      const inventoryYml = path.join(projectPath, "inventory.yml");
      const boltProjectYaml = path.join(projectPath, "bolt-project.yaml");
      const boltProjectYml = path.join(projectPath, "bolt-project.yml");

      const hasInventory = fs.existsSync(inventoryYaml) || fs.existsSync(inventoryYml);
      const hasBoltProject = fs.existsSync(boltProjectYaml) || fs.existsSync(boltProjectYml);

      // If no project-specific configuration exists, report as degraded
      if (!hasInventory && !hasBoltProject) {
        return {
          healthy: false,
          message: "Bolt project configuration is missing. Using global configuration as fallback.",
          details: {
            error: "No project-specific inventory.yaml or bolt-project.yaml found",
            projectPath,
            missingFiles: ["inventory.yaml", "bolt-project.yaml"],
            usingGlobalConfig: true,
          },
        };
      }

      // If inventory is missing but bolt-project exists, report as degraded
      if (!hasInventory) {
        return {
          healthy: false,
          degraded: true,
          message: "Bolt inventory file is missing. Task execution will be limited.",
          details: {
            error: "inventory.yaml not found in project directory",
            projectPath,
            missingFiles: ["inventory.yaml"],
            hasBoltProject,
          },
        };
      }

      // Try to load inventory as a final health check
      const inventory = await this.boltService.getInventory();

      return {
        healthy: true,
        message: `Bolt is properly configured. ${String(inventory.length)} nodes in inventory.`,
        details: {
          nodeCount: inventory.length,
          projectPath,
          hasInventory,
          hasBoltProject,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        healthy: false,
        message: `Bolt health check failed: ${errorMessage}`,
        details: {
          error: errorMessage,
          projectPath: this.boltService.getBoltProjectPath(),
        },
      };
    }
  }

  /**
   * Execute an action using Bolt
   *
   * @param action - Action to execute
   * @returns Execution result
   */
  async executeAction(action: Action): Promise<ExecutionResult> {
    if (!this.initialized) {
      throw new Error("Bolt plugin not initialized");
    }

    // Bolt currently only supports single target execution
    const target = Array.isArray(action.target)
      ? action.target[0]
      : action.target;

    if (!target) {
      throw new Error("No target specified for action");
    }

    // Extract streaming callback from action metadata if present
    const streamingCallback = action.metadata?.streamingCallback as
      | {
          onCommand?: (cmd: string) => void;
          onStdout?: (chunk: string) => void;
          onStderr?: (chunk: string) => void;
        }
      | undefined;

    // Map action to appropriate Bolt service method
    switch (action.type) {
      case "command":
        return this.boltService.runCommand(
          target,
          action.action,
          streamingCallback,
        );

      case "task":
        return this.boltService.runTask(
          target,
          action.action,
          action.parameters,
          streamingCallback,
        );

      case "script":
        throw new Error("Script execution not yet implemented");

      case "plan":
        throw new Error("Plan execution not yet implemented");

      default: {
        const exhaustiveCheck: never = action.type;
        throw new Error(`Unsupported action type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * List capabilities supported by Bolt
   *
   * @returns Array of capabilities
   */
  listCapabilities(): Capability[] {
    return [
      {
        name: "command",
        description: "Execute shell commands on target nodes",
        parameters: [
          {
            name: "command",
            type: "string",
            required: true,
            description: "Shell command to execute",
          },
        ],
      },
      {
        name: "task",
        description: "Execute Puppet tasks on target nodes",
        parameters: [
          {
            name: "task",
            type: "string",
            required: true,
            description: "Name of the task to execute",
          },
          {
            name: "parameters",
            type: "object",
            required: false,
            description: "Task parameters",
          },
        ],
      },
    ];
  }

  /**
   * Get inventory of nodes from Bolt
   *
   * @returns Array of nodes
   */
  async getInventory(): Promise<Node[]> {
    if (!this.initialized) {
      throw new Error("Bolt plugin not initialized");
    }

    return await this.boltService.getInventory();
  }

  /**
   * Get facts for a specific node
   *
   * @param nodeId - Node identifier
   * @returns Node facts
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (!this.initialized) {
      throw new Error("Bolt plugin not initialized");
    }

    return await this.boltService.gatherFacts(nodeId);
  }

  /**
   * Get arbitrary data for a node
   *
   * Bolt doesn't support arbitrary data types beyond facts,
   * so this method throws an error for unsupported data types.
   *
   * @param nodeId - Node identifier
   * @param dataType - Type of data to retrieve
   * @returns Data of the requested type
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    if (!this.initialized) {
      throw new Error("Bolt plugin not initialized");
    }

    // Bolt only supports facts data type
    if (dataType === "facts") {
      return await this.boltService.gatherFacts(nodeId);
    }

    throw new Error(`Bolt does not support data type: ${dataType}`);
  }

  /**
   * Get the wrapped BoltService instance
   *
   * @returns BoltService instance
   */
  getBoltService(): BoltService {
    return this.boltService;
  }
}
