/**
 * AnsibleService - Handles Ansible command execution and inventory management
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type {
  Node,
  Facts,
  ExecutionResult,
  NodeResult,
  Playbook,
  StreamingCallback,
  AnsibleConfig,
} from "../types";

const execAsync = promisify(exec);

export interface AnsibleServiceInterface {
  getInventory(): Promise<Node[]>;
  gatherFacts(nodeId: string): Promise<Facts>;
  runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult>;
  runPlaybook(
    nodeId: string,
    playbookName: string,
    parameters?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult>;
  listPlaybooks(): Promise<Playbook[]>;
  getPlaybookDetails(playbookName: string): Promise<Playbook | null>;
  getInventoryPath(): string;
  getDefaultTimeout(): number;
}

export class AnsibleService implements AnsibleServiceInterface {
  private config: AnsibleConfig;
  private logger: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
    debug: (message: string, context?: Record<string, unknown>) => void;
  };

  constructor(
    config: AnsibleConfig,
    logger: {
      info: (message: string, context?: Record<string, unknown>) => void;
      warn: (message: string, context?: Record<string, unknown>) => void;
      error: (message: string, context?: Record<string, unknown>) => void;
      debug: (message: string, context?: Record<string, unknown>) => void;
    },
  ) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Get inventory from Ansible
   */
  async getInventory(): Promise<Node[]> {
    try {
      this.logger.debug("Fetching Ansible inventory", {
        inventoryPath: this.config.inventoryPath,
      });

      const { stdout } = await execAsync(
        `ansible-inventory -i "${this.config.inventoryPath}" --list`,
      );

      const inventory = JSON.parse(stdout);
      const nodes: Node[] = [];

      // Parse inventory structure
      if (inventory._meta && inventory._meta.hostvars) {
        for (const [hostname, hostvars] of Object.entries(
          inventory._meta.hostvars as Record<string, Record<string, unknown>>,
        )) {
          const groups: string[] = [];

          // Find groups for this host
          for (const [groupName, groupData] of Object.entries(inventory)) {
            if (
              groupName !== "_meta" &&
              groupName !== "all" &&
              typeof groupData === "object" &&
              groupData !== null &&
              "hosts" in groupData &&
              Array.isArray(groupData.hosts) &&
              groupData.hosts.includes(hostname)
            ) {
              groups.push(groupName);
            }
          }

          nodes.push({
            id: hostname,
            name: hostname,
            uri: (hostvars.ansible_host as string) || hostname,
            transport: "ssh",
            source: "ansible",
            metadata: hostvars,
          });
        }
      }

      this.logger.info(`Retrieved ${nodes.length} nodes from Ansible inventory`);
      return nodes;
    } catch (error) {
      this.logger.error("Failed to get Ansible inventory", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to get Ansible inventory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Gather facts from a node using ansible setup module
   */
  async gatherFacts(nodeId: string): Promise<Facts> {
    try {
      this.logger.debug("Gathering facts from node", { nodeId });

      const { stdout } = await execAsync(
        `ansible -i "${this.config.inventoryPath}" ${nodeId} -m setup`,
      );

      // Parse ansible output
      const lines = stdout.split("\n");
      let jsonStart = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("SUCCESS =>")) {
          jsonStart = i + 1;
          break;
        }
      }

      if (jsonStart === -1) {
        throw new Error("Could not parse Ansible facts output");
      }

      const jsonStr = lines.slice(jsonStart).join("\n");
      const result = JSON.parse(jsonStr);

      this.logger.info("Successfully gathered facts", { nodeId });
      return result.ansible_facts || {};
    } catch (error) {
      this.logger.error("Failed to gather facts", {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to gather facts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Run a command on a node using ansible command module
   */
  async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const executionId = `ansible-cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date().toISOString();

    try {
      this.logger.info("Executing command via Ansible", {
        executionId,
        nodeId,
        command,
      });

      const args = [
        "-i",
        this.config.inventoryPath,
        nodeId,
        "-m",
        "shell",
        "-a",
        command,
      ];

      if (this.config.ansibleConfig) {
        process.env.ANSIBLE_CONFIG = this.config.ansibleConfig;
      }

      const result = await this.executeAnsibleCommand("ansible", args, streamingCallback);

      const nodeResult: NodeResult = {
        nodeId,
        status: result.exitCode === 0 ? "success" : "failed",
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        duration: Date.now() - new Date(startedAt).getTime(),
      };

      if (result.exitCode !== 0) {
        nodeResult.error = result.stderr || "Command execution failed";
      }

      return {
        id: executionId,
        type: "command",
        targetNodes: [nodeId],
        action: command,
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        results: [nodeResult],
        command,
      };
    } catch (error) {
      this.logger.error("Command execution failed", {
        executionId,
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        id: executionId,
        type: "command",
        targetNodes: [nodeId],
        action: command,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        results: [
          {
            nodeId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - new Date(startedAt).getTime(),
          },
        ],
        error: error instanceof Error ? error.message : String(error),
        command,
      };
    }
  }

  /**
   * Run an Ansible playbook
   */
  async runPlaybook(
    nodeId: string,
    playbookName: string,
    parameters?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const executionId = `ansible-playbook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date().toISOString();

    try {
      this.logger.info("Executing playbook via Ansible", {
        executionId,
        nodeId,
        playbookName,
        parameters,
      });

      const playbookPath = path.join(this.config.playbookPath, playbookName);

      if (!fs.existsSync(playbookPath)) {
        throw new Error(`Playbook not found: ${playbookPath}`);
      }

      const args = [
        "-i",
        this.config.inventoryPath,
        "--limit",
        nodeId,
        playbookPath,
      ];

      // Add extra variables if provided
      if (parameters && Object.keys(parameters).length > 0) {
        args.push("--extra-vars", JSON.stringify(parameters));
      }

      if (this.config.ansibleConfig) {
        process.env.ANSIBLE_CONFIG = this.config.ansibleConfig;
      }

      const result = await this.executeAnsibleCommand(
        "ansible-playbook",
        args,
        streamingCallback,
      );

      const nodeResult: NodeResult = {
        nodeId,
        status: result.exitCode === 0 ? "success" : "failed",
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        duration: Date.now() - new Date(startedAt).getTime(),
      };

      if (result.exitCode !== 0) {
        nodeResult.error = result.stderr || "Playbook execution failed";
      }

      return {
        id: executionId,
        type: "playbook",
        targetNodes: [nodeId],
        action: playbookName,
        parameters,
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        results: [nodeResult],
      };
    } catch (error) {
      this.logger.error("Playbook execution failed", {
        executionId,
        nodeId,
        playbookName,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        id: executionId,
        type: "playbook",
        targetNodes: [nodeId],
        action: playbookName,
        parameters,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        results: [
          {
            nodeId,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - new Date(startedAt).getTime(),
          },
        ],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List available playbooks
   */
  async listPlaybooks(): Promise<Playbook[]> {
    try {
      this.logger.debug("Listing playbooks", {
        playbookPath: this.config.playbookPath,
      });

      if (!fs.existsSync(this.config.playbookPath)) {
        this.logger.warn("Playbook directory does not exist", {
          playbookPath: this.config.playbookPath,
        });
        return [];
      }

      const files = fs.readdirSync(this.config.playbookPath);
      const playbooks: Playbook[] = [];

      for (const file of files) {
        if (file.endsWith(".yml") || file.endsWith(".yaml")) {
          const fullPath = path.join(this.config.playbookPath, file);
          playbooks.push({
            name: file,
            path: fullPath,
            description: `Ansible playbook: ${file}`,
          });
        }
      }

      this.logger.info(`Found ${playbooks.length} playbooks`);
      return playbooks;
    } catch (error) {
      this.logger.error("Failed to list playbooks", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get playbook details
   */
  async getPlaybookDetails(playbookName: string): Promise<Playbook | null> {
    try {
      const playbookPath = path.join(this.config.playbookPath, playbookName);

      if (!fs.existsSync(playbookPath)) {
        return null;
      }

      return {
        name: playbookName,
        path: playbookPath,
        description: `Ansible playbook: ${playbookName}`,
      };
    } catch (error) {
      this.logger.error("Failed to get playbook details", {
        playbookName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Execute an Ansible command with streaming support
   */
  private executeAnsibleCommand(
    command: string,
    args: string[],
    streamingCallback?: StreamingCallback,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        if (streamingCallback) {
          streamingCallback({
            nodeId: "ansible",
            stream: "stdout",
            data: chunk,
            timestamp: new Date().toISOString(),
          });
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;

        if (streamingCallback) {
          streamingCallback({
            nodeId: "ansible",
            stream: "stderr",
            data: chunk,
            timestamp: new Date().toISOString(),
          });
        }
      });

      proc.on("close", (code: number | null) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      proc.on("error", (error: Error) => {
        reject(error);
      });
    });
  }

  getInventoryPath(): string {
    return this.config.inventoryPath;
  }

  getDefaultTimeout(): number {
    return this.config.defaultTimeout;
  }
}
