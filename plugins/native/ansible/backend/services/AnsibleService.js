"use strict";
/**
 * AnsibleService - Handles Ansible command execution and inventory management
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
exports.AnsibleService = void 0;
var child_process_1 = require("child_process");
var util_1 = require("util");
var child_process_2 = require("child_process");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var execAsync = (0, util_1.promisify)(child_process_2.exec);
var AnsibleService = /** @class */ (function () {
    function AnsibleService(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    /**
     * Get inventory from Ansible
     */
    AnsibleService.prototype.getInventory = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stdout, inventory, nodes, _i, _a, _b, hostname, hostvars, groups, _c, _d, _e, groupName, groupData, error_1;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 2, , 3]);
                        this.logger.debug("Fetching Ansible inventory", {
                            inventoryPath: this.config.inventoryPath,
                        });
                        return [4 /*yield*/, execAsync("ansible-inventory -i \"".concat(this.config.inventoryPath, "\" --list"))];
                    case 1:
                        stdout = (_f.sent()).stdout;
                        inventory = JSON.parse(stdout);
                        nodes = [];
                        // Parse inventory structure
                        if (inventory._meta && inventory._meta.hostvars) {
                            for (_i = 0, _a = Object.entries(inventory._meta.hostvars); _i < _a.length; _i++) {
                                _b = _a[_i], hostname = _b[0], hostvars = _b[1];
                                groups = [];
                                // Find groups for this host
                                for (_c = 0, _d = Object.entries(inventory); _c < _d.length; _c++) {
                                    _e = _d[_c], groupName = _e[0], groupData = _e[1];
                                    if (groupName !== "_meta" &&
                                        groupName !== "all" &&
                                        typeof groupData === "object" &&
                                        groupData !== null &&
                                        "hosts" in groupData &&
                                        Array.isArray(groupData.hosts) &&
                                        groupData.hosts.includes(hostname)) {
                                        groups.push(groupName);
                                    }
                                }
                                nodes.push({
                                    id: hostname,
                                    name: hostname,
                                    uri: hostvars.ansible_host || hostname,
                                    transport: "ssh",
                                    source: "ansible",
                                    metadata: hostvars,
                                });
                            }
                        }
                        this.logger.info("Retrieved ".concat(nodes.length, " nodes from Ansible inventory"));
                        return [2 /*return*/, nodes];
                    case 2:
                        error_1 = _f.sent();
                        this.logger.error("Failed to get Ansible inventory", {
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        });
                        throw new Error("Failed to get Ansible inventory: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gather facts from a node using ansible setup module
     */
    AnsibleService.prototype.gatherFacts = function (nodeId) {
        return __awaiter(this, void 0, void 0, function () {
            var stdout, lines, jsonStart, i, jsonStr, result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        this.logger.debug("Gathering facts from node", { nodeId: nodeId });
                        return [4 /*yield*/, execAsync("ansible -i \"".concat(this.config.inventoryPath, "\" ").concat(nodeId, " -m setup"))];
                    case 1:
                        stdout = (_a.sent()).stdout;
                        lines = stdout.split("\n");
                        jsonStart = -1;
                        for (i = 0; i < lines.length; i++) {
                            if (lines[i].includes("SUCCESS =>")) {
                                jsonStart = i + 1;
                                break;
                            }
                        }
                        if (jsonStart === -1) {
                            throw new Error("Could not parse Ansible facts output");
                        }
                        jsonStr = lines.slice(jsonStart).join("\n");
                        result = JSON.parse(jsonStr);
                        this.logger.info("Successfully gathered facts", { nodeId: nodeId });
                        return [2 /*return*/, result.ansible_facts || {}];
                    case 2:
                        error_2 = _a.sent();
                        this.logger.error("Failed to gather facts", {
                            nodeId: nodeId,
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        });
                        throw new Error("Failed to gather facts: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run a command on a node using ansible command module
     */
    AnsibleService.prototype.runCommand = function (nodeId, command, streamingCallback) {
        return __awaiter(this, void 0, void 0, function () {
            var executionId, startedAt, args, result, nodeResult, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        executionId = "ansible-cmd-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                        startedAt = new Date().toISOString();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Executing command via Ansible", {
                            executionId: executionId,
                            nodeId: nodeId,
                            command: command,
                        });
                        args = [
                            "-i",
                            this.config.inventoryPath,
                            nodeId,
                            "-m",
                            "shell",
                            "-a",
                            command,
                        ];
                        if (this.config.ansibleConfig) {
                            process.env.ANSIBLE_CONFIG = this.config.ansibleConfig;
                        }
                        return [4 /*yield*/, this.executeAnsibleCommand("ansible", args, streamingCallback)];
                    case 2:
                        result = _a.sent();
                        nodeResult = {
                            nodeId: nodeId,
                            status: result.exitCode === 0 ? "success" : "failed",
                            output: {
                                stdout: result.stdout,
                                stderr: result.stderr,
                                exitCode: result.exitCode,
                            },
                            duration: Date.now() - new Date(startedAt).getTime(),
                        };
                        if (result.exitCode !== 0) {
                            nodeResult.error = result.stderr || "Command execution failed";
                        }
                        return [2 /*return*/, {
                                id: executionId,
                                type: "command",
                                targetNodes: [nodeId],
                                action: command,
                                status: result.exitCode === 0 ? "success" : "failed",
                                startedAt: startedAt,
                                completedAt: new Date().toISOString(),
                                results: [nodeResult],
                                command: command,
                            }];
                    case 3:
                        error_3 = _a.sent();
                        this.logger.error("Command execution failed", {
                            executionId: executionId,
                            nodeId: nodeId,
                            error: error_3 instanceof Error ? error_3.message : String(error_3),
                        });
                        return [2 /*return*/, {
                                id: executionId,
                                type: "command",
                                targetNodes: [nodeId],
                                action: command,
                                status: "failed",
                                startedAt: startedAt,
                                completedAt: new Date().toISOString(),
                                results: [
                                    {
                                        nodeId: nodeId,
                                        status: "failed",
                                        error: error_3 instanceof Error ? error_3.message : String(error_3),
                                        duration: Date.now() - new Date(startedAt).getTime(),
                                    },
                                ],
                                error: error_3 instanceof Error ? error_3.message : String(error_3),
                                command: command,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run an Ansible playbook
     */
    AnsibleService.prototype.runPlaybook = function (nodeId, playbookName, parameters, streamingCallback) {
        return __awaiter(this, void 0, void 0, function () {
            var executionId, startedAt, playbookPath, args, result, nodeResult, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        executionId = "ansible-playbook-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                        startedAt = new Date().toISOString();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.logger.info("Executing playbook via Ansible", {
                            executionId: executionId,
                            nodeId: nodeId,
                            playbookName: playbookName,
                            parameters: parameters,
                        });
                        playbookPath = path.join(this.config.playbookPath, playbookName);
                        if (!fs.existsSync(playbookPath)) {
                            throw new Error("Playbook not found: ".concat(playbookPath));
                        }
                        args = [
                            "-i",
                            this.config.inventoryPath,
                            "--limit",
                            nodeId,
                            playbookPath,
                        ];
                        // Add extra variables if provided
                        if (parameters && Object.keys(parameters).length > 0) {
                            args.push("--extra-vars", JSON.stringify(parameters));
                        }
                        if (this.config.ansibleConfig) {
                            process.env.ANSIBLE_CONFIG = this.config.ansibleConfig;
                        }
                        return [4 /*yield*/, this.executeAnsibleCommand("ansible-playbook", args, streamingCallback)];
                    case 2:
                        result = _a.sent();
                        nodeResult = {
                            nodeId: nodeId,
                            status: result.exitCode === 0 ? "success" : "failed",
                            output: {
                                stdout: result.stdout,
                                stderr: result.stderr,
                                exitCode: result.exitCode,
                            },
                            duration: Date.now() - new Date(startedAt).getTime(),
                        };
                        if (result.exitCode !== 0) {
                            nodeResult.error = result.stderr || "Playbook execution failed";
                        }
                        return [2 /*return*/, {
                                id: executionId,
                                type: "playbook",
                                targetNodes: [nodeId],
                                action: playbookName,
                                parameters: parameters,
                                status: result.exitCode === 0 ? "success" : "failed",
                                startedAt: startedAt,
                                completedAt: new Date().toISOString(),
                                results: [nodeResult],
                            }];
                    case 3:
                        error_4 = _a.sent();
                        this.logger.error("Playbook execution failed", {
                            executionId: executionId,
                            nodeId: nodeId,
                            playbookName: playbookName,
                            error: error_4 instanceof Error ? error_4.message : String(error_4),
                        });
                        return [2 /*return*/, {
                                id: executionId,
                                type: "playbook",
                                targetNodes: [nodeId],
                                action: playbookName,
                                parameters: parameters,
                                status: "failed",
                                startedAt: startedAt,
                                completedAt: new Date().toISOString(),
                                results: [
                                    {
                                        nodeId: nodeId,
                                        status: "failed",
                                        error: error_4 instanceof Error ? error_4.message : String(error_4),
                                        duration: Date.now() - new Date(startedAt).getTime(),
                                    },
                                ],
                                error: error_4 instanceof Error ? error_4.message : String(error_4),
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List available playbooks
     */
    AnsibleService.prototype.listPlaybooks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files, playbooks, _i, files_1, file, fullPath;
            return __generator(this, function (_a) {
                try {
                    this.logger.debug("Listing playbooks", {
                        playbookPath: this.config.playbookPath,
                    });
                    if (!fs.existsSync(this.config.playbookPath)) {
                        this.logger.warn("Playbook directory does not exist", {
                            playbookPath: this.config.playbookPath,
                        });
                        return [2 /*return*/, []];
                    }
                    files = fs.readdirSync(this.config.playbookPath);
                    playbooks = [];
                    for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                        file = files_1[_i];
                        if (file.endsWith(".yml") || file.endsWith(".yaml")) {
                            fullPath = path.join(this.config.playbookPath, file);
                            playbooks.push({
                                name: file,
                                path: fullPath,
                                description: "Ansible playbook: ".concat(file),
                            });
                        }
                    }
                    this.logger.info("Found ".concat(playbooks.length, " playbooks"));
                    return [2 /*return*/, playbooks];
                }
                catch (error) {
                    this.logger.error("Failed to list playbooks", {
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return [2 /*return*/, []];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get playbook details
     */
    AnsibleService.prototype.getPlaybookDetails = function (playbookName) {
        return __awaiter(this, void 0, void 0, function () {
            var playbookPath;
            return __generator(this, function (_a) {
                try {
                    playbookPath = path.join(this.config.playbookPath, playbookName);
                    if (!fs.existsSync(playbookPath)) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            name: playbookName,
                            path: playbookPath,
                            description: "Ansible playbook: ".concat(playbookName),
                        }];
                }
                catch (error) {
                    this.logger.error("Failed to get playbook details", {
                        playbookName: playbookName,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return [2 /*return*/, null];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Execute an Ansible command with streaming support
     */
    AnsibleService.prototype.executeAnsibleCommand = function (command, args, streamingCallback) {
        return new Promise(function (resolve, reject) {
            var proc = (0, child_process_1.spawn)(command, args);
            var stdout = "";
            var stderr = "";
            proc.stdout.on("data", function (data) {
                var chunk = data.toString();
                stdout += chunk;
                if (streamingCallback) {
                    streamingCallback({
                        nodeId: "ansible",
                        stream: "stdout",
                        data: chunk,
                        timestamp: new Date().toISOString(),
                    });
                }
            });
            proc.stderr.on("data", function (data) {
                var chunk = data.toString();
                stderr += chunk;
                if (streamingCallback) {
                    streamingCallback({
                        nodeId: "ansible",
                        stream: "stderr",
                        data: chunk,
                        timestamp: new Date().toISOString(),
                    });
                }
            });
            proc.on("close", function (code) {
                resolve({
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: code || 0,
                });
            });
            proc.on("error", function (error) {
                reject(error);
            });
        });
    };
    AnsibleService.prototype.getInventoryPath = function () {
        return this.config.inventoryPath;
    };
    AnsibleService.prototype.getDefaultTimeout = function () {
        return this.config.defaultTimeout;
    };
    return AnsibleService;
}());
exports.AnsibleService = AnsibleService;
//# sourceMappingURL=AnsibleService.js.map
