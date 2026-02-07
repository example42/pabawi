/**
 * Ansible Plugin Entry Point
 *
 * This file is the entry point for the Ansible plugin.
 * It exports the plugin factory function that creates and initializes the plugin instance.
 *
 * @module plugins/native/ansible/backend
 */

import { AnsiblePlugin } from "./AnsiblePlugin";

/**
 * Plugin factory function
 *
 * Creates and returns a new Ansible plugin instance with all dependencies injected.
 * This function is called by the PluginLoader during plugin discovery.
 *
 * @param config - Plugin configuration
 * @returns Initialized Ansible plugin instance
 */
export async function createPlugin(config?: Record<string, unknown>) {
  // Import services dynamically to avoid circular dependencies
  const { LoggerService } = await import("../../../../backend/src/services/LoggerService");
  const { PerformanceMonitorService } = await import("../../../../backend/src/services/PerformanceMonitorService");

  // Create service instances
  const logger = new LoggerService();
  const performanceMonitor = new PerformanceMonitorService();

  // Create plugin instance
  const plugin = new AnsiblePlugin(config || {}, logger as any, performanceMonitor as any);

  return plugin;
}

/**
 * Export plugin class for type checking
 */
export { AnsiblePlugin } from "./AnsiblePlugin";
export type { Node, Facts, ExecutionResult, Playbook } from "./types";
