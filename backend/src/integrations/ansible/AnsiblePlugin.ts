import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { BasePlugin } from "../BasePlugin";
import type {
  Action,
  Capability,
  ExecutionToolPlugin,
  InformationSourcePlugin,
  HealthStatus,
} from "../types";
import type { ExecutionResult, Node, Facts } from "../bolt/types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import { AnsibleService } from "./AnsibleService";

export class AnsiblePlugin extends BasePlugin implements ExecutionToolPlugin, InformationSourcePlugin {
  readonly type = "both" as const;
  private readonly ansibleService: AnsibleService;

  constructor(
    ansibleService: AnsibleService,
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
  ) {
    super("ansible", "both", logger, performanceMonitor);
    this.ansibleService = ansibleService;
  }

  protected async performInitialization(): Promise<void> {
    await this.performHealthCheck();
  }

  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    const [ansibleOk, ansiblePlaybookOk, ansibleInventoryOk] = await Promise.all([
      this.checkBinary("ansible"),
      this.checkBinary("ansible-playbook"),
      this.checkBinary("ansible-inventory"),
    ]);

    const inventoryPath = resolve(this.ansibleService.getAnsibleProjectPath(), this.ansibleService.getInventoryPath());
    const inventoryExists = existsSync(inventoryPath);

    if (!ansibleOk || !ansiblePlaybookOk || !ansibleInventoryOk) {
      return {
        healthy: false,
        message: "Ansible CLI is not available",
        details: {
          ansibleAvailable: ansibleOk,
          ansiblePlaybookAvailable: ansiblePlaybookOk,
          ansibleInventoryAvailable: ansibleInventoryOk,
        },
      };
    }

    if (!inventoryExists) {
      return {
        healthy: false,
        degraded: true,
        message: "Ansible inventory file was not found",
        details: {
          inventoryPath,
        },
      };
    }

