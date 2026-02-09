"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppetDBPluginConfigSchema = exports.PuppetDBPlugin = void 0;
exports.createPlugin = createPlugin;
const PuppetDBPlugin_js_1 = require("./PuppetDBPlugin.js");
var PuppetDBPlugin_js_2 = require("./PuppetDBPlugin.js");
Object.defineProperty(exports, "PuppetDBPlugin", { enumerable: true, get: function () { return PuppetDBPlugin_js_2.PuppetDBPlugin; } });
Object.defineProperty(exports, "PuppetDBPluginConfigSchema", { enumerable: true, get: function () { return PuppetDBPlugin_js_2.PuppetDBPluginConfigSchema; } });
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
 * Create a stub PuppetDBService for now
 * TODO: Implement full PuppetDBService in services/PuppetDBService.ts
 */
function createStubPuppetDBService(logger) {
    return {
        initialize: async () => {
            logger.warn("PuppetDBService stub - initialize called but not implemented");
        },
        healthCheck: async () => ({
            healthy: false,
            message: "PuppetDBService not yet implemented",
            lastCheck: new Date().toISOString(),
        }),
        getInventory: async () => [],
        queryInventory: async () => [],
        getNodeFacts: async () => ({ nodeId: "", gatheredAt: "", facts: {} }),
        getNodeReports: async () => [],
        getReport: async () => null,
        getReportsSummary: async () => ({
            total: 0,
            failed: 0,
            changed: 0,
            unchanged: 0,
            noop: 0,
        }),
        getAllReports: async () => [],
        queryEvents: async () => [],
        getNodeCatalog: async () => null,
        getCatalogResources: async () => ({}),
        getSummaryStats: async () => ({}),
        getResourceTypes: async () => {
            logger.warn("PuppetDBService stub - getResourceTypes called but not implemented");
            return [];
        },
        getResourcesByType: async () => {
            logger.warn("PuppetDBService stub - getResourcesByType called but not implemented");
            return [];
        },
        getResource: async () => {
            logger.warn("PuppetDBService stub - getResource called but not implemented");
            return null;
        },
    };
}
/**
 * Factory function for PluginLoader
 *
 * Creates a PuppetDBPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured PuppetDBPlugin instance
 */
function createPlugin() {
    // Create internal dependencies
    const logger = createSimpleLogger();
    const performanceMonitor = createSimplePerformanceMonitor();
    const puppetDBService = createStubPuppetDBService(logger);
    logger.warn("PuppetDB plugin loaded with stub service - full implementation needed");
    return new PuppetDBPlugin_js_1.PuppetDBPlugin(puppetDBService, logger, performanceMonitor);
}
exports.default = PuppetDBPlugin_js_1.PuppetDBPlugin;
//# sourceMappingURL=index.js.map
