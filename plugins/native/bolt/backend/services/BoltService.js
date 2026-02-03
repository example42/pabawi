"use strict";
/**
 * Bolt Service
 *
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture.
 *
 * @module plugins/native/bolt/backend/services/BoltService
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoltService = void 0;
const child_process_1 = require("child_process");
const types_js_1 = require("../types.js");
/**
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture
 */
class BoltService {
    defaultTimeout;
    boltProjectPath;
    taskListCache = null;
    logger;
    // Cache configuration
    inventoryTtl;
    factsTtl;
    // Cache storage
    inventoryCache = null;
    factsCache = new Map();
    constructor(boltProjectPath, defaultTimeout = 300000, cacheConfig, logger) {
        this.boltProjectPath = boltProjectPath;
        this.defaultTimeout = defaultTimeout;
        this.inventoryTtl = cacheConfig?.inventoryTtl ?? 30000; // 30 seconds default
        this.factsTtl = cacheConfig?.factsTtl ?? 300000; // 5 minutes default
        // Use provided logger or create a simple console logger
        this.logger = logger ?? {
            error: (message, context, error) => {
                console.error(message, context, error);
            },
        };
    }
    /**
     * Build a Bolt CLI command string from arguments
     */
    buildCommandString(args) {
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
    async executeCommand(args, options = {}, streamingCallback) {
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
            let childProcess = null;
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
                childProcess = (0, child_process_1.spawn)("bolt", args, {
                    cwd,
                    env: process.env,
                    shell: false,
                });
                if (childProcess.stdout) {
                    childProcess.stdout.on("data", (data) => {
                        const chunk = data.toString();
                        stdout += chunk;
                        if (streamingCallback?.onStdout) {
                            streamingCallback.onStdout(chunk);
                        }
                    });
                }
                if (childProcess.stderr) {
                    childProcess.stderr.on("data", (data) => {
                        const chunk = data.toString();
                        stderr += chunk;
                        if (streamingCallback?.onStderr) {
                            streamingCallback.onStderr(chunk);
                        }
                    });
                }
                childProcess.on("close", (exitCode) => {
                    clearTimeout(timeoutId);
                    if (timedOut) {
                        reject(new types_js_1.BoltTimeoutError(`Bolt command execution exceeded timeout of ${String(timeout)}ms`, timeout));
                        return;
                    }
                    const result = {
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
                childProcess.on("error", (error) => {
                    clearTimeout(timeoutId);
                    reject(new types_js_1.BoltExecutionError(`Failed to execute Bolt command: ${error.message}`, null, stderr.trim(), stdout.trim()));
                });
            }
            catch (error) {
                clearTimeout(timeoutId);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    /**
     * Execute a Bolt CLI command and parse JSON output
     */
    async executeCommandWithJsonOutput(args, options = {}, streamingCallback) {
        const argsToUse = !args.includes("--format") && !args.includes("json")
            ? [...args, "--format", "json"]
            : args;
        const result = await this.executeCommand(argsToUse, options, streamingCallback);
        if (!result.success) {
            throw new types_js_1.BoltExecutionError(result.error ?? "Bolt command failed", result.exitCode, result.stderr, result.stdout);
        }
        return this.parseJsonOutput(result.stdout);
    }
    /**
     * Parse JSON output from Bolt CLI
     */
    parseJsonOutput(output) {
        if (!output || output.trim().length === 0) {
            throw new types_js_1.BoltParseError("Bolt command returned empty output", output, new Error("Empty output"));
        }
        try {
            return JSON.parse(output);
        }
        catch (error) {
            throw new types_js_1.BoltParseError("Failed to parse Bolt JSON output", output, error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Get the Bolt project path
     */
    getBoltProjectPath() {
        return this.boltProjectPath;
    }
    /**
     * Get the default timeout
     */
    getDefaultTimeout() {
        return this.defaultTimeout;
    }
    /**
     * Check if a cache entry is still valid based on TTL
     */
    isCacheValid(entry, ttl) {
        if (!entry) {
            return false;
        }
        const now = Date.now();
        return now - entry.timestamp < ttl;
    }
    /**
     * Invalidate the inventory cache
     */
    invalidateInventoryCache() {
        this.inventoryCache = null;
    }
    /**
     * Invalidate facts cache for a specific node or all nodes
     */
    invalidateFactsCache(nodeId) {
        if (nodeId) {
            this.factsCache.delete(nodeId);
        }
        else {
            this.factsCache.clear();
        }
    }
    /**
     * Invalidate all caches
     */
    invalidateAllCaches() {
        this.invalidateInventoryCache();
        this.invalidateFactsCache();
        this.taskListCache = null;
    }
    /**
     * Retrieve inventory from Bolt
     */
    async getInventory() {
        if (this.isCacheValid(this.inventoryCache, this.inventoryTtl)) {
            return this.inventoryCache.data;
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
        }
        catch (error) {
            if (error instanceof types_js_1.BoltExecutionError && error.stderr) {
                const errorMessage = error.stderr.toLowerCase();
                if (errorMessage.includes("inventory file") ||
                    errorMessage.includes("could not find") ||
                    errorMessage.includes("no such file")) {
                    throw new types_js_1.BoltInventoryNotFoundError("Bolt inventory file not found. Ensure inventory.yaml exists in the Bolt project directory.");
                }
            }
            throw error;
        }
    }
    /**
     * Transform Bolt inventory JSON output to Node array
     */
    transformInventoryToNodes(jsonOutput) {
        const nodes = [];
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
    parseInventoryTarget(target) {
        if (typeof target !== "object" || target === null) {
            return null;
        }
        const targetObj = target;
        const name = typeof targetObj.name === "string" ? targetObj.name : null;
        if (!name) {
            return null;
        }
        const uri = typeof targetObj.uri === "string" ? targetObj.uri : name;
        let transport = "ssh";
        if (typeof targetObj.transport === "string") {
            const transportValue = targetObj.transport.toLowerCase();
            if (transportValue === "ssh" ||
                transportValue === "winrm" ||
                transportValue === "docker" ||
                transportValue === "local") {
                transport = transportValue;
            }
        }
        const config = {};
        if (typeof targetObj.config === "object" && targetObj.config !== null) {
            const configObj = targetObj.config;
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
    async gatherFacts(nodeId) {
        const cachedFacts = this.factsCache.get(nodeId);
        if (this.isCacheValid(cachedFacts ?? null, this.factsTtl)) {
            return cachedFacts.data;
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
        }
        catch (error) {
            if (error instanceof types_js_1.BoltExecutionError && error.stderr) {
                const errorMessage = error.stderr.toLowerCase();
                if (errorMessage.includes("unreachable") ||
                    errorMessage.includes("connection") ||
                    errorMessage.includes("could not connect") ||
                    errorMessage.includes("timed out") ||
                    errorMessage.includes("connection refused") ||
                    errorMessage.includes("no route to host")) {
                    throw new types_js_1.BoltNodeUnreachableError(`Node ${nodeId} is unreachable`, nodeId, error.stderr);
                }
            }
            throw error;
        }
    }
    /**
     * Transform Bolt facts output to Facts object
     */
    transformFactsOutput(nodeId, jsonOutput) {
        let factsData = {};
        const items = jsonOutput.items;
        if (Array.isArray(items) && items.length > 0) {
            const item = items[0];
            if (item.status === "success" &&
                typeof item.value === "object" &&
                item.value !== null) {
                factsData = item.value;
            }
        }
        else {
            factsData = jsonOutput;
        }
        const facts = {
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
    extractOsFacts(factsData) {
        const os = factsData.os;
        const release = os?.release;
        return {
            family: typeof os?.family === "string" ? os.family : "unknown",
            name: typeof os?.name === "string" ? os.name : "unknown",
            release: {
                full: typeof release?.full === "string" ? release.full : "unknown",
                major: typeof release?.major === "string" ? release.major : "unknown",
            },
        };
    }
    extractProcessorFacts(factsData) {
        const processors = factsData.processors;
        return {
            count: typeof processors?.count === "number" ? processors.count : 0,
            models: Array.isArray(processors?.models)
                ? processors.models.filter((m) => typeof m === "string")
                : [],
        };
    }
    extractMemoryFacts(factsData) {
        const memory = factsData.memory;
        const system = memory?.system;
        return {
            system: {
                total: typeof system?.total === "string" ? system.total : "0",
                available: typeof system?.available === "string" ? system.available : "0",
            },
        };
    }
    extractNetworkingFacts(factsData) {
        const networking = factsData.networking;
        const hostname = networking !== undefined && typeof networking.hostname === "string"
            ? networking.hostname
            : "unknown";
        const interfaces = networking !== undefined &&
            typeof networking.interfaces === "object" &&
            networking.interfaces !== null
            ? networking.interfaces
            : {};
        return {
            hostname,
            interfaces,
        };
    }
    /**
     * Execute a command on a target node
     */
    async runCommand(nodeId, command, streamingCallback) {
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
                throw new types_js_1.BoltExecutionError(boltResult.error ?? "Bolt command failed", boltResult.exitCode, boltResult.stderr, boltResult.stdout);
            }
            const jsonOutput = this.parseJsonOutput(boltResult.stdout);
            const endTime = Date.now();
            const result = this.transformCommandOutput(executionId, nodeId, command, jsonOutput, startTime, endTime, { stdout: boltResult.stdout, stderr: boltResult.stderr });
            result.command = commandString;
            return result;
        }
        catch (error) {
            const endTime = Date.now();
            if (error instanceof types_js_1.BoltExecutionError && error.stderr) {
                const errorMessage = error.stderr.toLowerCase();
                if (errorMessage.includes("unreachable") ||
                    errorMessage.includes("connection") ||
                    errorMessage.includes("could not connect") ||
                    errorMessage.includes("timed out") ||
                    errorMessage.includes("connection refused") ||
                    errorMessage.includes("no route to host")) {
                    throw new types_js_1.BoltNodeUnreachableError(`Node ${nodeId} is unreachable`, nodeId, error.stderr);
                }
            }
            if (error instanceof types_js_1.BoltExecutionError) {
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
    transformCommandOutput(executionId, nodeId, command, jsonOutput, startTime, endTime, rawOutput) {
        const items = jsonOutput.items;
        const results = [];
        let overallStatus = "success";
        if (Array.isArray(items)) {
            for (const item of items) {
                const itemObj = item;
                const target = typeof itemObj.target === "string" ? itemObj.target : nodeId;
                const status = itemObj.status === "success" ? "success" : "failed";
                if (status === "failed") {
                    overallStatus = "failed";
                }
                const nodeResult = {
                    nodeId: target,
                    status,
                    duration: endTime - startTime,
                };
                if (typeof itemObj.value === "object" && itemObj.value !== null) {
                    const value = itemObj.value;
                    nodeResult.output = {
                        stdout: typeof value.stdout === "string" ? value.stdout : "",
                        stderr: typeof value.stderr === "string" ? value.stderr : "",
                        exitCode: typeof value.exit_code === "number" ? value.exit_code : undefined,
                    };
                }
                if (typeof itemObj.error === "object" && itemObj.error !== null) {
                    const errorObj = itemObj.error;
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
        const result = {
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
    generateExecutionId() {
        return `exec_${String(Date.now())}_${Math.random().toString(36).substring(2, 11)}`;
    }
    /**
     * Execute a task on a target node
     */
    async runTask(nodeId, taskName, parameters, streamingCallback) {
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
                throw new types_js_1.BoltExecutionError(boltResult.error ?? "Bolt task failed", boltResult.exitCode, boltResult.stderr, boltResult.stdout);
            }
            const jsonOutput = this.parseJsonOutput(boltResult.stdout);
            const endTime = Date.now();
            const result = this.transformTaskOutput(executionId, nodeId, taskName, parameters, jsonOutput, startTime, endTime, { stdout: boltResult.stdout, stderr: boltResult.stderr });
            result.command = commandString;
            return result;
        }
        catch (error) {
            const endTime = Date.now();
            if (error instanceof types_js_1.BoltExecutionError && error.stderr) {
                const errorMessage = error.stderr.toLowerCase();
                if (errorMessage.includes("could not find") ||
                    errorMessage.includes("task not found") ||
                    errorMessage.includes("no such task") ||
                    errorMessage.includes("unknown task")) {
                    throw new types_js_1.BoltTaskNotFoundError(`Task '${taskName}' not found in Bolt modules`, taskName);
                }
                if (errorMessage.includes("parameter") ||
                    errorMessage.includes("invalid") ||
                    errorMessage.includes("required") ||
                    errorMessage.includes("missing")) {
                    const paramErrors = this.extractParameterErrors(error.stderr);
                    throw new types_js_1.BoltTaskParameterError(`Invalid parameters for task '${taskName}'`, taskName, paramErrors);
                }
                if (errorMessage.includes("unreachable") ||
                    errorMessage.includes("connection") ||
                    errorMessage.includes("could not connect") ||
                    errorMessage.includes("timed out") ||
                    errorMessage.includes("connection refused") ||
                    errorMessage.includes("no route to host")) {
                    throw new types_js_1.BoltNodeUnreachableError(`Node ${nodeId} is unreachable`, nodeId, error.stderr);
                }
            }
            if (error instanceof types_js_1.BoltExecutionError) {
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
    transformTaskOutput(executionId, nodeId, taskName, parameters, jsonOutput, startTime, endTime, rawOutput) {
        const items = jsonOutput.items;
        const results = [];
        let overallStatus = "success";
        if (Array.isArray(items)) {
            for (const item of items) {
                const itemObj = item;
                const target = typeof itemObj.target === "string" ? itemObj.target : nodeId;
                const status = itemObj.status === "success" ? "success" : "failed";
                if (status === "failed") {
                    overallStatus = "failed";
                }
                const nodeResult = {
                    nodeId: target,
                    status,
                    duration: endTime - startTime,
                };
                if (itemObj.value !== undefined) {
                    nodeResult.value = itemObj.value;
                    if (status === "failed" && typeof itemObj.value === "object" && itemObj.value !== null) {
                        const valueObj = itemObj.value;
                        if (typeof valueObj._output === "string" && valueObj._output.trim()) {
                            nodeResult.output = {
                                stdout: valueObj._output,
                                stderr: "",
                            };
                        }
                        if (typeof valueObj._error === "object" && valueObj._error !== null) {
                            const errorObj = valueObj._error;
                            let errorMessage = "";
                            if (typeof errorObj.msg === "string") {
                                errorMessage = errorObj.msg;
                            }
                            else if (typeof errorObj.message === "string") {
                                errorMessage = errorObj.message;
                            }
                            if (typeof errorObj.kind === "string") {
                                errorMessage = `[${errorObj.kind}] ${errorMessage}`;
                            }
                            if (typeof errorObj.details === "object" && errorObj.details !== null) {
                                const details = errorObj.details;
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
                        }
                        else if (!nodeResult.error) {
                            if (typeof valueObj._output === "string" && valueObj._output.trim()) {
                                nodeResult.error = valueObj._output.trim();
                            }
                            else {
                                nodeResult.error = "Task execution failed";
                            }
                        }
                    }
                }
                if (!nodeResult.error && typeof itemObj.error === "object" && itemObj.error !== null) {
                    const errorObj = itemObj.error;
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
        const result = {
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
    extractParameterErrors(stderr) {
        const errors = [];
        const lines = stderr.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes("parameter") ||
                trimmed.includes("required") ||
                trimmed.includes("invalid") ||
                trimmed.includes("missing")) {
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
    async getTaskDetails(taskName) {
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
        }
        catch (error) {
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
    async listTasks() {
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
        const detailedTasks = await Promise.all(tasks.map(async (task) => {
            const detailedTask = await this.getTaskDetails(task.name);
            return detailedTask ?? task;
        }));
        this.taskListCache = detailedTasks;
        return detailedTasks;
    }
    transformTaskListOutput(jsonOutput) {
        const tasks = [];
        if (Array.isArray(jsonOutput.tasks)) {
            for (const taskData of jsonOutput.tasks) {
                if (Array.isArray(taskData) && taskData.length >= 2) {
                    const name = taskData[0];
                    const description = taskData[1];
                    if (typeof name === "string") {
                        tasks.push({
                            name,
                            module: this.extractModuleName(name),
                            description: typeof description === "string" ? description : undefined,
                            parameters: [],
                            modulePath: "",
                        });
                    }
                }
                else {
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
    parseTaskData(taskData) {
        if (typeof taskData !== "object" || taskData === null) {
            return null;
        }
        const taskObj = taskData;
        const name = typeof taskObj.name === "string" ? taskObj.name : null;
        if (!name) {
            return null;
        }
        const module = this.extractModuleName(name);
        const metadata = typeof taskObj.metadata === "object" && taskObj.metadata !== null
            ? taskObj.metadata
            : taskObj;
        const description = typeof metadata.description === "string"
            ? metadata.description
            : undefined;
        const modulePath = typeof taskObj.module === "string"
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
    extractModuleName(taskName) {
        const parts = taskName.split("::");
        return parts.length > 1 ? parts[0] : "core";
    }
    groupTasksByModule(tasks) {
        return tasks.reduce((acc, task) => {
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
    async listTasksByModule() {
        const tasks = await this.listTasks();
        return this.groupTasksByModule(tasks);
    }
    parseTaskParameters(metadata) {
        const parameters = [];
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
        }
        else {
            const paramsObj = paramsData;
            for (const [paramName, paramData] of Object.entries(paramsObj)) {
                if (typeof paramData === "object" && paramData !== null) {
                    const param = this.parseTaskParameter({
                        name: paramName,
                        ...paramData,
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
    async runPuppetAgent(nodeId, config = {}, streamingCallback) {
        const parameters = {};
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
        return this.runTask(nodeId, "psick::puppet_agent", parameters, streamingCallback);
    }
    /**
     * Install a package on a target node using the specified package installation task
     */
    async installPackage(nodeId, taskName, packageParams, parameterMapping, streamingCallback) {
        const parameters = {
            [parameterMapping.packageName]: packageParams.packageName,
        };
        if (packageParams.ensure && parameterMapping.ensure) {
            let ensureValue = packageParams.ensure;
            if (parameterMapping.ensure === "action") {
                const ensureMapping = {
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
    parseTaskParameter(paramData) {
        if (typeof paramData !== "object" || paramData === null) {
            return null;
        }
        const paramObj = paramData;
        const name = typeof paramObj.name === "string" ? paramObj.name : null;
        if (!name) {
            return null;
        }
        let type = "String";
        let required = false;
        let enumValues;
        const puppetType = typeof paramObj.type === "string" ? paramObj.type : undefined;
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
            }
            else {
                const typeMatch = /^([A-Za-z]+)/.exec(baseType);
                if (typeMatch) {
                    const extractedType = typeMatch[1];
                    if (extractedType === "String") {
                        type = "String";
                    }
                    else if (extractedType === "Integer" ||
                        extractedType === "Numeric") {
                        type = "Integer";
                    }
                    else if (extractedType === "Boolean") {
                        type = "Boolean";
                    }
                    else if (extractedType === "Array") {
                        type = "Array";
                    }
                    else if (extractedType === "Hash" || extractedType === "Struct") {
                        type = "Hash";
                    }
                }
            }
        }
        const description = typeof paramObj.description === "string"
            ? paramObj.description
            : undefined;
        if (paramObj.required === true) {
            required = true;
        }
        else if (paramObj.required === false) {
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
exports.BoltService = BoltService;
//# sourceMappingURL=BoltService.js.map