    return {
      healthy: true,
      message: "Ansible is configured and available",
      details: {
        inventoryPath,
      },
    };
  }

  async executeAction(action: Action): Promise<ExecutionResult> {
    if (!this.initialized) {
      throw new Error("Ansible plugin not initialized");
    }

    const target = Array.isArray(action.target)
      ? action.target[0]
      : action.target;

    if (!target) {
      throw new Error("No target specified for action");
    }

    const streamingCallback = action.metadata?.streamingCallback as
      | {
          onCommand?: (cmd: string) => void;
          onStdout?: (chunk: string) => void;
          onStderr?: (chunk: string) => void;
        }
      | undefined;

    switch (action.type) {
      case "command":
        return await this.ansibleService.runCommand(
          target,
          action.action,
          streamingCallback,
        );
      case "task": {
        if (action.action !== "package") {
          throw new Error(
            `Unsupported ansible task action: ${action.action}. Only 'package' is currently supported.`,
          );
        }

        const packageName = String(action.parameters?.packageName ?? "").trim();
        if (!packageName) {
          throw new Error("packageName is required for ansible package action");
        }

        const ensure =
          action.parameters?.ensure === "absent" ||
          action.parameters?.ensure === "latest"
            ? (action.parameters.ensure as "absent" | "latest")
            : "present";

        const version =
          typeof action.parameters?.version === "string"
            ? action.parameters.version
            : undefined;

        const settings =
          action.parameters?.settings &&
          typeof action.parameters.settings === "object"
            ? (action.parameters.settings as Record<string, unknown>)
            : undefined;

        return await this.ansibleService.installPackage(
          target,
          packageName,
          ensure,
          version,
          settings,
          streamingCallback,
        );
      }
      case "plan": {
        const extraVars =
          action.parameters?.extraVars &&
          typeof action.parameters.extraVars === "object"
            ? (action.parameters.extraVars as Record<string, unknown>)
            : undefined;

        return await this.ansibleService.runPlaybook(
          target,
          action.action,
          extraVars,
          streamingCallback,
        );
      }
      default:
        throw new Error(`Unsupported action type for ansible: ${action.type}`);
    }
  }

  listCapabilities(): Capability[] {
    return [
      {
        name: "command",
        description: "Execute shell commands on target nodes via ansible shell module",
      },
      {
        name: "package",
        description: "Install or remove packages on target nodes via ansible package module",
      },
      {
        name: "playbook",
        description: "Execute ansible playbooks against target nodes",
      },
    ];
  }

  /**
   * Get inventory from Ansible
   * Implements InformationSourcePlugin interface
   */
  async getInventory(): Promise<Node[]> {
    if (!this.initialized) {
      throw new Error("Ansible plugin not initialized");
    }

    return await this.ansibleService.getInventory();
  }

  /**
   * Get facts for a specific node
   * Implements InformationSourcePlugin interface
   *
   * Note: Ansible facts are gathered dynamically via setup module
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (!this.initialized) {
      throw new Error("Ansible plugin not initialized");
    }

    // Use ansible setup module to gather facts
    // This is a simplified implementation - could be enhanced with caching
    const args = [
      nodeId,
      "-i",
      this.ansibleService.getInventoryPath(),
      "-m",
      "setup",
    ];

    try {
      const result = await new Promise<{ stdout: string; success: boolean }>((resolve, reject) => {
        const child = spawn("ansible", args, {
          cwd: this.ansibleService.getAnsibleProjectPath(),
          env: process.env,
        });

        let stdout = "";
        let stderr = "";

        if (child.stdout) {
          child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
          });
        }

        if (child.stderr) {
          child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        }

        child.on("close", (exitCode: number | null) => {
          if (exitCode === 0) {
            resolve({ stdout, success: true });
          } else {
            reject(new Error(`Failed to gather facts: ${stderr || stdout}`));
          }
        });

        child.on("error", (error: Error) => {
          reject(error);
        });
      });

      // Parse ansible facts from output
      // Ansible setup module returns JSON in stdout
      const factsMatch = result.stdout.match(/"ansible_facts":\s*({[\s\S]*?})\s*}/);
      if (factsMatch) {
        const ansibleFacts = JSON.parse(factsMatch[1]);

        // Convert Ansible facts to Bolt-compatible format
        return {
          nodeId,
          gatheredAt: new Date().toISOString(),
          source: "ansible",
          facts: {
            os: {
              name: ansibleFacts.ansible_distribution || ansibleFacts.ansible_os_family || "Unknown",
              family: ansibleFacts.ansible_os_family || "Unknown",
              release: {
                full: ansibleFacts.ansible_distribution_version || "Unknown",
                major: ansibleFacts.ansible_distribution_major_version || "Unknown",
              },
            },
            processors: {
              count: ansibleFacts.ansible_processor_count || ansibleFacts.ansible_processor_vcpus || 0,
              models: ansibleFacts.ansible_processor ? [ansibleFacts.ansible_processor] : [],
            },
            networking: {
              hostname: ansibleFacts.ansible_hostname || nodeId,
              interfaces: {
                ...(ansibleFacts.ansible_interfaces || {}),
                fqdn: ansibleFacts.ansible_fqdn,
                ip: ansibleFacts.ansible_default_ipv4?.address,
              },
            },
            memory: {
              system: {
                total: ansibleFacts.ansible_memtotal_mb ? `${ansibleFacts.ansible_memtotal_mb} MB` : "Unknown",
                available: ansibleFacts.ansible_memfree_mb ? `${ansibleFacts.ansible_memfree_mb} MB` : "Unknown",
              },
            },
            system_uptime: {
              seconds: ansibleFacts.ansible_uptime_seconds,
            },
            // Store raw ansible facts for reference
            ansible_facts: ansibleFacts,
          },
        };
      }

      // Return minimal facts if parsing fails
      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: "ansible",
        facts: {
          os: {
            name: "Unknown",
            family: "Unknown",
            release: {
              full: "Unknown",
              major: "Unknown",
            },
          },
          processors: {
            count: 0,
            models: [],
          },
          networking: {
            hostname: nodeId,
            interfaces: {},
          },
          memory: {
            system: {
              total: "Unknown",
              available: "Unknown",
            },
          },
        },
      };
    } catch (error) {
      this.logger?.warn(`Failed to gather facts for node ${nodeId}`, {
        component: "AnsiblePlugin",
        operation: "getNodeFacts",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });

      // Return minimal facts rather than failing
      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: "ansible",
        facts: {
          os: {
            name: "Unknown",
            family: "Unknown",
            release: {
              full: "Unknown",
              major: "Unknown",
            },
          },
          processors: {
            count: 0,
            models: [],
          },
          networking: {
            hostname: nodeId,
            interfaces: {},
          },
          memory: {
            system: {
              total: "Unknown",
              available: "Unknown",
            },
          },
        },
      };
    }
  }

  /**
   * Get arbitrary data for a node
   * Implements InformationSourcePlugin interface
   *
   * Note: Ansible doesn't have a centralized data store like PuppetDB
   * This is a placeholder implementation
   */
  async getNodeData(_nodeId: string, dataType: string): Promise<unknown> {
    if (!this.initialized) {
      throw new Error("Ansible plugin not initialized");
    }

    // Ansible doesn't have built-in support for arbitrary data retrieval
    // This could be extended to query custom fact files or external sources
    throw new Error(`Ansible does not support data type: ${dataType}`);
  }

  private async checkBinary(binary: "ansible" | "ansible-playbook" | "ansible-inventory"): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const child = spawn(binary, ["--version"], { stdio: "pipe" });
      let resolved = false;

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      });

      child.on("error", () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          resolve(false);
        }
      }, 5000);
    });
  }
}
