/**
 * Puppetserver Integration Plugin
 *
 * Puppetserver integration for catalog compilation, environments, and facts.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/puppetserver/backend
 * @version 1.0.0
 */

import { PuppetserverPlugin } from "./PuppetserverPlugin.js";
import { PuppetserverService } from "./services/PuppetserverService.js";

// Re-export plugin class and types
export {
  PuppetserverPlugin,
  PuppetserverPluginConfigSchema,
  type PuppetserverPluginConfig,
} from "./PuppetserverPlugin.js";

// Re-export service
export { PuppetserverService } from "./services/PuppetserverService.js";

// Re-export types
export {
  type CertificateStatus,
  type Certificate,
  type NodeActivityCategory,
  type NodeStatus,
  type EnvironmentSettings,
  type Environment,
  type DeploymentResult,
  type CatalogResource,
  type Catalog,
  type CatalogEdge,
  type ParameterDiff,
  type ResourceDiff,
  type CatalogDiff,
  type BulkOperationResult,
  type PuppetserverClientConfig,
  type PuppetserverCacheConfig,
  type PuppetserverSSLConfig,
  type PuppetserverConfig,
  type Facts,
  type HealthStatus,
  PuppetserverError,
  PuppetserverConnectionError,
  PuppetserverAuthenticationError,
  CatalogCompilationError,
  EnvironmentDeploymentError,
  PuppetserverTimeoutError,
  PuppetserverConfigurationError,
  PuppetserverValidationError,
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
 * Creates a PuppetserverPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetserverPlugin instance
 */
export function createPlugin(): PuppetserverPlugin {
  // Get configuration from environment or use defaults
  const serverUrl = process.env.PUPPETSERVER_URL ?? "https://localhost:8140";
  const certPath = process.env.PUPPETSERVER_CERT_PATH;
  const keyPath = process.env.PUPPETSERVER_KEY_PATH;
  const caPath = process.env.PUPPETSERVER_CA_PATH;
  const timeout = parseInt(process.env.PUPPETSERVER_TIMEOUT ?? "30000", 10);

  // Create internal dependencies
  const logger = createSimpleLogger();
  const performanceMonitor = createSimplePerformanceMonitor();
  const puppetserverService = new PuppetserverService(
    serverUrl,
    certPath,
    keyPath,
    caPath,
    timeout,
    logger,
  );

  return new PuppetserverPlugin(puppetserverService, logger, performanceMonitor);
}

export default PuppetserverPlugin;
