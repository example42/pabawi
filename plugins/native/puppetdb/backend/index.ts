/**
 * PuppetDB Integration Plugin
 *
 * PuppetDB integration for node inventory, facts, reports, events, and catalogs.
 *
 * IMPORTANT: This plugin is SELF-CONTAINED. Dependencies are injected via
 * the createPlugin factory function. NO relative path imports to the main
 * codebase are allowed.
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
// Service Interfaces (for dependency injection)
// These match the interfaces defined in PuppetDBPlugin.ts
// =============================================================================

/** Node interface */
interface Node {
  id: string;
  name: string;
  uri: string;
  transport: string;
  config: Record<string, unknown>;
}

/** Facts interface */
interface Facts {
  nodeId: string;
  gatheredAt: string;
  facts: Record<string, unknown>;
}

/** Report interface */
interface Report {
  certname: string;
  hash: string;
  environment: string;
  status: "unchanged" | "changed" | "failed";
  noop: boolean;
  puppet_version: string;
  report_format: number;
  configuration_version: string;
  start_time: string;
  end_time: string;
  producer_timestamp: string;
  receive_time: string;
  transaction_uuid: string;
  metrics: unknown;
  logs: unknown[];
  resource_events: unknown[];
}

/** Catalog interface */
interface Catalog {
  certname: string;
  version: string;
  transaction_uuid: string;
  environment: string;
  producer_timestamp: string;
  hash: string;
  resources: unknown[];
  edges: unknown[];
}

/** Event interface */
interface Event {
  certname: string;
  timestamp: string;
  report: string;
  resource_type: string;
  resource_title: string;
  property: string;
  status: "success" | "failure" | "noop" | "skipped";
  old_value?: unknown;
  new_value?: unknown;
  message?: string;
  file?: string;
  line?: number;
}

/** Event filters interface */
interface EventFilters {
  status?: "success" | "failure" | "noop" | "skipped";
  resourceType?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  reportHash?: string;
}

/** Resource interface */
interface Resource {
  type: string;
  title: string;
  tags: string[];
  exported: boolean;
  file?: string;
  line?: number;
  parameters: Record<string, unknown>;
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

/** PuppetDBService interface - what we need from the injected service */
interface PuppetDBServiceInterface {
  initialize(config: unknown): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getInventory(pqlQuery?: string): Promise<Node[]>;
  queryInventory(pqlQuery: string): Promise<Node[]>;
  getNodeFacts(nodeId: string): Promise<Facts>;
  getNodeReports(nodeId: string, limit?: number, offset?: number): Promise<Report[]>;
  getReport(reportHash: string): Promise<Report | null>;
  getReportsSummary(limit?: number, hours?: number): Promise<{
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  }>;
  getAllReports(limit?: number, offset?: number): Promise<Report[]>;
  queryEvents(nodeId: string, filters: EventFilters): Promise<Event[]>;
  getNodeCatalog(nodeId: string): Promise<Catalog | null>;
  getCatalogResources(nodeId: string, resourceType?: string): Promise<Record<string, Resource[]>>;
  getSummaryStats(): Promise<unknown>;
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

/** Dependencies required by PuppetDBPlugin */
export interface PuppetDBPluginDependencies {
  puppetDBService: PuppetDBServiceInterface;
  logger: LoggerServiceInterface;
  performanceMonitor: PerformanceMonitorServiceInterface;
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetDBPlugin instance with injected dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @param dependencies - Services injected by the PluginLoader
 * @returns Configured PuppetDBPlugin instance
 */
export function createPlugin(dependencies: PuppetDBPluginDependencies): PuppetDBPlugin {
  const { puppetDBService, logger, performanceMonitor } = dependencies;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PuppetDBPlugin(puppetDBService as any, logger as any, performanceMonitor as any);
}

/**
 * Alternative factory with explicit parameters (for backward compatibility)
 */
export function createPuppetDBPlugin(
  puppetDBService: PuppetDBServiceInterface,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): PuppetDBPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PuppetDBPlugin(puppetDBService as any, logger as any, performanceMonitor as any);
}

export default PuppetDBPlugin;
