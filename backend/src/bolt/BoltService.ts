import { spawn, type ChildProcess } from "child_process";
import {
  type BoltExecutionResult,
  type BoltExecutionOptions,
  type BoltJsonOutput,
  type Node,
  type Facts,
  type ExecutionResult,
  type NodeResult,
  type Task,
  type TaskParameter,
  BoltExecutionError,
  BoltTimeoutError,
  BoltParseError,
  BoltInventoryNotFoundError,
  BoltNodeUnreachableError,
  BoltTaskNotFoundError,
  BoltTaskParameterError,
} from "./types";

/**
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture
 */
export class BoltService {
  private readonly defaultTimeout: number;
  private readonly boltProjectPath: string;
  private taskListCache: Task[] | null = null;

  constructor(boltProjectPath: string, defaultTimeout = 300000) {
    this.boltProjectPath = boltProjectPath;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute a Bolt CLI command with timeout handling
   *
   * @param args - Command line arguments for Bolt CLI
   * @param options - Execution options including timeout and working directory
   * @returns Promise resolving to execution result
   * @throws BoltTimeoutError if execution exceeds timeout
   * @throws BoltExecutionError if Bolt returns non-zero exit code
   */
  public async executeCommand(
    args: string[],
    options: BoltExecutionOptions = {},
  ): Promise<BoltExecutionResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const cwd = options.cwd ?? this.boltProjectPath;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let childProcess: ChildProcess | null = null;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (childProcess) {
          childProcess.kill("SIGTERM");
          // Force kill after 5 seconds if SIGTERM doesn't work
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }, timeout);

