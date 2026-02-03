/**
 * Hiera Integration Plugin
 *
 * Puppet Hiera integration for hierarchical data lookup, key resolution, and code analysis.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/hiera/backend
 * @version 1.0.0
 */

import { HieraPlugin } from "./HieraPlugin.js";
import { HieraService } from "./services/HieraService.js";

// Re-export plugin class and types
export {
  HieraPlugin,
  HieraPluginConfigSchema,
  type HieraPluginConfig,
} from "./HieraPlugin.js";

// Re-export service
export { HieraService } from "./services/HieraService.js";

// Re-export types
export {
  type HieraConfig,
  type HieraDefaults,
  type HierarchyLevel,
  type LookupOptions,
  type LookupMethod,
  type HieraKey,
  type HieraKeyLocation,
  type HieraKeyIndex,
  type HieraFileInfo,
  type HieraResolution,
  type ResolveOptions,
  type MergeOptions,
  type HierarchyFileInfo,
  type NodeHieraData,
  type KeyNodeValues,
  type KeyUsageMap,
  type Facts,
  type FactResult,
  type LocalFactFile,
  type CodeAnalysisResult,
  type UnusedCodeReport,
  type UnusedItem,
  type LintIssue,
  type LintSeverity,
  type ModuleUpdate,
  type UsageStatistics,
  type ClassUsage,
  type ResourceUsage,
  type HealthStatus,
  type HieraHealthStatus,
  type HieraErrorCode,
  type HieraError,
  HIERA_ERROR_CODES,
  HieraServiceError,
  HieraConfigurationError,
  HieraParseError,
  HieraResolutionError,
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
 * Creates a HieraPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured HieraPlugin instance
 */
export function createPlugin(): HieraPlugin {
  // Get configuration from environment or use defaults
  const controlRepoPath = process.env.BOLT_PROJECT_PATH ?? process.cwd();
  const hieraConfigPath = process.env.HIERA_CONFIG_PATH ?? "hiera.yaml";

  // Create internal dependencies
  const logger = createSimpleLogger();
  const performanceMonitor = createSimplePerformanceMonitor();

  // Create the plugin
  const plugin = new HieraPlugin(logger, performanceMonitor);

  // Try to create and set HieraService if configuration is available
  try {
    const hieraService = new HieraService(hieraConfigPath, controlRepoPath, logger);
    plugin.setHieraService(hieraService);
  } catch (error) {
    logger.warn("Could not initialize HieraService", {
      component: "HieraPlugin",
      operation: "createPlugin",
      metadata: { error: String(error) },
    });
  }

  return plugin;
}

export default HieraPlugin;
