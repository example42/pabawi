"use strict";
/**
 * SSH Plugin Entry Point
 *
 * This file is the entry point for the SSH plugin.
 * It exports the plugin factory function that creates and initializes the plugin instance.
 *
 * @module plugins/native/ssh/backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSHService = exports.SSHPlugin = void 0;
exports.createPlugin = createPlugin;
const SSHPlugin_1 = require("./SSHPlugin");
const SSHService_1 = require("./SSHService");
const LoggerService_1 = require("../../../../backend/src/services/LoggerService");
const PerformanceMonitorService_1 = require("../../../../backend/src/services/PerformanceMonitorService");
/**
 * Plugin factory function
 *
 * Creates and returns a new SSH plugin instance with all dependencies injected.
 * This function is called by the PluginLoader during plugin discovery.
 *
 * @param config - Plugin configuration
 * @returns Initialized SSH plugin instance
 */
async function createPlugin(config) {
    // Create service instances
    const logger = new LoggerService_1.LoggerService();
    const performanceMonitor = new PerformanceMonitorService_1.PerformanceMonitorService();
    // Create SSH service with config
    const sshService = new SSHService_1.SSHService({
        sshConfigPath: config?.sshConfigPath,
        timeout: config?.executionTimeout,
    });
    // Create plugin instance
    const plugin = new SSHPlugin_1.SSHPlugin(sshService, logger, performanceMonitor);
    return plugin;
}
/**
 * Export plugin class for type checking
 */
var SSHPlugin_2 = require("./SSHPlugin");
Object.defineProperty(exports, "SSHPlugin", { enumerable: true, get: function () { return SSHPlugin_2.SSHPlugin; } });
var SSHService_2 = require("./SSHService");
Object.defineProperty(exports, "SSHService", { enumerable: true, get: function () { return SSHService_2.SSHService; } });
//# sourceMappingURL=index.js.map
