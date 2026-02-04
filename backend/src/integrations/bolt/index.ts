/**
 * Bolt Integration - Service Exports
 *
 * This module exports the BoltPlugin class and related types.
 *
 * NOTE: The canonical location for Bolt plugin code is now plugins/native/bolt/backend/.
 * This file is maintained for backward compatibility during the migration period.
 *
 * @module integrations/bolt
 * @version 1.0.0
 * @deprecated Use plugins/native/bolt/backend/ for new code
 */

// Re-export everything from the plugin location for backward compatibility
export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
  BoltService,
  type StreamingCallback,
  type BoltExecutionResult,
  type BoltExecutionOptions,
  type BoltJsonOutput,
  type Node,
  type Facts,
  type ExecutionResult,
  type NodeResult,
  type Task,
  type TaskParameter,
  type TasksByModule,
  BoltExecutionError,
  BoltTimeoutError,
  BoltParseError,
  BoltInventoryNotFoundError,
  BoltNodeUnreachableError,
  BoltTaskNotFoundError,
  BoltTaskParameterError,
  createPlugin,
} from "../../../../plugins/native/bolt/backend/index.js";

// Also export createBoltPlugin as an alias for createPlugin
export { createPlugin as createBoltPlugin } from "../../../../plugins/native/bolt/backend/index.js";

// Default export
import { BoltPlugin } from "../../../../plugins/native/bolt/backend/index.js";
export default BoltPlugin;
