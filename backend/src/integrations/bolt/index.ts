/**
 * Bolt Integration Plugin
 *
 * Puppet Bolt integration for remote command and task execution.
 *
 * @module integrations/bolt
 * @version 1.0.0
 *
 * NOTE: This file re-exports from the new plugin location at plugins/native/bolt/backend/
 * for backward compatibility. New code should import directly from the plugin location.
 */

// Re-export everything from the new plugin location
export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
  createBoltPlugin,
} from "./BoltPlugin.js";

// Re-export factory functions
import { BoltPlugin } from "./BoltPlugin.js";
import { BoltService } from "../../bolt/BoltService.js";
import { LoggerService } from "../../services/LoggerService.js";
import { PerformanceMonitorService } from "../../services/PerformanceMonitorService.js";
import { ConfigService } from "../../config/ConfigService.js";

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

export default BoltPlugin;
