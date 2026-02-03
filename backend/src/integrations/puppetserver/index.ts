/**
 * Puppetserver Integration - Service Exports
 *
 * @deprecated This module is deprecated. Import from 'plugins/native/puppetserver/backend' instead.
 * This file is kept for backward compatibility only.
 *
 * The plugin code has been migrated to:
 * - plugins/native/puppetserver/backend/PuppetserverPlugin.ts
 * - plugins/native/puppetserver/backend/services/PuppetserverService.ts
 * - plugins/native/puppetserver/backend/types.ts
 *
 * @module integrations/puppetserver
 * @version 1.0.0
 */

import { PuppetserverPlugin } from "./PuppetserverPlugin.js";
import { PuppetserverService } from "./PuppetserverService.js";
import { LoggerService } from "../../services/LoggerService.js";
import { PerformanceMonitorService } from "../../services/PerformanceMonitorService.js";

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
