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

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for command.execute parameters
 */
export const CommandExecuteParamsSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  timeout: z.number().positive().optional().describe("Execution timeout in milliseconds"),
  environment: z.record(z.string()).optional().describe("Environment variables"),
  async: z.boolean().optional().describe("Execute asynchronously"),
  debugMode: z.boolean().optional().describe("Enable debug mode for detailed output"),
});

/**
 * Schema for task.execute parameters
 */
export const TaskExecuteParamsSchema = z.object({
  taskName: z.string().min(1).describe("Task or playbook name"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  parameters: z.record(z.unknown()).optional().describe("Task parameters"),
  timeout: z.number().positive().optional().describe("Execution timeout in milliseconds"),
  environment: z.record(z.string()).optional().describe("Environment variables"),
  async: z.boolean().optional().describe("Execute asynchronously"),
  debugMode: z.boolean().optional().describe("Enable debug mode for detailed output"),
});

/**
 * Schema for script.execute parameters
 */
export const ScriptExecuteParamsSchema = z.object({
  script: z.string().min(1).describe("Script content or path"),
  targets: z.array(z.string().min(1)).min(1).describe("Target node identifiers"),
  scriptType: z.enum(["bash", "powershell", "python", "ruby"]).optional().describe("Script interpreter type"),
  arguments: z.array(z.string()).optional().describe("Script arguments"),
  timeout: z.number().positive().optional().describe("Execution timeout in milliseconds"),
  environment: z.record(z.string()).optional().describe("Environment variables"),
  async: z.boolean().optional().describe("Execute asynchronously"),
  debugMode: z.boolean().optional().describe("Enable debug mode for detailed output"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type CommandExecuteParams = z.infer<typeof CommandExecuteParamsSchema>;
export type TaskExecuteParams = z.infer<typeof TaskExecuteParamsSchema>;
export type ScriptExecuteParams = z.infer<typeof ScriptExecuteParamsSchema>;

// =============================================================================
// Streaming Output Types
// =============================================================================

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

// =============================================================================
// Capability Interfaces
// =============================================================================

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
export function hasRemoteExecutionCapability(
  plugin: unknown,
): plugin is RemoteExecutionCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "commandExecute" in plugin &&
    typeof (plugin as Record<string, unknown>).commandExecute === "function" &&
    "taskExecute" in plugin &&
    typeof (plugin as Record<string, unknown>).taskExecute === "function" &&
    "scriptExecute" in plugin &&
    typeof (plugin as Record<string, unknown>).scriptExecute === "function" &&
    "streamOutput" in plugin &&
    typeof (plugin as Record<string, unknown>).streamOutput === "function" &&
    "cancelExecution" in plugin &&
    typeof (plugin as Record<string, unknown>).cancelExecution === "function"
  );
}
