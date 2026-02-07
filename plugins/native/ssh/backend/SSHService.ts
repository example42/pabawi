/**
 * SSH Service
 *
 * Provides SSH connectivity and command execution functionality.
 * Reads SSH configuration from ~/.ssh/config and manages SSH connections.
 *
 * @module plugins/native/ssh/backend/SSHService
 */

import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

/**
 * Node interface
 */
export interface Node {
  id: string;
  name: string;
  uri: string;
  transport: "ssh";
  config: {
    hostname?: string;
    port?: number;
    user?: string;
    identityFile?: string;
    groups?: string[];
    [key: string]: unknown;
  };
}

/**
 * Execution result interface
 */
export interface ExecutionResult {
  id: string;
  type: "command";
  targetNodes: string[];
  action: string;
  status: "success" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  results: NodeResult[];
  error?: string;
  command?: string;
  expertMode?: boolean;
}

/**
 * Node result interface
 */
export interface NodeResult {
  nodeId: string;
  status: "success" | "failed";
  output?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  error?: string;
  duration: number;
}

/**
 * Streaming callback interface
 */
export interface StreamingCallback {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onCommand?: (command: string) => void;
}

/**
 * SSH Service
 *
 * Manages SSH connections and command execution
 */
export class SSHService {
  private sshConfigPath: string;
  private defaultTimeout: number;

  constructor(config?: { sshConfigPath?: string; timeout?: number }) {
    this.sshConfigPath = config?.sshConfigPath ?? join(homedir(), ".ssh", "config");
    this.defaultTimeout = config?.timeout ?? 30000; // 30 seconds default
  }

  /**
   * Parse SSH config file and return nodes
   */
  async getInventory(): Promise<Node[]> {
    try {
      const configContent = await readFile(this.sshConfigPath, "utf-8");
      return this.parseSSHConfig(configContent);
    } catch (error) {
      // If config file doesn't exist or can't be read, return empty inventory
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse SSH config content into nodes
   */
  private parseSSHConfig(content: string): Node[] {
    const nodes: Node[] = [];
    const lines = content.split("\n");
    let currentHost: Partial<Node> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse Host directive
      const hostMatch = trimmed.match(/^Host\s+(.+)$/i);
      if (hostMatch) {
        // Save previous host if exists
        if (currentHost && currentHost.name) {
          nodes.push(this.finalizeNode(currentHost));
        }

        // Start new host
        const hostName = hostMatch[1].trim();
        // Skip wildcard hosts
        if (hostName.includes("*") || hostName.includes("?")) {
          currentHost = null;
          continue;
        }

        currentHost = {
          id: hostName,
          name: hostName,
          transport: "ssh",
          config: {},
        };
        continue;
      }

      // Parse host configuration options
      if (currentHost) {
        const optionMatch = trimmed.match(/^(\w+)\s+(.+)$/);
        if (optionMatch) {
          const [, key, value] = optionMatch;
          const lowerKey = key.toLowerCase();

          if (lowerKey === "hostname") {
            currentHost.config = currentHost.config || {};
            currentHost.config.hostname = value.trim();
          } else if (lowerKey === "port") {
            currentHost.config = currentHost.config || {};
            currentHost.config.port = parseInt(value.trim(), 10);
          } else if (lowerKey === "user") {
            currentHost.config = currentHost.config || {};
            currentHost.config.user = value.trim();
          } else if (lowerKey === "identityfile") {
            currentHost.config = currentHost.config || {};
            currentHost.config.identityFile = value.trim().replace(/^~/, homedir());
          } else {
            // Store other options as-is
            currentHost.config = currentHost.config || {};
            currentHost.config[key] = value.trim();
          }
        }
      }
    }

    // Save last host
    if (currentHost && currentHost.name) {
      nodes.push(this.finalizeNode(currentHost));
    }

    return nodes;
  }

  /**
   * Finalize node configuration
   */
  private finalizeNode(partial: Partial<Node>): Node {
    const config = partial.config || {};
    const hostname = config.hostname || partial.name || "";
    const port = config.port || 22;
    const user = config.user || process.env.USER || "root";

    return {
      id: partial.id || partial.name || hostname,
      name: partial.name || hostname,
      uri: `ssh://${user}@${hostname}:${port}`,
      transport: "ssh",
      config: {
        ...config,
        hostname,
        port,
        user,
      },
    };
  }

  /**
   * Execute command on a remote node via SSH
   */
  async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = `ssh-cmd-${Date.now()}`;

    try {
      // Get node from inventory
      const nodes = await this.getInventory();
      const node = nodes.find((n) => n.id === nodeId || n.name === nodeId);

      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Notify command if callback provided
      if (streamingCallback?.onCommand) {
        streamingCallback.onCommand(command);
      }

      // Build SSH command
      const sshArgs = this.buildSSHArgs(node, command);

      // Execute SSH command
      const result = await this.executeSSH(sshArgs, streamingCallback);

      const duration = Date.now() - startTime;

      return {
        id: executionId,
        type: "command",
        targetNodes: [nodeId],
        action: command,
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        command,
        results: [
          {
            nodeId,
            status: result.exitCode === 0 ? "success" : "failed",
            output: {
              stdout: result.stdout,
              stderr: result.stderr,
              exitCode: result.exitCode,
            },
            error: result.exitCode !== 0 ? result.stderr || "Command failed" : undefined,
            duration,
          },
        ],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        id: executionId,
        type: "command",
        targetNodes: [nodeId],
        action: command,
        status: "failed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        command,
        error: errorMessage,
        results: [
          {
            nodeId,
            status: "failed",
            error: errorMessage,
            duration,
          },
        ],
      };
    }
  }

  /**
   * Build SSH command arguments
   */
  private buildSSHArgs(node: Node, command: string): string[] {
    const args: string[] = [];

    // Add port if specified
    if (node.config.port && node.config.port !== 22) {
      args.push("-p", node.config.port.toString());
    }

    // Add identity file if specified
    if (node.config.identityFile) {
      args.push("-i", node.config.identityFile);
    }

    // Add common SSH options
    args.push(
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
    );

    // Add target
    const user = node.config.user || process.env.USER || "root";
    const hostname = node.config.hostname || node.name;
    args.push(`${user}@${hostname}`);

    // Add command
    args.push(command);

    return args;
  }

  /**
   * Execute SSH command
   */
  private executeSSH(
    args: string[],
    streamingCallback?: StreamingCallback,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const proc = spawn("ssh", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Handle stdout
      proc.stdout.on("data", (chunk: Buffer) => {
        const data = chunk.toString();
        stdout += data;
        if (streamingCallback?.onStdout) {
          streamingCallback.onStdout(data);
        }
      });

      // Handle stderr
      proc.stderr.on("data", (chunk: Buffer) => {
        const data = chunk.toString();
        stderr += data;
        if (streamingCallback?.onStderr) {
          streamingCallback.onStderr(data);
        }
      });

      // Handle process exit
      proc.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      // Handle errors
      proc.on("error", (error) => {
        reject(error);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error("SSH command timed out"));
      }, this.defaultTimeout);

      proc.on("close", () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Get SSH config path
   */
  getSSHConfigPath(): string {
    return this.sshConfigPath;
  }

  /**
   * Get default timeout
   */
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }
}
