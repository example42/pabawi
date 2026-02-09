/**
 * PuppetDB Integration Plugin
 *
 * PuppetDB integration for node inventory, facts, reports, events, and catalogs.
 *
 * This plugin is SELF-CONTAINED. The createPlugin() factory creates all
 * required dependencies internally.
 *
 * @module plugins/native/puppetdb/backend
 * @version 1.0.0
 */
import { PuppetDBPlugin } from "./PuppetDBPlugin.js";
export { PuppetDBPlugin, PuppetDBPluginConfigSchema, type PuppetDBPluginConfig, } from "./PuppetDBPlugin.js";
/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetDBPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetDBPlugin instance
 */
export declare function createPlugin(): PuppetDBPlugin;
export default PuppetDBPlugin;
//# sourceMappingURL=index.d.ts.map
