/**
 * Bolt Service
 *
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture.
 *
 * @module plugins/native/bolt/backend/services/BoltService
 * @version 1.0.0
 */

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
} from "../types.js";

/**
 * Streaming callback for real-time output
 */
export interface StreamingCallback {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onCommand?: (command: string) => void;
}

/**
 * Logger interface - minimal interface for logging
 */
interface LoggerInterface {
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/**
 * Cache entry with timestamp for TTL tracking
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture
 */
export class BoltService {
  private readonly defaultTimeout: number;
  private readonly boltProjectPath: string;
  private taskListCache: Task[] | null = null;
  private logger: LoggerInterface;

  // Cache configuration
  private readonly inventoryTtl: number;
  private readonly factsTtl: number;

  // Cache storage
  private inventoryCache: CacheEntry<Node[]> | null = null;
  private factsCache = new Map<string, CacheEntry<Facts>>();

  constructor(
    boltProjectPath: string,
    defaultTimeout = 300000,
    cacheConfig?: { inventoryTtl?: number; factsTtl?: number },
    logger?: LoggerInterface,
  ) {
    this.boltProjectPath = boltProjectPath;
    this.defaultTimeout = defaultTimeout;
    this.inventoryTtl = cacheConfig?.inventoryTtl ?? 30000; // 30 seconds default
    this.factsTtl = cacheConfig?.factsTtl ?? 300000; // 5 minutes default
    // Use provided logger or create a simple console logger
    this.logger = logger ?? {
      error: (message: string, context?: Record<string, unknown>, error?: Error) => {
        console.error(message, context, error);
      },
    };
  }

  /**
   * Build a Bolt CLI command string from arguments
   */
  private buildCommandString(args: string[]): string {
    const escapedArgs = args.map((arg) => {
      if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });
    return `bolt ${escapedArgs.join(" ")}`;
  }

  /**
   * Execute a Bolt CLI command with timeout handling and optional streaming
   */
  public async executeCommand(
    args: string[],
    options: BoltExecutionOptions = {},
    streamingCallback?: StreamingCallback,
  ): Promise<BoltExecutionResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const cwd = options.cwd ?? this.boltProjectPath;

