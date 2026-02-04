/**
 * Bolt Integration Plugin
 *
 * Puppet Bolt integration for remote command and task execution.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/bolt/backend
 * @version 1.0.0
 */
import { BoltPlugin } from "./BoltPlugin.js";
export { BoltPlugin, BoltPluginConfigSchema, type BoltPluginConfig, } from "./BoltPlugin.js";
export { BoltService, type StreamingCallback } from "./services/BoltService.js";
export { type BoltExecutionResult, type BoltExecutionOptions, type BoltJsonOutput, type Node, type Facts, type ExecutionResult, type NodeResult, type Task, type TaskParameter, type TasksByModule, BoltExecutionError, BoltTimeoutError, BoltParseError, BoltInventoryNotFoundError, BoltNodeUnreachableError, BoltTaskNotFoundError, BoltTaskParameterError, } from "./types.js";
/**
 * Factory function for PluginLoader
 *
 * Creates a BoltPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured BoltPlugin instance
 */
export declare function createPlugin(): BoltPlugin;
export default BoltPlugin;
//# sourceMappingURL=index.d.ts.map
