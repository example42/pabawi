/**
 * Puppetserver Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (catalog, environments, facts, status)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (PuppetserverService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/puppetserver/backend/PuppetserverPlugin
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
     * Get lightweight summary for home page tile
     * Must return in under 500ms with minimal data
     */
    getSummary(): Promise<{
        pluginName: string;
        displayName: string;
        metrics: Record<string, number | string | boolean>;
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
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
        error?: string;
    }>;
}
/** Environment interface */
interface Environment {
    name: string;
    last_deployed?: string;
    status?: "deployed" | "deploying" | "failed";
    settings?: Record<string, unknown>;
}
/** Catalog interface */
interface Catalog {
    certname: string;
    version: string;
    environment: string;
    transaction_uuid?: string;
    producer_timestamp?: string;
    resources: CatalogResource[];
    edges?: CatalogEdge[];
}
/** Catalog resource interface */
interface CatalogResource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
}
/** Catalog edge interface */
interface CatalogEdge {
    source: {
        type: string;
        title: string;
    };
    target: {
        type: string;
        title: string;
    };
    relationship: string;
}
/** Catalog diff interface */
interface CatalogDiff {
    environment1: string;
    environment2: string;
    added: CatalogResource[];
    removed: CatalogResource[];
    modified: ResourceDiff[];
    unchanged: CatalogResource[];
}
/** Resource diff interface */
interface ResourceDiff {
    type: string;
    title: string;
    parameterChanges: ParameterDiff[];
}
/** Parameter diff interface */
interface ParameterDiff {
    parameter: string;
    oldValue: unknown;
    newValue: unknown;
}
/** Deployment result interface */
interface DeploymentResult {
    environment: string;
    status: "success" | "failed";
    message?: string;
    timestamp: string;
}
/** Facts interface */
interface Facts {
    nodeId: string;
    gatheredAt: string;
    source: string;
    facts: Record<string, unknown>;
}
/** PuppetserverService interface - what we need from the injected service */
interface PuppetserverServiceInterface {
    initialize(config: unknown): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    compileCatalog(certname: string, environment: string): Promise<Catalog>;
    getNodeCatalog(certname: string): Promise<Catalog | null>;
    compareCatalogs(certname: string, env1: string, env2: string): Promise<CatalogDiff>;
    listEnvironments(): Promise<Environment[]>;
    getEnvironment(name: string): Promise<Environment | null>;
    deployEnvironment(name: string): Promise<DeploymentResult>;
    flushEnvironmentCache(name?: string): Promise<DeploymentResult>;
    getNodeFacts(nodeId: string): Promise<Facts>;
    getSimpleStatus(): Promise<unknown>;
    getServicesStatus(): Promise<unknown>;
    getMetrics(mbean?: string): Promise<unknown>;
    getAdminApiInfo(): Promise<unknown>;
    clearCache(): void;
}
/** LoggerService interface */
interface LoggerServiceInterface {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>, error?: Error): void;
}
/** PerformanceMonitorService interface */
interface PerformanceMonitorServiceInterface {
    startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}
