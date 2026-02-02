/**
 * Bolt Integration Plugin
 *
 * Puppet Bolt integration for remote command and task execution.
 *
 * @module plugins/native/bolt/backend
 * @version 1.0.0
 */

import { BoltPlugin } from "./BoltPlugin.js";
import { BoltService } from "../../../../backend/src/bolt/BoltService.js";
import { LoggerService } from "../../../../backend/src/services/LoggerService.js";
import { PerformanceMonitorService } from "../../../../backend/src/services/PerformanceMonitorService.js";
import { ConfigService } from "../../../../backend/src/config/ConfigService.js";

export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
} from "./BoltPlugin.js";

/**
 * Factory function for PluginLoader auto-discovery
 *
 * Creates a BoltPlugin instance with default dependencies.
 * This is called by PluginLoader when auto-discovering plugins.
 */
export function createPlugin(): BoltPlugin {
  const configService = new ConfigService();
  const config = configService.getConfig();

  const logger = new LoggerService(config.logLevel);
  const performanceMonitor = new PerformanceMonitorService();
  const boltService = new BoltService(config.boltProjectPath);

  return new BoltPlugin(boltService, logger, performanceMonitor);
}

/**
 * Legacy factory function (for manual instantiation with custom dependencies)
 */
export function createBoltPlugin(
  boltService: BoltService,
  logger: LoggerService,
  performanceMonitor: PerformanceMonitorService,
): BoltPlugin {
  return new BoltPlugin(boltService, logger, performanceMonitor);
}

export default BoltPlugin;
