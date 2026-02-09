/**
 * PuppetDB Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (query, nodes, facts, reports, events, catalog)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 * - Circuit breaker and retry logic for resilience
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (PuppetDBService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/puppetdb/backend/PuppetDBPlugin
 * @version 1.0.0
 */
import type { ZodSchema } from "zod";
import { z } from "zod";
import type { InventoryCapability, InventoryListParams, InventoryGetParams, InventoryGroupsParams, InventoryFilterParams } from "../../../../backend/dist/integrations/capability-types/inventory";
import type { FactsCapability, FactsGetParams, FactsRefreshParams, FactProvider } from "../../../../backend/dist/integrations/capability-types/facts";
import type { ReportsCapability, ReportsListParams, ReportsGetParams, ReportsQueryParams, Report as StandardReport, ReportListResult } from "../../../../backend/dist/integrations/capability-types/reports";
import type { EventsCapability, EventsListParams, EventsStreamParams, EventsQueryParams, EventListResult, EventStreamCallback } from "../../../../backend/dist/integrations/capability-types/events";
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
     * Get lightweight summary for home page tiles
     * Must return in under 500ms with minimal data (counts, status only)
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
     * Get full plugin data for plugin home pages
     * Called on-demand when navigating to plugin page
     */
    getData(): Promise<{
        pluginName: string;
        displayName: string;
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
    }>;
}
/** Node interface */
interface Node {
    id: string;
    name: string;
    uri: string;
    transport: string;
    config: Record<string, unknown>;
}
/** Facts interface */
interface Facts {
    nodeId: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
}
/** Report interface */
interface Report {
    certname: string;
    hash: string;
    environment: string;
    status: "unchanged" | "changed" | "failed";
    noop: boolean;
    puppet_version: string;
    report_format: number;
    configuration_version: string;
    start_time: string;
    end_time: string;
    producer_timestamp: string;
    receive_time: string;
    transaction_uuid: string;
    metrics: unknown;
    logs: unknown[];
    resource_events: unknown[];
}
/** Catalog interface */
interface Catalog {
    certname: string;
    version: string;
    transaction_uuid: string;
    environment: string;
    producer_timestamp: string;
    hash: string;
    resources: unknown[];
    edges: unknown[];
}
/** Event interface */
interface Event {
    certname: string;
    timestamp: string;
    report: string;
    resource_type: string;
    resource_title: string;
    property: string;
    status: "success" | "failure" | "noop" | "skipped";
    old_value?: unknown;
    new_value?: unknown;
    message?: string;
    file?: string;
    line?: number;
}
/** Event filters interface */
interface EventFilters {
    status?: "success" | "failure" | "noop" | "skipped";
    resourceType?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    reportHash?: string;
}
/** Resource interface */
interface Resource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
}
/** Resource type interface */
interface ResourceType {
    name: string;
    count: number;
    description?: string;
}
/** PuppetDBService interface - what we need from the injected service */
interface PuppetDBServiceInterface {
    initialize(config: unknown): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    getInventory(pqlQuery?: string): Promise<Node[]>;
    queryInventory(pqlQuery: string): Promise<Node[]>;
    getNodeFacts(nodeId: string): Promise<Facts>;
    getNodeReports(nodeId: string, limit?: number, offset?: number): Promise<Report[]>;
    getReport(reportHash: string): Promise<Report | null>;
    getReportsSummary(limit?: number, hours?: number): Promise<{
        total: number;
        failed: number;
        changed: number;
        unchanged: number;
        noop: number;
    }>;
    getAllReports(limit?: number, offset?: number): Promise<Report[]>;
    queryEvents(nodeId: string, filters: EventFilters): Promise<Event[]>;
    getNodeCatalog(nodeId: string): Promise<Catalog | null>;
    getCatalogResources(nodeId: string, resourceType?: string): Promise<Record<string, Resource[]>>;
    getSummaryStats(): Promise<unknown>;
    getResourceTypes(): Promise<ResourceType[]>;
    getResourcesByType(resourceType: string, limit?: number, offset?: number): Promise<Resource[]>;
    getResource(resourceType: string, resourceTitle: string): Promise<Resource | null>;
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
 * PuppetDB plugin configuration schema
 */
export declare const PuppetDBPluginConfigSchema: z.ZodObject<{
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
    circuitBreaker: z.ZodOptional<z.ZodObject<{
        threshold: z.ZodOptional<z.ZodNumber>;
        resetTimeout: z.ZodOptional<z.ZodNumber>;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        timeout?: number | undefined;
        threshold?: number | undefined;
        resetTimeout?: number | undefined;
    }, {
        timeout?: number | undefined;
        threshold?: number | undefined;
        resetTimeout?: number | undefined;
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
    circuitBreaker?: {
        timeout?: number | undefined;
        threshold?: number | undefined;
        resetTimeout?: number | undefined;
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
    circuitBreaker?: {
        timeout?: number | undefined;
        threshold?: number | undefined;
        resetTimeout?: number | undefined;
    } | undefined;
    retryAttempts?: number | undefined;
    retryDelay?: number | undefined;
}>;
export type PuppetDBPluginConfig = z.infer<typeof PuppetDBPluginConfigSchema>;
/**
 * PuppetDB Plugin v1.0.0
 *
 * Provides PuppetDB integration with capability-based architecture:
 * - puppetdb.query: Execute arbitrary PQL queries
 * - puppetdb.nodes: List nodes from PuppetDB inventory
 * - puppetdb.facts: Get facts for a specific node
 * - puppetdb.reports: Get reports for a node
 * - puppetdb.report: Get a specific report by hash
 * - puppetdb.reports.summary: Get aggregated report statistics
 * - puppetdb.reports.all: Get all recent reports
 * - puppetdb.events: Get events for a node
 * - puppetdb.catalog: Get catalog for a node
 * - puppetdb.catalog.resources: Get catalog resources organized by type
 * - puppetdb.stats: Get summary statistics
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - FactsCapability: info.facts, info.refresh
 * - ReportsCapability: reports.list, reports.get, reports.query
 * - EventsCapability: events.list, events.stream, events.query
 */
export declare class PuppetDBPlugin implements BasePluginInterface, InventoryCapability, FactsCapability, ReportsCapability, EventsCapability {
    readonly metadata: PluginMetadata;
    readonly capabilities: PluginCapability[];
    readonly widgets: PluginWidget[];
    readonly cliCommands: PluginCLICommand[];
    readonly configSchema: ZodSchema;
    readonly defaultPermissions: Record<string, string[]>;
    private puppetDBService;
    private logger;
    private performanceMonitor;
    private config;
    private _initialized;
    constructor(puppetDBService: PuppetDBServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
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
     * Get lightweight summary for home page tiles
     * Must return in under 500ms with minimal data (counts, status only)
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
     * Get full plugin data for plugin home pages
     * Called on-demand when navigating to plugin page
     */
    getData(): Promise<{
        pluginName: string;
        displayName: string;
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
    }>;
    /**
     * Execute a PQL query
     */
    private executeQuery;
    /**
     * List nodes from PuppetDB
     */
    private listNodes;
    /**
     * Get facts for a node
     */
    private getNodeFacts;
    /**
     * Get reports for a node
     */
    private getNodeReports;
    /**
     * Get a specific report by hash
     */
    private getReport;
    /**
     * Get reports summary statistics
     */
    private getReportsSummary;
    /**
     * Get all recent reports
     */
    private getAllReports;
    /**
     * Get events for a node
     */
    private getNodeEvents;
    /**
     * Get catalog for a node
     */
    private getNodeCatalog;
    /**
     * Get catalog resources organized by type
     */
    private getCatalogResources;
    /**
     * Get summary statistics
     */
    private getSummaryStats;
    /**
     * Get all resource types
     */
    private getResourceTypes;
    /**
     * Get resources by type
     */
    private getResourcesByType;
    /**
     * Get specific resource details
     */
    private getResource;
    /**
     * List all nodes from PuppetDB inventory
     * Implements InventoryCapability.inventoryList
     */
    inventoryList(params: InventoryListParams): Promise<Node[]>;
    /**
     * Get specific node details
     * Implements InventoryCapability.inventoryGet
     */
    inventoryGet(params: InventoryGetParams): Promise<Node | null>;
    /**
     * List available groups
     * Implements InventoryCapability.inventoryGroups
     */
    inventoryGroups(params: InventoryGroupsParams): Promise<string[]>;
    /**
     * Filter nodes by criteria
     * Implements InventoryCapability.inventoryFilter
     */
    inventoryFilter(params: InventoryFilterParams): Promise<Node[]>;
    /**
     * Get facts for a node
     * Implements FactsCapability.factsGet
     */
    factsGet(params: FactsGetParams): Promise<Facts>;
    /**
     * Force refresh facts (bypass cache)
     * Implements FactsCapability.factsRefresh
     */
    factsRefresh(params: FactsRefreshParams): Promise<Facts>;
    /**
     * Get fact provider information for this plugin
     * Implements FactsCapability.getFactProvider
     */
    getFactProvider(): FactProvider;
    /**
     * List available reports
     * Implements ReportsCapability.reportsList
     */
    reportsList(params: ReportsListParams): Promise<ReportListResult>;
    /**
     * Get specific report by ID
     * Implements ReportsCapability.reportsGet
     */
    reportsGet(params: ReportsGetParams): Promise<StandardReport | null>;
    /**
     * Query reports with advanced filters
     * Implements ReportsCapability.reportsQuery
     */
    reportsQuery(params: ReportsQueryParams): Promise<ReportListResult>;
    /**
     * List events for a node
     * Implements EventsCapability.eventsList
     */
    eventsList(params: EventsListParams): Promise<EventListResult>;
    /**
     * Stream live events
     * Implements EventsCapability.eventsStream
     *
     * Note: PuppetDB doesn't support real-time streaming, so this polls for new events
     */
    eventsStream(params: EventsStreamParams, _callback: EventStreamCallback): Promise<void>;
    /**
     * Query events with advanced filters
     * Implements EventsCapability.eventsQuery
     */
    eventsQuery(params: EventsQueryParams): Promise<EventListResult>;
    /**
     * Get the underlying PuppetDBService instance
     * @deprecated Use capability handlers instead
     */
    getPuppetDBService(): PuppetDBServiceInterface;
}
/**
 * Factory function for creating PuppetDBPlugin instances
 */
export declare function createPuppetDBPlugin(puppetDBService: PuppetDBServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface): PuppetDBPlugin;
export default PuppetDBPlugin;
//# sourceMappingURL=PuppetDBPlugin.d.ts.map
