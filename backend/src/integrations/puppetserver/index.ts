/**
 * Puppetserver Integration Plugin
 *
 * Puppetserver integration for catalog compilation, environments, and facts.
 *
 * Note: Certificate management has been removed in v0.4.
 * Node inventory should come from PuppetDB instead.
 *
 * @module integrations/puppetserver
 * @version 1.0.0
 */

import { PuppetserverPlugin } from "./PuppetserverPlugin.js";
import { PuppetserverService } from "./PuppetserverService.js";
import { LoggerService } from "../../services/LoggerService.js";
import { PerformanceMonitorService } from "../../services/PerformanceMonitorService.js";
import { ConfigService } from "../../config/ConfigService.js";

// Re-export plugin class and config
export {
  PuppetserverPlugin,
  PuppetserverPluginConfigSchema,
  type PuppetserverPluginConfig,
} from "./PuppetserverPlugin.js";

// Re-export service for backward compatibility
export { PuppetserverService } from "./PuppetserverService.js";

// Re-export client
export { PuppetserverClient } from "./PuppetserverClient.js";

// Re-export errors
export {
  PuppetserverError,
  PuppetserverConnectionError,
  PuppetserverConfigurationError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
} from "./errors.js";

// Re-export types
export type {
  Certificate,
  CertificateStatus,
  NodeStatus,
  NodeActivityCategory,
  Environment,
  EnvironmentSettings,
  DeploymentResult,
  Catalog,
  CatalogResource,
  CatalogEdge,
  CatalogDiff,
  ParameterDiff,
  ResourceDiff,
  BulkOperationResult,
  PuppetserverClientConfig,
  PuppetserverCacheConfig,
  PuppetserverSSLConfig,
  PuppetserverConfig,
} from "./types.js";

/**
 * Factory function for PluginLoader auto-discovery
 *
 * Creates a PuppetserverPlugin instance with default dependencies.
 * This is called by PluginLoader when auto-discovering plugins.
 */
export function createPlugin(): PuppetserverPlugin {
  const configService = new ConfigService();
  const config = configService.getConfig();

  const logger = new LoggerService(config.logLevel);
  const performanceMonitor = new PerformanceMonitorService();
  const puppetserverService = new PuppetserverService(logger, performanceMonitor);

  return new PuppetserverPlugin(puppetserverService, logger, performanceMonitor);
}

/**
 * Legacy factory function (for manual instantiation with custom dependencies)
 */
export function createPuppetserverPlugin(
  puppetserverService: PuppetserverService,
  logger: LoggerService,
  performanceMonitor: PerformanceMonitorService,
): PuppetserverPlugin {
  return new PuppetserverPlugin(puppetserverService, logger, performanceMonitor);
}

export default PuppetserverPlugin;