    if (streamingCallback?.onCommand) {
      const commandString = this.buildCommandString(args);
      streamingCallback.onCommand(commandString);
    }

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
        childProcess = spawn("bolt", args, {
          cwd,
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
   */
  public async executeCommandWithJsonOutput(
    args: string[],
    options: BoltExecutionOptions = {},
    streamingCallback?: StreamingCallback,
  ): Promise<BoltJsonOutput> {
    const argsToUse =
      !args.includes("--format") && !args.includes("json")
        ? [...args, "--format", "json"]
        : args;

    const result = await this.executeCommand(
      argsToUse,
      options,
      streamingCallback,
    );

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
   * Check if a cache entry is still valid based on TTL
   */
  private isCacheValid<T>(entry: CacheEntry<T> | null, ttl: number): boolean {
    if (!entry) {
      return false;
    }
    const now = Date.now();
    return now - entry.timestamp < ttl;
  }

  /**
   * Invalidate the inventory cache
   */
  public invalidateInventoryCache(): void {
    this.inventoryCache = null;
  }

  /**
   * Invalidate facts cache for a specific node or all nodes
   */
  public invalidateFactsCache(nodeId?: string): void {
    if (nodeId) {
      this.factsCache.delete(nodeId);
    } else {
      this.factsCache.clear();
    }
  }

  /**
   * Invalidate all caches
   */
  public invalidateAllCaches(): void {
    this.invalidateInventoryCache();
    this.invalidateFactsCache();
    this.taskListCache = null;
  }

  /**
   * Retrieve inventory from Bolt
   */
  public async getInventory(): Promise<Node[]> {
    if (this.isCacheValid(this.inventoryCache, this.inventoryTtl)) {
      return this.inventoryCache!.data;
    }

    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        "inventory",
        "show",
        "--format",
        "json",
        "--detail",
      ]);

      const nodes = this.transformInventoryToNodes(jsonOutput);

      this.inventoryCache = {
        data: nodes,
        timestamp: Date.now(),
      };

      return nodes;
    } catch (error) {
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
   */
  private transformInventoryToNodes(jsonOutput: BoltJsonOutput): Node[] {
    const nodes: Node[] = [];

    if (jsonOutput.inventory && Array.isArray(jsonOutput.inventory.targets)) {
      for (const target of jsonOutput.inventory.targets) {
        const node = this.parseInventoryTarget(target);
        if (node) {
          nodes.push(node);
        }
      }
      return nodes;
    }

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
   */
  private parseInventoryTarget(target: unknown): Node | null {
    if (typeof target !== "object" || target === null) {
      return null;
    }

    const targetObj = target as Record<string, unknown>;
    const name = typeof targetObj.name === "string" ? targetObj.name : null;
    if (!name) {
      return null;
    }

    const uri = typeof targetObj.uri === "string" ? targetObj.uri : name;

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

    const config: Node["config"] = {};
    if (typeof targetObj.config === "object" && targetObj.config !== null) {
      const configObj = targetObj.config as Record<string, unknown>;
      Object.assign(config, configObj);
    }

    if (typeof targetObj.user === "string" && config.user === undefined) {
      config.user = targetObj.user;
    }
    if (typeof targetObj.port === "number" && config.port === undefined) {
      config.port = targetObj.port;
    }

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
   */
  public async gatherFacts(nodeId: string): Promise<Facts> {
    const cachedFacts = this.factsCache.get(nodeId);
    if (this.isCacheValid(cachedFacts ?? null, this.factsTtl)) {
      return cachedFacts!.data;
    }

    const args = [
      "task",
      "run",
      "facts",
      "--targets",
      nodeId,
      "--format",
      "json",
    ];
    const command = this.buildCommandString(args);

    try {
      const jsonOutput = await this.executeCommandWithJsonOutput(args);

      const facts = this.transformFactsOutput(nodeId, jsonOutput);
      facts.command = command;

      this.factsCache.set(nodeId, {
        data: facts,
        timestamp: Date.now(),
      });

      return facts;
    } catch (error) {
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
   */
  private transformFactsOutput(
    nodeId: string,
    jsonOutput: BoltJsonOutput,
  ): Facts {
    let factsData: Record<string, unknown> = {};

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
      factsData = jsonOutput;
    }

    const facts: Facts["facts"] = {
      os: this.extractOsFacts(factsData),
      processors: this.extractProcessorFacts(factsData),
      memory: this.extractMemoryFacts(factsData),
      networking: this.extractNetworkingFacts(factsData),
    };

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
   */
  public async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();
    const args = [
      "command",
      "run",
      command,
      "--targets",
      nodeId,
      "--format",
      "json",
    ];
    const commandString = this.buildCommandString(args);

    try {
      const boltResult = await this.executeCommand(args, {}, streamingCallback);

      if (!boltResult.success) {
        throw new BoltExecutionError(
          boltResult.error ?? "Bolt command failed",
          boltResult.exitCode,
          boltResult.stderr,
          boltResult.stdout,
        );
      }

      const jsonOutput = this.parseJsonOutput(boltResult.stdout);
      const endTime = Date.now();
      const result = this.transformCommandOutput(
        executionId,
        nodeId,
        command,
        jsonOutput,
        startTime,
        endTime,
        { stdout: boltResult.stdout, stderr: boltResult.stderr },
      );
      result.command = commandString;
      return result;
    } catch (error) {
      const endTime = Date.now();

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
          command: commandString,
        };
      }

      throw error;
    }
  }

  private transformCommandOutput(
    executionId: string,
    nodeId: string,
    command: string,
    jsonOutput: BoltJsonOutput,
    startTime: number,
    endTime: number,
    rawOutput?: { stdout: string; stderr: string },
  ): ExecutionResult {
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

        if (typeof itemObj.value === "object" && itemObj.value !== null) {
          const value = itemObj.value as Record<string, unknown>;
          nodeResult.output = {
            stdout: typeof value.stdout === "string" ? value.stdout : "",
            stderr: typeof value.stderr === "string" ? value.stderr : "",
            exitCode:
              typeof value.exit_code === "number" ? value.exit_code : undefined,
          };
        }

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

    const result: ExecutionResult = {
      id: executionId,
      type: "command",
      targetNodes: [nodeId],
      action: command,
      status: overallStatus,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      results,
    };

    if (rawOutput) {
      result.stdout = rawOutput.stdout;
      result.stderr = rawOutput.stderr;
    }

    return result;
  }

  private generateExecutionId(): string {
    return `exec_${String(Date.now())}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Execute a task on a target node
   */
  public async runTask(
    nodeId: string,
    taskName: string,
    parameters?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    const args = [
      "task",
      "run",
      taskName,
      "--targets",
      nodeId,
      "--format",
      "json",
    ];

    if (parameters && Object.keys(parameters).length > 0) {
      args.push("--params", JSON.stringify(parameters));
    }

    const commandString = this.buildCommandString(args);

    try {
      const boltResult = await this.executeCommand(args, {}, streamingCallback);

      if (!boltResult.success) {
        throw new BoltExecutionError(
          boltResult.error ?? "Bolt task failed",
          boltResult.exitCode,
          boltResult.stderr,
          boltResult.stdout,
        );
      }

      const jsonOutput = this.parseJsonOutput(boltResult.stdout);
      const endTime = Date.now();
      const result = this.transformTaskOutput(
        executionId,
        nodeId,
        taskName,
        parameters,
        jsonOutput,
        startTime,
        endTime,
        { stdout: boltResult.stdout, stderr: boltResult.stderr },
      );
      result.command = commandString;
      return result;
    } catch (error) {
      const endTime = Date.now();

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
          command: commandString,
        };
      }

      throw error;
    }
  }


  private transformTaskOutput(
    executionId: string,
    nodeId: string,
    taskName: string,
    parameters: Record<string, unknown> | undefined,
    jsonOutput: BoltJsonOutput,
    startTime: number,
    endTime: number,
    rawOutput?: { stdout: string; stderr: string },
  ): ExecutionResult {
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

        if (itemObj.value !== undefined) {
          nodeResult.value = itemObj.value;

          if (status === "failed" && typeof itemObj.value === "object" && itemObj.value !== null) {
            const valueObj = itemObj.value as Record<string, unknown>;

            if (typeof valueObj._output === "string" && valueObj._output.trim()) {
              nodeResult.output = {
                stdout: valueObj._output,
                stderr: "",
              };
            }

            if (typeof valueObj._error === "object" && valueObj._error !== null) {
              const errorObj = valueObj._error as Record<string, unknown>;

              let errorMessage = "";

              if (typeof errorObj.msg === "string") {
                errorMessage = errorObj.msg;
              } else if (typeof errorObj.message === "string") {
                errorMessage = errorObj.message;
              }

              if (typeof errorObj.kind === "string") {
                errorMessage = `[${errorObj.kind}] ${errorMessage}`;
              }

              if (typeof errorObj.details === "object" && errorObj.details !== null) {
                const details = errorObj.details as Record<string, unknown>;
                if (typeof details.exit_code === "number") {
                  nodeResult.output ??= { stdout: "", stderr: "" };
                  nodeResult.output.exitCode = details.exit_code;
                  errorMessage += ` (exit code ${String(details.exit_code)})`;
                }
              }

              if (errorMessage && !nodeResult.output && typeof valueObj._output !== "string") {
                nodeResult.output = {
                  stdout: errorMessage,
                  stderr: "",
                };
              }

              if (typeof valueObj._output === "string" && valueObj._output.trim()) {
                errorMessage += `\n\nOutput:\n${valueObj._output.trim()}`;
              }

              nodeResult.error = errorMessage || "Task execution failed";
            } else if (!nodeResult.error) {
              if (typeof valueObj._output === "string" && valueObj._output.trim()) {
                nodeResult.error = valueObj._output.trim();
              } else {
                nodeResult.error = "Task execution failed";
              }
            }
          }
        }

        if (!nodeResult.error && typeof itemObj.error === "object" && itemObj.error !== null) {
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

    const result: ExecutionResult = {
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

    if (rawOutput) {
      result.stdout = rawOutput.stdout;
      result.stderr = rawOutput.stderr;
    }

    return result;
  }

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

    if (errors.length === 0) {
      errors.push(stderr.trim());
    }

    return errors;
  }

  /**
   * Get detailed information for a specific task
   */
  public async getTaskDetails(taskName: string): Promise<Task | null> {
    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        "task",
        "show",
        taskName,
        "--format",
        "json",
      ]);

      const task = this.parseTaskData(jsonOutput);
      return task;
    } catch (error) {
      this.logger.error(`Error fetching details for task ${taskName}`, {
        component: "BoltService",
        operation: "getTaskDetails",
        metadata: { taskName },
      }, error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * List available Bolt tasks
   */
  public async listTasks(): Promise<Task[]> {
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

    const detailedTasks = await Promise.all(
      tasks.map(async (task) => {
        const detailedTask = await this.getTaskDetails(task.name);
        return detailedTask ?? task;
      }),
    );

    this.taskListCache = detailedTasks;

    return detailedTasks;
  }

  private transformTaskListOutput(jsonOutput: BoltJsonOutput): Task[] {
    const tasks: Task[] = [];

    if (Array.isArray(jsonOutput.tasks)) {
      for (const taskData of jsonOutput.tasks) {
        if (Array.isArray(taskData) && taskData.length >= 2) {
          const name: unknown = taskData[0];
          const description: unknown = taskData[1];
          if (typeof name === "string") {
            tasks.push({
              name,
              module: this.extractModuleName(name),
              description:
                typeof description === "string" ? description : undefined,
              parameters: [],
              modulePath: "",
            });
          }
        } else {
          const task = this.parseTaskData(taskData);
          if (task) {
            tasks.push(task);
          }
        }
      }
      return tasks;
    }

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

  private parseTaskData(taskData: unknown): Task | null {
    if (typeof taskData !== "object" || taskData === null) {
      return null;
    }

    const taskObj = taskData as Record<string, unknown>;

    const name = typeof taskObj.name === "string" ? taskObj.name : null;
    if (!name) {
      return null;
    }

    const module = this.extractModuleName(name);

    const metadata =
      typeof taskObj.metadata === "object" && taskObj.metadata !== null
        ? (taskObj.metadata as Record<string, unknown>)
        : taskObj;

    const description =
      typeof metadata.description === "string"
        ? metadata.description
        : undefined;

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

    const parameters = this.parseTaskParameters(metadata);

    return {
      name,
      module,
      description,
      parameters,
      modulePath,
    };
  }

  private extractModuleName(taskName: string): string {
    const parts = taskName.split("::");
    return parts.length > 1 ? parts[0] : "core";
  }

  private groupTasksByModule(tasks: Task[]): Record<string, Task[]> {
    return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      const module = task.module;
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(task);
      return acc;
    }, {});
  }

  /**
   * List available Bolt tasks grouped by module
   */
  public async listTasksByModule(): Promise<Record<string, Task[]>> {
    const tasks = await this.listTasks();
    return this.groupTasksByModule(tasks);
  }

  private parseTaskParameters(
    metadata: Record<string, unknown>,
  ): TaskParameter[] {
    const parameters: TaskParameter[] = [];

    const paramsData = metadata.parameters ?? metadata.params;

    if (typeof paramsData !== "object" || paramsData === null) {
      return parameters;
    }

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
   * Run Puppet agent on a target node using psick::puppet_agent task
   */
  public async runPuppetAgent(
    nodeId: string,
    config: {
      tags?: string[];
      environment?: string;
      noop?: boolean;
      noNoop?: boolean;
      debug?: boolean;
    } = {},
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const parameters: Record<string, unknown> = {};

    if (config.tags && config.tags.length > 0) {
      parameters.tags = config.tags.join(",");
    }

    if (config.environment) {
      parameters.environment = config.environment;
    }

    if (config.noop) {
      parameters.noop = true;
    }

    if (config.noNoop) {
      parameters.no_noop = true;
    }

    if (config.debug) {
      parameters.debug = true;
    }

    return this.runTask(
      nodeId,
      "psick::puppet_agent",
      parameters,
      streamingCallback,
    );
  }

  /**
   * Install a package on a target node using the specified package installation task
   */
  public async installPackage(
    nodeId: string,
    taskName: string,
    packageParams: {
      packageName: string;
      ensure?: string;
      version?: string;
      settings?: Record<string, unknown>;
    },
    parameterMapping: {
      packageName: string;
      ensure?: string;
      version?: string;
      settings?: string;
    },
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const parameters: Record<string, unknown> = {
      [parameterMapping.packageName]: packageParams.packageName,
    };

    if (packageParams.ensure && parameterMapping.ensure) {
      let ensureValue = packageParams.ensure;

      if (parameterMapping.ensure === "action") {
        const ensureMapping: Record<string, string> = {
          present: "install",
          absent: "uninstall",
          latest: "upgrade",
        };
        ensureValue =
          ensureMapping[packageParams.ensure] || packageParams.ensure;
      }

      parameters[parameterMapping.ensure] = ensureValue;
    }

    if (packageParams.version && parameterMapping.version) {
      parameters[parameterMapping.version] = packageParams.version;
    }

    if (packageParams.settings && parameterMapping.settings) {
      parameters[parameterMapping.settings] = packageParams.settings;
    }

    return this.runTask(nodeId, taskName, parameters, streamingCallback);
  }

  private parseTaskParameter(paramData: unknown): TaskParameter | null {
    if (typeof paramData !== "object" || paramData === null) {
      return null;
    }

    const paramObj = paramData as Record<string, unknown>;

    const name = typeof paramObj.name === "string" ? paramObj.name : null;
    if (!name) {
      return null;
    }

    let type: TaskParameter["type"] = "String";
    let required = false;
    let enumValues: string[] | undefined;
    const puppetType =
      typeof paramObj.type === "string" ? paramObj.type : undefined;

    if (typeof paramObj.type === "string") {
      const typeValue = paramObj.type;

      if (!typeValue.startsWith("Optional[")) {
        required = true;
      }

      const baseType = typeValue.replace(/^Optional\[(.+)\]$/, "$1");

      const enumMatch = /^Enum\[(.+)\]$/.exec(baseType);
      if (enumMatch) {
        const enumString = enumMatch[1];
        enumValues = enumString.split(",").map((v) => v.trim());
        type = "String";
      } else {
        const typeMatch = /^([A-Za-z]+)/.exec(baseType);
        if (typeMatch) {
          const extractedType = typeMatch[1];

          if (extractedType === "String") {
            type = "String";
          } else if (
            extractedType === "Integer" ||
            extractedType === "Numeric"
          ) {
            type = "Integer";
          } else if (extractedType === "Boolean") {
            type = "Boolean";
          } else if (extractedType === "Array") {
            type = "Array";
          } else if (extractedType === "Hash" || extractedType === "Struct") {
            type = "Hash";
          }
        }
      }
    }

    const description =
      typeof paramObj.description === "string"
        ? paramObj.description
        : undefined;

    if (paramObj.required === true) {
      required = true;
    } else if (paramObj.required === false) {
      required = false;
    }

    const defaultValue = paramObj.default;

    return {
      name,
      type,
      description,
      required,
      default: defaultValue,
      enum: enumValues,
      puppetType,
    };
  }
}
