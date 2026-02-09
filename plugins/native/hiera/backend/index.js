"use strict";
/**
 * Hiera Integration Plugin
 *
 * Puppet Hiera integration for hierarchical data lookup, key resolution, and code analysis.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/hiera/backend
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HieraResolutionError = exports.HieraParseError = exports.HieraConfigurationError = exports.HieraServiceError = exports.HIERA_ERROR_CODES = exports.HieraService = exports.HieraPluginConfigSchema = exports.HieraPlugin = void 0;
exports.createPlugin = createPlugin;
const HieraPlugin_js_1 = require("./HieraPlugin.js");
const HieraService_js_1 = require("./services/HieraService.js");
// Re-export plugin class and types
var HieraPlugin_js_2 = require("./HieraPlugin.js");
Object.defineProperty(exports, "HieraPlugin", { enumerable: true, get: function () { return HieraPlugin_js_2.HieraPlugin; } });
Object.defineProperty(exports, "HieraPluginConfigSchema", { enumerable: true, get: function () { return HieraPlugin_js_2.HieraPluginConfigSchema; } });
// Re-export service
var HieraService_js_2 = require("./services/HieraService.js");
Object.defineProperty(exports, "HieraService", { enumerable: true, get: function () { return HieraService_js_2.HieraService; } });
// Re-export types
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "HIERA_ERROR_CODES", { enumerable: true, get: function () { return types_js_1.HIERA_ERROR_CODES; } });
Object.defineProperty(exports, "HieraServiceError", { enumerable: true, get: function () { return types_js_1.HieraServiceError; } });
Object.defineProperty(exports, "HieraConfigurationError", { enumerable: true, get: function () { return types_js_1.HieraConfigurationError; } });
Object.defineProperty(exports, "HieraParseError", { enumerable: true, get: function () { return types_js_1.HieraParseError; } });
Object.defineProperty(exports, "HieraResolutionError", { enumerable: true, get: function () { return types_js_1.HieraResolutionError; } });
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
 * Creates a HieraPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured HieraPlugin instance
 */
function createPlugin() {
    // Get configuration from environment or use defaults
    const controlRepoPath = process.env.BOLT_PROJECT_PATH ?? process.cwd();
    const hieraConfigPath = process.env.HIERA_CONFIG_PATH ?? "hiera.yaml";
    // Create internal dependencies
    const logger = createSimpleLogger();
    const performanceMonitor = createSimplePerformanceMonitor();
    // Create the plugin
    const plugin = new HieraPlugin_js_1.HieraPlugin(logger, performanceMonitor);
    // Try to create and set HieraService if configuration is available
    try {
        const hieraService = new HieraService_js_1.HieraService(hieraConfigPath, controlRepoPath, logger);
        plugin.setHieraService(hieraService);
    }
    catch (error) {
        logger.warn("Could not initialize HieraService", {
            component: "HieraPlugin",
            operation: "createPlugin",
            metadata: { error: String(error) },
        });
    }
    return plugin;
}
exports.default = HieraPlugin_js_1.HieraPlugin;
