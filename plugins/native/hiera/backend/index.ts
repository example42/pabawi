/**
 * Hiera Integration Plugin
 *
 * Puppet Hiera integration for hierarchical data lookup, key resolution, and code analysis.
 *
 * IMPORTANT: This plugin is SELF-CONTAINED. Dependencies are injected via
 * the createPlugin factory function. NO relative path imports to the main
 * codebase are allowed.
 *
 * @module plugins/native/hiera/backend
 * @version 1.0.0
 */

import { HieraPlugin } from "./HieraPlugin.js";

export {
  HieraPlugin,
  HieraPluginConfigSchema,
  type HieraPluginConfig,
} from "./HieraPlugin.js";

// =============================================================================
// Service Interfaces (for dependency injection)
// These match the interfaces defined in HieraPlugin.ts
// =============================================================================

/** HieraService interface - what we need from the injected service */
interface HieraServiceInterface {
  isInitialized(): boolean;
  getAllKeys(): Promise<unknown>;
  searchKeys(query: string): Promise<unknown[]>;
  resolveKey(node: string, key: string, environment?: string): Promise<unknown>;
  getNodeHieraData(node: string): Promise<unknown>;
  getKeyValuesAcrossNodes(key: string): Promise<unknown[]>;
  getHieraConfig(): unknown;
  invalidateCache(): void;
  shutdown(): void;
}

/** CodeAnalyzer interface */
interface CodeAnalyzerInterface {
  analyze(): Promise<unknown>;
  clearCache(): void;
}

/** LoggerService interface */
interface LoggerServiceInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

/** Dependencies required by HieraPlugin */
export interface HieraPluginDependencies {
  hieraService?: HieraServiceInterface;
  codeAnalyzer?: CodeAnalyzerInterface;
  logger: LoggerServiceInterface;
  performanceMonitor: PerformanceMonitorServiceInterface;
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for PluginLoader
 *
 * Creates a HieraPlugin instance with injected dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @param dependencies - Services injected by the PluginLoader
 * @returns Configured HieraPlugin instance
 */
export function createPlugin(dependencies: HieraPluginDependencies): HieraPlugin {
  const { hieraService, codeAnalyzer, logger, performanceMonitor } = dependencies;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin = new HieraPlugin(logger as any, performanceMonitor as any);

  if (hieraService) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin.setHieraService(hieraService as any);
  }

  if (codeAnalyzer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin.setCodeAnalyzer(codeAnalyzer as any);
  }

  return plugin;
}

/**
 * Alternative factory with explicit parameters (for backward compatibility)
 */
export function createHieraPlugin(
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
  hieraService?: HieraServiceInterface,
  codeAnalyzer?: CodeAnalyzerInterface,
): HieraPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin = new HieraPlugin(logger as any, performanceMonitor as any);

  if (hieraService) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin.setHieraService(hieraService as any);
  }

  if (codeAnalyzer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin.setCodeAnalyzer(codeAnalyzer as any);
  }

  return plugin;
}

export default HieraPlugin;
