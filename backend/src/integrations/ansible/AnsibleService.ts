import { randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, rmSync, mkdtempSync, readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, extname } from "path";
import { parse as parseYaml } from "yaml";
import type { ExecutionResult, Node } from "../bolt/types";
import type { NodeGroup } from "../types";

/**
 * Represents an Ansible playbook file discovered in the project
 */
export interface PlaybookFile {
  /** Relative path from ANSIBLE_PROJECT_PATH */
  path: string;
  /** Filename without directory */
  name: string;
  /** Directory containing the playbook (relative) */
  directory: string;
}

/**
 * Parameter extracted from a playbook's vars_prompt or role defaults
 */
export interface PlaybookParameter {
  name: string;
  type: "String" | "Boolean" | "Integer" | "Array" | "Hash";
  description?: string;
  required: boolean;
  default?: unknown;
  private?: boolean;
}

/**
 * Full playbook details including content and detected parameters
 */
export interface PlaybookDetails {
  path: string;
  name: string;
  content: string;
  plays: PlaybookPlay[];
  parameters: PlaybookParameter[];
}

/**
 * A single play within a playbook
 */
interface PlaybookPlay {
  name?: string;
  hosts?: string;
  roles?: string[];
  tasks?: number;
}

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
    options?: { become?: boolean },
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Check if nodeId exists in inventory
    const inventory = await this.getInventory();
    const nodeInInventory = inventory.some(
      (node) => node.name === nodeId || node.id === nodeId
    );

    let tempInventoryPath: string | null = null;
    let args: string[];

    if (nodeInInventory) {
      args = [
        nodeId,
        "-i",
        this.inventoryPath,
        "-m",
        "shell",
        "-a",
        command,
      ];
    } else {
      // Create temporary inventory for ad-hoc host
      tempInventoryPath = this.createTempInventory(nodeId);
      args = [
        "adhoc",
        "-i",
        tempInventoryPath,
        "-m",
        "shell",
        "-a",
        command,
      ];
    }

    if (options?.become) {
      args.push("--become");
    }

    const exec = await this.executeCommand("ansible", args, streamingCallback);

    // Clean up temporary inventory if created
    if (tempInventoryPath) {
      this.cleanupTempInventory(tempInventoryPath);
    }

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

    // Check if nodeId exists in inventory
    const inventory = await this.getInventory();
    const nodeInInventory = inventory.some(
      (node) => node.name === nodeId || node.id === nodeId
    );

    let tempInventoryPath: string | null = null;
    let args: string[];

    if (nodeInInventory) {
      args = [
        nodeId,
        "-i",
        this.inventoryPath,
        "-m",
        "package",
        "-a",
        this.toModuleArgString(moduleArgs),
      ];
    } else {
      // Create temporary inventory for ad-hoc host
      tempInventoryPath = this.createTempInventory(nodeId);
      args = [
        "adhoc",
        "-i",
        tempInventoryPath,
        "-m",
        "package",
        "-a",
        this.toModuleArgString(moduleArgs),
      ];
    }

    const exec = await this.executeCommand("ansible", args, streamingCallback);

    // Clean up temporary inventory if created
    if (tempInventoryPath) {
      this.cleanupTempInventory(tempInventoryPath);
    }

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
  public async getGroups(): Promise<NodeGroup[]> {
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
      const groups: NodeGroup[] = [];

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

        // Get hosts (direct members), validate each entry is a non-empty string
        // before prefixing with the source to avoid producing IDs like
        // "ansible:[object Object]" for non-string entries.
        const hosts = Array.isArray(group.hosts)
          ? group.hosts
              .filter((h: unknown): h is string => typeof h === "string")
              .map((h) => h.trim())
              .filter((h) => h.length > 0)
              .map((h) => `ansible:${h}`)
          : [];

        // Get children groups (for hierarchy)
        const children = Array.isArray(group.children) ? group.children : [];

        // Get group variables
        const vars = typeof group.vars === "object" ? group.vars : undefined;

        // Build metadata
        const metadata: NonNullable<NodeGroup['metadata']> = {};

        if (vars && Object.keys(vars).length > 0) {
          metadata.variables = vars;
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
          nodes: hosts,
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

  /**
   * Create a temporary inventory file for an ad-hoc host
   * @param hostname - The hostname to create inventory for
   * @returns Path to the temporary inventory file
   */
  private createTempInventory(hostname: string): string {
    // Validate hostname to prevent INI injection via crafted node IDs.
    // Ansible INI inventory allows inline variable assignments (e.g. host key=val),
    // so any whitespace or special characters in the hostname could inject parameters.
    if (!/^[a-zA-Z0-9._-]+$/.test(hostname)) {
      throw new Error(`Invalid hostname for Ansible inventory: "${hostname}". Only alphanumeric characters, dots, hyphens, and underscores are allowed.`);
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'ansible-'));
    const inventoryPath = join(tempDir, 'inventory');

    const user = process.env.ANSIBLE_REMOTE_USER ?? process.env.SSH_DEFAULT_USER ?? "root";

    // Create a simple INI-style inventory file
    const inventoryContent = `[adhoc]
${hostname} ansible_connection=ssh ansible_user=${user}
`;

    writeFileSync(inventoryPath, inventoryContent, 'utf8');
    return inventoryPath;
  }

  /**
   * Clean up a temporary inventory file and its enclosing temp directory in
   * one call. `rmSync(..., { recursive, force })` handles the file + dir at
   * once and silently no-ops if either is already gone — replaces the prior
   * pattern that called `unlinkSync` on a directory and relied on try/catch
   * to swallow the inevitable EISDIR error.
   */
  private cleanupTempInventory(inventoryPath: string): void {
    try {
      rmSync(dirname(inventoryPath), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — temp dir cleanup must never break the caller
    }
  }

  /**
   * List all playbook YAML files in the configured ANSIBLE_PROJECT_PATH.
   *
   * Recursively scans the project directory for .yml/.yaml files that look
   * like playbooks (top-level array of plays). Excludes common non-playbook
   * directories (roles, group_vars, host_vars, etc.).
   */
  public listPlaybooks(): PlaybookFile[] {
    const playbooks: PlaybookFile[] = [];
    this.scanForPlaybooks(this.ansibleProjectPath, playbooks);
    return playbooks.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Get full details of a playbook including content and extracted parameters.
   *
   * Parses the YAML to extract:
   * - vars_prompt entries (interactive variables)
   * - vars with defaults (extra-vars candidates)
   * - Play structure (name, hosts, roles, task count)
   */
  public getPlaybookDetails(playbookRelPath: string): PlaybookDetails | null {
    // Validate path — must be relative, no traversal
    if (playbookRelPath.startsWith("/") || playbookRelPath.includes("..")) {
      return null;
    }

    const fullPath = join(this.ansibleProjectPath, playbookRelPath);
    const resolvedFull = join(this.ansibleProjectPath, playbookRelPath);

    // Ensure resolved path is within project (prevent symlink escape)
    if (!resolvedFull.startsWith(this.ansibleProjectPath)) {
      return null;
    }

    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch {
      // Invalid YAML — return raw content without parse data
      return {
        path: playbookRelPath,
        name: playbookRelPath.split("/").pop() ?? playbookRelPath,
        content,
        plays: [],
        parameters: [],
      };
    }

    const plays = this.extractPlays(parsed);
    const parameters = this.extractParameters(parsed);

    return {
      path: playbookRelPath,
      name: playbookRelPath.split("/").pop() ?? playbookRelPath,
      content,
      plays,
      parameters,
    };
  }

  /**
   * Recursively scan for playbook files.
   * Skips directories that typically contain task files, not playbooks.
   */
  private scanForPlaybooks(dir: string, results: PlaybookFile[]): void {
    const EXCLUDED_DIRS = new Set([
      "roles",
      ".git",
      "node_modules",
      "__pycache__",
      ".venv",
      "venv",
      "collections",
      "molecule",
      "filter_plugins",
      "library",
      "callback_plugins",
      "action_plugins",
      "lookup_plugins",
      "module_utils",
      "group_vars",
      "host_vars",
    ]);

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry) && !entry.startsWith(".")) {
          this.scanForPlaybooks(fullPath, results);
        }
        continue;
      }

      if (!stat.isFile()) continue;

      const ext = extname(entry).toLowerCase();
      if (ext !== ".yml" && ext !== ".yaml") continue;

      // Quick check: read file and see if it parses as a playbook (array of plays)
      if (this.isPlaybookFile(fullPath)) {
        const relPath = relative(this.ansibleProjectPath, fullPath);
        const dirPart = relative(this.ansibleProjectPath, dirname(fullPath));
        results.push({
          path: relPath,
          name: entry,
          directory: dirPart || ".",
        });
      }
    }
  }

  /**
   * Check if a YAML file looks like a playbook (top-level array with plays).
   */
  private isPlaybookFile(filePath: string): boolean {
    try {
      const content = readFileSync(filePath, "utf8");
      const parsed: unknown = parseYaml(content);

      // A playbook is an array of plays
      if (!Array.isArray(parsed) || parsed.length === 0) return false;

      // Each play should be an object with typical play keys
      const firstPlay = parsed[0] as Record<string, unknown> | null;
      if (typeof firstPlay !== "object" || firstPlay === null) return false;

      const playKeys = Object.keys(firstPlay);
      const playbookIndicators = [
        "hosts",
        "roles",
        "tasks",
        "pre_tasks",
        "post_tasks",
        "handlers",
        "import_playbook",
        "include",
      ];

      return playKeys.some((k) => playbookIndicators.includes(k));
    } catch {
      return false;
    }
  }

  /**
   * Extract play summaries from parsed YAML.
   */
  private extractPlays(parsed: unknown): PlaybookPlay[] {
    if (!Array.isArray(parsed)) return [];

    const plays: PlaybookPlay[] = [];

    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const play = item as Record<string, unknown>;

      const roles = Array.isArray(play.roles)
        ? play.roles
            .map((r: unknown) => {
              if (typeof r === "string") return r;
              if (typeof r === "object" && r !== null && "role" in r) {
                return String((r as Record<string, unknown>).role);
              }
              return null;
            })
            .filter((r): r is string => r !== null)
        : undefined;

      const taskCount = Array.isArray(play.tasks) ? play.tasks.length : 0;

      plays.push({
        name: typeof play.name === "string" ? play.name : undefined,
        hosts: typeof play.hosts === "string" ? play.hosts : undefined,
        roles,
        tasks: taskCount > 0 ? taskCount : undefined,
      });
    }

    return plays;
  }

  /**
   * Extract parameters from a playbook.
   *
   * Sources of parameters (in priority order):
   * 1. vars_prompt — explicitly prompted variables (required)
   * 2. Top-level vars — serve as defaults that extra-vars can override
   */
  private extractParameters(parsed: unknown): PlaybookParameter[] {
    if (!Array.isArray(parsed)) return [];

    const params = new Map<string, PlaybookParameter>();

    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const play = item as Record<string, unknown>;

      // Extract vars_prompt
      if (Array.isArray(play.vars_prompt)) {
        for (const prompt of play.vars_prompt) {
          if (typeof prompt !== "object" || prompt === null) continue;
          const p = prompt as Record<string, unknown>;

          const name = typeof p.name === "string" ? p.name : null;
          if (!name) continue;

          params.set(name, {
            name,
            type: "String",
            description: typeof p.prompt === "string" ? p.prompt : undefined,
            required: p.default === undefined,
            default: p.default,
            private: p.private === true,
          });
        }
      }

      // Extract vars (as optional parameters with defaults)
      if (typeof play.vars === "object" && play.vars !== null && !Array.isArray(play.vars)) {
        const vars = play.vars as Record<string, unknown>;
        for (const [varName, varValue] of Object.entries(vars)) {
          // Skip if already extracted from vars_prompt
          if (params.has(varName)) continue;

          params.set(varName, {
            name: varName,
            type: this.inferParameterType(varValue),
            description: undefined,
            required: false,
            default: varValue,
          });
        }
      }
    }

    return Array.from(params.values());
  }

  /**
   * Infer the parameter type from a default value.
   */
  private inferParameterType(value: unknown): PlaybookParameter["type"] {
    if (typeof value === "boolean") return "Boolean";
    if (typeof value === "number") return "Integer";
    if (Array.isArray(value)) return "Array";
    if (typeof value === "object" && value !== null) return "Hash";
    return "String";
  }
}
