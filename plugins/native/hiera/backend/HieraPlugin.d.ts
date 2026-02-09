/**
 * Hiera Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (lookup, keys, hierarchy, scan, analysis)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 * - Optional PuppetDB dependency for node facts
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (HieraService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/hiera/backend/HieraPlugin
 * @version 1.0.0
 */
import type { ZodSchema } from "zod";
import { z } from "zod";
/** Plugin metadata interface */
interface PluginMetadata {
    name: string;
    version: string;
    author: string;
    description: string;
    integrationType: string;
    homepage?: string;
    dependencies?: string[];
    frontendEntryPoint?: string;
    color?: string;
    icon?: string;
    minPabawiVersion?: string;
    tags?: string[];
}
/** Health status interface */
interface HealthStatus {
    healthy: boolean;
    message?: string;
    lastCheck: string;
    details?: Record<string, unknown>;
    degraded?: boolean;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
}
/** Execution context interface */
interface ExecutionContext {
    user?: {
        id: string;
        username: string;
        roles: string[];
    };
    correlationId?: string;
    widgetId?: string;
    metadata?: Record<string, unknown>;
}
/** Capability risk level */
type CapabilityRiskLevel = "read" | "write" | "execute" | "admin";
/** Argument definition */
interface ArgumentDefinition {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    required: boolean;
    default?: unknown;
    choices?: unknown[];
    validation?: ZodSchema;
}
/** Capability schema */
interface CapabilitySchema {
    arguments: Record<string, ArgumentDefinition>;
    returns: {
        type: string;
        description: string;
        schema?: ZodSchema;
    };
}
/** Plugin capability interface */
interface PluginCapability {
    category: string;
    name: string;
    description: string;
    handler: (params: Record<string, unknown>, context: ExecutionContext) => Promise<unknown>;
    requiredPermissions: string[];
    riskLevel: CapabilityRiskLevel;
    schema?: CapabilitySchema;
}
/** Widget slot type */
type WidgetSlot = "dashboard" | "node-detail" | "inventory-panel" | "standalone-page" | "sidebar" | "modal" | "home-summary";
/** Widget size type */
type WidgetSize = "small" | "medium" | "large" | "full";
/** Plugin widget interface */
interface PluginWidget {
    id: string;
    name: string;
    component: string;
    slots: WidgetSlot[];
    size: WidgetSize;
    requiredCapabilities: string[];
    config?: Record<string, unknown>;
    icon?: string;
    priority?: number;
}
/** CLI action interface */
interface CLIAction {
    name: string;
    capability: string;
    description: string;
    aliases?: string[];
    examples?: string[];
}
/** Plugin CLI command interface */
interface PluginCLICommand {
    name: string;
    actions: CLIAction[];
}
/** Base plugin interface */
interface BasePluginInterface {
    metadata: PluginMetadata;
    capabilities: PluginCapability[];
    widgets?: PluginWidget[];
    cliCommands?: PluginCLICommand[];
    configSchema?: ZodSchema;
    defaultPermissions?: Record<string, string[]>;
    initialize(): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    getConfig(): Record<string, unknown>;
    isInitialized(): boolean;
    shutdown?(): Promise<void>;
    /**
     * Get lightweight summary data for home page tile
     * Must return in under 500ms with minimal data
     */
    getSummary(): Promise<{
        pluginName: string;
        displayName: string;
        metrics: Record<string, number | string>;
        healthy: boolean;
        lastUpdate: string;
        error?: string;
    }>;
    /**
     * Get full plugin data for plugin home page
     * Called on-demand when navigating to plugin page
     */
    getData(): Promise<{
        pluginName: string;
        displayName: string;
        description: string;
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
    }>;
}
/** Hiera key interface */
interface HieraKey {
    name: string;
    locations: HieraKeyLocation[];
    valueTypes: string[];
    firstSeen: string;
    lastModified: string;
}
/** Hiera key location interface */
interface HieraKeyLocation {
    file: string;
    line: number;
    value: unknown;
    valueType: string;
    hierarchyLevel: string;
}
/** Hiera key index interface */
interface HieraKeyIndex {
    keys: Map<string, HieraKey>;
    files: Map<string, unknown>;
    lastScan: string;
    totalKeys: number;
    totalFiles: number;
}
/** Hiera resolution interface */
interface HieraResolution {
    found: boolean;
    key: string;
    value?: unknown;
    source?: string;
    hierarchyLevel?: string;
    interpolated?: boolean;
    lookupPath?: string[];
}
/** Node Hiera data interface */
interface NodeHieraData {
    node: string;
    keys: Map<string, unknown>;
    hierarchyFiles: HierarchyFileInfo[];
    usedKeys: string[];
    unusedKeys: string[];
}
/** Hierarchy file info interface */
interface HierarchyFileInfo {
    path: string;
    exists: boolean;
    level: string;
    keyCount?: number;
}
/** Key node values interface */
interface KeyNodeValues {
    node: string;
    value: unknown;
    source: string;
    hierarchyLevel: string;
}
/** Code analysis result interface */
interface CodeAnalysisResult {
    lintIssues: unknown[];
    moduleUpdates: unknown[];
    unusedCode: unknown;
    statistics: unknown;
    lastAnalysis: string;
}
/** HieraService interface - what we need from the injected service */
interface HieraServiceInterface {
    isInitialized(): boolean;
    getAllKeys(): Promise<HieraKeyIndex>;
    searchKeys(query: string): Promise<HieraKey[]>;
    resolveKey(node: string, key: string, environment?: string): Promise<HieraResolution>;
    getNodeHieraData(node: string): Promise<NodeHieraData>;
    getKeyValuesAcrossNodes(key: string): Promise<KeyNodeValues[]>;
    getHieraConfig(): unknown;
    invalidateCache(): void;
    shutdown(): void;
}
/** CodeAnalyzer interface - what we need from the injected service */
interface CodeAnalyzerInterface {
    analyze(): Promise<CodeAnalysisResult>;
    clearCache(): void;
}
/** LoggerService interface */
interface LoggerServiceInterface {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
    startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}
