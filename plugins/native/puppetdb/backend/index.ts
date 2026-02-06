/**
 * PuppetDB Integration Plugin
 *
 * PuppetDB integration for node inventory, facts, reports, events, and catalogs.
 *
 * This plugin is SELF-CONTAINED. The createPlugin() factory creates all
 * required dependencies internally.
 *
 * @module plugins/native/puppetdb/backend
 * @version 1.0.0
 */

import { PuppetDBPlugin } from "./PuppetDBPlugin.js";

export {
  PuppetDBPlugin,
  PuppetDBPluginConfigSchema,
  type PuppetDBPluginConfig,
} from "./PuppetDBPlugin.js";

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
 * Create a stub PuppetDBService for now
 * TODO: Implement full PuppetDBService in services/PuppetDBService.ts
 */
function createStubPuppetDBService(logger: LoggerInterface): any {
  return {
    initialize: async () => {
      logger.warn("PuppetDBService stub - initialize called but not implemented");
    },
    healthCheck: async () => ({
      healthy: false,
      message: "PuppetDBService not yet implemented",
      lastCheck: new Date().toISOString(),
    }),
    getInventory: async () => [],
    queryInventory: async () => [],
    getNodeFacts: async () => ({ nodeId: "", gatheredAt: "", facts: {} }),
    getNodeReports: async () => [],
    getReport: async () => null,
    getReportsSummary: async () => ({
      total: 0,
      failed: 0,
      changed: 0,
      unchanged: 0,
      noop: 0,
    }),
    getAllReports: async () => [],
    queryEvents: async () => [],
    getNodeCatalog: async () => null,
    getCatalogResources: async () => ({}),
    getSummaryStats: async () => ({}),
  };
}

/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetDBPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetDBPlugin instance
 */
export function createPlugin(): PuppetDBPlugin {
  // Create internal dependencies
  const logger = createSimpleLogger();
  const performanceMonitor = createSimplePerformanceMonitor();
  const puppetDBService = createStubPuppetDBService(logger);

  logger.warn("PuppetDB plugin loaded with stub service - full implementation needed");

  return new PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}

export default PuppetDBPlugin;
