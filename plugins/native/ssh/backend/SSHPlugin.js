"use strict";
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
exports.SSHPlugin = exports.SSHPluginConfigSchema = void 0;
const zod_1 = require("zod");
// =============================================================================
// Type-only imports - These are resolved at compile time, not runtime
// =============================================================================
/** Integration type enum values */
const IntegrationType = {
    InventorySource: "InventorySource",
    RemoteExecution: "RemoteExecution",
    Info: "Info",
    ConfigurationManagement: "ConfigurationManagement",
    Event: "Event",
    Monitoring: "Monitoring",
    Provisioning: "Provisioning",
    Deployment: "Deployment",
    SecretManagement: "SecretManagement", //pragma: allowlist secret
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
/** Schema for command execution parameters */
const CommandExecuteSchema = zod_1.z.object({
    command: zod_1.z.string().min(1).describe("Shell command to execute"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s) to execute on"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
    environment: zod_1.z.record(zod_1.z.string()).optional().describe("Environment variables"),
    async: zod_1.z.boolean().optional().describe("Execute asynchronously"),
    debugMode: zod_1.z.boolean().optional().describe("Enable debug mode"),
});
/** Schema for script execution parameters */
const ScriptExecuteSchema = zod_1.z.object({
    script: zod_1.z.string().min(1).describe("Script content or path"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s)"),
    scriptType: zod_1.z.enum(["bash", "powershell", "python", "ruby"]).optional().describe("Script type"),
    arguments: zod_1.z.array(zod_1.z.string()).optional().describe("Script arguments"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
    environment: zod_1.z.record(zod_1.z.string()).optional().describe("Environment variables"),
    async: zod_1.z.boolean().optional().describe("Execute asynchronously"),
    debugMode: zod_1.z.boolean().optional().describe("Enable debug mode"),
});
/** Schema for inventory listing parameters */
const InventoryListSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
    groups: zod_1.z.array(zod_1.z.string()).optional().describe("Filter by group membership"),
});
/** Schema for inventory get parameters */
const InventoryGetSchema = zod_1.z.object({
    nodeId: zod_1.z.string().min(1).describe("Node identifier"),
});
/** Schema for inventory groups parameters */
const InventoryGroupsSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
});
/** Schema for inventory filter parameters */
const InventoryFilterSchema = zod_1.z.object({
    criteria: zod_1.z.record(zod_1.z.unknown()).describe("Filter criteria"),
    groups: zod_1.z.array(zod_1.z.string()).optional().describe("Filter by group membership"),
});
// =============================================================================
// Plugin Configuration
// =============================================================================
/** SSH plugin configuration schema */
exports.SSHPluginConfigSchema = zod_1.z.object({
    sshConfigPath: zod_1.z.string().optional().describe("Path to SSH config file"),
    executionTimeout: zod_1.z.number().optional().describe("Default execution timeout in ms"),
});
// =============================================================================
// Plugin Implementation
// =============================================================================
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
class SSHPlugin {
    // =========================================================================
    // Plugin Metadata
    // =========================================================================
    metadata = {
        name: "ssh",
        version: "1.0.0",
        author: "Pabawi Team",
        description: "SSH integration for remote command execution and inventory management",
        integrationType: IntegrationType.RemoteExecution,
        integrationTypes: [IntegrationType.RemoteExecution, IntegrationType.InventorySource],
        homepage: "https://www.openssh.com/",
        color: "#4A90E2",
        icon: "terminal",
        tags: ["ssh", "remote-execution", "commands", "inventory"],
        minPabawiVersion: "1.0.0",
    };
    // =========================================================================
    // Capabilities
    // =========================================================================
    capabilities;
    // =========================================================================
    // Widgets
    // =========================================================================
    widgets = [];
    // =========================================================================
    // CLI Commands
    // =========================================================================
    cliCommands = [
        {
            name: "ssh",
            actions: [
                {
                    name: "run",
                    capability: "command.execute",
                    description: "Execute a command on target nodes via SSH",
                    aliases: ["cmd", "exec"],
                    examples: [
                        'pab ssh run "uptime" --targets server1',
                        'pab ssh run "hostname" --targets all',
                    ],
                },
                {
                    name: "inventory",
                    capability: "inventory.list",
                    description: "List nodes from SSH config",
                    aliases: ["nodes", "inv"],
                    examples: ["pab ssh inventory", "pab ssh inventory --format json"],
                },
            ],
        },
    ];
    // =========================================================================
    // Configuration
    // =========================================================================
    configSchema = exports.SSHPluginConfigSchema;
    defaultPermissions = {
        "command.execute": ["admin", "operator"],
        "script.execute": ["admin", "operator"],
        "inventory.list": ["admin", "operator", "viewer"],
        "inventory.get": ["admin", "operator", "viewer"],
        "inventory.groups": ["admin", "operator", "viewer"],
        "inventory.filter": ["admin", "operator", "viewer"],
        "ssh.command.execute": ["admin", "operator"],
        "ssh.inventory.list": ["admin", "operator", "viewer"],
    };
    // =========================================================================
    // Private State
    // =========================================================================
    sshService;
    logger;
    performanceMonitor;
    config = {};
    _initialized = false;
    // =========================================================================
    // Constructor
    // =========================================================================
    constructor(sshService, logger, performanceMonitor) {
        this.sshService = sshService;
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
            // Standardized Remote Execution Capabilities
            {
                category: "command",
                name: "command.execute",
                description: "Execute shell command on target nodes via SSH (standardized interface)",
                handler: async (params) => this.commandExecute(params),
                requiredPermissions: ["ssh.command.execute", "command.execute"],
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
                            description: "Target node identifiers",
                            required: true,
                        },
                        timeout: {
                            type: "number",
                            description: "Execution timeout in milliseconds",
                            required: false,
                        },
                        environment: {
                            type: "object",
                            description: "Environment variables",
                            required: false,
                        },
                        async: {
                            type: "boolean",
                            description: "Execute asynchronously",
                            required: false,
                        },
                        debugMode: {
                            type: "boolean",
                            description: "Enable debug mode for detailed output",
                            required: false,
                        },
                    },
                    returns: {
                        type: "ExecutionResult",
                        description: "Execution result with per-node results",
                    },
                },
            },
            // Script Execution
            {
                category: "command",
                name: "script.execute",
                description: "Execute script on target nodes via SSH (standardized interface)",
                handler: async (params) => this.scriptExecute(params),
                requiredPermissions: ["ssh.command.execute", "command.execute"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        script: {
                            type: "string",
                            description: "Script content or path",
                            required: true,
                        },
                        targets: {
                            type: "array",
                            description: "Target node identifiers",
                            required: true,
                        },
                        scriptType: {
                            type: "string",
                            description: "Script interpreter type",
                            required: false,
                        },
                        arguments: {
                            type: "array",
                            description: "Script arguments",
                            required: false,
                        },
                        timeout: {
                            type: "number",
                            description: "Execution timeout in milliseconds",
                            required: false,
                        },
                        environment: {
                            type: "object",
                            description: "Environment variables",
                            required: false,
                        },
                        async: {
                            type: "boolean",
                            description: "Execute asynchronously",
                            required: false,
                        },
                        debugMode: {
                            type: "boolean",
                            description: "Enable debug mode for detailed output",
                            required: false,
                        },
                    },
                    returns: {
                        type: "ExecutionResult",
                        description: "Script execution result with per-node results",
                    },
                },
            },
            // Standardized Inventory Capabilities
            {
                category: "inventory",
                name: "inventory.list",
                description: "List all nodes from SSH config (standardized interface)",
                handler: async (params) => this.inventoryList(params),
                requiredPermissions: ["ssh.inventory.list", "inventory.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        refresh: {
                            type: "boolean",
                            description: "Force refresh from source",
                            required: false,
                            default: false,
                        },
                        groups: {
                            type: "array",
                            description: "Filter by group membership",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Node[]",
                        description: "Array of nodes from SSH config",
                    },
                },
            },
            {
                category: "inventory",
                name: "inventory.get",
                description: "Get specific node details from SSH config (standardized interface)",
                handler: async (params) => this.inventoryGet(params),
                requiredPermissions: ["ssh.inventory.list", "inventory.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        nodeId: {
                            type: "string",
                            description: "Node identifier",
                            required: true,
                        },
                    },
                    returns: {
                        type: "Node",
                        description: "Node details or null if not found",
                    },
                },
            },
            {
                category: "inventory",
                name: "inventory.groups",
                description: "List available groups from SSH config (standardized interface)",
                handler: async (params) => this.inventoryGroups(params),
                requiredPermissions: ["ssh.inventory.list", "inventory.read"],
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
                        type: "string[]",
                        description: "Array of group names",
                    },
                },
            },
            {
                category: "inventory",
                name: "inventory.filter",
                description: "Filter nodes by criteria (standardized interface)",
                handler: async (params) => this.inventoryFilter(params),
                requiredPermissions: ["ssh.inventory.list", "inventory.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        criteria: {
                            type: "object",
                            description: "Filter criteria as key-value pairs",
                            required: true,
                        },
                        groups: {
                            type: "array",
                            description: "Filter by group membership",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Node[]",
                        description: "Array of matching nodes",
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
        const complete = this.performanceMonitor.startTimer("ssh:v1:initialization");
        try {
            this.logger.info("Initializing SSHPlugin", {
                component: "SSHPlugin",
                operation: "initialize",
            });
            // Verify SSH config is accessible
            await this.sshService.getInventory();
            this._initialized = true;
            this.logger.info("SSHPlugin initialized successfully", {
                component: "SSHPlugin",
                operation: "initialize",
                metadata: {
                    sshConfigPath: this.sshService.getSSHConfigPath(),
                    capabilitiesCount: this.capabilities.length,
                },
            });
            complete({ success: true });
        }
        catch (error) {
            this.logger.warn("SSHPlugin initialization completed with issues", {
                component: "SSHPlugin",
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
        const complete = this.performanceMonitor.startTimer("ssh:v1:healthCheck");
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
            // Check if SSH command is available
            const { spawn } = await Promise.resolve().then(() => __importStar(require("child_process")));
            const sshCheck = spawn("ssh", ["-V"], { stdio: "pipe" });
            const sshAvailable = await new Promise((resolve) => {
                let resolved = false;
                const handleClose = (code) => {
                    if (!resolved) {
                        resolved = true;
                        resolve(code === 0 || code === 255); // SSH -V returns 255 on some systems
                    }
                };
                const handleError = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve(false);
                    }
                };
                sshCheck.on("close", handleClose);
                sshCheck.on("error", handleError);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        sshCheck.kill();
                        resolve(false);
                    }
                }, 5000);
            });
            if (!sshAvailable) {
                complete({ available: false });
                return {
                    healthy: false,
                    message: "SSH command is not available. Please install OpenSSH client.",
                    lastCheck: now,
                    details: {
                        error: "ssh command not found",
                        sshConfigPath: this.sshService.getSSHConfigPath(),
                    },
                };
            }
            // Try to load inventory
            const inventory = await this.sshService.getInventory();
            complete({ available: true, nodeCount: inventory.length });
            return {
                healthy: true,
                message: `SSH is healthy. ${inventory.length} nodes in SSH config.`,
                lastCheck: now,
                details: {
                    nodeCount: inventory.length,
                    sshConfigPath: this.sshService.getSSHConfigPath(),
                    capabilities: this.capabilities.map((c) => c.name),
                },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            complete({ error: errorMessage });
            return {
                healthy: false,
                message: `SSH health check failed: ${errorMessage}`,
                lastCheck: now,
                details: {
                    error: errorMessage,
                    sshConfigPath: this.sshService.getSSHConfigPath(),
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
            sshConfigPath: this.sshService.getSSHConfigPath(),
            defaultTimeout: this.sshService.getDefaultTimeout(),
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
        this.logger.info("SSHPlugin shutting down", {
            component: "SSHPlugin",
            operation: "shutdown",
        });
        this._initialized = false;
    }
    /**
     * Get lightweight summary for home page tiles
     * Must return in under 500ms with minimal data (counts, status only)
     */
    async getSummary() {
        const complete = this.performanceMonitor.startTimer("ssh:v1:getSummary");
        const startTime = Date.now();
        try {
            this.logger.debug("Getting plugin summary", {
                component: "SSHPlugin",
                operation: "getSummary",
            });
            // Check if plugin is initialized
            if (!this._initialized) {
                complete({ healthy: false, duration: Date.now() - startTime });
                return {
                    pluginName: "ssh",
                    displayName: "SSH",
                    metrics: {},
                    healthy: false,
                    lastUpdate: new Date().toISOString(),
                    error: "Plugin not initialized",
                };
            }
            // Get health status first
            const healthStatus = await this.healthCheck();
            // If unhealthy, return minimal summary
            if (!healthStatus.healthy) {
                complete({ healthy: false, duration: Date.now() - startTime });
                return {
                    pluginName: "ssh",
                    displayName: "SSH",
                    metrics: {
                        connectionCount: 0,
                        activeSessions: 0,
                    },
                    healthy: false,
                    lastUpdate: new Date().toISOString(),
                    error: healthStatus.message || "SSH is unhealthy",
                };
            }
            // Fetch lightweight data - just count nodes from SSH config
            const nodes = await this.sshService.getInventory();
            const connectionCount = nodes.length;
            // Get groups count
            const groupsSet = new Set();
            for (const node of nodes) {
                if (node.config.groups && Array.isArray(node.config.groups)) {
                    for (const group of node.config.groups) {
                        groupsSet.add(group);
                    }
                }
            }
            const groupCount = groupsSet.size;
            const duration = Date.now() - startTime;
            // Log warning if exceeds target time
            if (duration > 500) {
                this.logger.warn("getSummary exceeded target response time", {
                    component: "SSHPlugin",
                    operation: "getSummary",
                    metadata: { durationMs: duration },
                });
            }
            complete({ healthy: true, duration, connectionCount });
            return {
                pluginName: "ssh",
                displayName: "SSH",
                metrics: {
                    connectionCount,
                    groupCount,
                    activeSessions: 0, // SSH doesn't track active sessions in this implementation
                    sshConfigPath: this.sshService.getSSHConfigPath(),
                },
                healthy: true,
                lastUpdate: new Date().toISOString(),
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error("Failed to get plugin summary", {
                component: "SSHPlugin",
                operation: "getSummary",
                metadata: { error: errorMessage, duration },
            });
            complete({ error: errorMessage, duration });
            return {
                pluginName: "ssh",
                displayName: "SSH",
                metrics: {},
                healthy: false,
                lastUpdate: new Date().toISOString(),
                error: errorMessage,
            };
        }
    }
    // =========================================================================
    // Standardized Capability Interface Methods
    // =========================================================================
    /**
     * Execute shell command on target nodes via SSH
     * Implements RemoteExecutionCapability.commandExecute
     */
    async commandExecute(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:commandExecute");
        const executionId = `ssh-cmd-${Date.now()}`;
        try {
            this.logger.info("Executing command via SSH (standardized interface)", {
                component: "SSHPlugin",
                operation: "commandExecute",
                metadata: {
                    executionId,
                    command: params.command,
                    targets: params.targets,
                    async: params.async,
                    debugMode: params.debugMode,
                },
            });
            // For now, execute on first target (multi-target support would require ExecutionQueue integration)
            const target = params.targets[0];
            // Extract streaming callback from environment if present
            const streamingCallback = params.environment?.streamingCallback;
            const result = await this.sshService.runCommand(target, params.command, streamingCallback);
            // Set debug mode flag if requested
            if (params.debugMode) {
                result.expertMode = true;
            }
            complete({ status: result.status, targets: params.targets.length });
            return result;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Execute script on target nodes via SSH
     * Implements RemoteExecutionCapability.scriptExecute
     */
    async scriptExecute(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:scriptExecute");
        try {
            this.logger.info("Executing script via SSH (standardized interface)", {
                component: "SSHPlugin",
                operation: "scriptExecute",
                metadata: {
                    scriptType: params.scriptType,
                    targets: params.targets,
                    hasArguments: !!params.arguments,
                    async: params.async,
                    debugMode: params.debugMode,
                },
            });
            // Build the command based on script type
            let command = params.script;
            if (params.scriptType === "bash") {
                command = `bash -c '${params.script.replace(/'/g, "'\\''")}'`;
            }
            else if (params.scriptType === "python") {
                command = `python -c '${params.script.replace(/'/g, "'\\''")}'`;
            }
            else if (params.scriptType === "ruby") {
                command = `ruby -e '${params.script.replace(/'/g, "'\\''")}'`;
            }
            // Add arguments if provided
            if (params.arguments && params.arguments.length > 0) {
                command += " " + params.arguments.join(" ");
            }
            // Execute as command
            const target = params.targets[0];
            const streamingCallback = params.environment?.streamingCallback;
            const result = await this.sshService.runCommand(target, command, streamingCallback);
            // Set debug mode flag if requested
            if (params.debugMode) {
                result.expertMode = true;
            }
            complete({ status: result.status, targets: params.targets.length, scriptType: params.scriptType });
            return result;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Stream output from an execution
     * Implements RemoteExecutionCapability.streamOutput
     *
     * Note: SSH executions are synchronous, so streaming happens during execution.
     * This method is a placeholder for future async execution support.
     */
    async streamOutput(executionId, callback) {
        this.logger.debug("Stream output requested (not yet implemented for SSH)", {
            component: "SSHPlugin",
            operation: "streamOutput",
            metadata: { executionId },
        });
        // For SSH, streaming happens during execution via StreamingCallback
        // This method would be used with ExecutionQueue for async executions
        throw new Error("Stream output not yet implemented for SSH - use streaming callback during execution");
    }
    /**
     * Cancel an in-progress execution
     * Implements RemoteExecutionCapability.cancelExecution
     *
     * Note: SSH executions are synchronous and cannot be cancelled mid-execution.
     * This method is a placeholder for future async execution support.
     */
    async cancelExecution(executionId) {
        this.logger.debug("Cancel execution requested (not yet implemented for SSH)", {
            component: "SSHPlugin",
            operation: "cancelExecution",
            metadata: { executionId },
        });
        // For SSH, executions are synchronous and cannot be cancelled
        // This would require ExecutionQueue integration for async executions
        return false;
    }
    /**
     * List all nodes from SSH config
     * Implements InventoryCapability.inventoryList
     */
    async inventoryList(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryList");
        try {
            this.logger.debug("Listing inventory from SSH config (standardized interface)", {
                component: "SSHPlugin",
                operation: "inventoryList",
                metadata: { refresh: params.refresh, groups: params.groups },
            });
            let nodes = await this.sshService.getInventory();
            // Filter by groups if specified
            if (params.groups && params.groups.length > 0) {
                nodes = nodes.filter(node => node.config.groups &&
                    Array.isArray(node.config.groups) &&
                    params.groups.some(g => node.config.groups.includes(g)));
            }
            complete({ nodeCount: nodes.length, filtered: !!params.groups });
            return nodes;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Get specific node details from SSH config
     * Implements InventoryCapability.inventoryGet
     */
    async inventoryGet(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryGet");
        try {
            this.logger.debug("Getting node details from SSH config (standardized interface)", {
                component: "SSHPlugin",
                operation: "inventoryGet",
                metadata: { nodeId: params.nodeId },
            });
            const nodes = await this.sshService.getInventory();
            const node = nodes.find(n => n.id === params.nodeId || n.name === params.nodeId);
            complete({ nodeId: params.nodeId, found: !!node });
            return node ?? null;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * List available groups from SSH config
     * Implements InventoryCapability.inventoryGroups
     */
    async inventoryGroups(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryGroups");
        try {
            this.logger.debug("Listing inventory groups from SSH config (standardized interface)", {
                component: "SSHPlugin",
                operation: "inventoryGroups",
                metadata: { refresh: params.refresh },
            });
            const nodes = await this.sshService.getInventory();
            const groupsSet = new Set();
            // Extract groups from node configs
            for (const node of nodes) {
                if (node.config.groups && Array.isArray(node.config.groups)) {
                    for (const group of node.config.groups) {
                        groupsSet.add(group);
                    }
                }
            }
            const groups = Array.from(groupsSet).sort();
            complete({ groupCount: groups.length });
            return groups;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    /**
     * Filter nodes by criteria
     * Implements InventoryCapability.inventoryFilter
     */
    async inventoryFilter(params) {
        const complete = this.performanceMonitor.startTimer("ssh:v1:inventoryFilter");
        try {
            this.logger.debug("Filtering inventory from SSH config (standardized interface)", {
                component: "SSHPlugin",
                operation: "inventoryFilter",
                metadata: { criteria: params.criteria, groups: params.groups },
            });
            let nodes = await this.sshService.getInventory();
            // Filter by groups first if specified
            if (params.groups && params.groups.length > 0) {
                nodes = nodes.filter(node => node.config.groups &&
                    Array.isArray(node.config.groups) &&
                    params.groups.some(g => node.config.groups.includes(g)));
            }
            // Filter by criteria
            nodes = nodes.filter(node => {
                for (const [key, value] of Object.entries(params.criteria)) {
                    // Check in node config
                    if (node.config[key] !== value) {
                        // Also check nested paths (e.g., "transport" or "config.user")
                        const parts = key.split(".");
                        let current = node;
                        for (const part of parts) {
                            if (current && typeof current === "object" && part in current) {
                                current = current[part];
                            }
                            else {
                                return false;
                            }
                        }
                        if (current !== value) {
                            return false;
                        }
                    }
                }
                return true;
            });
            complete({ matchCount: nodes.length, criteriaCount: Object.keys(params.criteria).length });
            return nodes;
        }
        catch (error) {
            complete({ error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
}
exports.SSHPlugin = SSHPlugin;
//# sourceMappingURL=SSHPlugin.js.map