/**
 * Hiera plugin configuration schema
 */
export declare const HieraPluginConfigSchema: z.ZodObject<{
    controlRepoPath: z.ZodString;
    hieraConfigPath: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    environments: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    factSources: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        preferPuppetDB: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        localFactsPath: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
    }, {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
    }>>>;
    cache: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        ttl: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        maxEntries: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
    }, {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    controlRepoPath?: string;
    hieraConfigPath?: string;
    environments?: string[];
    factSources?: {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
    };
    cache?: {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
    };
}, {
    controlRepoPath?: string;
    hieraConfigPath?: string;
    environments?: string[];
    factSources?: {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
    };
    cache?: {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
    };
}>;
export type HieraPluginConfig = z.infer<typeof HieraPluginConfigSchema>;
/**
 * Hiera Plugin v1.0.0
 *
 * Provides Hiera integration with capability-based architecture:
 * - hiera.lookup: Resolve a Hiera key for a specific node
 * - hiera.keys: List or search Hiera keys
 * - hiera.key: Get details for a specific key
 * - hiera.hierarchy: Get hierarchy information
 * - hiera.scan: Scan hieradata files
 * - hiera.node: Get all Hiera data for a node
 * - hiera.values: Get key values across all nodes
 * - hiera.analysis: Get code analysis results
 */
export declare class HieraPlugin implements BasePluginInterface {
    readonly metadata: PluginMetadata;
    readonly capabilities: PluginCapability[];
    readonly widgets: PluginWidget[];
    readonly cliCommands: PluginCLICommand[];
    readonly configSchema: ZodSchema;
    readonly defaultPermissions: Record<string, string[]>;
    private hieraService;
    private codeAnalyzer;
    private logger;
    private performanceMonitor;
    private config;
    private _initialized;
    constructor(logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
    /**
     * Set the HieraService instance
     */
    setHieraService(service: HieraServiceInterface): void;
    /**
     * Set the CodeAnalyzer instance
     */
    setCodeAnalyzer(analyzer: CodeAnalyzerInterface): void;
    /**
     * Create capability definitions with bound handlers
     */
    private createCapabilities;
    /**
     * Initialize the plugin
     */
    initialize(): Promise<void>;
    /**
     * Perform health check
     */
    healthCheck(): Promise<HealthStatus>;
    /**
     * Get current plugin configuration
     */
    getConfig(): Record<string, unknown>;
    /**
     * Check if plugin is initialized
     */
    isInitialized(): boolean;
    /**
     * Cleanup on shutdown
     */
    shutdown(): Promise<void>;
    /**
     * Get lightweight summary data for home page tile
     * Must return in under 500ms with minimal data
     */
    getSummary(): Promise<{
        pluginName: string;
        displayName: string;
        metrics: Record<string, number | string>;
        healthy: boolean;
        lastUpdate: string;
        error?: string;
    }>;
    /**
     * Get full plugin data for plugin home page
     * Called on-demand when navigating to plugin page
     */
    getData(): Promise<{
        pluginName: string;
        displayName: string;
        description: string;
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
    }>;
    /**
     * Lookup a Hiera key for a node
     */
    private lookupKey;
    /**
     * List or search Hiera keys
     */
    private listKeys;
    /**
     * Get details for a specific key
     */
    private getKeyDetails;
    /**
     * Get hierarchy information
     */
    private getHierarchy;
    /**
     * Scan hieradata files
     */
    private scanHieradata;
    /**
     * Get all Hiera data for a node
     */
    private getNodeData;
    /**
     * Get key values across all nodes
     */
    private getKeyValuesAcrossNodes;
    /**
     * Run code analysis
     */
    private runCodeAnalysis;
    /**
     * Ensure HieraService is available
     */
    private ensureService;
    /**
     * Get the underlying HieraService instance
     * @deprecated Use capability handlers instead
     */
    getHieraService(): HieraServiceInterface | null;
    /**
     * Get the underlying CodeAnalyzer instance
     * @deprecated Use hiera.analysis capability instead
     */
    getCodeAnalyzer(): CodeAnalyzerInterface | null;
}
export default HieraPlugin;
