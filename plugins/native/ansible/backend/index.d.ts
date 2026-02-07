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
export declare function createPlugin(config?: Record<string, unknown>): Promise<AnsiblePlugin>;
/**
 * Export plugin class for type checking
 */
export { AnsiblePlugin } from "./AnsiblePlugin";
export type { Node, Facts, ExecutionResult, Playbook } from "./types";
//# sourceMappingURL=index.d.ts.map
