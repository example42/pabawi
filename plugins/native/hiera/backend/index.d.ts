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
import { HieraPlugin } from "./HieraPlugin.js";
export { HieraPlugin, HieraPluginConfigSchema, type HieraPluginConfig, } from "./HieraPlugin.js";
export { HieraService } from "./services/HieraService.js";
export { type HieraConfig, type HieraDefaults, type HierarchyLevel, type LookupOptions, type LookupMethod, type HieraKey, type HieraKeyLocation, type HieraKeyIndex, type HieraFileInfo, type HieraResolution, type ResolveOptions, type MergeOptions, type HierarchyFileInfo, type NodeHieraData, type KeyNodeValues, type KeyUsageMap, type Facts, type FactResult, type LocalFactFile, type CodeAnalysisResult, type UnusedCodeReport, type UnusedItem, type LintIssue, type LintSeverity, type ModuleUpdate, type UsageStatistics, type ClassUsage, type ResourceUsage, type HealthStatus, type HieraHealthStatus, type HieraErrorCode, type HieraError, HIERA_ERROR_CODES, HieraServiceError, HieraConfigurationError, HieraParseError, HieraResolutionError, } from "./types.js";
/**
 * Factory function for PluginLoader
 *
 * Creates a HieraPlugin instance with internally-created dependencies.
 * This is called by PluginLoader when loading plugins dynamically.
 *
 * @returns Configured HieraPlugin instance
 */
export declare function createPlugin(): HieraPlugin;
export default HieraPlugin;
