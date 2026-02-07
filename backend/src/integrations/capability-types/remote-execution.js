"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptExecuteParamsSchema = exports.TaskExecuteParamsSchema = exports.CommandExecuteParamsSchema = void 0;
exports.hasRemoteExecutionCapability = hasRemoteExecutionCapability;
const zod_1 = require("zod");
// =============================================================================
// Zod Schemas for Validation
// =============================================================================
/**
 * Schema for command.execute parameters
 */
exports.CommandExecuteParamsSchema = zod_1.z.object({
    command: zod_1.z.string().min(1).describe("Shell command to execute"),
    targets: zod_1.z.array(zod_1.z.string().min(1)).min(1).describe("Target node identifiers"),
    timeout: zod_1.z.number().positive().optional().describe("Execution timeout in milliseconds"),
    environment: zod_1.z.record(zod_1.z.string()).optional().describe("Environment variables"),
    async: zod_1.z.boolean().optional().describe("Execute asynchronously"),
    debugMode: zod_1.z.boolean().optional().describe("Enable debug mode for detailed output"),
});
/**
 * Schema for task.execute parameters
 */
exports.TaskExecuteParamsSchema = zod_1.z.object({
    taskName: zod_1.z.string().min(1).describe("Task or playbook name"),
    targets: zod_1.z.array(zod_1.z.string().min(1)).min(1).describe("Target node identifiers"),
    parameters: zod_1.z.record(zod_1.z.unknown()).optional().describe("Task parameters"),
    timeout: zod_1.z.number().positive().optional().describe("Execution timeout in milliseconds"),
    environment: zod_1.z.record(zod_1.z.string()).optional().describe("Environment variables"),
    async: zod_1.z.boolean().optional().describe("Execute asynchronously"),
    debugMode: zod_1.z.boolean().optional().describe("Enable debug mode for detailed output"),
});
/**
 * Schema for script.execute parameters
 */
exports.ScriptExecuteParamsSchema = zod_1.z.object({
    script: zod_1.z.string().min(1).describe("Script content or path"),
    targets: zod_1.z.array(zod_1.z.string().min(1)).min(1).describe("Target node identifiers"),
    scriptType: zod_1.z.enum(["bash", "powershell", "python", "ruby"]).optional().describe("Script interpreter type"),
    arguments: zod_1.z.array(zod_1.z.string()).optional().describe("Script arguments"),
    timeout: zod_1.z.number().positive().optional().describe("Execution timeout in milliseconds"),
    environment: zod_1.z.record(zod_1.z.string()).optional().describe("Environment variables"),
    async: zod_1.z.boolean().optional().describe("Execute asynchronously"),
    debugMode: zod_1.z.boolean().optional().describe("Enable debug mode for detailed output"),
});
/**
 * Type guard to check if a plugin implements RemoteExecutionCapability
 */
function hasRemoteExecutionCapability(plugin) {
    return (typeof plugin === "object" &&
        plugin !== null &&
        "commandExecute" in plugin &&
        typeof plugin.commandExecute === "function" &&
        "taskExecute" in plugin &&
        typeof plugin.taskExecute === "function" &&
        "scriptExecute" in plugin &&
        typeof plugin.scriptExecute === "function" &&
        "streamOutput" in plugin &&
        typeof plugin.streamOutput === "function" &&
        "cancelExecution" in plugin &&
        typeof plugin.cancelExecution === "function");
}
//# sourceMappingURL=remote-execution.js.map