      try {
        // Spawn Bolt process
        childProcess = spawn("bolt", args, {
          cwd,
          env: process.env,
          shell: false,
        });

        // Capture stdout
        if (childProcess.stdout) {
          childProcess.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
          });
        }

        // Capture stderr
        if (childProcess.stderr) {
          childProcess.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
        }

        // Handle process completion
        childProcess.on("close", (exitCode: number | null) => {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(
              new BoltTimeoutError(
                `Bolt command execution exceeded timeout of ${String(timeout)}ms`,
                timeout,
              ),
            );
            return;
          }

          const result: BoltExecutionResult = {
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          };

          if (exitCode !== 0) {
            result.error =
              stderr.trim() !== ""
                ? stderr.trim()
                : `Bolt command failed with exit code ${String(exitCode)}`;
          }

          resolve(result);
        });

        // Handle process errors
        childProcess.on("error", (error: Error) => {
          clearTimeout(timeoutId);
          reject(
            new BoltExecutionError(
              `Failed to execute Bolt command: ${error.message}`,
              null,
              stderr.trim(),
              stdout.trim(),
            ),
          );
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Execute a Bolt CLI command and parse JSON output
   *
   * @param args - Command line arguments for Bolt CLI (should include --format json)
   * @param options - Execution options
   * @returns Promise resolving to parsed JSON output
   * @throws BoltParseError if JSON parsing fails
   * @throws BoltExecutionError if Bolt returns non-zero exit code
   * @throws BoltTimeoutError if execution exceeds timeout
   */
  public async executeCommandWithJsonOutput(
    args: string[],
    options: BoltExecutionOptions = {},
  ): Promise<BoltJsonOutput> {
    // Ensure --format json is included in args
    const argsToUse =
      !args.includes("--format") && !args.includes("json")
        ? [...args, "--format", "json"]
        : args;

    const result = await this.executeCommand(argsToUse, options);

    if (!result.success) {
      throw new BoltExecutionError(
        result.error ?? "Bolt command failed",
        result.exitCode,
        result.stderr,
        result.stdout,
      );
    }

    return this.parseJsonOutput(result.stdout);
  }

  /**
   * Parse JSON output from Bolt CLI
   *
   * @param output - Raw stdout from Bolt CLI
   * @returns Parsed JSON object
   * @throws BoltParseError if parsing fails
   */
  public parseJsonOutput(output: string): BoltJsonOutput {
    if (!output || output.trim().length === 0) {
      throw new BoltParseError(
        "Bolt command returned empty output",
        output,
        new Error("Empty output"),
      );
    }

    try {
      return JSON.parse(output) as BoltJsonOutput;
    } catch (error) {
      throw new BoltParseError(
        "Failed to parse Bolt JSON output",
        output,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Get the Bolt project path
   */
  public getBoltProjectPath(): string {
    return this.boltProjectPath;
  }

  /**
   * Get the default timeout
   */
  public getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  /**
   * Retrieve inventory from Bolt
   *
   * Executes `bolt inventory show --format json` and transforms the output
   * into an array of Node objects
   *
   * @returns Promise resolving to array of nodes
   * @throws BoltInventoryNotFoundError if inventory file is not found
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   */
  public async getInventory(): Promise<Node[]> {
    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        "inventory",
        "show",
        "--format",
        "json",
        "--detail",
      ]);

      return this.transformInventoryToNodes(jsonOutput);
    } catch (error) {
      // Check if error is due to missing inventory file
      if (error instanceof BoltExecutionError && error.stderr) {
        const errorMessage = error.stderr.toLowerCase();
        if (
          errorMessage.includes("inventory file") ||
          errorMessage.includes("could not find") ||
          errorMessage.includes("no such file")
        ) {
          throw new BoltInventoryNotFoundError(
            "Bolt inventory file not found. Ensure inventory.yaml exists in the Bolt project directory.",
          );
        }
      }
      throw error;
    }
  }

  /**
   * Transform Bolt inventory JSON output to Node array
   *
   * @param jsonOutput - Raw JSON output from Bolt inventory command
   * @returns Array of Node objects
   */
  private transformInventoryToNodes(jsonOutput: BoltJsonOutput): Node[] {
    const nodes: Node[] = [];

    // Bolt inventory output with --detail flag has structure:
    // { "inventory": { "targets": [...] }, "targets": [...] }
    // We use inventory.targets for detailed information

    // Check for inventory.targets (detailed format)
    if (jsonOutput.inventory && Array.isArray(jsonOutput.inventory.targets)) {
      for (const target of jsonOutput.inventory.targets) {
        const node = this.parseInventoryTarget(target);
        if (node) {
          nodes.push(node);
        }
      }
      return nodes;
    }

    // Fallback: Handle root targets array format
    const targets = jsonOutput.targets;
    if (Array.isArray(targets)) {
      for (const target of targets) {
        const node = this.parseInventoryTarget(target);
        if (node) {
          nodes.push(node);
        }
      }
      return nodes;
    }

    // Fallback: Handle flat object format where keys are node names
    for (const [nodeName, nodeData] of Object.entries(jsonOutput)) {
      if (typeof nodeData === "object" && nodeData !== null) {
        const node = this.parseInventoryTarget({ name: nodeName, ...nodeData });
        if (node) {
          nodes.push(node);
        }
      }
    }

    return nodes;
  }

  /**
   * Parse a single inventory target into a Node object
   *
   * @param target - Raw target data from Bolt inventory
   * @returns Node object or null if parsing fails
   */
  private parseInventoryTarget(target: unknown): Node | null {
    if (typeof target !== "object" || target === null) {
      return null;
    }

    const targetObj = target as Record<string, unknown>;

    // Extract node name
    const name = typeof targetObj.name === "string" ? targetObj.name : null;
    if (!name) {
      return null;
    }

    // Extract URI
    const uri = typeof targetObj.uri === "string" ? targetObj.uri : name;

    // Extract transport (default to 'ssh' if not specified)
    let transport: "ssh" | "winrm" | "docker" | "local" = "ssh";
    if (typeof targetObj.transport === "string") {
      const transportValue = targetObj.transport.toLowerCase();
      if (
        transportValue === "ssh" ||
        transportValue === "winrm" ||
        transportValue === "docker" ||
        transportValue === "local"
      ) {
        transport = transportValue;
      }
    }

    // Extract config
    const config: Node["config"] = {};
    if (typeof targetObj.config === "object" && targetObj.config !== null) {
      const configObj = targetObj.config as Record<string, unknown>;
      Object.assign(config, configObj);
    }

    // Extract common config fields from top level if not in config object
    if (typeof targetObj.user === "string" && config.user === undefined) {
      config.user = targetObj.user;
    }
    if (typeof targetObj.port === "number" && config.port === undefined) {
      config.port = targetObj.port;
    }

    // Generate ID from name (use name as-is for ID)
    const id = name;

    return {
      id,
      name,
      uri,
      transport,
      config,
    };
  }

  /**
   * Gather facts from a target node
   *
   * Executes `bolt task run facts --targets <node> --format json` and
   * structures the output as a Facts object
   *
   * @param nodeId - The ID/name of the target node
   * @returns Promise resolving to Facts object
   * @throws BoltNodeUnreachableError if the node is unreachable
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   */
  public async gatherFacts(nodeId: string): Promise<Facts> {
    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        "task",
        "run",
        "facts",
        "--targets",
        nodeId,
        "--format",
        "json",
      ]);

      return this.transformFactsOutput(nodeId, jsonOutput);
    } catch (error) {
      // Check if error is due to node being unreachable
      if (error instanceof BoltExecutionError && error.stderr) {
        const errorMessage = error.stderr.toLowerCase();
        if (
          errorMessage.includes("unreachable") ||
          errorMessage.includes("connection") ||
          errorMessage.includes("could not connect") ||
          errorMessage.includes("timed out") ||
          errorMessage.includes("connection refused") ||
          errorMessage.includes("no route to host")
        ) {
          throw new BoltNodeUnreachableError(
            `Node ${nodeId} is unreachable`,
            nodeId,
            error.stderr,
          );
        }
      }
      throw error;
    }
  }

  /**
   * Transform Bolt facts output to Facts object
   *
   * @param nodeId - The ID of the node
   * @param jsonOutput - Raw JSON output from Bolt facts command
   * @returns Facts object
   */
  private transformFactsOutput(
    nodeId: string,
    jsonOutput: BoltJsonOutput,
  ): Facts {
    // Bolt task output structure typically has items array with results per node
    // Format: { "items": [{ "target": "node1", "status": "success", "value": {...} }] }

    let factsData: Record<string, unknown> = {};

    // Handle items array format
    const items = jsonOutput.items;
    if (Array.isArray(items) && items.length > 0) {
      const item = items[0] as Record<string, unknown>;
      if (
        item.status === "success" &&
        typeof item.value === "object" &&
        item.value !== null
      ) {
        factsData = item.value as Record<string, unknown>;
      }
    } else {
      // Handle direct facts format
      factsData = jsonOutput;
    }

    // Extract and structure facts according to the Facts interface
    const facts: Facts["facts"] = {
      os: this.extractOsFacts(factsData),
      processors: this.extractProcessorFacts(factsData),
      memory: this.extractMemoryFacts(factsData),
      networking: this.extractNetworkingFacts(factsData),
    };

    // Include any additional facts
    for (const [key, value] of Object.entries(factsData)) {
      if (!["os", "processors", "memory", "networking"].includes(key)) {
        facts[key] = value;
      }
    }

    return {
      nodeId,
      gatheredAt: new Date().toISOString(),
      facts,
    };
  }

  /**
   * Extract OS facts from raw facts data
   */
  private extractOsFacts(
    factsData: Record<string, unknown>,
  ): Facts["facts"]["os"] {
    const os = factsData.os as Record<string, unknown> | undefined;
    const release = os?.release as Record<string, unknown> | undefined;

    return {
      family: typeof os?.family === "string" ? os.family : "unknown",
      name: typeof os?.name === "string" ? os.name : "unknown",
      release: {
        full: typeof release?.full === "string" ? release.full : "unknown",
        major: typeof release?.major === "string" ? release.major : "unknown",
      },
    };
  }

  /**
   * Extract processor facts from raw facts data
   */
  private extractProcessorFacts(
    factsData: Record<string, unknown>,
  ): Facts["facts"]["processors"] {
    const processors = factsData.processors as
      | Record<string, unknown>
      | undefined;

    return {
      count: typeof processors?.count === "number" ? processors.count : 0,
      models: Array.isArray(processors?.models)
        ? processors.models.filter((m): m is string => typeof m === "string")
        : [],
    };
  }

  /**
   * Extract memory facts from raw facts data
   */
  private extractMemoryFacts(
    factsData: Record<string, unknown>,
  ): Facts["facts"]["memory"] {
    const memory = factsData.memory as Record<string, unknown> | undefined;
    const system = memory?.system as Record<string, unknown> | undefined;

    return {
      system: {
        total: typeof system?.total === "string" ? system.total : "0",
        available:
          typeof system?.available === "string" ? system.available : "0",
      },
    };
  }

  /**
   * Extract networking facts from raw facts data
   */
  private extractNetworkingFacts(
    factsData: Record<string, unknown>,
  ): Facts["facts"]["networking"] {
    const networking = factsData.networking as
      | Record<string, unknown>
      | undefined;

    const hostname =
      networking !== undefined && typeof networking.hostname === "string"
        ? networking.hostname
        : "unknown";

    const interfaces =
      networking !== undefined &&
      typeof networking.interfaces === "object" &&
      networking.interfaces !== null
        ? (networking.interfaces as Record<string, unknown>)
        : {};

    return {
      hostname,
      interfaces,
    };
  }

  /**
   * Execute a command on a target node
   *
   * Executes `bolt command run <cmd> --targets <node> --format json` and
   * returns structured execution results including stdout, stderr, and exit code
   *
   * @param nodeId - The ID/name of the target node
   * @param command - The command string to execute
   * @returns Promise resolving to ExecutionResult object
   * @throws BoltNodeUnreachableError if the node is unreachable
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   * @throws BoltTimeoutError if execution exceeds timeout
   */
  public async runCommand(
    nodeId: string,
    command: string,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        "command",
        "run",
        command,
        "--targets",
        nodeId,
        "--format",
        "json",
      ]);

      const endTime = Date.now();
      return this.transformCommandOutput(
        executionId,
        nodeId,
        command,
        jsonOutput,
        startTime,
        endTime,
      );
    } catch (error) {
      const endTime = Date.now();

      // Check if error is due to node being unreachable
      if (error instanceof BoltExecutionError && error.stderr) {
        const errorMessage = error.stderr.toLowerCase();
        if (
          errorMessage.includes("unreachable") ||
          errorMessage.includes("connection") ||
          errorMessage.includes("could not connect") ||
          errorMessage.includes("timed out") ||
          errorMessage.includes("connection refused") ||
          errorMessage.includes("no route to host")
        ) {
          throw new BoltNodeUnreachableError(
            `Node ${nodeId} is unreachable`,
            nodeId,
            error.stderr,
          );
        }
      }

      // Return failed execution result for other errors
      if (error instanceof BoltExecutionError) {
        return {
          id: executionId,
          type: "command",
          targetNodes: [nodeId],
          action: command,
          status: "failed",
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date(endTime).toISOString(),
          results: [
            {
              nodeId,
              status: "failed",
              error: error.message,
              duration: endTime - startTime,
            },
          ],
          error: error.message,
        };
      }

      throw error;
    }
  }

  /**
   * Transform Bolt command output to ExecutionResult object
   *
   * @param executionId - Unique execution identifier
   * @param nodeId - The ID of the target node
   * @param command - The command that was executed
   * @param jsonOutput - Raw JSON output from Bolt command
   * @param startTime - Execution start timestamp
   * @param endTime - Execution end timestamp
   * @returns ExecutionResult object
   */
  private transformCommandOutput(
    executionId: string,
    nodeId: string,
    command: string,
    jsonOutput: BoltJsonOutput,
    startTime: number,
    endTime: number,
  ): ExecutionResult {
    // Bolt command output structure: { "items": [{ "target": "node1", "status": "success", "value": {...} }] }
    const items = jsonOutput.items;
    const results: NodeResult[] = [];
    let overallStatus: ExecutionResult["status"] = "success";

    if (Array.isArray(items)) {
      for (const item of items) {
        const itemObj = item as Record<string, unknown>;
        const target =
          typeof itemObj.target === "string" ? itemObj.target : nodeId;
        const status = itemObj.status === "success" ? "success" : "failed";

        if (status === "failed") {
          overallStatus = "failed";
        }

        const nodeResult: NodeResult = {
          nodeId: target,
          status,
          duration: endTime - startTime,
        };

        // Extract output from value object
        if (typeof itemObj.value === "object" && itemObj.value !== null) {
          const value = itemObj.value as Record<string, unknown>;
          nodeResult.output = {
            stdout: typeof value.stdout === "string" ? value.stdout : "",
            stderr: typeof value.stderr === "string" ? value.stderr : "",
            exitCode:
              typeof value.exit_code === "number" ? value.exit_code : undefined,
          };
        }

        // Extract error message if present
        if (typeof itemObj.error === "object" && itemObj.error !== null) {
          const errorObj = itemObj.error as Record<string, unknown>;
          nodeResult.error =
            typeof errorObj.msg === "string"
              ? errorObj.msg
              : typeof errorObj.message === "string"
                ? errorObj.message
                : "Command execution failed";
        }

        results.push(nodeResult);
      }
    }

    return {
      id: executionId,
      type: "command",
      targetNodes: [nodeId],
      action: command,
      status: overallStatus,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      results,
    };
  }

  /**
   * Generate a unique execution ID
   *
   * @returns Unique execution identifier
   */
  private generateExecutionId(): string {
    return `exec_${String(Date.now())}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Execute a task on a target node
   *
   * Executes `bolt task run <task> --targets <node> --params <json> --format json`
   * and returns structured execution results
   *
   * @param nodeId - The ID/name of the target node
   * @param taskName - The name of the task to execute
   * @param parameters - Task parameters as key-value pairs
   * @returns Promise resolving to ExecutionResult object
   * @throws BoltTaskNotFoundError if the task does not exist
   * @throws BoltTaskParameterError if parameters are invalid
   * @throws BoltNodeUnreachableError if the node is unreachable
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   * @throws BoltTimeoutError if execution exceeds timeout
   */
  public async runTask(
    nodeId: string,
    taskName: string,
    parameters?: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    try {
      // Build command arguments
      const args = [
        "task",
        "run",
        taskName,
        "--targets",
        nodeId,
        "--format",
        "json",
      ];

      // Add parameters if provided
      if (parameters && Object.keys(parameters).length > 0) {
        args.push("--params", JSON.stringify(parameters));
      }

      const jsonOutput = await this.executeCommandWithJsonOutput(args);

      const endTime = Date.now();
      return this.transformTaskOutput(
        executionId,
        nodeId,
        taskName,
        parameters,
        jsonOutput,
        startTime,
        endTime,
      );
    } catch (error) {
      const endTime = Date.now();

      // Check if error is due to task not found
      if (error instanceof BoltExecutionError && error.stderr) {
        const errorMessage = error.stderr.toLowerCase();

        if (
          errorMessage.includes("could not find") ||
          errorMessage.includes("task not found") ||
          errorMessage.includes("no such task") ||
          errorMessage.includes("unknown task")
        ) {
          throw new BoltTaskNotFoundError(
            `Task '${taskName}' not found in Bolt modules`,
            taskName,
          );
        }

        // Check for parameter validation errors
        if (
          errorMessage.includes("parameter") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("required") ||
          errorMessage.includes("missing")
        ) {
          const paramErrors = this.extractParameterErrors(error.stderr);
          throw new BoltTaskParameterError(
            `Invalid parameters for task '${taskName}'`,
            taskName,
            paramErrors,
          );
        }

        // Check if error is due to node being unreachable
        if (
          errorMessage.includes("unreachable") ||
          errorMessage.includes("connection") ||
          errorMessage.includes("could not connect") ||
          errorMessage.includes("timed out") ||
          errorMessage.includes("connection refused") ||
          errorMessage.includes("no route to host")
        ) {
          throw new BoltNodeUnreachableError(
            `Node ${nodeId} is unreachable`,
            nodeId,
            error.stderr,
          );
        }
      }

      // Return failed execution result for other errors
      if (error instanceof BoltExecutionError) {
        return {
          id: executionId,
          type: "task",
          targetNodes: [nodeId],
          action: taskName,
          parameters,
          status: "failed",
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date(endTime).toISOString(),
          results: [
            {
              nodeId,
              status: "failed",
              error: error.message,
              duration: endTime - startTime,
            },
          ],
          error: error.message,
        };
      }

      throw error;
    }
  }

  /**
   * Transform Bolt task output to ExecutionResult object
   *
   * @param executionId - Unique execution identifier
   * @param nodeId - The ID of the target node
   * @param taskName - The name of the task that was executed
   * @param parameters - Task parameters that were provided
   * @param jsonOutput - Raw JSON output from Bolt task command
   * @param startTime - Execution start timestamp
   * @param endTime - Execution end timestamp
   * @returns ExecutionResult object
   */
  private transformTaskOutput(
    executionId: string,
    nodeId: string,
    taskName: string,
    parameters: Record<string, unknown> | undefined,
    jsonOutput: BoltJsonOutput,
    startTime: number,
    endTime: number,
  ): ExecutionResult {
    // Bolt task output structure: { "items": [{ "target": "node1", "status": "success", "value": {...} }] }
    const items = jsonOutput.items;
    const results: NodeResult[] = [];
    let overallStatus: ExecutionResult["status"] = "success";

    if (Array.isArray(items)) {
      for (const item of items) {
        const itemObj = item as Record<string, unknown>;
        const target =
          typeof itemObj.target === "string" ? itemObj.target : nodeId;
        const status = itemObj.status === "success" ? "success" : "failed";

        if (status === "failed") {
          overallStatus = "failed";
        }

        const nodeResult: NodeResult = {
          nodeId: target,
          status,
          duration: endTime - startTime,
        };

        // Extract task result value
        if (itemObj.value !== undefined) {
          nodeResult.value = itemObj.value;
        }

        // Extract error message if present
        if (typeof itemObj.error === "object" && itemObj.error !== null) {
          const errorObj = itemObj.error as Record<string, unknown>;
          nodeResult.error =
            typeof errorObj.msg === "string"
              ? errorObj.msg
              : typeof errorObj.message === "string"
                ? errorObj.message
                : "Task execution failed";
        }

        results.push(nodeResult);
      }
    }

    return {
      id: executionId,
      type: "task",
      targetNodes: [nodeId],
      action: taskName,
      parameters,
      status: overallStatus,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      results,
    };
  }

  /**
   * Extract parameter error messages from Bolt stderr output
   *
   * @param stderr - Error output from Bolt
   * @returns Array of parameter error messages
   */
  private extractParameterErrors(stderr: string): string[] {
    const errors: string[] = [];
    const lines = stderr.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.includes("parameter") ||
        trimmed.includes("required") ||
        trimmed.includes("invalid") ||
        trimmed.includes("missing")
      ) {
        errors.push(trimmed);
      }
    }

    // If no specific errors found, return the full stderr as a single error
    if (errors.length === 0) {
      errors.push(stderr.trim());
    }

    return errors;
  }

  /**
   * List available Bolt tasks
   *
   * Executes `bolt task show --format json` to retrieve available tasks
   * with their metadata including parameters and descriptions.
   * Results are cached until server restart.
   *
   * @returns Promise resolving to array of Task objects
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   */
  public async listTasks(): Promise<Task[]> {
    // Return cached result if available
    if (this.taskListCache !== null) {
      return this.taskListCache;
    }

    const jsonOutput = await this.executeCommandWithJsonOutput([
      "task",
      "show",
      "--format",
      "json",
    ]);

    const tasks = this.transformTaskListOutput(jsonOutput);

    // Cache the result
    this.taskListCache = tasks;

    return tasks;
  }

  /**
   * Transform Bolt task show output to Task array
   *
   * @param jsonOutput - Raw JSON output from Bolt task show command
   * @returns Array of Task objects
   */
  private transformTaskListOutput(jsonOutput: BoltJsonOutput): Task[] {
    const tasks: Task[] = [];

    // Bolt task show output structure can vary:
    // Format 1: { "tasks": [{ "name": "...", "metadata": {...} }] }
    // Format 2: { "task_name": { "metadata": {...} }, ... }

    // Handle tasks array format
    if (Array.isArray(jsonOutput.tasks)) {
      for (const taskData of jsonOutput.tasks) {
        const task = this.parseTaskData(taskData);
        if (task) {
          tasks.push(task);
        }
      }
      return tasks;
    }

    // Handle object format where keys are task names
    for (const [taskName, taskData] of Object.entries(jsonOutput)) {
      if (typeof taskData === "object" && taskData !== null) {
        const task = this.parseTaskData({ name: taskName, ...taskData });
        if (task) {
          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * Parse a single task data object into a Task object
   *
   * @param taskData - Raw task data from Bolt
   * @returns Task object or null if parsing fails
   */
  private parseTaskData(taskData: unknown): Task | null {
    if (typeof taskData !== "object" || taskData === null) {
      return null;
    }

    const taskObj = taskData as Record<string, unknown>;

    // Extract task name
    const name = typeof taskObj.name === "string" ? taskObj.name : null;
    if (!name) {
      return null;
    }

    // Extract metadata
    const metadata =
      typeof taskObj.metadata === "object" && taskObj.metadata !== null
        ? (taskObj.metadata as Record<string, unknown>)
        : taskObj;

    // Extract description
    const description =
      typeof metadata.description === "string"
        ? metadata.description
        : undefined;

    // Extract module path
    const modulePath =
      typeof taskObj.module === "string"
        ? taskObj.module
        : typeof metadata.module === "string"
          ? metadata.module
          : typeof taskObj.file === "string"
            ? taskObj.file
            : typeof metadata.file === "string"
              ? metadata.file
              : "";

    // Extract parameters
    const parameters = this.parseTaskParameters(metadata);

    return {
      name,
      description,
      parameters,
      modulePath,
    };
  }

  /**
   * Parse task parameters from metadata
   *
   * @param metadata - Task metadata object
   * @returns Array of TaskParameter objects
   */
  private parseTaskParameters(
    metadata: Record<string, unknown>,
  ): TaskParameter[] {
    const parameters: TaskParameter[] = [];

    // Parameters can be in metadata.parameters or metadata.params
    const paramsData = metadata.parameters ?? metadata.params;

    if (typeof paramsData !== "object" || paramsData === null) {
      return parameters;
    }

    // Parameters can be an object with parameter names as keys
    // or an array of parameter objects
    if (Array.isArray(paramsData)) {
      for (const paramData of paramsData) {
        const param = this.parseTaskParameter(paramData);
        if (param) {
          parameters.push(param);
        }
      }
    } else {
      const paramsObj = paramsData as Record<string, unknown>;
      for (const [paramName, paramData] of Object.entries(paramsObj)) {
        if (typeof paramData === "object" && paramData !== null) {
          const param = this.parseTaskParameter({
            name: paramName,
            ...(paramData as Record<string, unknown>),
          });
          if (param) {
            parameters.push(param);
          }
        }
      }
    }

    return parameters;
  }

  /**
   * Parse a single task parameter
   *
   * @param paramData - Raw parameter data
   * @returns TaskParameter object or null if parsing fails
   */
  private parseTaskParameter(paramData: unknown): TaskParameter | null {
    if (typeof paramData !== "object" || paramData === null) {
      return null;
    }

    const paramObj = paramData as Record<string, unknown>;

    // Extract parameter name
    const name = typeof paramObj.name === "string" ? paramObj.name : null;
    if (!name) {
      return null;
    }

    // Extract parameter type (default to String if not specified)
    let type: TaskParameter["type"] = "String";
    if (typeof paramObj.type === "string") {
      const typeValue = paramObj.type;
      if (
        typeValue === "String" ||
        typeValue === "Integer" ||
        typeValue === "Boolean" ||
        typeValue === "Array" ||
        typeValue === "Hash"
      ) {
        type = typeValue;
      }
    }

    // Extract description
    const description =
      typeof paramObj.description === "string"
        ? paramObj.description
        : undefined;

    // Extract required flag (default to false)
    const required = paramObj.required === true;

    // Extract default value
    const defaultValue = paramObj.default;

    return {
      name,
      type,
      description,
      required,
      default: defaultValue,
    };
  }
}
