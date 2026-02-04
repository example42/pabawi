"use strict";
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
exports.BoltPlugin = exports.BoltPluginConfigSchema = void 0;
exports.createBoltPlugin = createBoltPlugin;
const zod_1 = require("zod");
// =============================================================================
// Type-only imports - These are resolved at compile time, not runtime
// The actual implementations are injected via constructor
// =============================================================================
/** Integration type enum values (duplicated to avoid runtime import) */
const IntegrationType = {
    InventorySource: "InventorySource",
    RemoteExecution: "RemoteExecution",
    Info: "Info",
    ConfigurationManagement: "ConfigurationManagement",
    Event: "Event",
    Monitoring: "Monitoring",
    Provisioning: "Provisioning",
    Deployment: "Deployment",
    SecretManagement: "SecretManagement", //pragma: allowlist secret`
    Schedule: "Schedule",
    SoftwareInstall: "SoftwareInstall",
    Orchestration: "Orchestration",
    Logging: "Logging",
    AuditCompliance: "AuditCompliance",
    BackupRecovery: "BackupRecovery",
};
// =============================================================================
// Capability Parameter Schemas
// =============================================================================
/**
 * Schema for command execution parameters
 */
const CommandExecuteSchema = zod_1.z.object({
    command: zod_1.z.string().min(1).describe("Shell command to execute"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s) to execute on"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
});
/**
 * Schema for task execution parameters
 */
const TaskExecuteSchema = zod_1.z.object({
    task: zod_1.z.string().min(1).describe("Name of the Bolt task to execute"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s) to execute on"),
    parameters: zod_1.z.record(zod_1.z.unknown()).optional().describe("Task parameters"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
});
/**
 * Schema for inventory listing parameters
 */
const InventoryListSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
});
/**
 * Schema for facts query parameters
 */
const FactsQuerySchema = zod_1.z.object({
    target: zod_1.z.string().min(1).describe("Node to query facts for"),
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
});
/**
 * Schema for task listing parameters
 */
const TaskListSchema = zod_1.z.object({
    module: zod_1.z.string().optional().describe("Filter by module name"),
});
/**
 * Schema for task details parameters
 */
const TaskDetailsSchema = zod_1.z.object({
    task: zod_1.z.string().min(1).describe("Task name to get details for"),
});
// =============================================================================
// Plugin Configuration
// =============================================================================
/**
 * Bolt plugin configuration schema
 */
exports.BoltPluginConfigSchema = zod_1.z.object({
    projectPath: zod_1.z.string().optional().describe("Path to Bolt project directory"),
    executionTimeout: zod_1.z.number().optional().describe("Default execution timeout in ms"),
    cache: zod_1.z.object({
        inventoryTtl: zod_1.z.number().optional().describe("Inventory cache TTL in ms"),
        factsTtl: zod_1.z.number().optional().describe("Facts cache TTL in ms"),
    }).optional(),
});
// =============================================================================
// Plugin Implementation
// =============================================================================
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
 */
