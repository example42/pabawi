/**
 * Puppetserver Integration Plugin
 *
 * Puppetserver integration for catalog compilation, environments, and facts.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/puppetserver/backend
 * @version 1.0.0
 */
import { PuppetserverPlugin } from "./PuppetserverPlugin.js";
export { PuppetserverPlugin, PuppetserverPluginConfigSchema, type PuppetserverPluginConfig, } from "./PuppetserverPlugin.js";
export { PuppetserverService } from "./services/PuppetserverService.js";
export { type CertificateStatus, type Certificate, type NodeActivityCategory, type NodeStatus, type EnvironmentSettings, type Environment, type DeploymentResult, type CatalogResource, type Catalog, type CatalogEdge, type ParameterDiff, type ResourceDiff, type CatalogDiff, type BulkOperationResult, type PuppetserverClientConfig, type PuppetserverCacheConfig, type PuppetserverSSLConfig, type PuppetserverConfig, type Facts, type HealthStatus, PuppetserverError, PuppetserverConnectionError, PuppetserverAuthenticationError, CatalogCompilationError, EnvironmentDeploymentError, PuppetserverTimeoutError, PuppetserverConfigurationError, PuppetserverValidationError, } from "./types.js";
/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetserverPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetserverPlugin instance
 */
export declare function createPlugin(): PuppetserverPlugin;
export default PuppetserverPlugin;
//# sourceMappingURL=index.d.ts.map