export declare const PuppetserverPluginConfigSchema: z.ZodObject<{
    serverUrl: z.ZodOptional<z.ZodString>;
    port: z.ZodOptional<z.ZodNumber>;
    token: z.ZodOptional<z.ZodString>;
    ssl: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        ca: z.ZodOptional<z.ZodString>;
        cert: z.ZodOptional<z.ZodString>;
        key: z.ZodOptional<z.ZodString>;
        rejectUnauthorized: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        ca?: string | undefined;
        cert?: string | undefined;
        key?: string | undefined;
        rejectUnauthorized?: boolean | undefined;
    }, {
        enabled?: boolean | undefined;
        ca?: string | undefined;
        cert?: string | undefined;
        key?: string | undefined;
        rejectUnauthorized?: boolean | undefined;
    }>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    cache: z.ZodOptional<z.ZodObject<{
        ttl: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        ttl?: number | undefined;
    }, {
        ttl?: number | undefined;
    }>>;
    retryAttempts: z.ZodOptional<z.ZodNumber>;
    retryDelay: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    serverUrl?: string | undefined;
    port?: number | undefined;
    token?: string | undefined;
    ssl?: {
        enabled?: boolean | undefined;
        ca?: string | undefined;
        cert?: string | undefined;
        key?: string | undefined;
        rejectUnauthorized?: boolean | undefined;
    } | undefined;
    timeout?: number | undefined;
    cache?: {
        ttl?: number | undefined;
    } | undefined;
    retryAttempts?: number | undefined;
    retryDelay?: number | undefined;
}, {
    serverUrl?: string | undefined;
    port?: number | undefined;
    token?: string | undefined;
    ssl?: {
        enabled?: boolean | undefined;
        ca?: string | undefined;
        cert?: string | undefined;
        key?: string | undefined;
        rejectUnauthorized?: boolean | undefined;
    } | undefined;
    timeout?: number | undefined;
    cache?: {
        ttl?: number | undefined;
    } | undefined;
    retryAttempts?: number | undefined;
    retryDelay?: number | undefined;
}>;
export type PuppetserverPluginConfig = z.infer<typeof PuppetserverPluginConfigSchema>;
/**
 * Puppetserver Plugin v1.0.0
 *
 * Provides Puppetserver integration with capability-based architecture:
 * - puppetserver.catalog: Compile catalog for a node
 * - puppetserver.catalog.get: Get catalog for a node (default environment)
 * - puppetserver.catalog.compare: Compare catalogs between environments
 * - puppetserver.environments: List available environments
 * - puppetserver.environment: Get specific environment details
 * - puppetserver.environment.deploy: Deploy/refresh an environment
 * - puppetserver.environment.cache.flush: Flush environment cache
 * - puppetserver.facts: Get facts for a node
 * - puppetserver.status: Get Puppetserver status
 * - puppetserver.status.services: Get detailed services status
 * - puppetserver.metrics: Get Puppetserver metrics
 * - puppetserver.admin: Get admin API information
 */
export declare class PuppetserverPlugin implements BasePluginInterface {
    readonly metadata: PluginMetadata;
    readonly capabilities: PluginCapability[];
    readonly widgets: PluginWidget[];
    readonly cliCommands: PluginCLICommand[];
    readonly configSchema: ZodSchema;
    readonly defaultPermissions: Record<string, string[]>;
    private puppetserverService;
    private logger;
    private performanceMonitor;
    private config;
    private _initialized;
    constructor(puppetserverService: PuppetserverServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
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
     * Compile a catalog for a node
     */
    private compileCatalog;
    /**
     * Get catalog for a node using default environment
     */
    private getNodeCatalog;
    /**
     * Compare catalogs between two environments
     */
    private compareCatalogs;
    /**
     * List available environments
     */
    private listEnvironments;
    /**
     * Get specific environment details
     */
    private getEnvironment;
    /**
     * Deploy an environment
     */
    private deployEnvironment;
    /**
     * Flush environment cache
     */
    private flushEnvironmentCache;
    /**
     * Get facts for a node
     */
    private getNodeFacts;
    /**
     * Get simple status
     */
    private getSimpleStatus;
    /**
     * Get services status
     */
    private getServicesStatus;
    /**
     * Get metrics
     */
    private getMetrics;
    /**
     * Get admin API info
     */
    private getAdminApiInfo;
    /**
     * Get the underlying PuppetserverService instance
     * @deprecated Use capability handlers instead
     */
    getPuppetserverService(): PuppetserverServiceInterface;
}
/**
 * Factory function for creating PuppetserverPlugin instances
 */
export declare function createPuppetserverPlugin(puppetserverService: PuppetserverServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface): PuppetserverPlugin;
export default PuppetserverPlugin;
//# sourceMappingURL=PuppetserverPlugin.d.ts.map
