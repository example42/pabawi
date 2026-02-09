"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppetserverValidationError = exports.PuppetserverConfigurationError = exports.PuppetserverTimeoutError = exports.EnvironmentDeploymentError = exports.CatalogCompilationError = exports.PuppetserverAuthenticationError = exports.PuppetserverConnectionError = exports.PuppetserverError = exports.PuppetserverService = exports.PuppetserverPluginConfigSchema = exports.PuppetserverPlugin = void 0;
exports.createPlugin = createPlugin;
const PuppetserverPlugin_js_1 = require("./PuppetserverPlugin.js");
const PuppetserverService_js_1 = require("./services/PuppetserverService.js");
// Re-export plugin class and types
var PuppetserverPlugin_js_2 = require("./PuppetserverPlugin.js");
Object.defineProperty(exports, "PuppetserverPlugin", { enumerable: true, get: function () { return PuppetserverPlugin_js_2.PuppetserverPlugin; } });
Object.defineProperty(exports, "PuppetserverPluginConfigSchema", { enumerable: true, get: function () { return PuppetserverPlugin_js_2.PuppetserverPluginConfigSchema; } });
// Re-export service
var PuppetserverService_js_2 = require("./services/PuppetserverService.js");
Object.defineProperty(exports, "PuppetserverService", { enumerable: true, get: function () { return PuppetserverService_js_2.PuppetserverService; } });
// Re-export types
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "PuppetserverError", { enumerable: true, get: function () { return types_js_1.PuppetserverError; } });
Object.defineProperty(exports, "PuppetserverConnectionError", { enumerable: true, get: function () { return types_js_1.PuppetserverConnectionError; } });
Object.defineProperty(exports, "PuppetserverAuthenticationError", { enumerable: true, get: function () { return types_js_1.PuppetserverAuthenticationError; } });
Object.defineProperty(exports, "CatalogCompilationError", { enumerable: true, get: function () { return types_js_1.CatalogCompilationError; } });
Object.defineProperty(exports, "EnvironmentDeploymentError", { enumerable: true, get: function () { return types_js_1.EnvironmentDeploymentError; } });
Object.defineProperty(exports, "PuppetserverTimeoutError", { enumerable: true, get: function () { return types_js_1.PuppetserverTimeoutError; } });
Object.defineProperty(exports, "PuppetserverConfigurationError", { enumerable: true, get: function () { return types_js_1.PuppetserverConfigurationError; } });
Object.defineProperty(exports, "PuppetserverValidationError", { enumerable: true, get: function () { return types_js_1.PuppetserverValidationError; } });
/**
 * Create a simple console logger
 */
function createSimpleLogger() {
    return {
        info: (message, context) => {
            console.log(`[INFO] ${message}`, context ?? "");
        },
        warn: (message, context) => {
            console.warn(`[WARN] ${message}`, context ?? "");
        },
        debug: (message, context) => {
            if (process.env.DEBUG) {
                console.debug(`[DEBUG] ${message}`, context ?? "");
            }
        },
        error: (message, context, error) => {
            console.error(`[ERROR] ${message}`, context ?? "", error ?? "");
        },
    };
}
/**
 * Create a simple performance monitor
 */
function createSimplePerformanceMonitor() {
    return {
        startTimer: (name) => {
            const start = Date.now();
            return (metadata) => {
                const duration = Date.now() - start;
                if (process.env.DEBUG) {
                    console.debug(`[PERF] ${name}: ${duration}ms`, metadata ?? "");
                }
            };
        },
    };
}
/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetserverPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetserverPlugin instance
 */
function createPlugin() {
    // Get configuration from environment or use defaults
    const serverUrl = process.env.PUPPETSERVER_URL ?? "https://localhost:8140";
    const certPath = process.env.PUPPETSERVER_CERT_PATH;
    const keyPath = process.env.PUPPETSERVER_KEY_PATH;
    const caPath = process.env.PUPPETSERVER_CA_PATH;
    const timeout = parseInt(process.env.PUPPETSERVER_TIMEOUT ?? "30000", 10);
    // Create internal dependencies
    const logger = createSimpleLogger();
    const performanceMonitor = createSimplePerformanceMonitor();
    const puppetserverService = new PuppetserverService_js_1.PuppetserverService(serverUrl, certPath, keyPath, caPath, timeout, logger);
    return new PuppetserverPlugin_js_1.PuppetserverPlugin(puppetserverService, logger, performanceMonitor);
}
exports.default = PuppetserverPlugin_js_1.PuppetserverPlugin;
//# sourceMappingURL=index.js.map
