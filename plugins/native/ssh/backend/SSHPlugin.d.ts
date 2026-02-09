/**
 * SSH Plugin v1.0 - Modular Plugin Architecture
 *
 * Implements BasePluginInterface with:
 * - Capability-based execution (command, inventory)
 * - SSH config file parsing for inventory
 * - Remote command execution via SSH
 * - RBAC-aware capability handlers
 *
 * @module plugins/native/ssh/backend/SSHPlugin
 * @version 1.0.0
 */
import type { ZodSchema } from "zod";
import { z } from "zod";
import type { SSHService, Node, ExecutionResult } from "./SSHService";
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
    getSummary?(): Promise<{
        pluginName: string;
        displayName: string;
        metrics: Record<string, number | string | boolean>;
        healthy: boolean;
        lastUpdate: string;
        error?: string;
    }>;
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
/** SSH plugin configuration schema */
export declare const SSHPluginConfigSchema: z.ZodObject<{
    sshConfigPath: z.ZodOptional<z.ZodString>;
    executionTimeout: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sshConfigPath?: string | undefined;
    executionTimeout?: number | undefined;
}, {
    sshConfigPath?: string | undefined;
    executionTimeout?: number | undefined;
}>;
export type SSHPluginConfig = z.infer<typeof SSHPluginConfigSchema>;
/**
 * SSH Plugin v1.0.0
 *
 * Provides SSH integration with capability-based architecture:
 * - command.execute: Run shell commands on target nodes via SSH
 * - script.execute: Execute scripts on target nodes via SSH
 * - inventory.list: List nodes from SSH config
 * - inventory.get: Get specific node details
 * - inventory.groups: List available groups
 * - inventory.filter: Filter nodes by criteria
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - RemoteExecutionCapability: command.execute, script.execute
 */
export declare class SSHPlugin implements BasePluginInterface {
    readonly metadata: PluginMetadata;
    readonly capabilities: PluginCapability[];
    readonly widgets: PluginWidget[];
    readonly cliCommands: PluginCLICommand[];
    readonly configSchema: ZodSchema;
    readonly defaultPermissions: Record<string, string[]>;
    private sshService;
    private logger;
    private performanceMonitor;
    private config;
    private _initialized;
    constructor(sshService: SSHService, logger: LoggerServiceInterface, performanceMonitor: PerformanceMonitorServiceInterface);
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
     * Execute shell command on target nodes via SSH
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
     * Execute script on target nodes via SSH
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
     * Note: SSH executions are synchronous, so streaming happens during execution.
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
     * Note: SSH executions are synchronous and cannot be cancelled mid-execution.
     * This method is a placeholder for future async execution support.
     */
    cancelExecution(executionId: string): Promise<boolean>;
    /**
     * List all nodes from SSH config
     * Implements InventoryCapability.inventoryList
     */
    inventoryList(params: {
        refresh?: boolean;
        groups?: string[];
    }): Promise<Node[]>;
    /**
     * Get specific node details from SSH config
     * Implements InventoryCapability.inventoryGet
     */
    inventoryGet(params: {
        nodeId: string;
    }): Promise<Node | null>;
    /**
     * List available groups from SSH config
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
}
export {};
//# sourceMappingURL=SSHPlugin.d.ts.map
