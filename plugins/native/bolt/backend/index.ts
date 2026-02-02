/**
 * Bolt Integration Plugin
 *
 * Puppet Bolt integration for remote command and task execution.
 *
 * IMPORTANT: This plugin is SELF-CONTAINED. Dependencies are injected via
 * the createPlugin factory function. NO relative path imports to the main
 * codebase are allowed.
 *
 * @module plugins/native/bolt/backend
 * @version 1.0.0
 */

import { BoltPlugin } from "./BoltPlugin.js";

export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
} from "./BoltPlugin.js";

// =============================================================================
// Service Interfaces (for dependency injection)
// These match the interfaces defined in BoltPlugin.ts
// =============================================================================

/** BoltService interface - what we need from the injected service */
interface BoltServiceInterface {
  getInventory(): Promise<unknown[]>;
  gatherFacts(nodeId: string): Promise<unknown>;
  runCommand(nodeId: string, command: string, streamingCallback?: unknown): Promise<unknown>;
  runTask(nodeId: string, taskName: string, parameters?: Record<string, unknown>, streamingCallback?: unknown): Promise<unknown>;
  listTasks(): Promise<unknown[]>;
  getTaskDetails(taskName: string): Promise<unknown>;
  getBoltProjectPath(): string;
  getDefaultTimeout(): number;
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

/** Dependencies required by BoltPlugin */
export interface BoltPluginDependencies {
  boltService: BoltServiceInterface;
  logger: LoggerServiceInterface;
  performanceMonitor: PerformanceMonitorServiceInterface;
}

// =============================================================================
// Plugin Factory
// =============================================================================

/**
 * Factory function for PluginLoader
 *
 * Creates a BoltPlugin instance with injected dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @param dependencies - Services injected by the PluginLoader
 * @returns Configured BoltPlugin instance
 */
export function createPlugin(dependencies: BoltPluginDependencies): BoltPlugin {
  const { boltService, logger, performanceMonitor } = dependencies;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new BoltPlugin(boltService as any, logger as any, performanceMonitor as any);
}

/**
 * Alternative factory with explicit parameters (for backward compatibility)
 */
export function createBoltPlugin(
  boltService: BoltServiceInterface,
  logger: LoggerServiceInterface,
  performanceMonitor: PerformanceMonitorServiceInterface,
): BoltPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new BoltPlugin(boltService as any, logger as any, performanceMonitor as any);
}

export default BoltPlugin;
