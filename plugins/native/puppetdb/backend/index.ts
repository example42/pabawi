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

import path from "path";
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
 * Get the backend source directory path
 * Resolves from plugins/native/puppetdb/backend to backend/src
 */
function getBackendSrcPath(): string {
  // From plugins/native/puppetdb/backend -> project root -> backend/src
  return path.resolve(__dirname, "..", "..", "..", "..", "backend", "src");
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
  const backendSrc = getBackendSrcPath();

  // Import services from the main codebase using absolute paths
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ConfigService } = require(path.join(backendSrc, "config", "ConfigService.ts"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LoggerService } = require(path.join(backendSrc, "services", "LoggerService.ts"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PerformanceMonitorService } = require(path.join(backendSrc, "services", "PerformanceMonitorService.ts"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PuppetDBService } = require(path.join(backendSrc, "integrations", "puppetdb", "PuppetDBService.ts"));

  const configService = new ConfigService();
  const config = configService.getConfig();

  const logger = new LoggerService(config.logLevel);
  const performanceMonitor = new PerformanceMonitorService();

  // Create PuppetDBService with configuration
  const puppetDBService = new PuppetDBService(
    config.puppetdbUrl,
    config.puppetdbCertPath,
    config.puppetdbKeyPath,
    config.puppetdbCaPath,
    logger
  );

  return new PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}

export default PuppetDBPlugin;
