/**
 * Bolt Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (command, task, inventory, facts)
 * - Frontend widget definitions
 * - CLI command generation
 * - RBAC-aware capability handlers
 *
 * NOTE: This plugin is designed to be loaded dynamically by the PluginLoader.
 * Dependencies (BoltService, LoggerService, etc.) are injected via constructor.
 * Type imports use 'import type' to avoid runtime dependencies on the main codebase.
 *
 * @module plugins/native/bolt/backend/BoltPlugin
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
    integrationTypes?: string[];
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
    getSummary(): Promise<{
        pluginName: string;
        displayName: string;
        metrics: Record<string, number | string | boolean>;
        healthy: boolean;
        lastUpdate: string;
        error?: string;
    }>;
    getData(): Promise<{
        pluginName: string;
        displayName: string;
        data: unknown;
        healthy: boolean;
        lastUpdate: string;
        capabilities: string[];
        error?: string;
    }>;
    getConfig(): Record<string, unknown>;
    isInitialized(): boolean;
    shutdown?(): Promise<void>;
}
/** Streaming callback interface */
interface StreamingCallback {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onCommand?: (command: string) => void;
}
/** Node interface */
interface Node {
    id: string;
    name: string;
    uri: string;
    transport: "ssh" | "winrm" | "docker" | "local";
    config: Record<string, unknown>;
}
/** Facts interface */
interface Facts {
    nodeId: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
    command?: string;
}
/** Execution result interface */
interface ExecutionResult {
    id: string;
    type: "command" | "task" | "facts" | "puppet" | "package";
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: "running" | "success" | "failed" | "partial";
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
}
/** Node result interface */
interface NodeResult {
    nodeId: string;
    status: "success" | "failed";
    output?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
    };
    value?: unknown;
    error?: string;
    duration: number;
}
/** Task interface */
interface Task {
    name: string;
    module: string;
    description?: string;
    parameters: TaskParameter[];
    modulePath: string;
}
/** Task parameter interface */
interface TaskParameter {
    name: string;
    type: "String" | "Integer" | "Boolean" | "Array" | "Hash";
    description?: string;
    required: boolean;
    default?: unknown;
}
/** BoltService interface - what we need from the injected service */
interface BoltServiceInterface {
    getInventory(): Promise<Node[]>;
    gatherFacts(nodeId: string): Promise<Facts>;
    runCommand(nodeId: string, command: string, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    runTask(nodeId: string, taskName: string, parameters?: Record<string, unknown>, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    listTasks(): Promise<Task[]>;
    getTaskDetails(taskName: string): Promise<Task | null>;
    getBoltProjectPath(): string;
    getDefaultTimeout(): number;
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
 * Bolt plugin configuration schema
 */
export declare const BoltPluginConfigSchema: z.ZodObject<{
    projectPath: z.ZodOptional<z.ZodString>;
    executionTimeout: z.ZodOptional<z.ZodNumber>;
    cache: z.ZodOptional<z.ZodObject<{
        inventoryTtl: z.ZodOptional<z.ZodNumber>;
        factsTtl: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        inventoryTtl?: number;
        factsTtl?: number;
    }, {
        inventoryTtl?: number;
        factsTtl?: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    projectPath?: string;
    executionTimeout?: number;
    cache?: {
        inventoryTtl?: number;
        factsTtl?: number;
    };
}, {
    projectPath?: string;
    executionTimeout?: number;
    cache?: {
        inventoryTtl?: number;
        factsTtl?: number;
    };
}>;
export type BoltPluginConfig = z.infer<typeof BoltPluginConfigSchema>;
/**
 * Bolt Plugin v1.0.0
 *
 * Provides Puppet Bolt integration with capability-based architecture:
 * - command.execute: Run shell commands on target nodes
 * - task.execute: Run Bolt tasks on target nodes
 * - inventory.list: List nodes from Bolt inventory
 * - facts.query: Gather facts from target nodes
 * - task.list: List available Bolt tasks
 * - task.details: Get task metadata and parameters
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - FactsCapability: info.facts, info.refresh
 * - RemoteExecutionCapability: command.execute, task.execute, script.execute
 */
export declare class BoltPlugin implements BasePluginInterface {
    readonly metadata: PluginMetadata;
    readonly capabilities: PluginCapability[];
    readonly widgets: PluginWidget[];
    readonly cliCommands: PluginCLICommand[];
    readonly configSchema: ZodSchema;
    readonly defaultPermissions: Record<string, string[]>;
    private boltService;
    private logger;
    private performanceMonitor;
    private config;
    private _initialized;
    constructor(boltService: BoltServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
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
    /**
     * Execute a command on target nodes
     */
    private executeCommand;
    /**
     * Execute a task on target nodes
     */
    private executeTask;
    /**
     * List nodes from inventory
     */
    private listInventory;
    /**
     * Query facts for a node
     */
    private queryFacts;
    /**
     * List available tasks
     */
    private listTasks;
    /**
     * Get task details
     */
    private getTaskDetails;
    /**
     * List all nodes from Bolt inventory
     * Implements InventoryCapability.inventoryList
     */
    inventoryList(params: {
        refresh?: boolean;
        groups?: string[];
    }): Promise<Node[]>;
    /**
     * Get specific node details
     * Implements InventoryCapability.inventoryGet
     */
    inventoryGet(params: {
        nodeId: string;
    }): Promise<Node | null>;
    /**
     * List available groups
     * Implements InventoryCapability.inventoryGroups
     */
    inventoryGroups(params: {
        refresh?: boolean;
    }): Promise<string[]>;
    /**
     * Filter nodes by criteria
     * Implements InventoryCapability.inventoryFilter
     */
    inventoryFilter(params: {
        criteria: Record<string, unknown>;
        groups?: string[];
    }): Promise<Node[]>;
    /**
     * Get facts for a node
     * Implements FactsCapability.factsGet
     */
    factsGet(params: {
        nodeId: string;
        providers?: string[];
    }): Promise<Facts>;
    /**
     * Force refresh facts (bypass cache)
     * Implements FactsCapability.factsRefresh
     */
    factsRefresh(params: {
        nodeId: string;
        providers?: string[];
    }): Promise<Facts>;
    /**
     * Get fact provider information for this plugin
     * Implements FactsCapability.getFactProvider
     */
    getFactProvider(): {
        name: string;
        priority: number;
        supportedFactKeys: string[];
    };
    /**
     * Execute shell command on target nodes
     * Implements RemoteExecutionCapability.commandExecute
     */
    commandExecute(params: {
        command: string;
        targets: string[];
        timeout?: number;
        environment?: Record<string, string>;
        async?: boolean;
        debugMode?: boolean;
    }): Promise<ExecutionResult>;
    /**
     * Execute task or playbook on target nodes
     * Implements RemoteExecutionCapability.taskExecute
     */
    taskExecute(params: {
        taskName: string;
        targets: string[];
        parameters?: Record<string, unknown>;
        timeout?: number;
        environment?: Record<string, string>;
        async?: boolean;
        debugMode?: boolean;
    }): Promise<ExecutionResult>;
    /**
     * Execute script on target nodes
     * Implements RemoteExecutionCapability.scriptExecute
     */
    scriptExecute(params: {
        script: string;
        targets: string[];
        scriptType?: "bash" | "powershell" | "python" | "ruby";
        arguments?: string[];
        timeout?: number;
        environment?: Record<string, string>;
        async?: boolean;
        debugMode?: boolean;
    }): Promise<ExecutionResult>;
    /**
     * Stream output from an execution
     * Implements RemoteExecutionCapability.streamOutput
     *
     * Note: Bolt executions are synchronous, so streaming happens during execution.
     * This method is a placeholder for future async execution support.
     */
    streamOutput(executionId: string, callback: (chunk: {
        nodeId: string;
        stream: "stdout" | "stderr";
        data: string;
        timestamp: string;
    }) => void): Promise<void>;
    /**
     * Cancel an in-progress execution
     * Implements RemoteExecutionCapability.cancelExecution
     *
     * Note: Bolt executions are synchronous and cannot be cancelled mid-execution.
     * This method is a placeholder for future async execution support.
     */
    cancelExecution(executionId: string): Promise<boolean>;
    /**
     * Install a package on target nodes
     * Implements SoftwareInstallationCapability.packageInstall
     */
    packageInstall(params: {
        packageName: string;
        version?: string;
        targets: string[];
        options?: Record<string, unknown>;
        async?: boolean;
    }): Promise<{
        id: string;
        operation: "install";
        packageName: string;
        targetNodes: string[];
        status: "running" | "success" | "failed" | "partial";
        startedAt: string;
        completedAt?: string;
        results: Array<{
            nodeId: string;
            status: "success" | "failed";
            packageName: string;
            version?: string;
            error?: string;
            duration: number;
        }>;
        error?: string;
    }>;
    /**
     * Uninstall a package from target nodes
     * Implements SoftwareInstallationCapability.packageUninstall
     */
    packageUninstall(params: {
        packageName: string;
        targets: string[];
        purge?: boolean;
        async?: boolean;
    }): Promise<{
        id: string;
        operation: "uninstall";
        packageName: string;
        targetNodes: string[];
        status: "running" | "success" | "failed" | "partial";
        startedAt: string;
        completedAt?: string;
        results: Array<{
            nodeId: string;
            status: "success" | "failed";
            packageName: string;
            version?: string;
            error?: string;
            duration: number;
        }>;
        error?: string;
    }>;
    /**
     * Update a package on target nodes
     * Implements SoftwareInstallationCapability.packageUpdate
     */
    packageUpdate(params: {
        packageName: string;
        version?: string;
        targets: string[];
        async?: boolean;
    }): Promise<{
        id: string;
        operation: "update";
        packageName: string;
        targetNodes: string[];
        status: "running" | "success" | "failed" | "partial";
        startedAt: string;
        completedAt?: string;
        results: Array<{
            nodeId: string;
            status: "success" | "failed";
            packageName: string;
            version?: string;
            error?: string;
            duration: number;
        }>;
        error?: string;
    }>;
    /**
     * List installed packages on a node
     * Implements SoftwareInstallationCapability.packageList
     */
    packageList(params: {
        nodeId: string;
        filter?: string;
    }): Promise<Array<{
        name: string;
        version?: string;
        availableVersion?: string;
        status: "installed" | "not_installed" | "upgradable" | "broken";
        description?: string;
        size?: string;
        installedAt?: string;
        repository?: string;
        metadata?: Record<string, unknown>;
    }>>;
    /**
     * Search available packages
     * Implements SoftwareInstallationCapability.packageSearch
     */
    packageSearch(params: {
        query: string;
        limit?: number;
    }): Promise<Array<{
        name: string;
        version: string;
        description?: string;
        repository?: string;
        size?: string;
        metadata?: Record<string, unknown>;
    }>>;
    /**
     * Log command execution to Node Journal (when available)
     * @private
     */
    private logCommandToJournal;
    /**
     * Log task execution to Node Journal (when available)
     * @private
     */
    private logTaskToJournal;
    /**
     * Log package installation to Node Journal (when available)
     * @private
     */
    private logPackageToJournal;
    /**
     * Get the underlying BoltService instance
     * @deprecated Use capability handlers instead
     */
    getBoltService(): BoltServiceInterface;
}
/**
 * Factory function for creating BoltPlugin instances
 */
export declare function createBoltPlugin(boltService: BoltServiceInterface, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface): BoltPlugin;
export default BoltPlugin;
//# sourceMappingURL=BoltPlugin.d.ts.map
