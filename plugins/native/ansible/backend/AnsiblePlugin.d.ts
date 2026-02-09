/**
 * AnsiblePlugin - Ansible integration for Pabawi
 *
 * Provides remote execution and inventory management capabilities using Ansible.
 */
import type { AnsibleServiceInterface } from "./services/AnsibleService";
import type { Node, ExecutionResult } from "./types";
import type { InventoryCapability, InventoryListParams, InventoryGetParams, InventoryGroupsParams, InventoryFilterParams } from "../../../../backend/src/integrations/capability-types/inventory";
import type { RemoteExecutionCapability, CommandExecuteParams, TaskExecuteParams, ScriptExecuteParams, OutputStreamCallback } from "../../../../backend/src/integrations/capability-types/remote-execution";
interface PluginMetadata {
    name: string;
    version: string;
    description: string;
    integrationType: string;
    integrationTypes?: string[];
    capabilities: string[];
}
interface HealthStatus {
    healthy: boolean;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
}
interface BasePluginInterface {
    metadata: PluginMetadata;
    initialize(): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    getConfig(): Record<string, unknown>;
    isInitialized(): boolean;
    shutdown?(): Promise<void>;
}
interface LoggerServiceInterface {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
interface PerformanceMonitorServiceInterface {
    startTimer(name: string): (metadata?: Record<string, unknown>) => void;
}
/**
 * AnsiblePlugin class
 *
 * Implements:
 * - BasePluginInterface for plugin lifecycle
 * - InventoryCapability for inventory management
 * - RemoteExecutionCapability for command/playbook execution
 */
export declare class AnsiblePlugin implements BasePluginInterface, InventoryCapability, RemoteExecutionCapability {
    readonly metadata: PluginMetadata;
    readonly capabilities: Array<{
        name: string;
        category: string;
        description: string;
        riskLevel: string;
        requiredPermissions: string[];
    }>;
    private config;
    private logger;
    private performanceMonitor;
    private ansibleService;
    private initialized;
    private inventoryCache;
    private inventoryCacheExpiry;
    private readonly CACHE_TTL;
    constructor(config: Record<string, unknown>, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
    /**
     * Initialize the plugin
     */
    initialize(): Promise<void>;
    /**
     * Health check
     */
    healthCheck(): Promise<HealthStatus>;
    getConfig(): Record<string, unknown>;
    isInitialized(): boolean;
    shutdown(): Promise<void>;
    /**
     * List all nodes from Ansible inventory
     */
    inventoryList(params: InventoryListParams): Promise<Node[]>;
    /**
     * Get specific node details
     */
    inventoryGet(params: InventoryGetParams): Promise<Node | null>;
    /**
     * List available groups
     */
    inventoryGroups(params: InventoryGroupsParams): Promise<string[]>;
    /**
     * Filter nodes by criteria
     */
    inventoryFilter(params: InventoryFilterParams): Promise<Node[]>;
    /**
     * Execute shell command on target nodes
     */
    commandExecute(params: CommandExecuteParams): Promise<ExecutionResult>;
    /**
     * Execute Ansible playbook on target nodes
     */
    taskExecute(params: TaskExecuteParams): Promise<ExecutionResult>;
    /**
     * Execute script on target nodes
     */
    scriptExecute(params: ScriptExecuteParams): Promise<ExecutionResult>;
    /**
     * Stream output from an execution
     */
    streamOutput(executionId: string, callback: OutputStreamCallback): Promise<void>;
    /**
     * Cancel an in-progress execution
     */
    cancelExecution(executionId: string): Promise<boolean>;
    /**
     * Get the Ansible service instance (for testing)
     */
    getAnsibleService(): AnsibleServiceInterface;
    /**
     * Get lightweight summary for home page tile
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
export {};
//# sourceMappingURL=AnsiblePlugin.d.ts.map
