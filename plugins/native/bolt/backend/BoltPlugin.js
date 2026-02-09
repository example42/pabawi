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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoltPlugin = exports.BoltPluginConfigSchema = void 0;
exports.createBoltPlugin = createBoltPlugin;
var zod_1 = require("zod");
// =============================================================================
// Type-only imports - These are resolved at compile time, not runtime
// The actual implementations are injected via constructor
// =============================================================================
/** Integration type enum values (duplicated to avoid runtime import) */
var IntegrationType = {
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
var CommandExecuteSchema = zod_1.z.object({
    command: zod_1.z.string().min(1).describe("Shell command to execute"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s) to execute on"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
});
/**
 * Schema for task execution parameters
 */
var TaskExecuteSchema = zod_1.z.object({
    task: zod_1.z.string().min(1).describe("Name of the Bolt task to execute"),
    targets: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).describe("Target node(s) to execute on"),
    parameters: zod_1.z.record(zod_1.z.unknown()).optional().describe("Task parameters"),
    timeout: zod_1.z.number().optional().describe("Execution timeout in milliseconds"),
});
/**
 * Schema for inventory listing parameters
 */
var InventoryListSchema = zod_1.z.object({
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
});
/**
 * Schema for facts query parameters
 */
var FactsQuerySchema = zod_1.z.object({
    target: zod_1.z.string().min(1).describe("Node to query facts for"),
    refresh: zod_1.z.boolean().optional().default(false).describe("Force refresh from source"),
});
/**
 * Schema for task listing parameters
 */
var TaskListSchema = zod_1.z.object({
    module: zod_1.z.string().optional().describe("Filter by module name"),
});
/**
 * Schema for task details parameters
 */
