/**
 * PuppetDB Integration - Service Exports
 *
 * This module exports the PuppetDB services and types.
 * The actual plugin is loaded from plugins/native/puppetdb/backend/.
 *
 * @module integrations/puppetdb
 * @version 1.0.0
 */

import { PuppetDBPlugin } from "./PuppetDBPlugin.js";
import { PuppetDBService } from "./PuppetDBService.js";
import { LoggerService } from "../../services/LoggerService.js";
import { PerformanceMonitorService } from "../../services/PerformanceMonitorService.js";

// Re-export plugin class and config
export {
  PuppetDBPlugin,
  PuppetDBPluginConfigSchema,
  type PuppetDBPluginConfig,
} from "./PuppetDBPlugin.js";

// Re-export service for backward compatibility
export { PuppetDBService } from "./PuppetDBService.js";

// Re-export client and errors
export {
  PuppetDBClient,
  PuppetDBError,
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
  type PuppetDBClientConfig,
  type QueryParams,
} from "./PuppetDBClient.js";

// Re-export types
export type {
  Report,
  ReportMetrics,
  ResourceEvent,
  LogEntry,
  Catalog,
  Resource,
  ResourceRef,
  Edge,
  Event,
  EventFilters,
} from "./types.js";

// Re-export resilience utilities
export { CircuitBreaker, createPuppetDBCircuitBreaker } from "./CircuitBreaker.js";
export {
  withRetry,
  createPuppetDBRetryConfig,
  type RetryConfig,
} from "./RetryLogic.js";

/**
 * Legacy factory function (for manual instantiation with custom dependencies)
 */
export function createPuppetDBPlugin(
  puppetDBService: PuppetDBService,
  logger: LoggerService,
  performanceMonitor: PerformanceMonitorService,
): PuppetDBPlugin {
  return new PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}

export default PuppetDBPlugin;
