/**
 * Remote Execution Capability Interface
 *
 * Standardized interface for remote execution capabilities.
 * Plugins implementing remote execution should conform to these interfaces.
 *
 * Integrates with:
 * - StreamingExecutionManager for output streaming
 * - ExecutionQueue for async execution and concurrency control
 *
 * @module integrations/capability-types/remote-execution
 */
import { z } from "zod";
import type { ExecutionResult } from "../types";
/**
 * Schema for command.execute parameters
 */
export declare const CommandExecuteParamsSchema: z.ZodObject<{
    command: z.ZodString;
    targets: z.ZodArray<z.ZodString, "many">;
    timeout: z.ZodOptional<z.ZodNumber>;
    environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    async: z.ZodOptional<z.ZodBoolean>;
    debugMode: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command: string;
    targets: string[];
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
}, {
    command: string;
    targets: string[];
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
}>;
/**
 * Schema for task.execute parameters
 */
export declare const TaskExecuteParamsSchema: z.ZodObject<{
    taskName: z.ZodString;
    targets: z.ZodArray<z.ZodString, "many">;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    async: z.ZodOptional<z.ZodBoolean>;
    debugMode: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    targets: string[];
    taskName: string;
    parameters?: Record<string, unknown> | undefined;
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
}, {
    targets: string[];
    taskName: string;
    parameters?: Record<string, unknown> | undefined;
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
}>;
/**
 * Schema for script.execute parameters
 */
export declare const ScriptExecuteParamsSchema: z.ZodObject<{
    script: z.ZodString;
    targets: z.ZodArray<z.ZodString, "many">;
    scriptType: z.ZodOptional<z.ZodEnum<["bash", "powershell", "python", "ruby"]>>;
    arguments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timeout: z.ZodOptional<z.ZodNumber>;
    environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    async: z.ZodOptional<z.ZodBoolean>;
    debugMode: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    script: string;
    targets: string[];
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
    scriptType?: "bash" | "powershell" | "python" | "ruby" | undefined;
    arguments?: string[] | undefined;
}, {
    script: string;
    targets: string[];
    timeout?: number | undefined;
    environment?: Record<string, string> | undefined;
    async?: boolean | undefined;
    debugMode?: boolean | undefined;
    scriptType?: "bash" | "powershell" | "python" | "ruby" | undefined;
    arguments?: string[] | undefined;
}>;
export type CommandExecuteParams = z.infer<typeof CommandExecuteParamsSchema>;
export type TaskExecuteParams = z.infer<typeof TaskExecuteParamsSchema>;
export type ScriptExecuteParams = z.infer<typeof ScriptExecuteParamsSchema>;
/**
 * Output chunk for streaming execution results
 */
export interface OutputChunk {
    /** Node identifier */
    nodeId: string;
    /** Output stream type */
    stream: "stdout" | "stderr";
    /** Output data */
    data: string;
    /** Timestamp of output */
    timestamp: string;
}
/**
 * Callback function for streaming output
 */
export type OutputStreamCallback = (chunk: OutputChunk) => void;
/**
 * Remote Execution capability interface
 *
 * Provides standardized methods for remote execution:
 * - command.execute: Execute shell command on targets
 * - task.execute: Execute task/playbook on targets
 * - script.execute: Execute script on targets
 *
 * Supports:
 * - Streaming output (integrate with StreamingExecutionManager)
 * - Async execution (integrate with ExecutionQueue)
 * - Timeout management
 * - Environment variables
 *
 * @example
 * ```typescript
 * class BoltPlugin extends BasePlugin implements RemoteExecutionCapability {
 *   async commandExecute(params: CommandExecuteParams): Promise<ExecutionResult> {
 *     // Implementation
 *   }
 *
 *   async taskExecute(params: TaskExecuteParams): Promise<ExecutionResult> {
 *     // Implementation
 *   }
 *
 *   async scriptExecute(params: ScriptExecuteParams): Promise<ExecutionResult> {
 *     // Implementation
 *   }
 *
 *   async streamOutput(executionId: string, callback: OutputStreamCallback): Promise<void> {
 *     // Implementation
 *   }
 *
 *   async cancelExecution(executionId: string): Promise<boolean> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface RemoteExecutionCapability {
    /**
     * Execute shell command on target nodes
     *
     * @param params - Command execution parameters
     * @returns Execution result with per-node results
     */
    commandExecute(params: CommandExecuteParams): Promise<ExecutionResult>;
    /**
     * Execute task or playbook on target nodes
     *
     * @param params - Task execution parameters
     * @returns Execution result with per-node results
     */
    taskExecute(params: TaskExecuteParams): Promise<ExecutionResult>;
    /**
     * Execute script on target nodes
     *
     * @param params - Script execution parameters
     * @returns Execution result with per-node results
     */
    scriptExecute(params: ScriptExecuteParams): Promise<ExecutionResult>;
    /**
     * Stream output from an execution
     * Integrates with StreamingExecutionManager
     *
     * @param executionId - Execution identifier
     * @param callback - Callback function for output chunks
     */
    streamOutput(executionId: string, callback: OutputStreamCallback): Promise<void>;
    /**
     * Cancel an in-progress execution
     *
     * @param executionId - Execution identifier
     * @returns true if cancelled successfully, false otherwise
     */
    cancelExecution(executionId: string): Promise<boolean>;
}
/**
 * Type guard to check if a plugin implements RemoteExecutionCapability
 */
export declare function hasRemoteExecutionCapability(plugin: unknown): plugin is RemoteExecutionCapability;
//# sourceMappingURL=remote-execution.d.ts.map
