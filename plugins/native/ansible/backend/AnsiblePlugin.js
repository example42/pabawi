"use strict";
/**
 * AnsiblePlugin - Ansible integration for Pabawi
 *
 * Provides remote execution and inventory management capabilities using Ansible.
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
exports.AnsiblePlugin = void 0;
var AnsibleService_1 = require("./services/AnsibleService");
/**
 * AnsiblePlugin class
 *
 * Implements:
 * - BasePluginInterface for plugin lifecycle
 * - InventoryCapability for inventory management
 * - RemoteExecutionCapability for command/playbook execution
 */
var AnsiblePlugin = /** @class */ (function () {
    function AnsiblePlugin(config, logger, performanceMonitor) {
        this.metadata = {
            name: "ansible",
            version: "1.0.0",
            description: "Ansible integration for remote execution and inventory management",
            integrationType: "RemoteExecution",
            integrationTypes: ["RemoteExecution", "InventorySource"],
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
        this.capabilities = [
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
        this.initialized = false;
        this.inventoryCache = null;
        this.inventoryCacheExpiry = 0;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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
    AnsiblePlugin.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, exec, promisify, execAsync, stdout, error_1, fs, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.initialize");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 9, , 10]);
                        this.logger.info("Initializing Ansible plugin", {
                            inventoryPath: this.config.inventoryPath,
                            playbookPath: this.config.playbookPath,
                        });
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("child_process")); })];
                    case 2:
                        exec = (_a.sent()).exec;
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("util")); })];
                    case 3:
                        promisify = (_a.sent()).promisify;
                        execAsync = promisify(exec);
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, execAsync("ansible --version")];
                    case 5:
                        stdout = (_a.sent()).stdout;
                        this.logger.info("Ansible version detected", {
                            version: stdout.split("\n")[0],
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _a.sent();
                        throw new Error("Ansible is not installed or not accessible in PATH");
                    case 7: return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("fs")); })];
                    case 8:
                        fs = _a.sent();
                        if (!fs.existsSync(this.config.inventoryPath)) {
                            this.logger.warn("Inventory path does not exist", {
                                inventoryPath: this.config.inventoryPath,
                            });
                        }
                        this.initialized = true;
                        this.logger.info("Ansible plugin initialized successfully");
                        endTimer({ success: true });
                        return [3 /*break*/, 10];
                    case 9:
                        error_2 = _a.sent();
                        this.logger.error("Failed to initialize Ansible plugin", {
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        });
                        endTimer({ success: false, error: String(error_2) });
                        throw error_2;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Health check
     */
    AnsiblePlugin.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var exec, promisify, execAsync, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        if (!this.initialized) {
                            return [2 /*return*/, {
                                    healthy: false,
                                    message: "Plugin not initialized",
                                    timestamp: new Date().toISOString(),
                                }];
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("child_process")); })];
                    case 1:
                        exec = (_a.sent()).exec;
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("util")); })];
                    case 2:
                        promisify = (_a.sent()).promisify;
                        execAsync = promisify(exec);
                        return [4 /*yield*/, execAsync("ansible --version")];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, {
                                healthy: true,
                                message: "Ansible is accessible and operational",
                                details: {
                                    inventoryPath: this.config.inventoryPath,
                                    playbookPath: this.config.playbookPath,
                                },
                                timestamp: new Date().toISOString(),
                            }];
                    case 4:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                healthy: false,
                                message: "Health check failed: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)),
                                timestamp: new Date().toISOString(),
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AnsiblePlugin.prototype.getConfig = function () {
        return __assign({}, this.config);
    };
    AnsiblePlugin.prototype.isInitialized = function () {
        return this.initialized;
    };
    AnsiblePlugin.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.info("Shutting down Ansible plugin");
                this.initialized = false;
                this.inventoryCache = null;
                return [2 /*return*/];
            });
        });
    };
    // ==========================================================================
    // Inventory Capability Implementation
    // ==========================================================================
    /**
     * List all nodes from Ansible inventory
     */
    AnsiblePlugin.prototype.inventoryList = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, nodes_1, nodes, filteredNodes, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.inventory.list");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Listing inventory", params);
                        // Check cache
                        if (!params.refresh &&
                            this.inventoryCache &&
                            Date.now() < this.inventoryCacheExpiry) {
                            this.logger.debug("Returning cached inventory");
                            nodes_1 = this.inventoryCache;
                            // Filter by groups if specified
                            if (params.groups && params.groups.length > 0) {
                                nodes_1 = nodes_1.filter(function (node) { var _a; return (_a = node.groups) === null || _a === void 0 ? void 0 : _a.some(function (g) { var _a; return (_a = params.groups) === null || _a === void 0 ? void 0 : _a.includes(g); }); });
                            }
                            endTimer({ cached: true, count: nodes_1.length });
                            return [2 /*return*/, nodes_1];
                        }
                        return [4 /*yield*/, this.ansibleService.getInventory()];
                    case 2:
                        nodes = _a.sent();
                        // Update cache
                        this.inventoryCache = nodes;
                        this.inventoryCacheExpiry = Date.now() + this.CACHE_TTL;
                        filteredNodes = nodes;
                        if (params.groups && params.groups.length > 0) {
                            filteredNodes = nodes.filter(function (node) { var _a; return (_a = node.groups) === null || _a === void 0 ? void 0 : _a.some(function (g) { var _a; return (_a = params.groups) === null || _a === void 0 ? void 0 : _a.includes(g); }); });
                        }
                        endTimer({ cached: false, count: filteredNodes.length });
                        return [2 /*return*/, filteredNodes];
                    case 3:
                        error_4 = _a.sent();
                        this.logger.error("Failed to list inventory", {
                            error: error_4 instanceof Error ? error_4.message : String(error_4),
                        });
                        endTimer({ success: false, error: String(error_4) });
                        throw error_4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get specific node details
     */
    AnsiblePlugin.prototype.inventoryGet = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, nodes, node, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.inventory.get");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Getting node details", params);
                        return [4 /*yield*/, this.inventoryList({ refresh: false })];
                    case 2:
                        nodes = _a.sent();
                        node = nodes.find(function (n) { return n.id === params.nodeId; }) || null;
                        endTimer({ found: node !== null });
                        return [2 /*return*/, node];
                    case 3:
                        error_5 = _a.sent();
                        this.logger.error("Failed to get node", {
                            nodeId: params.nodeId,
                            error: error_5 instanceof Error ? error_5.message : String(error_5),
                        });
                        endTimer({ success: false, error: String(error_5) });
                        throw error_5;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List available groups
     */
    AnsiblePlugin.prototype.inventoryGroups = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, nodes, groupsSet, _i, nodes_2, node, _a, _b, group, groups, error_6;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.inventory.groups");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        this.logger.debug("Listing groups", params);
                        return [4 /*yield*/, this.inventoryList({ refresh: params.refresh })];
                    case 2:
                        nodes = _c.sent();
                        groupsSet = new Set();
                        for (_i = 0, nodes_2 = nodes; _i < nodes_2.length; _i++) {
                            node = nodes_2[_i];
                            if (node.groups) {
                                for (_a = 0, _b = node.groups; _a < _b.length; _a++) {
                                    group = _b[_a];
                                    groupsSet.add(group);
                                }
                            }
                        }
                        groups = Array.from(groupsSet).sort();
                        endTimer({ count: groups.length });
                        return [2 /*return*/, groups];
                    case 3:
                        error_6 = _c.sent();
                        this.logger.error("Failed to list groups", {
                            error: error_6 instanceof Error ? error_6.message : String(error_6),
                        });
                        endTimer({ success: false, error: String(error_6) });
                        throw error_6;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Filter nodes by criteria
     */
    AnsiblePlugin.prototype.inventoryFilter = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, nodes, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.inventory.filter");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.debug("Filtering inventory", params);
                        return [4 /*yield*/, this.inventoryList({ groups: params.groups })];
                    case 2:
                        nodes = _a.sent();
                        // Apply additional criteria filters
                        if (params.criteria && Object.keys(params.criteria).length > 0) {
                            nodes = nodes.filter(function (node) {
                                var _a;
                                for (var _i = 0, _b = Object.entries(params.criteria); _i < _b.length; _i++) {
                                    var _c = _b[_i], key = _c[0], value = _c[1];
                                    var nodeValue = (_a = node.metadata) === null || _a === void 0 ? void 0 : _a[key];
                                    if (nodeValue !== value) {
                                        return false;
                                    }
                                }
                                return true;
                            });
                        }
                        endTimer({ count: nodes.length });
                        return [2 /*return*/, nodes];
                    case 3:
                        error_7 = _a.sent();
                        this.logger.error("Failed to filter inventory", {
                            error: error_7 instanceof Error ? error_7.message : String(error_7),
                        });
                        endTimer({ success: false, error: String(error_7) });
                        throw error_7;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ==========================================================================
    // Remote Execution Capability Implementation
    // ==========================================================================
    /**
     * Execute shell command on target nodes
     */
    AnsiblePlugin.prototype.commandExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, target, streamingCallback, result, error_8;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.command.execute");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Executing command", {
                            command: params.command,
                            targets: params.targets,
                        });
                        target = params.targets[0];
                        streamingCallback = params.debugMode
                            ? function (chunk) {
                                _this.logger.debug("Command output", chunk);
                            }
                            : undefined;
                        return [4 /*yield*/, this.ansibleService.runCommand(target, params.command, streamingCallback)];
                    case 2:
                        result = _a.sent();
                        endTimer({ status: result.status });
                        return [2 /*return*/, result];
                    case 3:
                        error_8 = _a.sent();
                        this.logger.error("Command execution failed", {
                            error: error_8 instanceof Error ? error_8.message : String(error_8),
                        });
                        endTimer({ success: false, error: String(error_8) });
                        throw error_8;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute Ansible playbook on target nodes
     */
    AnsiblePlugin.prototype.taskExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, target, streamingCallback, result, error_9;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.task.execute");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Executing playbook", {
                            taskName: params.taskName,
                            targets: params.targets,
                            parameters: params.parameters,
                        });
                        target = params.targets[0];
                        streamingCallback = params.debugMode
                            ? function (chunk) {
                                _this.logger.debug("Playbook output", chunk);
                            }
                            : undefined;
                        return [4 /*yield*/, this.ansibleService.runPlaybook(target, params.taskName, params.parameters, streamingCallback)];
                    case 2:
                        result = _a.sent();
                        endTimer({ status: result.status });
                        return [2 /*return*/, result];
                    case 3:
                        error_9 = _a.sent();
                        this.logger.error("Playbook execution failed", {
                            error: error_9 instanceof Error ? error_9.message : String(error_9),
                        });
                        endTimer({ success: false, error: String(error_9) });
                        throw error_9;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute script on target nodes
     */
    AnsiblePlugin.prototype.scriptExecute = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, target, command, streamingCallback, result, error_10;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.script.execute");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Executing script", {
                            script: params.script,
                            targets: params.targets,
                            scriptType: params.scriptType,
                        });
                        target = params.targets[0];
                        command = params.script;
                        streamingCallback = params.debugMode
                            ? function (chunk) {
                                _this.logger.debug("Script output", chunk);
                            }
                            : undefined;
                        return [4 /*yield*/, this.ansibleService.runCommand(target, command, streamingCallback)];
                    case 2:
                        result = _a.sent();
                        endTimer({ status: result.status });
                        return [2 /*return*/, result];
                    case 3:
                        error_10 = _a.sent();
                        this.logger.error("Script execution failed", {
                            error: error_10 instanceof Error ? error_10.message : String(error_10),
                        });
                        endTimer({ success: false, error: String(error_10) });
                        throw error_10;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stream output from an execution
     */
    AnsiblePlugin.prototype.streamOutput = function (executionId, callback) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.debug("Stream output requested", { executionId: executionId });
                return [2 /*return*/];
            });
        });
    };
    /**
     * Cancel an in-progress execution
     */
    AnsiblePlugin.prototype.cancelExecution = function (executionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.logger.warn("Cancel execution not implemented", { executionId: executionId });
                return [2 /*return*/, false];
            });
        });
    };
    /**
     * Get the Ansible service instance (for testing)
     */
    AnsiblePlugin.prototype.getAnsibleService = function () {
        return this.ansibleService;
    };
    /**
     * Get lightweight summary for home page tile
     * Must return in under 500ms with minimal data (counts, status only)
     */
    AnsiblePlugin.prototype.getSummary = function () {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, startTime, healthStatus, _a, inventoryResult, playbooksResult, nodeCount, playbookCount, duration, error_11;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.getSummary");
                        startTime = Date.now();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        this.logger.debug("Getting Ansible summary");
                        // Check if plugin is initialized
                        if (!this.initialized) {
                            endTimer({ healthy: false, duration: Date.now() - startTime });
                            return [2 /*return*/, {
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
                                }];
                        }
                        return [4 /*yield*/, this.healthCheck()];
                    case 2:
                        healthStatus = _b.sent();
                        return [4 /*yield*/, Promise.allSettled([
                                this.inventoryList({ refresh: false }),
                                this.ansibleService.listPlaybooks(),
                            ])];
                    case 3:
                        _a = _b.sent(), inventoryResult = _a[0], playbooksResult = _a[1];
                        nodeCount = inventoryResult.status === "fulfilled" ? inventoryResult.value.length : 0;
                        playbookCount = playbooksResult.status === "fulfilled" ? playbooksResult.value.length : 0;
                        duration = Date.now() - startTime;
                        endTimer({ healthy: healthStatus.healthy, duration: duration });
                        return [2 /*return*/, {
                                pluginName: "ansible",
                                displayName: "Ansible",
                                metrics: {
                                    nodeCount: nodeCount,
                                    playbookCount: playbookCount,
                                    recentRuns: 0, // TODO: Track execution history
                                },
                                healthy: healthStatus.healthy,
                                lastUpdate: new Date().toISOString(),
                                error: healthStatus.healthy ? undefined : healthStatus.message,
                            }];
                    case 4:
                        error_11 = _b.sent();
                        this.logger.error("Failed to get Ansible summary", {
                            error: error_11 instanceof Error ? error_11.message : String(error_11),
                        });
                        endTimer({ success: false, error: String(error_11) });
                        return [2 /*return*/, {
                                pluginName: "ansible",
                                displayName: "Ansible",
                                metrics: {
                                    nodeCount: 0,
                                    playbookCount: 0,
                                    recentRuns: 0,
                                },
                                healthy: false,
                                lastUpdate: new Date().toISOString(),
                                error: error_11 instanceof Error ? error_11.message : "Failed to get summary",
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get full plugin data for plugin home page
     * Called on-demand when navigating to plugin page
     */
    AnsiblePlugin.prototype.getData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var endTimer, startTime, healthStatus, _a, inventory, playbooks, groups, config, inventoryData, playbooksData, groupsData, configData, duration, error_12;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        endTimer = this.performanceMonitor.startTimer("ansible.getData");
                        startTime = Date.now();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        this.logger.debug("Getting full Ansible plugin data");
                        // Check if plugin is initialized
                        if (!this.initialized) {
                            endTimer({ healthy: false, duration: Date.now() - startTime });
                            return [2 /*return*/, {
                                    pluginName: "ansible",
                                    displayName: "Ansible",
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
                                this.inventoryList({ refresh: false }),
                                this.ansibleService.listPlaybooks(),
                                this.inventoryGroups({ refresh: false }),
                                Promise.resolve(this.getConfig()),
                            ])];
                    case 3:
                        _a = _b.sent(), inventory = _a[0], playbooks = _a[1], groups = _a[2], config = _a[3];
                        inventoryData = inventory.status === "fulfilled" ? inventory.value : [];
                        playbooksData = playbooks.status === "fulfilled" ? playbooks.value : [];
                        groupsData = groups.status === "fulfilled" ? groups.value : [];
                        configData = config.status === "fulfilled" ? config.value : {};
                        duration = Date.now() - startTime;
                        endTimer({ healthy: healthStatus.healthy, duration: duration });
                        return [2 /*return*/, {
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
                            }];
                    case 4:
                        error_12 = _b.sent();
                        this.logger.error("Failed to get Ansible plugin data", {
                            error: error_12 instanceof Error ? error_12.message : String(error_12),
                        });
                        endTimer({ success: false, error: String(error_12) });
                        return [2 /*return*/, {
                                pluginName: "ansible",
                                displayName: "Ansible",
                                data: null,
                                healthy: false,
                                lastUpdate: new Date().toISOString(),
                                capabilities: [],
                                error: error_12 instanceof Error ? error_12.message : "Failed to get plugin data",
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return AnsiblePlugin;
}());
exports.AnsiblePlugin = AnsiblePlugin;
//# sourceMappingURL=AnsiblePlugin.js.map