var TaskDetailsSchema = zod_1.z.object({
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
 *
 * Implements standardized capability interfaces:
 * - InventoryCapability: inventory.list, inventory.get, inventory.groups, inventory.filter
 * - FactsCapability: info.facts, info.refresh
 * - RemoteExecutionCapability: command.execute, task.execute, script.execute
 */
var BoltPlugin = /** @class */ (function () {
    // =========================================================================
    // Constructor
    // =========================================================================
    function BoltPlugin(boltService, logger, performanceMonitor) {
        // =========================================================================
        // Plugin Metadata
        // =========================================================================
        this.metadata = {
            name: "bolt",
            version: "1.0.0",
            author: "Pabawi Team",
            description: "Puppet Bolt integration for remote command and task execution",
            integrationType: IntegrationType.RemoteExecution,
            integrationTypes: [IntegrationType.RemoteExecution, IntegrationType.InventorySource, IntegrationType.Info],
            homepage: "https://puppet.com/docs/bolt/latest/bolt.html",
            color: "#FFAE1A", // Puppet/Bolt orange
            icon: "terminal",
            tags: ["bolt", "puppet", "remote-execution", "commands", "tasks"],
            minPabawiVersion: "1.0.0",
        };
        // =========================================================================
        // Widgets
        // =========================================================================
        this.widgets = [
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
        this.cliCommands = [
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
        this.configSchema = exports.BoltPluginConfigSchema;
        this.defaultPermissions = {
            "bolt.command.execute": ["admin", "operator"],
            "bolt.task.execute": ["admin", "operator"],
            "bolt.inventory.list": ["admin", "operator", "viewer"],
            "bolt.facts.query": ["admin", "operator", "viewer"],
            "bolt.task.list": ["admin", "operator", "viewer"],
            "bolt.task.details": ["admin", "operator", "viewer"],
        };
        this.config = {};
        this._initialized = false;
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
    BoltPlugin.prototype.createCapabilities = function () {
        var _this = this;
        return [
            // Command Execution (legacy handler)
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
            // Standardized Remote Execution Capabilities (Phase 1)
            {
                category: "command",
                name: "command.execute",
                description: "Execute shell command on target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.commandExecute(params)];
                    });
                }); },
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
            // Task Execution (legacy handler)
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
            // Standardized Task Execution (Phase 1)
            {
                category: "task",
                name: "task.execute",
                description: "Execute task or playbook on target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.taskExecute(params)];
                    });
                }); },
                requiredPermissions: ["bolt.task.execute", "task.execute"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        taskName: {
                            type: "string",
                            description: "Task or playbook name",
                            required: true,
                        },
                        targets: {
                            type: "array",
                            description: "Target node identifiers",
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
                        description: "Task execution result with per-node results",
                    },
                },
            },
            // Standardized Script Execution (Phase 1)
            {
                category: "command",
                name: "script.execute",
                description: "Execute script on target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.scriptExecute(params)];
                    });
                }); },
                requiredPermissions: ["bolt.command.execute", "command.execute"],
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
            // Inventory Listing (legacy handler)
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
            // Standardized Inventory Capabilities (Phase 1)
            {
                category: "inventory",
                name: "inventory.list",
                description: "List all nodes from Bolt inventory (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.inventoryList(params)];
                }); }); },
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
                        groups: {
                            type: "array",
                            description: "Filter by group membership",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Node[]",
                        description: "Array of nodes from inventory",
                    },
                },
            },
            {
                category: "inventory",
                name: "inventory.get",
                description: "Get specific node details (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.inventoryGet(params)];
                }); }); },
                requiredPermissions: ["bolt.inventory.list", "inventory.read"],
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
                description: "List available groups (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.inventoryGroups(params)];
                }); }); },
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
                        type: "string[]",
                        description: "Array of group names",
                    },
                },
            },
            {
                category: "inventory",
                name: "inventory.filter",
                description: "Filter nodes by criteria (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.inventoryFilter(params)];
                }); }); },
                requiredPermissions: ["bolt.inventory.list", "inventory.read"],
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
            // Facts Query (legacy handler)
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
            // Standardized Facts Capabilities (Phase 1)
            {
                category: "info",
                name: "info.facts",
                description: "Get facts for a node (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.factsGet(params)];
                }); }); },
                requiredPermissions: ["bolt.facts.query", "facts.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        nodeId: {
                            type: "string",
                            description: "Node identifier",
                            required: true,
                        },
                        providers: {
                            type: "array",
                            description: "Specific fact providers to use",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Facts",
                        description: "Facts object with key-value pairs",
                    },
                },
            },
            {
                category: "info",
                name: "info.refresh",
                description: "Force refresh facts (bypass cache) (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, this.factsRefresh(params)];
                }); }); },
                requiredPermissions: ["bolt.facts.query", "facts.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        nodeId: {
                            type: "string",
                            description: "Node identifier",
                            required: true,
                        },
                        providers: {
                            type: "array",
                            description: "Specific fact providers to refresh",
                            required: false,
                        },
                    },
                    returns: {
                        type: "Facts",
                        description: "Refreshed facts object",
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
            // Package Management
            {
                category: "package",
                name: "package.install",
                description: "Install software packages on target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.packageInstall(params)];
                    });
                }); },
                requiredPermissions: ["bolt.package.manage", "package.write"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        packageName: {
                            type: "string",
                            description: "Package name to install",
                            required: true,
                        },
                        version: {
                            type: "string",
                            description: "Specific version to install",
                            required: false,
                        },
                        targets: {
                            type: "array",
                            description: "Target node identifiers",
                            required: true,
                        },
                        options: {
                            type: "object",
                            description: "Installation options",
                            required: false,
                        },
                        async: {
                            type: "boolean",
                            description: "Execute asynchronously",
                            required: false,
                        },
                    },
                    returns: {
                        type: "PackageOperationResult",
                        description: "Package installation result",
                    },
                },
            },
            {
                category: "package",
                name: "package.uninstall",
                description: "Uninstall software packages from target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.packageUninstall(params)];
                    });
                }); },
                requiredPermissions: ["bolt.package.manage", "package.write"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        packageName: {
                            type: "string",
                            description: "Package name to uninstall",
                            required: true,
                        },
                        targets: {
                            type: "array",
                            description: "Target node identifiers",
                            required: true,
                        },
                        purge: {
                            type: "boolean",
                            description: "Remove configuration files",
                            required: false,
                        },
                        async: {
                            type: "boolean",
                            description: "Execute asynchronously",
                            required: false,
                        },
                    },
                    returns: {
                        type: "PackageOperationResult",
                        description: "Package uninstallation result",
                    },
                },
            },
            {
                category: "package",
                name: "package.update",
                description: "Update software packages on target nodes (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.packageUpdate(params)];
                    });
                }); },
                requiredPermissions: ["bolt.package.manage", "package.write"],
                riskLevel: "execute",
                schema: {
                    arguments: {
                        packageName: {
                            type: "string",
                            description: "Package name to update",
                            required: true,
                        },
                        version: {
                            type: "string",
                            description: "Specific version to update to",
                            required: false,
                        },
                        targets: {
                            type: "array",
                            description: "Target node identifiers",
                            required: true,
                        },
                        async: {
                            type: "boolean",
                            description: "Execute asynchronously",
                            required: false,
                        },
                    },
                    returns: {
                        type: "PackageOperationResult",
                        description: "Package update result",
                    },
                },
            },
            {
                category: "package",
                name: "package.list",
                description: "List installed packages on a node (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.packageList(params)];
                    });
                }); },
                requiredPermissions: ["bolt.package.query", "package.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        nodeId: {
                            type: "string",
                            description: "Node identifier",
                            required: true,
                        },
                        filter: {
                            type: "string",
                            description: "Filter packages by name pattern",
                            required: false,
                        },
                    },
                    returns: {
                        type: "PackageInfo[]",
                        description: "Array of installed packages",
                    },
                },
            },
            {
                category: "package",
                name: "package.search",
                description: "Search available packages (standardized interface)",
                handler: function (params) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        return [2 /*return*/, this.packageSearch(params)];
                    });
                }); },
                requiredPermissions: ["bolt.package.query", "package.read"],
                riskLevel: "read",
                schema: {
                    arguments: {
                        query: {
                            type: "string",
                            description: "Search query",
                            required: true,
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of results",
                            required: false,
                        },
                    },
                    returns: {
                        type: "AvailablePackage[]",
                        description: "Array of available packages",
                    },
                },
            },
        ];
    };
    // =========================================================================
    // Lifecycle Methods
    // =========================================================================
    /**
     * Initialize the plugin
     */
    BoltPlugin.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var complete, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:initialization");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Initializing BoltPlugin", {
                            component: "BoltPlugin",
                            operation: "initialize",
                        });
                        // Verify Bolt is accessible by checking inventory
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        // Verify Bolt is accessible by checking inventory
                        _a.sent();
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
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        this.logger.warn("BoltPlugin initialization completed with issues", {
                            component: "BoltPlugin",
                            operation: "initialize",
                            metadata: {
                                error: error_1 instanceof Error ? error_1.message : String(error_1),
                            },
                        });
                        // Don't throw - allow plugin to start in degraded mode
                        this._initialized = true;
                        complete({ success: false, error: error_1 instanceof Error ? error_1.message : String(error_1) });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Perform health check
     */
    BoltPlugin.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var complete, now, fs, path, childProcess, boltCheck_1, boltAvailable, projectPath, inventoryYaml, inventoryYml, hasInventory, inventory, error_2, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:healthCheck");
                        now = new Date().toISOString();
                        if (!this._initialized) {
                            complete({ healthy: false });
                            return [2 /*return*/, {
                                    healthy: false,
                                    message: "Plugin is not initialized",
                                    lastCheck: now,
                                }];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("fs")); })];
                    case 2:
                        fs = _a.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("path")); })];
                    case 3:
                        path = _a.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("child_process")); })];
                    case 4:
                        childProcess = _a.sent();
                        boltCheck_1 = childProcess.spawn("bolt", ["--version"], { stdio: "pipe" });
                        return [4 /*yield*/, new Promise(function (resolve) {
                                var resolved = false;
                                var handleClose = function (code) {
                                    if (!resolved) {
                                        resolved = true;
                                        resolve(code === 0);
                                    }
                                };
                                var handleError = function () {
                                    if (!resolved) {
                                        resolved = true;
                                        resolve(false);
                                    }
                                };
                                boltCheck_1.on("close", handleClose);
                                boltCheck_1.on("error", handleError);
                                setTimeout(function () {
                                    if (!resolved) {
                                        resolved = true;
                                        boltCheck_1.kill();
                                        resolve(false);
                                    }
                                }, 5000);
                            })];
                    case 5:
                        boltAvailable = _a.sent();
                        if (!boltAvailable) {
                            complete({ available: false });
                            return [2 /*return*/, {
                                    healthy: false,
                                    message: "Bolt command is not available. Please install Puppet Bolt.",
                                    lastCheck: now,
                                    details: {
                                        error: "bolt command not found",
                                        projectPath: this.boltService.getBoltProjectPath(),
                                    },
                                }];
                        }
                        projectPath = this.boltService.getBoltProjectPath();
                        inventoryYaml = path.join(projectPath, "inventory.yaml");
                        inventoryYml = path.join(projectPath, "inventory.yml");
                        hasInventory = fs.existsSync(inventoryYaml) || fs.existsSync(inventoryYml);
                        if (!hasInventory) {
                            complete({ available: true, configured: false });
                            return [2 /*return*/, {
                                    healthy: false,
                                    degraded: true,
                                    message: "Bolt inventory file is missing. Some operations will be limited.",
                                    lastCheck: now,
                                    details: {
                                        projectPath: projectPath,
                                        missingFiles: ["inventory.yaml"],
                                    },
                                }];
                        }
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 6:
                        inventory = _a.sent();
                        complete({ available: true, configured: true, nodeCount: inventory.length });
                        return [2 /*return*/, {
                                healthy: true,
                                message: "Bolt is healthy. ".concat(inventory.length, " nodes in inventory."),
                                lastCheck: now,
                                details: {
                                    nodeCount: inventory.length,
                                    projectPath: projectPath,
                                    capabilities: this.capabilities.map(function (c) { return c.name; }),
                                },
                            }];
                    case 7:
                        error_2 = _a.sent();
                        errorMessage = error_2 instanceof Error ? error_2.message : String(error_2);
                        complete({ error: errorMessage });
                        return [2 /*return*/, {
                                healthy: false,
                                message: "Bolt health check failed: ".concat(errorMessage),
                                lastCheck: now,
                                details: {
                                    error: errorMessage,
                                    projectPath: this.boltService.getBoltProjectPath(),
                                },
                            }];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get current plugin configuration
     */
    BoltPlugin.prototype.getConfig = function () {
        return __assign(__assign({}, this.config), { projectPath: this.boltService.getBoltProjectPath(), defaultTimeout: this.boltService.getDefaultTimeout() });
    };
    /**
     * Check if plugin is initialized
     */
    BoltPlugin.prototype.isInitialized = function () {
        return this._initialized;
    };
    /**
     * Cleanup on shutdown
     */
    BoltPlugin.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.info("BoltPlugin shutting down", {
                    component: "BoltPlugin",
                    operation: "shutdown",
                });
                this._initialized = false;
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get lightweight summary for home page tile
     * Must return in under 500ms with minimal data (counts, status only)
     */
    BoltPlugin.prototype.getSummary = function () {
        return __awaiter(this, void 0, void 0, function () {
            var complete, startTime, now, health, taskCount, inventoryCount, tasks, error_3, inventory, error_4, duration, error_5, duration, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:getSummary");
                        startTime = Date.now();
                        now = new Date().toISOString();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 10, , 11]);
                        this.logger.debug("Getting Bolt summary", {
                            component: "BoltPlugin",
                            operation: "getSummary",
                        });
                        // Check if plugin is initialized
                        if (!this._initialized) {
                            complete({ healthy: false, duration: Date.now() - startTime });
                            return [2 /*return*/, {
                                    pluginName: "bolt",
                                    displayName: "Bolt",
                                    metrics: {},
                                    healthy: false,
                                    lastUpdate: now,
                                    error: "Plugin not initialized",
                                }];
                        }
                        return [4 /*yield*/, this.healthCheck()];
                    case 2:
                        health = _a.sent();
                        taskCount = 0;
                        inventoryCount = 0;
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.boltService.listTasks()];
                    case 4:
                        tasks = _a.sent();
                        taskCount = tasks.length;
                        return [3 /*break*/, 6];
                    case 5:
                        error_3 = _a.sent();
                        this.logger.warn("Failed to get task count for summary", {
                            component: "BoltPlugin",
                            operation: "getSummary",
                            metadata: { error: error_3 instanceof Error ? error_3.message : String(error_3) },
                        });
                        return [3 /*break*/, 6];
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 7:
                        inventory = _a.sent();
                        inventoryCount = inventory.length;
                        return [3 /*break*/, 9];
                    case 8:
                        error_4 = _a.sent();
                        this.logger.warn("Failed to get inventory count for summary", {
                            component: "BoltPlugin",
                            operation: "getSummary",
                            metadata: { error: error_4 instanceof Error ? error_4.message : String(error_4) },
                        });
                        return [3 /*break*/, 9];
                    case 9:
                        duration = Date.now() - startTime;
                        // Log warning if exceeds target time
                        if (duration > 500) {
                            this.logger.warn("getSummary exceeded target response time", {
                                component: "BoltPlugin",
                                operation: "getSummary",
                                metadata: { durationMs: duration, targetMs: 500 },
                            });
                        }
                        complete({ healthy: health.healthy, duration: duration, taskCount: taskCount, inventoryCount: inventoryCount });
                        return [2 /*return*/, {
                                pluginName: "bolt",
                                displayName: "Bolt",
                                metrics: {
                                    taskCount: taskCount,
                                    inventoryCount: inventoryCount,
                                    boltVersion: health.healthy ? "available" : "unknown",
                                },
                                healthy: health.healthy,
                                lastUpdate: now,
                            }];
                    case 10:
                        error_5 = _a.sent();
                        duration = Date.now() - startTime;
                        errorMessage = error_5 instanceof Error ? error_5.message : String(error_5);
                        this.logger.error("Failed to get Bolt summary", {
                            component: "BoltPlugin",
                            operation: "getSummary",
                            metadata: { error: errorMessage, durationMs: duration },
                        });
                        complete({ healthy: false, error: errorMessage });
                        return [2 /*return*/, {
                                pluginName: "bolt",
                                displayName: "Bolt",
                                metrics: {},
                                healthy: false,
                                lastUpdate: now,
                                error: errorMessage,
                            }];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get full plugin data for plugin home page
     * Called on-demand when navigating to plugin page
     */
    BoltPlugin.prototype.getData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var complete, startTime, healthStatus, _a, inventory, tasks, config, inventoryData, tasksData, configData, duration, error_6, errorMessage, duration;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:getData");
                        startTime = Date.now();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        this.logger.debug("Getting full plugin data", {
                            component: "BoltPlugin",
                            operation: "getData",
                        });
                        // Check if plugin is initialized
                        if (!this._initialized) {
                            complete({ healthy: false, duration: Date.now() - startTime });
                            return [2 /*return*/, {
                                    pluginName: "bolt",
                                    displayName: "Bolt",
                                    data: null,
                                    healthy: false,
                                    lastUpdate: new Date().toISOString(),
                                    capabilities: [],
                                    error: "Plugin not initialized",
                                }];
                        }
                        return [4 /*yield*/, this.healthCheck()];
                    case 2:
                        healthStatus = _b.sent();
                        return [4 /*yield*/, Promise.allSettled([
                                this.boltService.getInventory(),
                                this.boltService.listTasks(),
                                Promise.resolve(this.getConfig()),
                            ])];
                    case 3:
                        _a = _b.sent(), inventory = _a[0], tasks = _a[1], config = _a[2];
                        inventoryData = inventory.status === "fulfilled" ? inventory.value : [];
                        tasksData = tasks.status === "fulfilled" ? tasks.value : [];
                        configData = config.status === "fulfilled" ? config.value : {};
                        duration = Date.now() - startTime;
                        complete({ healthy: healthStatus.healthy, duration: duration });
                        return [2 /*return*/, {
                                pluginName: "bolt",
                                displayName: "Bolt",
                                data: {
                                    inventory: inventoryData,
                                    tasks: tasksData,
                                    config: configData,
                                    health: healthStatus,
                                },
                                healthy: healthStatus.healthy,
                                lastUpdate: new Date().toISOString(),
                                capabilities: this.capabilities.map(function (c) { return c.name; }),
                                error: healthStatus.healthy ? undefined : healthStatus.message,
                            }];
                    case 4:
                        error_6 = _b.sent();
                        errorMessage = error_6 instanceof Error ? error_6.message : String(error_6);
                        duration = Date.now() - startTime;
                        complete({ error: errorMessage, duration: duration });
                        this.logger.error("Failed to get full plugin data", {
                            component: "BoltPlugin",
                            operation: "getData",
                            metadata: { duration: duration },
                        }, error_6 instanceof Error ? error_6 : undefined);
                        return [2 /*return*/, {
                                pluginName: "bolt",
                                displayName: "Bolt",
                                data: null,
                                healthy: false,
                                lastUpdate: new Date().toISOString(),
                                capabilities: [],
                                error: errorMessage,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // =========================================================================
    // Capability Handlers
    // =========================================================================
    /**
     * Execute a command on target nodes
     */
    BoltPlugin.prototype.executeCommand = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated, target, streamingCallback, result, error_7;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:executeCommand");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        validated = CommandExecuteSchema.parse(params);
                        target = Array.isArray(validated.targets)
                            ? validated.targets[0]
                            : validated.targets;
                        this.logger.info("Executing command", {
                            component: "BoltPlugin",
                            operation: "executeCommand",
                            metadata: {
                                command: validated.command,
                                target: target,
                                correlationId: context.correlationId,
                                userId: (_a = context.user) === null || _a === void 0 ? void 0 : _a.id,
                            },
                        });
                        streamingCallback = (_b = context.metadata) === null || _b === void 0 ? void 0 : _b.streamingCallback;
                        return [4 /*yield*/, this.boltService.runCommand(target, validated.command, streamingCallback)];
                    case 2:
                        result = _c.sent();
                        complete({ status: result.status, target: target });
                        return [2 /*return*/, result];
                    case 3:
                        error_7 = _c.sent();
                        complete({ error: error_7 instanceof Error ? error_7.message : String(error_7) });
                        throw error_7;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute a task on target nodes
     */
    BoltPlugin.prototype.executeTask = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated, target, streamingCallback, result, error_8;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:executeTask");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        validated = TaskExecuteSchema.parse(params);
                        target = Array.isArray(validated.targets)
                            ? validated.targets[0]
                            : validated.targets;
                        this.logger.info("Executing task", {
                            component: "BoltPlugin",
                            operation: "executeTask",
                            metadata: {
                                task: validated.task,
                                target: target,
                                hasParameters: !!validated.parameters,
                                correlationId: context.correlationId,
                                userId: (_a = context.user) === null || _a === void 0 ? void 0 : _a.id,
                            },
                        });
                        streamingCallback = (_b = context.metadata) === null || _b === void 0 ? void 0 : _b.streamingCallback;
                        return [4 /*yield*/, this.boltService.runTask(target, validated.task, validated.parameters, streamingCallback)];
                    case 2:
                        result = _c.sent();
                        complete({ status: result.status, target: target, task: validated.task });
                        return [2 /*return*/, result];
                    case 3:
                        error_8 = _c.sent();
                        complete({ error: error_8 instanceof Error ? error_8.message : String(error_8) });
                        throw error_8;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List nodes from inventory
     */
    BoltPlugin.prototype.listInventory = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated, nodes, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:listInventory");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        validated = InventoryListSchema.parse(params);
                        this.logger.debug("Listing inventory", {
                            component: "BoltPlugin",
                            operation: "listInventory",
                            metadata: {
                                refresh: validated.refresh,
                                correlationId: context.correlationId,
                            },
                        });
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        nodes = _a.sent();
                        complete({ nodeCount: nodes.length });
                        return [2 /*return*/, nodes];
                    case 3:
                        error_9 = _a.sent();
                        complete({ error: error_9 instanceof Error ? error_9.message : String(error_9) });
                        throw error_9;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Query facts for a node
     */
    BoltPlugin.prototype.queryFacts = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated, facts, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:queryFacts");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        validated = FactsQuerySchema.parse(params);
                        this.logger.debug("Querying facts", {
                            component: "BoltPlugin",
                            operation: "queryFacts",
                            metadata: {
                                target: validated.target,
                                refresh: validated.refresh,
                                correlationId: context.correlationId,
                            },
                        });
                        return [4 /*yield*/, this.boltService.gatherFacts(validated.target)];
                    case 2:
                        facts = _a.sent();
                        complete({ target: validated.target });
                        return [2 /*return*/, facts];
                    case 3:
                        error_10 = _a.sent();
                        complete({ error: error_10 instanceof Error ? error_10.message : String(error_10) });
                        throw error_10;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List available tasks
     */
    BoltPlugin.prototype.listTasks = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated_1, tasks, filteredTasks, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:listTasks");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        validated_1 = TaskListSchema.parse(params);
                        this.logger.debug("Listing tasks", {
                            component: "BoltPlugin",
                            operation: "listTasks",
                            metadata: {
                                module: validated_1.module,
                                correlationId: context.correlationId,
                            },
                        });
                        return [4 /*yield*/, this.boltService.listTasks()];
                    case 2:
                        tasks = _a.sent();
                        filteredTasks = validated_1.module
                            ? tasks.filter(function (t) { return t.module === validated_1.module; })
                            : tasks;
                        complete({ taskCount: filteredTasks.length, module: validated_1.module });
                        return [2 /*return*/, filteredTasks];
                    case 3:
                        error_11 = _a.sent();
                        complete({ error: error_11 instanceof Error ? error_11.message : String(error_11) });
                        throw error_11;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get task details
     */
    BoltPlugin.prototype.getTaskDetails = function (params, context) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, validated, task, error_12;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:getTaskDetails");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        validated = TaskDetailsSchema.parse(params);
                        this.logger.debug("Getting task details", {
                            component: "BoltPlugin",
                            operation: "getTaskDetails",
                            metadata: {
                                task: validated.task,
                                correlationId: context.correlationId,
                            },
                        });
                        return [4 /*yield*/, this.boltService.getTaskDetails(validated.task)];
                    case 2:
                        task = _a.sent();
                        complete({ task: validated.task, found: !!task });
                        return [2 /*return*/, task];
                    case 3:
                        error_12 = _a.sent();
                        complete({ error: error_12 instanceof Error ? error_12.message : String(error_12) });
                        throw error_12;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // =========================================================================
    // Standardized Capability Interface Methods (Phase 1)
    // =========================================================================
    /**
     * List all nodes from Bolt inventory
     * Implements InventoryCapability.inventoryList
     */
    BoltPlugin.prototype.inventoryList = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, nodes, error_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:inventoryList");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Listing inventory (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "inventoryList",
                            metadata: { refresh: params.refresh, groups: params.groups },
                        });
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        nodes = _a.sent();
                        // Filter by groups if specified
                        if (params.groups && params.groups.length > 0) {
                            nodes = nodes.filter(function (node) {
                                return node.config.groups &&
                                    Array.isArray(node.config.groups) &&
                                    params.groups.some(function (g) { return node.config.groups.includes(g); });
                            });
                        }
                        complete({ nodeCount: nodes.length, filtered: !!params.groups });
                        return [2 /*return*/, nodes];
                    case 3:
                        error_13 = _a.sent();
                        complete({ error: error_13 instanceof Error ? error_13.message : String(error_13) });
                        throw error_13;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get specific node details
     * Implements InventoryCapability.inventoryGet
     */
    BoltPlugin.prototype.inventoryGet = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, nodes, node, error_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:inventoryGet");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Getting node details (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "inventoryGet",
                            metadata: { nodeId: params.nodeId },
                        });
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        nodes = _a.sent();
                        node = nodes.find(function (n) { return n.id === params.nodeId || n.name === params.nodeId; });
                        complete({ nodeId: params.nodeId, found: !!node });
                        return [2 /*return*/, node !== null && node !== void 0 ? node : null];
                    case 3:
                        error_14 = _a.sent();
                        complete({ error: error_14 instanceof Error ? error_14.message : String(error_14) });
                        throw error_14;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List available groups
     * Implements InventoryCapability.inventoryGroups
     */
    BoltPlugin.prototype.inventoryGroups = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, nodes, groupsSet, _i, nodes_1, node, _a, _b, group, groups, error_15;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:inventoryGroups");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        this.logger.debug("Listing inventory groups (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "inventoryGroups",
                            metadata: { refresh: params.refresh },
                        });
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        nodes = _c.sent();
                        groupsSet = new Set();
                        // Extract groups from node configs
                        for (_i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
                            node = nodes_1[_i];
                            if (node.config.groups && Array.isArray(node.config.groups)) {
                                for (_a = 0, _b = node.config.groups; _a < _b.length; _a++) {
                                    group = _b[_a];
                                    groupsSet.add(group);
                                }
                            }
                        }
                        groups = Array.from(groupsSet).sort();
                        complete({ groupCount: groups.length });
                        return [2 /*return*/, groups];
                    case 3:
                        error_15 = _c.sent();
                        complete({ error: error_15 instanceof Error ? error_15.message : String(error_15) });
                        throw error_15;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Filter nodes by criteria
     * Implements InventoryCapability.inventoryFilter
     */
    BoltPlugin.prototype.inventoryFilter = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, nodes, error_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:inventoryFilter");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Filtering inventory (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "inventoryFilter",
                            metadata: { criteria: params.criteria, groups: params.groups },
                        });
                        return [4 /*yield*/, this.boltService.getInventory()];
                    case 2:
                        nodes = _a.sent();
                        // Filter by groups first if specified
                        if (params.groups && params.groups.length > 0) {
                            nodes = nodes.filter(function (node) {
                                return node.config.groups &&
                                    Array.isArray(node.config.groups) &&
                                    params.groups.some(function (g) { return node.config.groups.includes(g); });
                            });
                        }
                        // Filter by criteria
                        nodes = nodes.filter(function (node) {
                            for (var _i = 0, _a = Object.entries(params.criteria); _i < _a.length; _i++) {
                                var _b = _a[_i], key = _b[0], value = _b[1];
                                // Check in node config
                                if (node.config[key] !== value) {
                                    // Also check nested paths (e.g., "transport" or "config.user")
                                    var parts = key.split(".");
                                    var current = node;
                                    for (var _c = 0, parts_1 = parts; _c < parts_1.length; _c++) {
                                        var part = parts_1[_c];
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
                        return [2 /*return*/, nodes];
                    case 3:
                        error_16 = _a.sent();
                        complete({ error: error_16 instanceof Error ? error_16.message : String(error_16) });
                        throw error_16;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get facts for a node
     * Implements FactsCapability.factsGet
     */
    BoltPlugin.prototype.factsGet = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, facts, error_17;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:factsGet");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Getting facts (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "factsGet",
                            metadata: { nodeId: params.nodeId, providers: params.providers },
                        });
                        return [4 /*yield*/, this.boltService.gatherFacts(params.nodeId)];
                    case 2:
                        facts = _a.sent();
                        complete({ nodeId: params.nodeId });
                        return [2 /*return*/, facts];
                    case 3:
                        error_17 = _a.sent();
                        complete({ error: error_17 instanceof Error ? error_17.message : String(error_17) });
                        throw error_17;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Force refresh facts (bypass cache)
     * Implements FactsCapability.factsRefresh
     */
    BoltPlugin.prototype.factsRefresh = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, facts, error_18;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:factsRefresh");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Refreshing facts (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "factsRefresh",
                            metadata: { nodeId: params.nodeId, providers: params.providers },
                        });
                        return [4 /*yield*/, this.boltService.gatherFacts(params.nodeId)];
                    case 2:
                        facts = _a.sent();
                        complete({ nodeId: params.nodeId });
                        return [2 /*return*/, facts];
                    case 3:
                        error_18 = _a.sent();
                        complete({ error: error_18 instanceof Error ? error_18.message : String(error_18) });
                        throw error_18;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get fact provider information for this plugin
     * Implements FactsCapability.getFactProvider
     */
    BoltPlugin.prototype.getFactProvider = function () {
        return {
            name: "bolt",
            priority: 50, // Medium priority (PuppetDB would be higher at 100)
            supportedFactKeys: [
                "os",
                "kernel",
                "processors",
                "memory",
                "networking",
                "hostname",
                "fqdn",
                "ipaddress",
                "macaddress",
                "architecture",
                "operatingsystem",
                "operatingsystemrelease",
                "osfamily",
            ],
        };
    };
    /**
     * Execute shell command on target nodes
     * Implements RemoteExecutionCapability.commandExecute
     */
    BoltPlugin.prototype.commandExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, executionId, target, streamingCallback, result, _i, _a, nodeResult, error_19;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:commandExecute");
                        executionId = "cmd-".concat(Date.now());
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 7, , 8]);
                        this.logger.info("Executing command (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "commandExecute",
                            metadata: {
                                executionId: executionId,
                                command: params.command,
                                targets: params.targets,
                                async: params.async,
                                debugMode: params.debugMode,
                            },
                        });
                        target = params.targets[0];
                        streamingCallback = (_b = params.environment) === null || _b === void 0 ? void 0 : _b.streamingCallback;
                        return [4 /*yield*/, this.boltService.runCommand(target, params.command, streamingCallback)];
                    case 2:
                        result = _c.sent();
                        // Set debug mode flag if requested
                        if (params.debugMode) {
                            result.expertMode = true;
                        }
                        _i = 0, _a = result.results;
                        _c.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        nodeResult = _a[_i];
                        return [4 /*yield*/, this.logCommandToJournal({
                                executionId: executionId,
                                nodeId: nodeResult.nodeId,
                                command: params.command,
                                status: nodeResult.status,
                                output: nodeResult.output,
                                error: nodeResult.error,
                            })];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        complete({ status: result.status, targets: params.targets.length });
                        return [2 /*return*/, result];
                    case 7:
                        error_19 = _c.sent();
                        complete({ error: error_19 instanceof Error ? error_19.message : String(error_19) });
                        throw error_19;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute task or playbook on target nodes
     * Implements RemoteExecutionCapability.taskExecute
     */
    BoltPlugin.prototype.taskExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, executionId, target, streamingCallback, result, _i, _a, nodeResult, error_20;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:taskExecute");
                        executionId = "task-".concat(Date.now());
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 7, , 8]);
                        this.logger.info("Executing task (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "taskExecute",
                            metadata: {
                                executionId: executionId,
                                taskName: params.taskName,
                                targets: params.targets,
                                hasParameters: !!params.parameters,
                                async: params.async,
                                debugMode: params.debugMode,
                            },
                        });
                        target = params.targets[0];
                        streamingCallback = (_b = params.environment) === null || _b === void 0 ? void 0 : _b.streamingCallback;
                        return [4 /*yield*/, this.boltService.runTask(target, params.taskName, params.parameters, streamingCallback)];
                    case 2:
                        result = _c.sent();
                        // Set debug mode flag if requested
                        if (params.debugMode) {
                            result.expertMode = true;
                        }
                        _i = 0, _a = result.results;
                        _c.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        nodeResult = _a[_i];
                        return [4 /*yield*/, this.logTaskToJournal({
                                executionId: executionId,
                                nodeId: nodeResult.nodeId,
                                taskName: params.taskName,
                                parameters: params.parameters,
                                status: nodeResult.status,
                                error: nodeResult.error,
                            })];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        complete({ status: result.status, targets: params.targets.length, taskName: params.taskName });
                        return [2 /*return*/, result];
                    case 7:
                        error_20 = _c.sent();
                        complete({ error: error_20 instanceof Error ? error_20.message : String(error_20) });
                        throw error_20;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute script on target nodes
     * Implements RemoteExecutionCapability.scriptExecute
     */
    BoltPlugin.prototype.scriptExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, command, target, streamingCallback, result, error_21;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:scriptExecute");
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        this.logger.info("Executing script (standardized interface)", {
                            component: "BoltPlugin",
                            operation: "scriptExecute",
                            metadata: {
                                scriptType: params.scriptType,
                                targets: params.targets,
                                hasArguments: !!params.arguments,
                                async: params.async,
                                debugMode: params.debugMode,
                            },
                        });
                        command = params.script;
                        if (params.scriptType === "bash") {
                            command = "bash -c '".concat(params.script.replace(/'/g, "'\\''"), "'");
                        }
                        else if (params.scriptType === "powershell") {
                            command = "powershell -Command \"".concat(params.script.replace(/"/g, '\\"'), "\"");
                        }
                        else if (params.scriptType === "python") {
                            command = "python -c '".concat(params.script.replace(/'/g, "'\\''"), "'");
                        }
                        else if (params.scriptType === "ruby") {
                            command = "ruby -e '".concat(params.script.replace(/'/g, "'\\''"), "'");
                        }
                        // Add arguments if provided
                        if (params.arguments && params.arguments.length > 0) {
                            command += " " + params.arguments.join(" ");
                        }
                        target = params.targets[0];
                        streamingCallback = (_a = params.environment) === null || _a === void 0 ? void 0 : _a.streamingCallback;
                        return [4 /*yield*/, this.boltService.runCommand(target, command, streamingCallback)];
                    case 2:
                        result = _b.sent();
                        // Set debug mode flag if requested
                        if (params.debugMode) {
                            result.expertMode = true;
                        }
                        complete({ status: result.status, targets: params.targets.length, scriptType: params.scriptType });
                        return [2 /*return*/, result];
                    case 3:
                        error_21 = _b.sent();
                        complete({ error: error_21 instanceof Error ? error_21.message : String(error_21) });
                        throw error_21;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stream output from an execution
     * Implements RemoteExecutionCapability.streamOutput
     *
     * Note: Bolt executions are synchronous, so streaming happens during execution.
     * This method is a placeholder for future async execution support.
     */
    BoltPlugin.prototype.streamOutput = function (executionId, callback) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.debug("Stream output requested (not yet implemented for Bolt)", {
                    component: "BoltPlugin",
                    operation: "streamOutput",
                    metadata: { executionId: executionId },
                });
                // For Bolt, streaming happens during execution via StreamingCallback
                // This method would be used with ExecutionQueue for async executions
                throw new Error("Stream output not yet implemented for Bolt - use streaming callback during execution");
            });
        });
    };
    /**
     * Cancel an in-progress execution
     * Implements RemoteExecutionCapability.cancelExecution
     *
     * Note: Bolt executions are synchronous and cannot be cancelled mid-execution.
     * This method is a placeholder for future async execution support.
     */
    BoltPlugin.prototype.cancelExecution = function (executionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.debug("Cancel execution requested (not yet implemented for Bolt)", {
                    component: "BoltPlugin",
                    operation: "cancelExecution",
                    metadata: { executionId: executionId },
                });
                // For Bolt, executions are synchronous and cannot be cancelled
                // This would require ExecutionQueue integration for async executions
                return [2 /*return*/, false];
            });
        });
    };
    // =========================================================================
    // Package Management Methods (SoftwareInstallationCapability)
    // =========================================================================
    /**
     * Install a package on target nodes
     * Implements SoftwareInstallationCapability.packageInstall
     */
    BoltPlugin.prototype.packageInstall = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, startTime, executionId, taskName, taskParams, result, operationResult, _i, _a, nodeResult, error_22;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:packageInstall");
                        startTime = Date.now();
                        executionId = "pkg-install-".concat(Date.now());
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        this.logger.info("Installing package via Bolt", {
                            component: "BoltPlugin",
                            operation: "packageInstall",
                            metadata: { executionId: executionId, packageName: params.packageName, version: params.version, targets: params.targets },
                        });
                        taskName = "package";
                        taskParams = __assign(__assign({ action: "install", name: params.packageName }, (params.version && { version: params.version })), (params.options || {}));
                        return [4 /*yield*/, this.boltService.executeTask(taskName, params.targets, taskParams, { timeout: 300000 })];
                    case 2:
                        result = _b.sent();
                        operationResult = {
                            id: executionId,
                            operation: "install",
                            packageName: params.packageName,
                            targetNodes: params.targets,
                            status: result.status,
                            startedAt: new Date(startTime).toISOString(),
                            completedAt: new Date().toISOString(),
                            results: result.results.map(function (r) { return ({
                                nodeId: r.nodeId,
                                status: r.status,
                                packageName: params.packageName,
                                version: params.version,
                                error: r.error,
                                duration: r.duration,
                            }); }),
                            error: result.error,
                        };
                        _i = 0, _a = result.results;
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        nodeResult = _a[_i];
                        return [4 /*yield*/, this.logPackageToJournal({
                                executionId: executionId,
                                nodeId: nodeResult.nodeId,
                                operation: 'install',
                                packageName: params.packageName,
                                version: params.version,
                                status: nodeResult.status,
                                error: nodeResult.error,
                            })];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        complete({ status: result.status });
                        return [2 /*return*/, operationResult];
                    case 7:
                        error_22 = _b.sent();
                        complete({ status: "error" });
                        throw error_22;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Uninstall a package from target nodes
     * Implements SoftwareInstallationCapability.packageUninstall
     */
    BoltPlugin.prototype.packageUninstall = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, startTime, executionId, taskName, taskParams, result, operationResult, _i, _a, nodeResult, error_23;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:packageUninstall");
                        startTime = Date.now();
                        executionId = "pkg-uninstall-".concat(Date.now());
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        this.logger.info("Uninstalling package via Bolt", {
                            component: "BoltPlugin",
                            operation: "packageUninstall",
                            metadata: { executionId: executionId, packageName: params.packageName, targets: params.targets, purge: params.purge },
                        });
                        taskName = "package";
                        taskParams = __assign({ action: "uninstall", name: params.packageName }, (params.purge && { purge: true }));
                        return [4 /*yield*/, this.boltService.executeTask(taskName, params.targets, taskParams, { timeout: 300000 })];
                    case 2:
                        result = _b.sent();
                        operationResult = {
                            id: executionId,
                            operation: "uninstall",
                            packageName: params.packageName,
                            targetNodes: params.targets,
                            status: result.status,
                            startedAt: new Date(startTime).toISOString(),
                            completedAt: new Date().toISOString(),
                            results: result.results.map(function (r) { return ({
                                nodeId: r.nodeId,
                                status: r.status,
                                packageName: params.packageName,
                                error: r.error,
                                duration: r.duration,
                            }); }),
                            error: result.error,
                        };
                        _i = 0, _a = result.results;
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        nodeResult = _a[_i];
                        return [4 /*yield*/, this.logPackageToJournal({
                                executionId: executionId,
                                nodeId: nodeResult.nodeId,
                                operation: 'uninstall',
                                packageName: params.packageName,
                                status: nodeResult.status,
                                error: nodeResult.error,
                            })];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        complete({ status: result.status });
                        return [2 /*return*/, operationResult];
                    case 7:
                        error_23 = _b.sent();
                        complete({ status: "error" });
                        throw error_23;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update a package on target nodes
     * Implements SoftwareInstallationCapability.packageUpdate
     */
    BoltPlugin.prototype.packageUpdate = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, startTime, executionId, taskName, taskParams, result, operationResult, _i, _a, nodeResult, error_24;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:packageUpdate");
                        startTime = Date.now();
                        executionId = "pkg-update-".concat(Date.now());
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        this.logger.info("Updating package via Bolt", {
                            component: "BoltPlugin",
                            operation: "packageUpdate",
                            metadata: { executionId: executionId, packageName: params.packageName, version: params.version, targets: params.targets },
                        });
                        taskName = "package";
                        taskParams = __assign({ action: "upgrade", name: params.packageName }, (params.version && { version: params.version }));
                        return [4 /*yield*/, this.boltService.executeTask(taskName, params.targets, taskParams, { timeout: 300000 })];
                    case 2:
                        result = _b.sent();
                        operationResult = {
                            id: executionId,
                            operation: "update",
                            packageName: params.packageName,
                            targetNodes: params.targets,
                            status: result.status,
                            startedAt: new Date(startTime).toISOString(),
                            completedAt: new Date().toISOString(),
                            results: result.results.map(function (r) { return ({
                                nodeId: r.nodeId,
                                status: r.status,
                                packageName: params.packageName,
                                version: params.version,
                                error: r.error,
                                duration: r.duration,
                            }); }),
                            error: result.error,
                        };
                        _i = 0, _a = result.results;
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        nodeResult = _a[_i];
                        return [4 /*yield*/, this.logPackageToJournal({
                                executionId: executionId,
                                nodeId: nodeResult.nodeId,
                                operation: 'update',
                                packageName: params.packageName,
                                version: params.version,
                                status: nodeResult.status,
                                error: nodeResult.error,
                            })];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        complete({ status: result.status });
                        return [2 /*return*/, operationResult];
                    case 7:
                        error_24 = _b.sent();
                        complete({ status: "error" });
                        throw error_24;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List installed packages on a node
     * Implements SoftwareInstallationCapability.packageList
     */
    BoltPlugin.prototype.packageList = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete, taskName, taskParams, result, packages, packageData, error_25;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        complete = this.performanceMonitor.startTimer("bolt:v1:packageList");
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        this.logger.info("Listing packages via Bolt", {
                            component: "BoltPlugin",
                            operation: "packageList",
                            metadata: { nodeId: params.nodeId, filter: params.filter },
                        });
                        taskName = "package";
                        taskParams = __assign({ action: "status" }, (params.filter && { name: params.filter }));
                        return [4 /*yield*/, this.boltService.executeTask(taskName, [params.nodeId], taskParams, { timeout: 60000 })];
                    case 2:
                        result = _b.sent();
                        packages = [];
                        if ((_a = result.results[0]) === null || _a === void 0 ? void 0 : _a.value) {
                            packageData = result.results[0].value;
                            // Parse package data based on Bolt's package task output format
                            if (Array.isArray(packageData.packages)) {
                                packages.push.apply(packages, packageData.packages);
                            }
                        }
                        complete({ status: "success" });
                        return [2 /*return*/, packages];
                    case 3:
                        error_25 = _b.sent();
                        complete({ status: "error" });
                        throw error_25;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Search available packages
     * Implements SoftwareInstallationCapability.packageSearch
     */
    BoltPlugin.prototype.packageSearch = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var complete;
            return __generator(this, function (_a) {
                complete = this.performanceMonitor.startTimer("bolt:v1:packageSearch");
                try {
                    this.logger.info("Searching packages via Bolt", {
                        component: "BoltPlugin",
                        operation: "packageSearch",
                        metadata: { query: params.query, limit: params.limit },
                    });
                    // Note: Package search typically requires a target node to query the package manager
                    // This is a simplified implementation that returns an empty array
                    // In a real implementation, you would need to specify a target node
                    this.logger.warn("Package search not fully implemented - requires target node", {
                        component: "BoltPlugin",
                        operation: "packageSearch",
                    });
                    complete({ status: "success" });
                    return [2 /*return*/, []];
                }
                catch (error) {
                    complete({ status: "error" });
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // =========================================================================
    // Journal Integration (Node Journal Service)
    // =========================================================================
    /**
     * Log command execution to Node Journal (when available)
     * @private
     */
    BoltPlugin.prototype.logCommandToJournal = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // TODO: Integrate with Node Journal service when implemented
                    // For now, log to standard logger
                    this.logger.info("Command execution journal entry", {
                        component: "BoltPlugin",
                        operation: "journalEntry",
                        entryType: "command_execution",
                        metadata: {
                            executionId: params.executionId,
                            nodeId: params.nodeId,
                            command: params.command,
                            status: params.status,
                            user: params.user,
                            timestamp: new Date().toISOString(),
                        },
                    });
                    // When Node Journal is implemented, call:
                    // await this.nodeJournal.writeEntry({
                    //   nodeId: params.nodeId,
                    //   entryType: 'execution',
                    //   timestamp: new Date().toISOString(),
                    //   user: params.user,
                    //   action: 'command.execute',
                    //   details: {
                    //     executionId: params.executionId,
                    //     command: params.command,
                    //     status: params.status,
                    //     output: params.output,
                    //     error: params.error,
                    //   },
                    //   executionId: params.executionId,
                    //   status: params.status,
                    // });
                }
                catch (error) {
                    this.logger.warn("Failed to write command execution to journal", {
                        component: "BoltPlugin",
                        operation: "logCommandToJournal",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Log task execution to Node Journal (when available)
     * @private
     */
    BoltPlugin.prototype.logTaskToJournal = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    this.logger.info("Task execution journal entry", {
                        component: "BoltPlugin",
                        operation: "journalEntry",
                        entryType: "task_execution",
                        metadata: {
                            executionId: params.executionId,
                            nodeId: params.nodeId,
                            taskName: params.taskName,
                            parameters: params.parameters,
                            status: params.status,
                            user: params.user,
                            timestamp: new Date().toISOString(),
                        },
                    });
                    // When Node Journal is implemented, call:
                    // await this.nodeJournal.writeEntry({
                    //   nodeId: params.nodeId,
                    //   entryType: 'execution',
                    //   timestamp: new Date().toISOString(),
                    //   user: params.user,
                    //   action: 'task.execute',
                    //   details: {
                    //     executionId: params.executionId,
                    //     taskName: params.taskName,
                    //     parameters: params.parameters,
                    //     status: params.status,
                    //     error: params.error,
                    //   },
                    //   executionId: params.executionId,
                    //   status: params.status,
                    // });
                }
                catch (error) {
                    this.logger.warn("Failed to write task execution to journal", {
                        component: "BoltPlugin",
                        operation: "logTaskToJournal",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Log package installation to Node Journal (when available)
     * @private
     */
    BoltPlugin.prototype.logPackageToJournal = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    this.logger.info("Package operation journal entry", {
                        component: "BoltPlugin",
                        operation: "journalEntry",
                        entryType: "package_operation",
                        metadata: {
                            executionId: params.executionId,
                            nodeId: params.nodeId,
                            packageOperation: params.operation,
                            packageName: params.packageName,
                            version: params.version,
                            status: params.status,
                            user: params.user,
                            timestamp: new Date().toISOString(),
                        },
                    });
                    // When Node Journal is implemented, call:
                    // await this.nodeJournal.writeEntry({
                    //   nodeId: params.nodeId,
                    //   entryType: 'package',
                    //   timestamp: new Date().toISOString(),
                    //   user: params.user,
                    //   action: `package.${params.operation}`,
                    //   details: {
                    //     executionId: params.executionId,
                    //     packageName: params.packageName,
                    //     version: params.version,
                    //     operation: params.operation,
                    //     status: params.status,
                    //     error: params.error,
                    //   },
                    //   executionId: params.executionId,
                    //   status: params.status,
                    // });
                }
                catch (error) {
                    this.logger.warn("Failed to write package operation to journal", {
                        component: "BoltPlugin",
                        operation: "logPackageToJournal",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
                return [2 /*return*/];
            });
        });
    };
    // =========================================================================
    // Legacy Bridge Methods (for backward compatibility)
    // =========================================================================
    /**
     * Get the underlying BoltService instance
     * @deprecated Use capability handlers instead
     */
    BoltPlugin.prototype.getBoltService = function () {
        return this.boltService;
    };
    return BoltPlugin;
}());
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
