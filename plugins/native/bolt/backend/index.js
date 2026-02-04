"use strict";
/**
 * Bolt Integration Plugin
 *
 * Puppet Bolt integration for remote command and task execution.
 *
 * This plugin is SELF-CONTAINED. All code resides within the plugin directory.
 * The createPlugin() factory creates all required dependencies internally.
 *
 * @module plugins/native/bolt/backend
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoltTaskParameterError = exports.BoltTaskNotFoundError = exports.BoltNodeUnreachableError = exports.BoltInventoryNotFoundError = exports.BoltParseError = exports.BoltTimeoutError = exports.BoltExecutionError = exports.BoltService = exports.BoltPluginConfigSchema = exports.BoltPlugin = void 0;
exports.createPlugin = createPlugin;
const BoltPlugin_js_1 = require("./BoltPlugin.js");
const BoltService_js_1 = require("./services/BoltService.js");
// Re-export plugin class and types
var BoltPlugin_js_2 = require("./BoltPlugin.js");
Object.defineProperty(exports, "BoltPlugin", { enumerable: true, get: function () { return BoltPlugin_js_2.BoltPlugin; } });
Object.defineProperty(exports, "BoltPluginConfigSchema", { enumerable: true, get: function () { return BoltPlugin_js_2.BoltPluginConfigSchema; } });
// Re-export service
var BoltService_js_2 = require("./services/BoltService.js");
Object.defineProperty(exports, "BoltService", { enumerable: true, get: function () { return BoltService_js_2.BoltService; } });
// Re-export types
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "BoltExecutionError", { enumerable: true, get: function () { return types_js_1.BoltExecutionError; } });
Object.defineProperty(exports, "BoltTimeoutError", { enumerable: true, get: function () { return types_js_1.BoltTimeoutError; } });
Object.defineProperty(exports, "BoltParseError", { enumerable: true, get: function () { return types_js_1.BoltParseError; } });
Object.defineProperty(exports, "BoltInventoryNotFoundError", { enumerable: true, get: function () { return types_js_1.BoltInventoryNotFoundError; } });
Object.defineProperty(exports, "BoltNodeUnreachableError", { enumerable: true, get: function () { return types_js_1.BoltNodeUnreachableError; } });
Object.defineProperty(exports, "BoltTaskNotFoundError", { enumerable: true, get: function () { return types_js_1.BoltTaskNotFoundError; } });
Object.defineProperty(exports, "BoltTaskParameterError", { enumerable: true, get: function () { return types_js_1.BoltTaskParameterError; } });
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
 * Creates a BoltPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured BoltPlugin instance
 */
function createPlugin() {
    // Get configuration from environment or use defaults
    const boltProjectPath = process.env.BOLT_PROJECT_PATH ?? process.cwd();
    const defaultTimeout = parseInt(process.env.BOLT_TIMEOUT ?? "300000", 10);
    // Create internal dependencies
    const logger = createSimpleLogger();
    const performanceMonitor = createSimplePerformanceMonitor();
    const boltService = new BoltService_js_1.BoltService(boltProjectPath, defaultTimeout, undefined, logger);
    return new BoltPlugin_js_1.BoltPlugin(boltService, logger, performanceMonitor);
}
exports.default = BoltPlugin_js_1.BoltPlugin;
//# sourceMappingURL=index.js.map
