/**
 * SSH Plugin Entry Point
 *
 * This file is the entry point for the SSH plugin.
 * It exports the plugin factory function that creates and initializes the plugin instance.
 *
 * @module plugins/native/ssh/backend
 */
import { SSHPlugin } from "./SSHPlugin";
/**
 * Plugin factory function
 *
 * Creates and returns a new SSH plugin instance with all dependencies injected.
 * This function is called by the PluginLoader during plugin discovery.
 *
 * @param config - Plugin configuration
 * @returns Initialized SSH plugin instance
 */
export declare function createPlugin(config?: Record<string, unknown>): Promise<SSHPlugin>;
/**
 * Export plugin class for type checking
 */
export { SSHPlugin } from "./SSHPlugin";
export { SSHService } from "./SSHService";
//# sourceMappingURL=index.d.ts.map
