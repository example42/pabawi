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
  NodeGroup,
} from "../types";
import type { BoltService } from "./BoltService";
import type { ExecutionResult, Node, Facts } from "./types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";

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

  constructor(boltService: BoltService, logger?: LoggerService, performanceMonitor?: PerformanceMonitorService) {
    super("bolt", "both", logger, performanceMonitor);
    this.boltService = boltService;
  }

  /**
   * Perform plugin-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    const complete = this.performanceMonitor.startTimer('bolt:initialization');

    try {
      // Verify Bolt is accessible by checking inventory
      await this.boltService.getInventory();
      this.log("Bolt is accessible and inventory loaded");

      complete({ success: true });
    } catch (error) {
      this.logError("Failed to verify Bolt accessibility during initialization", error);
      // Don't throw error during initialization - let health checks handle this
      // This allows the server to start even if Bolt is not properly configured
      this.log("Bolt plugin initialized with configuration issues - will report in health checks");

      complete({ success: false, error: error instanceof Error ? error.message : String(error) });
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
    const complete = this.performanceMonitor.startTimer('bolt:healthCheck');
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
        complete({ available: false });
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
        complete({ available: true, configured: false });
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
        complete({ available: true, configured: true, degraded: true });
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

      complete({ available: true, configured: true, nodeCount: inventory.length });
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

      complete({ error: errorMessage });
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
    const complete = this.performanceMonitor.startTimer('bolt:executeAction');

    if (!this.initialized) {
      complete({ error: 'not initialized' });
      throw new Error("Bolt plugin not initialized");
    }

    // Bolt currently only supports single target execution
    const target = Array.isArray(action.target)
      ? action.target[0]
      : action.target;

    if (!target) {
      complete({ error: 'no target' });
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

    try {
      // Map action to appropriate Bolt service method
      let result: ExecutionResult;

      switch (action.type) {
        case "command":
          result = await this.boltService.runCommand(
            target,
            action.action,
            streamingCallback,
          );
          break;

        case "task":
          result = await this.boltService.runTask(
            target,
            action.action,
            action.parameters,
            streamingCallback,
          );
          break;

        case "script":
          complete({ error: 'script not implemented' });
          throw new Error("Script execution not yet implemented");

        case "plan":
          complete({ error: 'plan not implemented' });
          throw new Error("Plan execution not yet implemented");

        default: {
          const exhaustiveCheck: never = action.type;
          complete({ error: 'unsupported action type' });
          throw new Error(`Unsupported action type: ${String(exhaustiveCheck)}`);
        }
      }

      complete({ actionType: action.type, status: result.status });
      return result;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
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
    const complete = this.performanceMonitor.startTimer('bolt:getInventory');

    if (!this.initialized) {
      complete({ error: 'not initialized' });
      throw new Error("Bolt plugin not initialized");
    }

    try {
      const inventory = await this.boltService.getInventory();
      complete({ nodeCount: inventory.length });
      return inventory;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get facts for a specific node
   *
   * @param nodeId - Node identifier
   * @returns Node facts
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    const complete = this.performanceMonitor.startTimer('bolt:getNodeFacts');

    if (!this.initialized) {
      complete({ error: 'not initialized' });
      throw new Error("Bolt plugin not initialized");
    }

    try {
      const facts = await this.boltService.gatherFacts(nodeId);
      complete({ nodeId });
      return facts;
    } catch (error) {
      complete({ error: error instanceof Error ? error.message : String(error), nodeId });
      throw error;
    }
  }
  /**
   * Get groups from Bolt inventory
   *
   * @returns Array of node groups
   * @todo Implement group extraction from Bolt inventory.yaml (Task 2)
   */
  /**
     * Get groups from Bolt inventory
     *
     * Parses inventory.yaml to extract group definitions including:
     * - Group names and targets
     * - Nested groups (stored in metadata.hierarchy)
     * - Variables and config (stored in metadata)
     *
     * @returns Array of node groups
     */
    async getGroups(): Promise<NodeGroup[]> {
      const complete = this.performanceMonitor.startTimer('bolt:getGroups');

      if (!this.initialized) {
        complete({ error: 'not initialized' });
        throw new Error("Bolt plugin not initialized");
      }

      try {
        const groups = await this.extractGroupsFromInventory();
        complete({ groupCount: groups.length });
        return groups;
      } catch (error) {
        complete({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }

    /**
     * Extract groups from Bolt inventory.yaml file
     *
     * @returns Array of NodeGroup objects
     */
    private async extractGroupsFromInventory(): Promise<NodeGroup[]> {
      const fs = await import("fs");
      const path = await import("path");
      const { parse: parseYaml } = await import("yaml");

      const projectPath = this.boltService.getBoltProjectPath();

      // Try both inventory.yaml and inventory.yml
      const inventoryYaml = path.join(projectPath, "inventory.yaml");
      const inventoryYml = path.join(projectPath, "inventory.yml");

      let inventoryPath: string | null = null;
      if (fs.existsSync(inventoryYaml)) {
        inventoryPath = inventoryYaml;
      } else if (fs.existsSync(inventoryYml)) {
        inventoryPath = inventoryYml;
      }

      if (!inventoryPath) {
        // No inventory file found - return empty array
        this.log("No inventory file found, returning empty groups array");
        return [];
      }

      try {
        const inventoryContent = fs.readFileSync(inventoryPath, "utf-8");
        const inventory = parseYaml(inventoryContent) as Record<string, unknown>;

        if (!inventory.groups || !Array.isArray(inventory.groups)) {
          // No groups section in inventory
          return [];
        }

        const groups: NodeGroup[] = [];

        for (const groupData of inventory.groups) {
          if (typeof groupData !== "object" || groupData === null) {
            continue;
          }

          const group = this.parseInventoryGroup(groupData as Record<string, unknown>);
          if (group) {
            groups.push(group);
          }
        }

        return groups;
      } catch (error) {
        this.logError("Failed to parse inventory file for groups", error);
        return [];
      }
    }

    /**
     * Parse a single group from Bolt inventory
     *
     * @param groupData - Raw group data from inventory.yaml
     * @returns NodeGroup object or null if parsing fails
     */
    private parseInventoryGroup(groupData: Record<string, unknown>): NodeGroup | null {
      // Extract group name
      const name = typeof groupData.name === "string" ? groupData.name : null;
      if (!name) {
        this.log("Skipping group without name");
        return null;
      }

      // Extract targets and map to node IDs
      const nodes: string[] = [];
      if (Array.isArray(groupData.targets)) {
        for (const target of groupData.targets) {
          if (typeof target === "string") {
            // Map target to node ID using same format as parseInventoryTarget (just the name)
            nodes.push(target);
          } else if (typeof target === "object" && target !== null) {
            // Handle target objects with name property
            const targetObj = target as Record<string, unknown>;
            const targetName = typeof targetObj.name === "string" ? targetObj.name : null;
            if (targetName) {
              nodes.push(targetName);
            }
          }
        }
      }

      // Extract nested groups and store in hierarchy
      const hierarchy: string[] = [];
      if (Array.isArray(groupData.groups)) {
        for (const nestedGroup of groupData.groups) {
          if (typeof nestedGroup === "string") {
            hierarchy.push(nestedGroup);
          }
        }
      }

      // Extract vars and config as metadata
      const metadata: NodeGroup["metadata"] = {};

      if (typeof groupData.vars === "object" && groupData.vars !== null) {
        metadata.variables = groupData.vars as Record<string, unknown>;
      }

      if (typeof groupData.config === "object" && groupData.config !== null) {
        metadata.config = groupData.config as Record<string, unknown>;
      }

      if (typeof groupData.description === "string") {
        metadata.description = groupData.description;
      }

      if (hierarchy.length > 0) {
        metadata.hierarchy = hierarchy;
      }

      // Create NodeGroup object
      return {
        id: `bolt:${name}`,
        name,
        source: "bolt",
        sources: ["bolt"],
        linked: false,
        nodes,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
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
    const complete = this.performanceMonitor.startTimer('bolt:getNodeData');

    if (!this.initialized) {
      complete({ error: 'not initialized' });
      throw new Error("Bolt plugin not initialized");
    }

    // Bolt only supports facts data type
    if (dataType === "facts") {
      try {
        const facts = await this.boltService.gatherFacts(nodeId);
        complete({ nodeId, dataType });
        return facts;
      } catch (error) {
        complete({ error: error instanceof Error ? error.message : String(error), nodeId, dataType });
        throw error;
      }
    }

    complete({ error: 'unsupported data type', nodeId, dataType });
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
