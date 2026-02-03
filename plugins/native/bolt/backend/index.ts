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
import { BoltService } from "./services/BoltService.js";

// Re-export plugin class and types
export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
} from "./BoltPlugin.js";

// Re-export service
export { BoltService, type StreamingCallback } from "./services/BoltService.js";

// Re-export types
export {
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
} from "./types.js";

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Simple logger interface for the plugin
 */
interface LoggerInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/**
 * Simple performance monitor interface
 */
interface PerformanceMonitorInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

/**
 * Create a simple console logger
 */
function createSimpleLogger(): LoggerInterface {
  return {
    info: (message: string, context?: Record<string, unknown>) => {
      console.log(`[INFO] ${message}`, context ?? "");
    },
    warn: (message: string, context?: Record<string, unknown>) => {
      console.warn(`[WARN] ${message}`, context ?? "");
    },
    debug: (message: string, context?: Record<string, unknown>) => {
      if (process.env.DEBUG) {
        console.debug(`[DEBUG] ${message}`, context ?? "");
      }
    },
    error: (message: string, context?: Record<string, unknown>, error?: Error) => {
      console.error(`[ERROR] ${message}`, context ?? "", error ?? "");
    },
  };
}

/**
 * Create a simple performance monitor
 */
function createSimplePerformanceMonitor(): PerformanceMonitorInterface {
  return {
    startTimer: (name: string) => {
      const start = Date.now();
      return (metadata?: Record<string, unknown>) => {
        const duration = Date.now() - start;
        if (process.env.DEBUG) {
          console.debug(`[PERF] ${name}: ${duration}ms`, metadata ?? "");
        }
      };
    },
  };
}

/**
 * Factory function for PluginLoader
 *
 * Creates a BoltPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured BoltPlugin instance
 */
export function createPlugin(): BoltPlugin {
  // Get configuration from environment or use defaults
  const boltProjectPath = process.env.BOLT_PROJECT_PATH ?? process.cwd();
  const defaultTimeout = parseInt(process.env.BOLT_TIMEOUT ?? "300000", 10);

  // Create internal dependencies
  const logger = createSimpleLogger();
  const performanceMonitor = createSimplePerformanceMonitor();
  const boltService = new BoltService(boltProjectPath, defaultTimeout, undefined, logger);

  return new BoltPlugin(boltService, logger, performanceMonitor);
}

export default BoltPlugin;
