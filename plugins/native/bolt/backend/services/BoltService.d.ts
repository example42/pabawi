/**
 * Bolt Service
 *
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture.
 *
 * @module plugins/native/bolt/backend/services/BoltService
 * @version 1.0.0
 */
import { type BoltExecutionResult, type BoltExecutionOptions, type BoltJsonOutput, type Node, type Facts, type ExecutionResult, type Task } from "../types.js";
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
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture
 */
export declare class BoltService {
    private readonly defaultTimeout;
    private readonly boltProjectPath;
    private taskListCache;
    private logger;
    private readonly inventoryTtl;
    private readonly factsTtl;
    private inventoryCache;
    private factsCache;
    constructor(boltProjectPath: string, defaultTimeout?: number, cacheConfig?: {
        inventoryTtl?: number;
        factsTtl?: number;
    }, logger?: LoggerInterface);
    /**
     * Build a Bolt CLI command string from arguments
     */
    private buildCommandString;
    /**
     * Execute a Bolt CLI command with timeout handling and optional streaming
     */
    executeCommand(args: string[], options?: BoltExecutionOptions, streamingCallback?: StreamingCallback): Promise<BoltExecutionResult>;
    /**
     * Execute a Bolt CLI command and parse JSON output
     */
    executeCommandWithJsonOutput(args: string[], options?: BoltExecutionOptions, streamingCallback?: StreamingCallback): Promise<BoltJsonOutput>;
    /**
     * Parse JSON output from Bolt CLI
     */
    parseJsonOutput(output: string): BoltJsonOutput;
    /**
     * Get the Bolt project path
     */
    getBoltProjectPath(): string;
    /**
     * Get the default timeout
     */
    getDefaultTimeout(): number;
    /**
     * Check if a cache entry is still valid based on TTL
     */
    private isCacheValid;
    /**
     * Invalidate the inventory cache
     */
    invalidateInventoryCache(): void;
    /**
     * Invalidate facts cache for a specific node or all nodes
     */
    invalidateFactsCache(nodeId?: string): void;
    /**
     * Invalidate all caches
     */
    invalidateAllCaches(): void;
    /**
     * Retrieve inventory from Bolt
     */
    getInventory(): Promise<Node[]>;
    /**
     * Transform Bolt inventory JSON output to Node array
     */
    private transformInventoryToNodes;
    /**
     * Parse a single inventory target into a Node object
     */
    private parseInventoryTarget;
    /**
     * Gather facts from a target node
     */
    gatherFacts(nodeId: string): Promise<Facts>;
    /**
     * Transform Bolt facts output to Facts object
     */
    private transformFactsOutput;
    private extractOsFacts;
    private extractProcessorFacts;
    private extractMemoryFacts;
    private extractNetworkingFacts;
    /**
     * Execute a command on a target node
     */
    runCommand(nodeId: string, command: string, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    private transformCommandOutput;
    private generateExecutionId;
    /**
     * Execute a task on a target node
     */
    runTask(nodeId: string, taskName: string, parameters?: Record<string, unknown>, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    private transformTaskOutput;
    private extractParameterErrors;
    /**
     * Get detailed information for a specific task
     */
    getTaskDetails(taskName: string): Promise<Task | null>;
    /**
     * List available Bolt tasks
     */
    listTasks(): Promise<Task[]>;
    private transformTaskListOutput;
    private parseTaskData;
    private extractModuleName;
    private groupTasksByModule;
    /**
     * List available Bolt tasks grouped by module
     */
    listTasksByModule(): Promise<Record<string, Task[]>>;
    private parseTaskParameters;
    /**
     * Run Puppet agent on a target node using psick::puppet_agent task
     */
    runPuppetAgent(nodeId: string, config?: {
        tags?: string[];
        environment?: string;
        noop?: boolean;
        noNoop?: boolean;
        debug?: boolean;
    }, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    /**
     * Install a package on a target node using the specified package installation task
     */
    installPackage(nodeId: string, taskName: string, packageParams: {
        packageName: string;
        ensure?: string;
        version?: string;
        settings?: Record<string, unknown>;
    }, parameterMapping: {
        packageName: string;
        ensure?: string;
        version?: string;
        settings?: string;
    }, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    private parseTaskParameter;
}
export {};
//# sourceMappingURL=BoltService.d.ts.map
