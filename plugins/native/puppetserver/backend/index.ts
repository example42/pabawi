/**
 * Puppetserver Integration Plugin
 *
 * Puppetserver integration for catalog compilation, environments, and facts.
 *
 * IMPORTANT: This plugin is SELF-CONTAINED. Dependencies are injected via
 * the createPlugin factory function. NO relative path imports to the main
 * codebase are allowed.
 *
 * @module plugins/native/puppetserver/backend
 * @version 1.0.0
 */

import { PuppetserverPlugin } from "./PuppetserverPlugin.js";

export {
  PuppetserverPlugin,
  PuppetserverPluginConfigSchema,
  type PuppetserverPluginConfig,
} from "./PuppetserverPlugin.js";

// =============================================================================
// Service Interfaces (for dependency injection)
// These match the interfaces defined in PuppetserverPlugin.ts
// =============================================================================

/** Environment interface */
interface Environment {
  name: string;
  last_deployed?: string;
  status?: "deployed" | "deploying" | "failed";
  settings?: Record<string, unknown>;
}

/** Catalog interface */
interface Catalog {
  certname: string;
  version: string;
  environment: string;
  transaction_uuid?: string;
  producer_timestamp?: string;
  resources: CatalogResource[];
  edges?: CatalogEdge[];
}

/** Catalog resource interface */
interface CatalogResource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
}

/** Catalog edge interface */
interface CatalogEdge {
  source: { type: string; title: string };
  target: { type: string; title: string };
  relationship: string;
}

/** Catalog diff interface */
interface CatalogDiff {
  environment1: string;
  environment2: string;
  added: CatalogResource[];
  removed: CatalogResource[];
  modified: ResourceDiff[];
  unchanged: CatalogResource[];
}

/** Resource diff interface */
interface ResourceDiff {
  type: string;
  title: string;
  parameterChanges: ParameterDiff[];
}

/** Parameter diff interface */
interface ParameterDiff {
  parameter: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Deployment result interface */
interface DeploymentResult {
  environment: string;
  status: "success" | "failed";
  message?: string;
  timestamp: string;
}

/** Facts interface */
interface Facts {
  nodeId: string;
  gatheredAt: string;
  source: string;
  facts: Record<string, unknown>;
}

/** Health status interface */
interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: string;
  details?: Record<string, unknown>;
  degraded?: boolean;
  workingCapabilities?: string[];
  failingCapabilities?: string[];
}

/** PuppetserverService interface - what we need from the injected service */
interface PuppetserverServiceInterface {
  initialize(config: unknown): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  compileCatalog(certname: string, environment: string): Promise<Catalog>;
  getNodeCatalog(certname: string): Promise<Catalog | null>;
  compareCatalogs(certname: string, env1: string, env2: string): Promise<CatalogDiff>;
  listEnvironments(): Promise<Environment[]>;
  getEnvironment(name: string): Promise<Environment | null>;
  deployEnvironment(name: string): Promise<DeploymentResult>;
  flushEnvironmentCache(name?: string): Promise<DeploymentResult>;
  getNodeFacts(nodeId: string): Promise<Facts>;
  getSimpleStatus(): Promise<unknown>;
  getServicesStatus(): Promise<unknown>;
  getMetrics(mbean?: string): Promise<unknown>;
  getAdminApiInfo(): Promise<unknown>;
  clearCache(): void;
}

/** LoggerService interface */
interface LoggerServiceInterface {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
  startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}

/** Dependencies required by PuppetserverPlugin */
export interface PuppetserverPluginDependencies {
  puppetserverService: PuppetserverServiceInterface;
  logger: LoggerServiceInterface;
  performanceMonitor: PerformanceMonitorServiceInterface;
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetserverPlugin instance with injected dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @param dependencies - Services injected by the PluginLoader
 * @returns Configured PuppetserverPlugin instance
 */
export function createPlugin(dependencies: PuppetserverPluginDependencies): PuppetserverPlugin {
  const { puppetserverService, logger, performanceMonitor } = dependencies;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PuppetserverPlugin(puppetserverService as any, logger as any, performanceMonitor as any);
}

/**
 * Alternative factory with explicit parameters (for backward compatibility)
 */
export function createPuppetserverPlugin(
  puppetserverService: PuppetserverServiceInterface,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): PuppetserverPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PuppetserverPlugin(puppetserverService as any, logger as any, performanceMonitor as any);
}

export default PuppetserverPlugin;
