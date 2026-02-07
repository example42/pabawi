"use strict";
/**
 * Ansible Plugin Entry Point
 *
 * This file is the entry point for the Ansible plugin.
 * It exports the plugin factory function that creates and initializes the plugin instance.
 *
 * @module plugins/native/ansible/backend
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnsiblePlugin = void 0;
exports.createPlugin = createPlugin;
const AnsiblePlugin_1 = require("./AnsiblePlugin");
/**
 * Plugin factory function
 *
 * Creates and returns a new Ansible plugin instance with all dependencies injected.
 * This function is called by the PluginLoader during plugin discovery.
 *
 * @param config - Plugin configuration
 * @returns Initialized Ansible plugin instance
 */
async function createPlugin(config) {
    // Import services dynamically to avoid circular dependencies
    const { LoggerService } = await Promise.resolve().then(() => __importStar(require("../../../../backend/src/services/LoggerService")));
    const { PerformanceMonitorService } = await Promise.resolve().then(() => __importStar(require("../../../../backend/src/services/PerformanceMonitorService")));
    // Create service instances
    const logger = new LoggerService();
    const performanceMonitor = new PerformanceMonitorService();
    // Create plugin instance
    const plugin = new AnsiblePlugin_1.AnsiblePlugin(config || {}, logger, performanceMonitor);
    return plugin;
}
/**
 * Export plugin class for type checking
 */
var AnsiblePlugin_2 = require("./AnsiblePlugin");
Object.defineProperty(exports, "AnsiblePlugin", { enumerable: true, get: function () { return AnsiblePlugin_2.AnsiblePlugin; } });
//# sourceMappingURL=index.js.map
