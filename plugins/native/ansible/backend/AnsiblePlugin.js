"use strict";
/**
 * AnsiblePlugin - Ansible integration for Pabawi
 *
 * Provides remote execution and inventory management capabilities using Ansible.
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
const AnsibleService_1 = require("./services/AnsibleService");
/**
 * AnsiblePlugin class
 *
 * Implements:
 * - BasePluginInterface for plugin lifecycle
 * - InventoryCapability for inventory management
 * - RemoteExecutionCapability for command/playbook execution
 */
class AnsiblePlugin {
    metadata = {
        name: "ansible",
        version: "1.0.0",
        description: "Ansible integration for remote execution and inventory management",
        integrationType: "RemoteExecution",
        capabilities: [
            "command.execute",
            "task.execute",
            "script.execute",
            "inventory.list",
            "inventory.get",
            "inventory.groups",
            "inventory.filter",
        ],
    };
    capabilities = [
        {
            name: "command.execute",
            category: "command",
            description: "Execute shell commands on target nodes via Ansible",
            riskLevel: "execute",
            requiredPermissions: ["ansible.command.execute"],
        },
        {
            name: "task.execute",
            category: "task",
            description: "Execute Ansible tasks on target nodes",
            riskLevel: "execute",
            requiredPermissions: ["ansible.task.execute"],
        },
        {
            name: "script.execute",
            category: "command",
            description: "Execute scripts on target nodes via Ansible",
            riskLevel: "execute",
            requiredPermissions: ["ansible.command.execute"],
        },
        {
            name: "inventory.list",
            category: "inventory",
            description: "List all nodes from Ansible inventory",
            riskLevel: "read",
            requiredPermissions: ["ansible.inventory.list"],
        },
        {
            name: "inventory.get",
            category: "inventory",
            description: "Get specific node details from Ansible inventory",
            riskLevel: "read",
            requiredPermissions: ["ansible.inventory.list"],
        },
        {
            name: "inventory.groups",
            category: "inventory",
            description: "List available groups from Ansible inventory",
            riskLevel: "read",
            requiredPermissions: ["ansible.inventory.list"],
        },
        {
            name: "inventory.filter",
            category: "inventory",
            description: "Filter nodes by criteria",
            riskLevel: "read",
            requiredPermissions: ["ansible.inventory.list"],
        },
    ];
    config;
    logger;
    performanceMonitor;
    ansibleService;
    initialized = false;
    inventoryCache = null;
    inventoryCacheExpiry = 0;
    CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    constructor(config, logger, performanceMonitor) {
        this.config = {
            inventoryPath: config.inventoryPath || "/etc/ansible/hosts",
            playbookPath: config.playbookPath || "/etc/ansible/playbooks",
            defaultTimeout: config.defaultTimeout || 300000,
            ansibleConfig: config.ansibleConfig,
        };
        this.logger = logger;
        this.performanceMonitor = performanceMonitor;
        this.ansibleService = new AnsibleService_1.AnsibleService(this.config, this.logger);
    }
    /**
     * Initialize the plugin
     */
    async initialize() {
        const endTimer = this.performanceMonitor.startTimer("ansible.initialize");
        try {
            this.logger.info("Initializing Ansible plugin", {
                inventoryPath: this.config.inventoryPath,
                playbookPath: this.config.playbookPath,
            });
            // Verify Ansible is installed
            const { exec } = await Promise.resolve().then(() => __importStar(require("child_process")));
            const { promisify } = await Promise.resolve().then(() => __importStar(require("util")));
            const execAsync = promisify(exec);
            try {
                const { stdout } = await execAsync("ansible --version");
                this.logger.info("Ansible version detected", {
                    version: stdout.split("\n")[0],
                });
            }
            catch (error) {
                throw new Error("Ansible is not installed or not accessible in PATH");
            }
            // Verify inventory path exists
            const fs = await Promise.resolve().then(() => __importStar(require("fs")));
            if (!fs.existsSync(this.config.inventoryPath)) {
                this.logger.warn("Inventory path does not exist", {
                    inventoryPath: this.config.inventoryPath,
                });
            }
            this.initialized = true;
            this.logger.info("Ansible plugin initialized successfully");
            endTimer({ success: true });
        }
        catch (error) {
            this.logger.error("Failed to initialize Ansible plugin", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (!this.initialized) {
                return {
                    healthy: false,
                    message: "Plugin not initialized",
                    timestamp: new Date().toISOString(),
                };
            }
            // Check if Ansible is accessible
            const { exec } = await Promise.resolve().then(() => __importStar(require("child_process")));
            const { promisify } = await Promise.resolve().then(() => __importStar(require("util")));
            const execAsync = promisify(exec);
            await execAsync("ansible --version");
            return {
                healthy: true,
                message: "Ansible is accessible and operational",
                details: {
                    inventoryPath: this.config.inventoryPath,
                    playbookPath: this.config.playbookPath,
                },
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                healthy: false,
                message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString(),
            };
        }
    }
    getConfig() {
        return { ...this.config };
    }
    isInitialized() {
        return this.initialized;
    }
    async shutdown() {
        this.logger.info("Shutting down Ansible plugin");
        this.initialized = false;
        this.inventoryCache = null;
    }
    // ==========================================================================
    // Inventory Capability Implementation
    // ==========================================================================
    /**
     * List all nodes from Ansible inventory
     */
    async inventoryList(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.inventory.list");
        try {
            this.logger.debug("Listing inventory", params);
            // Check cache
            if (!params.refresh &&
                this.inventoryCache &&
                Date.now() < this.inventoryCacheExpiry) {
                this.logger.debug("Returning cached inventory");
                let nodes = this.inventoryCache;
                // Filter by groups if specified
                if (params.groups && params.groups.length > 0) {
                    nodes = nodes.filter((node) => node.groups?.some((g) => params.groups?.includes(g)));
                }
                endTimer({ cached: true, count: nodes.length });
                return nodes;
            }
            // Fetch from Ansible
            const nodes = await this.ansibleService.getInventory();
            // Update cache
            this.inventoryCache = nodes;
            this.inventoryCacheExpiry = Date.now() + this.CACHE_TTL;
            // Filter by groups if specified
            let filteredNodes = nodes;
            if (params.groups && params.groups.length > 0) {
                filteredNodes = nodes.filter((node) => node.groups?.some((g) => params.groups?.includes(g)));
            }
            endTimer({ cached: false, count: filteredNodes.length });
            return filteredNodes;
        }
        catch (error) {
            this.logger.error("Failed to list inventory", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Get specific node details
     */
    async inventoryGet(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.inventory.get");
        try {
            this.logger.debug("Getting node details", params);
            const nodes = await this.inventoryList({ refresh: false });
            const node = nodes.find((n) => n.id === params.nodeId) || null;
            endTimer({ found: node !== null });
            return node;
        }
        catch (error) {
            this.logger.error("Failed to get node", {
                nodeId: params.nodeId,
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * List available groups
     */
    async inventoryGroups(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.inventory.groups");
        try {
            this.logger.debug("Listing groups", params);
            const nodes = await this.inventoryList({ refresh: params.refresh });
            const groupsSet = new Set();
            for (const node of nodes) {
                if (node.groups) {
                    for (const group of node.groups) {
                        groupsSet.add(group);
                    }
                }
            }
            const groups = Array.from(groupsSet).sort();
            endTimer({ count: groups.length });
            return groups;
        }
        catch (error) {
            this.logger.error("Failed to list groups", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Filter nodes by criteria
     */
    async inventoryFilter(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.inventory.filter");
        try {
            this.logger.debug("Filtering inventory", params);
            let nodes = await this.inventoryList({ groups: params.groups });
            // Apply additional criteria filters
            if (params.criteria && Object.keys(params.criteria).length > 0) {
                nodes = nodes.filter((node) => {
                    for (const [key, value] of Object.entries(params.criteria)) {
                        const nodeValue = node.metadata?.[key];
                        if (nodeValue !== value) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            endTimer({ count: nodes.length });
            return nodes;
        }
        catch (error) {
            this.logger.error("Failed to filter inventory", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    // ==========================================================================
    // Remote Execution Capability Implementation
    // ==========================================================================
    /**
     * Execute shell command on target nodes
     */
    async commandExecute(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.command.execute");
        try {
            this.logger.info("Executing command", {
                command: params.command,
                targets: params.targets,
            });
            // For simplicity, execute on first target
            // In production, this should handle multiple targets
            const target = params.targets[0];
            const streamingCallback = params.debugMode
                ? (chunk) => {
                    this.logger.debug("Command output", chunk);
                }
                : undefined;
            const result = await this.ansibleService.runCommand(target, params.command, streamingCallback);
            endTimer({ status: result.status });
            return result;
        }
        catch (error) {
            this.logger.error("Command execution failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Execute Ansible playbook on target nodes
     */
    async taskExecute(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.task.execute");
        try {
            this.logger.info("Executing playbook", {
                taskName: params.taskName,
                targets: params.targets,
                parameters: params.parameters,
            });
            // For simplicity, execute on first target
            const target = params.targets[0];
            const streamingCallback = params.debugMode
                ? (chunk) => {
                    this.logger.debug("Playbook output", chunk);
                }
                : undefined;
            const result = await this.ansibleService.runPlaybook(target, params.taskName, params.parameters, streamingCallback);
            endTimer({ status: result.status });
            return result;
        }
        catch (error) {
            this.logger.error("Playbook execution failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Execute script on target nodes
     */
    async scriptExecute(params) {
        const endTimer = this.performanceMonitor.startTimer("ansible.script.execute");
        try {
            this.logger.info("Executing script", {
                script: params.script,
                targets: params.targets,
                scriptType: params.scriptType,
            });
            // Use Ansible script module or shell module depending on script type
            const target = params.targets[0];
            const command = params.script;
            const streamingCallback = params.debugMode
                ? (chunk) => {
                    this.logger.debug("Script output", chunk);
                }
                : undefined;
            const result = await this.ansibleService.runCommand(target, command, streamingCallback);
            endTimer({ status: result.status });
            return result;
        }
        catch (error) {
            this.logger.error("Script execution failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            throw error;
        }
    }
    /**
     * Stream output from an execution
     */
    async streamOutput(executionId, callback) {
        this.logger.debug("Stream output requested", { executionId });
        // Streaming is handled inline during execution
        // This method is a placeholder for the interface
    }
    /**
     * Cancel an in-progress execution
     */
    async cancelExecution(executionId) {
        this.logger.warn("Cancel execution not implemented", { executionId });
        return false;
    }
    /**
     * Get the Ansible service instance (for testing)
     */
    getAnsibleService() {
        return this.ansibleService;
    }
    /**
     * Get lightweight summary for home page tile
     * Must return in under 500ms with minimal data (counts, status only)
     */
    async getSummary() {
        const endTimer = this.performanceMonitor.startTimer("ansible.getSummary");
        const startTime = Date.now();
        try {
            this.logger.debug("Getting Ansible summary");
            // Check if plugin is initialized
            if (!this.initialized) {
                endTimer({ healthy: false, duration: Date.now() - startTime });
                return {
                    pluginName: "ansible",
                    displayName: "Ansible",
                    metrics: {
                        nodeCount: 0,
                        playbookCount: 0,
                        recentRuns: 0,
                    },
                    healthy: false,
                    lastUpdate: new Date().toISOString(),
                    error: "Plugin not initialized",
                };
            }
            // Get health status
            const healthStatus = await this.healthCheck();
            // Fetch lightweight summary data in parallel
            const [inventoryResult, playbooksResult] = await Promise.allSettled([
                this.inventoryList({ refresh: false }),
                this.ansibleService.listPlaybooks(),
            ]);
            const nodeCount = inventoryResult.status === "fulfilled" ? inventoryResult.value.length : 0;
            const playbookCount = playbooksResult.status === "fulfilled" ? playbooksResult.value.length : 0;
            const duration = Date.now() - startTime;
            endTimer({ healthy: healthStatus.healthy, duration });
            return {
                pluginName: "ansible",
                displayName: "Ansible",
                metrics: {
                    nodeCount,
                    playbookCount,
                    recentRuns: 0, // TODO: Track execution history
                },
                healthy: healthStatus.healthy,
                lastUpdate: new Date().toISOString(),
                error: healthStatus.healthy ? undefined : healthStatus.message,
            };
        }
        catch (error) {
            this.logger.error("Failed to get Ansible summary", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            return {
                pluginName: "ansible",
                displayName: "Ansible",
                metrics: {
                    nodeCount: 0,
                    playbookCount: 0,
                    recentRuns: 0,
                },
                healthy: false,
                lastUpdate: new Date().toISOString(),
                error: error instanceof Error ? error.message : "Failed to get summary",
            };
        }
    }
    /**
     * Get full plugin data for plugin home page
     * Called on-demand when navigating to plugin page
     */
    async getData() {
        const endTimer = this.performanceMonitor.startTimer("ansible.getData");
        const startTime = Date.now();
        try {
            this.logger.debug("Getting full Ansible plugin data");
            // Check if plugin is initialized
            if (!this.initialized) {
                endTimer({ healthy: false, duration: Date.now() - startTime });
                return {
                    pluginName: "ansible",
                    displayName: "Ansible",
                    data: null,
                    healthy: false,
                    lastUpdate: new Date().toISOString(),
                    capabilities: [],
                    error: "Plugin not initialized",
                };
            }
            // Get health status
            const healthStatus = await this.healthCheck();
            // Fetch full data in parallel
            const [inventory, playbooks, groups, config] = await Promise.allSettled([
                this.inventoryList({ refresh: false }),
                this.ansibleService.listPlaybooks(),
                this.inventoryGroups({ refresh: false }),
                Promise.resolve(this.getConfig()),
            ]);
            const inventoryData = inventory.status === "fulfilled" ? inventory.value : [];
            const playbooksData = playbooks.status === "fulfilled" ? playbooks.value : [];
            const groupsData = groups.status === "fulfilled" ? groups.value : [];
            const configData = config.status === "fulfilled" ? config.value : {};
            const duration = Date.now() - startTime;
            endTimer({ healthy: healthStatus.healthy, duration });
            return {
                pluginName: "ansible",
                displayName: "Ansible",
                data: {
                    inventory: inventoryData,
                    playbooks: playbooksData,
                    groups: groupsData,
                    config: configData,
                    health: healthStatus,
                },
                healthy: healthStatus.healthy,
                lastUpdate: new Date().toISOString(),
                capabilities: this.metadata.capabilities,
                error: healthStatus.healthy ? undefined : healthStatus.message,
            };
        }
        catch (error) {
            this.logger.error("Failed to get Ansible plugin data", {
                error: error instanceof Error ? error.message : String(error),
            });
            endTimer({ success: false, error: String(error) });
            return {
                pluginName: "ansible",
                displayName: "Ansible",
                data: null,
                healthy: false,
                lastUpdate: new Date().toISOString(),
                capabilities: [],
                error: error instanceof Error ? error.message : "Failed to get plugin data",
            };
        }
    }
}
exports.AnsiblePlugin = AnsiblePlugin;
//# sourceMappingURL=AnsiblePlugin.js.map
