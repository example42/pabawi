import { randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import type { ExecutionResult, Node } from "../bolt/types";

export interface StreamingCallback {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onCommand?: (command: string) => void;
}

interface CommandExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string;
}

export class AnsibleService {
  private readonly ansibleProjectPath: string;
  private readonly inventoryPath: string;
  private readonly defaultTimeout: number;

  constructor(
    ansibleProjectPath: string,
    inventoryPath: string,
    defaultTimeout = 300000,
  ) {
    this.ansibleProjectPath = ansibleProjectPath;
    this.inventoryPath = inventoryPath;
    this.defaultTimeout = defaultTimeout;
  }

  public getAnsibleProjectPath(): string {
    return this.ansibleProjectPath;
  }

  public getInventoryPath(): string {
    return this.inventoryPath;
  }

  public async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const args = [
      nodeId,
      "-i",
      this.inventoryPath,
      "-m",
      "shell",
      "-a",
      command,
    ];

    const exec = await this.executeCommand("ansible", args, streamingCallback);
    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible command execution failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "command",
      targetNodes: [nodeId],
      action: command,
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  public async installPackage(
    nodeId: string,
    packageName: string,
    ensure: "present" | "absent" | "latest",
    version?: string,
    settings?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const moduleArgs: Record<string, unknown> = {
      name: version ? `${packageName}-${version}` : packageName,
      state: ensure,
      ...(settings ?? {}),
    };

    const args = [
      nodeId,
      "-i",
      this.inventoryPath,
      "-m",
      "package",
      "-a",
      this.toModuleArgString(moduleArgs),
    ];

    const exec = await this.executeCommand("ansible", args, streamingCallback);
    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible package installation failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "task",
      targetNodes: [nodeId],
      action: "ansible.builtin.package",
      parameters: {
        packageName,
        ensure,
        version,
        settings,
      },
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  public async runPlaybook(
    nodeId: string,
    playbookPath: string,
    extraVars?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const args = [
      "-i",
      this.inventoryPath,
      playbookPath,
      "--limit",
      nodeId,
    ];

    if (extraVars && Object.keys(extraVars).length > 0) {
      args.push("--extra-vars", JSON.stringify(extraVars));
    }

    const exec = await this.executeCommand(
      "ansible-playbook",
      args,
      streamingCallback,
    );

    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible playbook execution failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "task",
      targetNodes: [nodeId],
      action: playbookPath,
      parameters: {
        playbook: true,
        extraVars,
      },
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  private async executeCommand(
    binary: "ansible" | "ansible-playbook" | "ansible-inventory",
    args: string[],
    streamingCallback?: StreamingCallback,
  ): Promise<CommandExecutionResult> {
    if (streamingCallback?.onCommand) {
      streamingCallback.onCommand(this.buildCommandString(binary, args));
    }

    const timeout = this.defaultTimeout;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let childProcess: ChildProcess | null = null;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (childProcess) {
          childProcess.kill("SIGTERM");
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }, timeout);

      try {
        childProcess = spawn(binary, args, {
          cwd: this.ansibleProjectPath,
          env: process.env,
          shell: false,
        });

        if (childProcess.stdout) {
          childProcess.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            if (streamingCallback?.onStdout) {
              streamingCallback.onStdout(chunk);
            }
          });
        }

        if (childProcess.stderr) {
          childProcess.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            if (streamingCallback?.onStderr) {
              streamingCallback.onStderr(chunk);
            }
          });
        }

        childProcess.on("close", (exitCode: number | null) => {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(
              new Error(
                `${binary} execution exceeded timeout of ${String(timeout)}ms`,
              ),
            );
            return;
          }

          resolve({
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
            command: this.buildCommandString(binary, args),
          });
        });

        childProcess.on("error", (error: Error) => {
          clearTimeout(timeoutId);
          reject(
            new Error(`Failed to execute ${binary} command: ${error.message}`),
          );
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Converts a key/value object to Ansible module argument string format.
   * e.g. { name: "curl", state: "present" } -> 'name=curl state=present'
   * Values containing spaces are quoted; internal double quotes are escaped.
   */
  private toModuleArgString(args: Record<string, unknown>): string {
    return Object.entries(args)
      .map(([key, value]) => {
        const strValue = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return strValue.includes(" ") ? `${key}="${strValue}"` : `${key}=${strValue}`;
      })
      .join(" ");
  }

  private buildCommandString(binary: string, args: string[]): string {
    const escapedArgs = args.map((arg) => {
      if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });

    return `${binary} ${escapedArgs.join(" ")}`;
  }

  /**
   * Get groups from Ansible inventory
   * Parses the inventory and returns groups with their member nodes
   */
  public async getGroups(): Promise<Array<{
    id: string;
    name: string;
    source: string;
    sources: string[];
    linked: boolean;
    nodes: string[];
    metadata?: {
      description?: string;
      variables?: Record<string, unknown>;
      hierarchy?: string[];
      [key: string]: unknown;
    };
  }>> {
    const args = [
      "-i",
      this.inventoryPath,
      "--list",
    ];

    try {
      const exec = await this.executeCommand("ansible-inventory", args);

      if (!exec.success) {
        throw new Error(`Failed to get Ansible inventory: ${exec.stderr || exec.stdout}`);
      }

      // Parse JSON output from ansible-inventory
      const inventoryData = JSON.parse(exec.stdout) as Record<string, unknown>;
      const groups: Array<{
        id: string;
        name: string;
        source: string;
        sources: string[];
        linked: boolean;
        nodes: string[];
        metadata?: {
          description?: string;
          variables?: Record<string, unknown>;
          hierarchy?: string[];
          [key: string]: unknown;
        };
      }> = [];

      // Extract groups from inventory structure
      // ansible-inventory --list returns: { _meta: {...}, groupName: { hosts: [...], children: [...], vars: {...} } }
      for (const [groupName, groupData] of Object.entries(inventoryData)) {
        // Skip special _meta key and 'all' and 'ungrouped' groups
        if (groupName === "_meta" || groupName === "all" || groupName === "ungrouped") {
          continue;
        }

        if (typeof groupData !== "object" || groupData === null) {
          continue;
        }

        const group = groupData as {
          hosts?: string[];
          children?: string[];
          vars?: Record<string, unknown>;
        };

        // Get hosts (direct members)
        const hosts = Array.isArray(group.hosts) ? group.hosts : [];

        // Get children groups (for hierarchy)
        const children = Array.isArray(group.children) ? group.children : [];

        // Get group variables
        const vars = typeof group.vars === "object" && group.vars !== null ? group.vars : undefined;

        // Build metadata
        const metadata: {
          description?: string;
          variables?: Record<string, unknown>;
          hierarchy?: string[];
          [key: string]: unknown;
        } = {};

        if (vars && Object.keys(vars).length > 0) {
          metadata.variables = vars as Record<string, unknown>;
        }

        if (children.length > 0) {
          metadata.hierarchy = children;
        }

        // Create group entry
        groups.push({
          id: `ansible:${groupName}`,
          name: groupName,
          source: "ansible",
          sources: ["ansible"],
          linked: false,
          nodes: hosts, // Use hostname directly to match node IDs from getInventory
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
      }

      return groups;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse Ansible inventory groups: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get inventory from Ansible using ansible-inventory command
   * Parses the inventory and returns nodes in Bolt-compatible format
   */
  public async getInventory(): Promise<Node[]> {
    const args = [
      "-i",
      this.inventoryPath,
      "--list",
    ];

    try {
      const exec = await this.executeCommand("ansible-inventory", args);

      if (!exec.success) {
        throw new Error(`Failed to get Ansible inventory: ${exec.stderr || exec.stdout}`);
      }

      // Parse JSON output from ansible-inventory
      const inventoryData = JSON.parse(exec.stdout) as { _meta?: { hostvars?: Record<string, unknown> } };
      const nodes: Node[] = [];

      // Extract hosts from inventory structure
      // ansible-inventory --list returns: { _meta: { hostvars: {...} }, groups: {...} }
      const metaData = inventoryData._meta ?? {};
      const hostvars = metaData.hostvars ?? {};

      for (const [hostname, vars] of Object.entries(hostvars)) {
        const hostVars = typeof vars === "object" && vars !== null ? vars as Record<string, unknown> : {};

        // Determine transport based on connection type
        let transport: "ssh" | "winrm" | "local" = "ssh";
        const connection = hostVars.ansible_connection as string | undefined;

        if (connection === "winrm") {
          transport = "winrm";
        } else if (connection === "local") {
          transport = "local";
        }

        // Build URI
        const host = (hostVars.ansible_host as string | undefined) ?? hostname;
        const port = hostVars.ansible_port as number | undefined;
        const user = hostVars.ansible_user as string | undefined;

        let uri = host;
        if (port) {
          uri = `${host}:${String(port)}`;
        }

        // Build config object
        const config: Record<string, unknown> = {};

        if (user) {
          config.user = user;
        }
        if (port) {
          config.port = port;
        }

        // Add other relevant ansible variables to config
        if (hostVars.ansible_ssh_private_key_file) {
          config["private-key"] = hostVars.ansible_ssh_private_key_file;
        }
        if (hostVars.ansible_become) {
          config.sudo = hostVars.ansible_become;
        }
        if (hostVars.ansible_become_user) {
          config["run-as"] = hostVars.ansible_become_user;
        }

        nodes.push({
          id: hostname,
          name: hostname,
          uri,
          transport,
          config,
          source: "ansible",
        });
      }

      return nodes;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse Ansible inventory: ${error.message}`);
      }
      throw error;
    }
  }
}
