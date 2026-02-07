/**
 * SSH Plugin Entry Point
 *
 * This file is the entry point for the SSH plugin.
 * It exports the plugin factory function that creates and initializes the plugin instance.
 *
 * @module plugins/native/ssh/backend
 */

import { SSHPlugin } from "./SSHPlugin";
import { SSHService } from "./SSHService";
import { LoggerService } from "../../../../backend/src/services/LoggerService";
import { PerformanceMonitorService } from "../../../../backend/src/services/PerformanceMonitorService";

/**
 * Plugin factory function
 *
 * Creates and returns a new SSH plugin instance with all dependencies injected.
 * This function is called by the PluginLoader during plugin discovery.
 *
 * @param config - Plugin configuration
 * @returns Initialized SSH plugin instance
 */
export async function createPlugin(config?: Record<string, unknown>) {
  // Create service instances
  const logger = new LoggerService();
  const performanceMonitor = new PerformanceMonitorService();

  // Create SSH service with config
  const sshService = new SSHService({
    sshConfigPath: config?.sshConfigPath as string | undefined,
    timeout: config?.executionTimeout as number | undefined,
  });

  // Create plugin instance
  const plugin = new SSHPlugin(sshService, logger, performanceMonitor);

  return plugin;
}

/**
 * Export plugin class for type checking
 */
export { SSHPlugin } from "./SSHPlugin";
export { SSHService } from "./SSHService";