class BoltPlugin {
    // =========================================================================
    // Plugin Metadata
    // =========================================================================
    metadata = {
        name: "bolt",
        version: "1.0.0",
        author: "Pabawi Team",
        description: "Puppet Bolt integration for remote command and task execution",
        integrationType: IntegrationType.RemoteExecution,
        homepage: "https://puppet.com/docs/bolt/latest/bolt.html",
        color: "#FFAE1A", // Puppet/Bolt orange
        icon: "terminal",
        tags: ["bolt", "puppet", "remote-execution", "commands", "tasks"],
        minPabawiVersion: "1.0.0",
    };
    // =========================================================================
    // Capabilities
    // =========================================================================
    capabilities;
    // =========================================================================
    // Widgets
    // =========================================================================
    widgets = [
        {
            id: "bolt:home-widget",
            name: "Bolt Summary",
            component: "./frontend/HomeWidget.svelte",
            slots: ["home-summary"],
            size: "medium",
            requiredCapabilities: ["bolt.inventory.list"],
            icon: "terminal",
            priority: 100,
        },
        {
            id: "bolt:command-executor",
            name: "Command Executor",
            component: "./frontend/CommandExecutor.svelte",
            slots: ["dashboard", "node-detail", "standalone-page"],
            size: "medium",
            requiredCapabilities: ["bolt.command.execute"],
            icon: "terminal",
            priority: 100,
            config: {
                showTargetSelector: true,
                showOutputPanel: true,
            },
        },
        {
            id: "bolt:task-runner",
            name: "Task Runner",
            component: "./frontend/TaskRunner.svelte",
            slots: ["dashboard", "node-detail", "standalone-page"],
            size: "large",
            requiredCapabilities: ["bolt.task.execute"],
            icon: "play",
            priority: 90,
            config: {
                showTaskBrowser: true,
                showParameterForm: true,
            },
        },
        {
            id: "bolt:inventory-viewer",
            name: "Inventory Viewer",
            component: "./frontend/InventoryViewer.svelte",
            slots: ["dashboard", "inventory-panel", "sidebar"],
            size: "medium",
            requiredCapabilities: ["bolt.inventory.list"],
            icon: "server",
            priority: 80,
        },
        {
            id: "bolt:task-browser",
            name: "Task Browser",
            component: "./frontend/TaskBrowser.svelte",
            slots: ["dashboard", "sidebar"],
            size: "small",
            requiredCapabilities: ["bolt.task.list"],
            icon: "list",
            priority: 70,
        },
        {
            id: "bolt:facts-viewer",
            name: "Facts Viewer",
            component: "./frontend/FactsViewer.svelte",
            slots: ["node-detail"],
            size: "medium",
            requiredCapabilities: ["bolt.facts.query"],
            icon: "info",
            priority: 60,
        },
    ];
    // =========================================================================
    // CLI Commands
    // =========================================================================
    cliCommands = [
        {
            name: "bolt",
            actions: [
                {
                    name: "run",
                    capability: "bolt.command.execute",
                    description: "Execute a command on target nodes",
                    aliases: ["cmd", "command"],
                    examples: [
                        'pab bolt run "uptime" --targets all',
                        'pab bolt run "systemctl status nginx" --targets web-*',
                    ],
                },
                {
                    name: "task",
                    capability: "bolt.task.execute",
                    description: "Execute a Bolt task on target nodes",
                    examples: [
                        'pab bolt task package --targets web-01 --params \'{"action":"install","name":"nginx"}\'',
                        "pab bolt task service --targets all --params '{\"action\":\"restart\",\"name\":\"httpd\"}'",
                    ],
                },
                {
                    name: "inventory",
                    capability: "bolt.inventory.list",
                    description: "List nodes from Bolt inventory",
                    aliases: ["nodes", "inv"],
                    examples: ["pab bolt inventory", "pab bolt inventory --format json"],
                },
                {
                    name: "facts",
                    capability: "bolt.facts.query",
                    description: "Gather facts from a target node",
                    examples: [
                        "pab bolt facts web-01",
                        "pab bolt facts db-server --format json",
                    ],
                },
                {
                    name: "tasks",
                    capability: "bolt.task.list",
                    description: "List available Bolt tasks",
                    aliases: ["list-tasks"],
                    examples: ["pab bolt tasks", "pab bolt tasks --module service"],
                },
            ],
        },
    ];
    // =========================================================================
    // Configuration
    // =========================================================================
    configSchema = exports.BoltPluginConfigSchema;
    defaultPermissions = {
        "bolt.command.execute": ["admin", "operator"],
        "bolt.task.execute": ["admin", "operator"],
        "bolt.inventory.list": ["admin", "operator", "viewer"],
        "bolt.facts.query": ["admin", "operator", "viewer"],
        "bolt.task.list": ["admin", "operator", "viewer"],
        "bolt.task.details": ["admin", "operator", "viewer"],
    };
    // =========================================================================
    // Private State
    // =========================================================================
    boltService;
    logger;
    performanceMonitor;
    config = {};
    _initialized = false;
    // =========================================================================
    // Constructor
    // =========================================================================
    constructor(boltService, logger, performanceMonitor) {
        this.boltService = boltService;
        this.logger = logger;
        this.performanceMonitor = performanceMonitor;
        // Initialize capabilities array with bound handlers
        this.capabilities = this.createCapabilities();
    }
    // =========================================================================
    // Capability Factory
    // =========================================================================
    /**
     * Create capability definitions with bound handlers
     */
    createCapabilities() {
        return [
            // Command Execution
            {
                category: "command",
                name: "bolt.command.execute",
                description: "Execute a shell command on one or more target nodes using Bolt",
                handler: this.executeCommand.bind(this),
                requiredPermissions: ["bolt.command.execute", "command.execute"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        command: {
                            type: "string",
                            description: "Shell command to execute",
                            required: true,
                        },
                        targets: {
                            type: "array",
                            description: "Target node(s) to execute on",
                            required: true,
                        },
                        timeout: {
                            type: "number",
                            description: "Execution timeout in milliseconds",
                            required: false,
                            default: 300000,
                        },
                    },
                    returns: {
                        type: "ExecutionResult",
                        description: "Execution results for each target node",
                    },
                },
            },
            // Task Execution
            {
                category: "task",
                name: "bolt.task.execute",
                description: "Execute a Bolt task on one or more target nodes",
                handler: this.executeTask.bind(this),
                requiredPermissions: ["bolt.task.execute", "task.execute"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        task: {
                            type: "string",
                            description: "Name of the Bolt task to execute",
                            required: true,
                        },
                        targets: {
                            type: "array",
                            description: "Target node(s) to execute on",
                            required: true,
                        },
                        parameters: {
                            type: "object",
                            description: "Task parameters",
                            required: false,
                        },
                        timeout: {
                            type: "number",
                            description: "Execution timeout in milliseconds",
                            required: false,
                            default: 300000,
                        },
                    },
                    returns: {
                        type: "ExecutionResult",
                        description: "Task execution results for each target node",
                    },
                },
            },
            // Inventory Listing
            {
                category: "inventory",
                name: "bolt.inventory.list",
                description: "List nodes from the Bolt inventory file",
                handler: this.listInventory.bind(this),
                requiredPermissions: ["bolt.inventory.list", "inventory.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        refresh: {
                            type: "boolean",
                            description: "Force refresh from source",
                            required: false,
                            default: false,
                        },
                    },
                    returns: {
                        type: "Node[]",
                        description: "Array of nodes from inventory",
                    },
                },
            },
            // Facts Query
            {
                category: "info",
                name: "bolt.facts.query",
                description: "Gather system facts from a target node using Bolt",
                handler: this.queryFacts.bind(this),
                requiredPermissions: ["bolt.facts.query", "facts.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        target: {
                            type: "string",
                            description: "Node to query facts for",
                            required: true,
                        },
                        refresh: {
                            type: "boolean",
                            description: "Force refresh from source",
                            required: false,
                            default: false,
                        },
                    },
                    returns: {
                        type: "Facts",
                        description: "System facts for the target node",
                    },
                },
            },
            // Task Listing
            {
                category: "info",
                name: "bolt.task.list",
                description: "List available Bolt tasks from modules",
                handler: this.listTasks.bind(this),
                requiredPermissions: ["bolt.task.list"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        module: {
                            type: "string",
                            description: "Filter by module name",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Task[]",
                        description: "Array of available tasks",
                    },
                },
            },
            // Task Details
            {
                category: "info",
                name: "bolt.task.details",
                description: "Get details about a specific Bolt task",
                handler: this.getTaskDetails.bind(this),
                requiredPermissions: ["bolt.task.details"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        task: {
                            type: "string",
                            description: "Task name to get details for",
                            required: true,
                        },
                    },
                    returns: {
                        type: "Task",
                        description: "Task metadata and parameters",
                    },
                },
            },
        ];
    }
    // =========================================================================
    // Lifecycle Methods
    // =========================================================================
    /**
     * Initialize the plugin
     */
    async initialize() {
        const complete = this.performanceMonitor.startTimer("bolt:v1:initialization");
        try {
            this.logger.info("Initializing BoltPlugin", {
                component: "BoltPlugin",
                operation: "initialize",
            });
            // Verify Bolt is accessible by checking inventory
            await this.boltService.getInventory();
            this._initialized = true;
            this.logger.info("BoltPlugin initialized successfully", {
                component: "BoltPlugin",
                operation: "initialize",
                metadata: {
                    projectPath: this.boltService.getBoltProjectPath(),
                    capabilitiesCount: this.capabilities.length,
                    widgetsCount: this.widgets.length,
                },
            });
            complete({ success: true });
        }
        catch (error) {
            this.logger.warn("BoltPlugin initialization completed with issues", {
                component: "BoltPlugin",
                operation: "initialize",
                metadata: {
                    error: error instanceof Error ? error.message : String(error),
                },
            });
            // Don't throw - allow plugin to start in degraded mode
            this._initialized = true;
            complete({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
    /**
     * Perform health check
     */
    async healthCheck() {
        const complete = this.performanceMonitor.startTimer("bolt:v1:healthCheck");
        const now = new Date().toISOString();
        if (!this._initialized) {
            complete({ healthy: false });
            return {
                healthy: false,
                message: "Plugin is not initialized",
                lastCheck: now,
            };
        }
        try {
            // Check if Bolt command is available
            const fs = await Promise.resolve().then(() => __importStar(require("fs")));
            const path = await Promise.resolve().then(() => __importStar(require("path")));
            const childProcess = await Promise.resolve().then(() => __importStar(require("child_process")));
            const boltCheck = childProcess.spawn("bolt", ["--version"], { stdio: "pipe" });
            const boltAvailable = await new Promise((resolve) => {
                let resolved = false;
                const handleClose = (code) => {
                    if (!resolved) {
                        resolved = true;
                        resolve(code === 0);
                    }
                };
                const handleError = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve(false);
                    }
                };
                boltCheck.on("close", handleClose);
                boltCheck.on("error", handleError);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        boltCheck.kill();
                        resolve(false);
                    }
                }, 5000);
            });
            if (!boltAvailable) {
                complete({ available: false });
                return {
                    healthy: false,
                    message: "Bolt command is not available. Please install Puppet Bolt.",
                    lastCheck: now,
                    details: {
                        error: "bolt command not found",
                        projectPath: this.boltService.getBoltProjectPath(),
                    },
                };
            }
            // Check for project configuration
            const projectPath = this.boltService.getBoltProjectPath();
            const inventoryYaml = path.join(projectPath, "inventory.yaml");
            const inventoryYml = path.join(projectPath, "inventory.yml");
            const hasInventory = fs.existsSync(inventoryYaml) || fs.existsSync(inventoryYml);
            if (!hasInventory) {
                complete({ available: true, configured: false });
                return {
                    healthy: false,
                    degraded: true,
                    message: "Bolt inventory file is missing. Some operations will be limited.",
                    lastCheck: now,
                    details: {
                        projectPath,
                        missingFiles: ["inventory.yaml"],
                    },
                };
            }
            // Try to load inventory
            const inventory = await this.boltService.getInventory();
            complete({ available: true, configured: true, nodeCount: inventory.length });
            return {
                healthy: true,
                message: `Bolt is healthy. ${inventory.length} nodes in inventory.`,
                lastCheck: now,
                details: {
                    nodeCount: inventory.length,
                    projectPath,
                    capabilities: this.capabilities.map((c) => c.name),
                },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            complete({ error: errorMessage });
            return {
                healthy: false,
                message: `Bolt health check failed: ${errorMessage}`,
                lastCheck: now,
                details: {
                    error: errorMessage,
                    projectPath: this.boltService.getBoltProjectPath(),
                },
            };
        }
    }
    /**
     * Get current plugin configuration
     */
    getConfig() {
        return {
            ...this.config,
            projectPath: this.boltService.getBoltProjectPath(),
            defaultTimeout: this.boltService.getDefaultTimeout(),
        };
    }
    /**
     * Check if plugin is initialized
     */
    isInitialized() {
        return this._initialized;
    }
    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        this.logger.info("BoltPlugin shutting down", {
            component: "BoltPlugin",
            operation: "shutdown",
        });
        this._initialized = false;
    }
    // =========================================================================
    // Capability Handlers
    // =========================================================================
    /**
     * Execute a command on target nodes
     */
    async executeCommand(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:executeCommand");
        try {
            const validated = CommandExecuteSchema.parse(params);
            const target = Array.isArray(validated.targets)
                ? validated.targets[0]
                : validated.targets;
            this.logger.info("Executing command", {
                component: "BoltPlugin",
                operation: "executeCommand",
                metadata: {
                    command: validated.command,
                    target,
                    correlationId: context.correlationId,
                    userId: context.user?.id,
                },
            });
            // Extract streaming callback from context metadata if present
            const streamingCallback = context.metadata?.streamingCallback;
            const result = await this.boltService.runCommand(target, validated.command, streamingCallback);
            complete({ status: result.status, target });
            return result;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Execute a task on target nodes
     */
    async executeTask(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:executeTask");
        try {
            const validated = TaskExecuteSchema.parse(params);
            const target = Array.isArray(validated.targets)
                ? validated.targets[0]
                : validated.targets;
            this.logger.info("Executing task", {
                component: "BoltPlugin",
                operation: "executeTask",
                metadata: {
                    task: validated.task,
                    target,
                    hasParameters: !!validated.parameters,
                    correlationId: context.correlationId,
                    userId: context.user?.id,
                },
            });
            // Extract streaming callback from context metadata if present
            const streamingCallback = context.metadata?.streamingCallback;
            const result = await this.boltService.runTask(target, validated.task, validated.parameters, streamingCallback);
            complete({ status: result.status, target, task: validated.task });
            return result;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * List nodes from inventory
     */
    async listInventory(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:listInventory");
        try {
            const validated = InventoryListSchema.parse(params);
            this.logger.debug("Listing inventory", {
                component: "BoltPlugin",
                operation: "listInventory",
                metadata: {
                    refresh: validated.refresh,
                    correlationId: context.correlationId,
                },
            });
            const nodes = await this.boltService.getInventory();
            complete({ nodeCount: nodes.length });
            return nodes;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Query facts for a node
     */
    async queryFacts(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:queryFacts");
        try {
            const validated = FactsQuerySchema.parse(params);
            this.logger.debug("Querying facts", {
                component: "BoltPlugin",
                operation: "queryFacts",
                metadata: {
                    target: validated.target,
                    refresh: validated.refresh,
                    correlationId: context.correlationId,
                },
            });
            const facts = await this.boltService.gatherFacts(validated.target);
            complete({ target: validated.target });
            return facts;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * List available tasks
     */
    async listTasks(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:listTasks");
        try {
            const validated = TaskListSchema.parse(params);
            this.logger.debug("Listing tasks", {
                component: "BoltPlugin",
                operation: "listTasks",
                metadata: {
                    module: validated.module,
                    correlationId: context.correlationId,
                },
            });
            const tasks = await this.boltService.listTasks();
            // Filter by module if specified
            const filteredTasks = validated.module
                ? tasks.filter((t) => t.module === validated.module)
                : tasks;
            complete({ taskCount: filteredTasks.length, module: validated.module });
            return filteredTasks;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Get task details
     */
    async getTaskDetails(params, context) {
        const complete = this.performanceMonitor.startTimer("bolt:v1:getTaskDetails");
        try {
            const validated = TaskDetailsSchema.parse(params);
            this.logger.debug("Getting task details", {
                component: "BoltPlugin",
                operation: "getTaskDetails",
                metadata: {
                    task: validated.task,
                    correlationId: context.correlationId,
                },
            });
            const task = await this.boltService.getTaskDetails(validated.task);
            complete({ task: validated.task, found: !!task });
            return task;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    // =========================================================================
    // Legacy Bridge Methods (for backward compatibility)
    // =========================================================================
    /**
     * Get the underlying BoltService instance
     * @deprecated Use capability handlers instead
     */
    getBoltService() {
        return this.boltService;
    }
}
exports.BoltPlugin = BoltPlugin;
// =============================================================================
// Plugin Factory
// =============================================================================
/**
 * Factory function for creating BoltPlugin instances
 */
function createBoltPlugin(boltService, logger, performanceMonitor) {
    return new BoltPlugin(boltService, logger, performanceMonitor);
}
exports.default = BoltPlugin;
//# sourceMappingURL=BoltPlugin.js.map
