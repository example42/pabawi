/**
 * Unit tests for BoltPlugin v1.0.0 (Capability-Based Architecture)
 *
 * Tests the BoltPlugin implementing BasePluginInterface with:
 * - Plugin metadata
 * - Capability definitions
 * - Widget definitions
 * - CLI command definitions
 * - Lifecycle methods (initialize, healthCheck)
 * - Capability handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoltPlugin, type BoltService } from "../../../src/integrations/bolt/index.js";
import { IntegrationType } from "../../../src/integrations/types.js";
import type { LoggerService } from "../../../src/services/LoggerService.js";
import type { PerformanceMonitorService } from "../../../src/services/PerformanceMonitorService.js";
import type { ExecutionContext } from "../../../src/integrations/types.js";

describe("BoltPlugin v1.0", () => {
  let mockBoltService: BoltService;
  let mockLogger: LoggerService;
  let mockPerformanceMonitor: PerformanceMonitorService;
  let boltPlugin: BoltPlugin;

  beforeEach(() => {
    // Create mock BoltService
    mockBoltService = {
      getInventory: vi.fn(),
      runCommand: vi.fn(),
      runTask: vi.fn(),
      runScript: vi.fn(),
      getFacts: vi.fn(),
      gatherFacts: vi.fn(),
      getBoltProjectPath: vi.fn().mockReturnValue("/test/bolt-project"),
      listTasks: vi.fn(),
      getTaskDetails: vi.fn(),
      validateBoltInstallation: vi.fn(),
    } as unknown as BoltService;

    // Create mock LoggerService
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService;

    // Create mock PerformanceMonitorService
    mockPerformanceMonitor = {
      startTimer: vi.fn().mockReturnValue(() => {}),
      recordMetric: vi.fn(),
    } as unknown as PerformanceMonitorService;

    boltPlugin = new BoltPlugin(mockBoltService, mockLogger, mockPerformanceMonitor);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("Plugin Metadata", () => {
    it("should have correct metadata properties", () => {
      expect(boltPlugin.metadata.name).toBe("bolt");
      expect(boltPlugin.metadata.version).toBe("1.0.0");
      expect(boltPlugin.metadata.author).toBe("Pabawi Team");
      expect(boltPlugin.metadata.integrationType).toBe(IntegrationType.RemoteExecution);
    });

    it("should have UI display properties", () => {
      expect(boltPlugin.metadata.color).toBe("#FFAE1A");
      expect(boltPlugin.metadata.icon).toBe("terminal");
      expect(boltPlugin.metadata.tags).toContain("bolt");
      expect(boltPlugin.metadata.tags).toContain("puppet");
    });

    it("should have version compatibility info", () => {
      expect(boltPlugin.metadata.minPabawiVersion).toBeDefined();
    });
  });

  describe("Capabilities", () => {
    it("should define 6 capabilities", () => {
      expect(boltPlugin.capabilities.length).toBe(6);
    });

    it("should have command execution capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.command.execute");
      expect(cap).toBeDefined();
      expect(cap!.category).toBe("command");
      expect(cap!.riskLevel).toBe("execute");
      expect(cap!.requiredPermissions).toContain("bolt.command.execute");
    });

    it("should have task execution capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.task.execute");
      expect(cap).toBeDefined();
      expect(cap!.category).toBe("task");
      expect(cap!.riskLevel).toBe("execute");
    });

    it("should have inventory list capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.inventory.list");
      expect(cap).toBeDefined();
      expect(cap!.category).toBe("inventory");
      expect(cap!.riskLevel).toBe("read");
    });

    it("should have facts query capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.facts.query");
      expect(cap).toBeDefined();
      expect(cap!.category).toBe("info");
      expect(cap!.riskLevel).toBe("read");
    });

    it("should have task list capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.task.list");
      expect(cap).toBeDefined();
      expect(cap!.riskLevel).toBe("read");
    });

    it("should have task details capability", () => {
      const cap = boltPlugin.capabilities.find(c => c.name === "bolt.task.details");
      expect(cap).toBeDefined();
      expect(cap!.riskLevel).toBe("read");
    });

    it("should define schema for each capability", () => {
      for (const cap of boltPlugin.capabilities) {
        expect(cap.schema).toBeDefined();
        expect(cap.schema.arguments).toBeDefined();
      }
    });
  });

  describe("Widgets", () => {
    it("should define 4 widgets", () => {
      expect(boltPlugin.widgets).toBeDefined();
      expect(boltPlugin.widgets!.length).toBe(4);
    });

    it("should have command executor widget", () => {
      const widget = boltPlugin.widgets!.find(w => w.id === "bolt:command-executor");
      expect(widget).toBeDefined();
      expect(widget!.name).toBe("Command Executor");
      expect(widget!.requiredCapabilities).toContain("bolt.command.execute");
    });

    it("should have task runner widget", () => {
      const widget = boltPlugin.widgets!.find(w => w.id === "bolt:task-runner");
      expect(widget).toBeDefined();
      expect(widget!.name).toBe("Task Runner");
      expect(widget!.requiredCapabilities).toContain("bolt.task.execute");
    });

    it("should have inventory viewer widget", () => {
      const widget = boltPlugin.widgets!.find(w => w.id === "bolt:inventory-viewer");
      expect(widget).toBeDefined();
      expect(widget!.requiredCapabilities).toContain("bolt.inventory.list");
    });

    it("should have task browser widget", () => {
      const widget = boltPlugin.widgets!.find(w => w.id === "bolt:task-browser");
      expect(widget).toBeDefined();
      expect(widget!.requiredCapabilities).toContain("bolt.task.list");
    });

    it("should define slots for each widget", () => {
      for (const widget of boltPlugin.widgets!) {
        expect(widget.slots).toBeDefined();
        expect(widget.slots.length).toBeGreaterThan(0);
      }
    });
  });

  describe("CLI Commands", () => {
    it("should define CLI commands", () => {
      expect(boltPlugin.cliCommands).toBeDefined();
      expect(boltPlugin.cliCommands!.length).toBeGreaterThan(0);
    });

    it("should have bolt command with actions", () => {
      const boltCmd = boltPlugin.cliCommands!.find(c => c.name === "bolt");
      expect(boltCmd).toBeDefined();
      expect(boltCmd!.actions).toBeDefined();
      expect(boltCmd!.actions!.length).toBeGreaterThanOrEqual(4);
    });

    it("should have run action for commands", () => {
      const boltCmd = boltPlugin.cliCommands!.find(c => c.name === "bolt");
      const runAction = boltCmd!.actions!.find(a => a.name === "run");
      expect(runAction).toBeDefined();
      expect(runAction!.capability).toBe("bolt.command.execute");
    });

    it("should have task action", () => {
      const boltCmd = boltPlugin.cliCommands!.find(c => c.name === "bolt");
      const taskAction = boltCmd!.actions!.find(a => a.name === "task");
      expect(taskAction).toBeDefined();
      expect(taskAction!.capability).toBe("bolt.task.execute");
    });
  });

  describe("Lifecycle - initialize()", () => {
    it("should initialize successfully", async () => {
      vi.mocked(mockBoltService.getInventory).mockResolvedValue({
        nodes: [],
        groups: [],
      });

      await expect(boltPlugin.initialize({})).resolves.not.toThrow();
    });

    it("should log initialization info", async () => {
      vi.mocked(mockBoltService.getInventory).mockResolvedValue({
        nodes: [],
        groups: [],
      });

      await boltPlugin.initialize({});

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it("should handle initialization errors gracefully", async () => {
      vi.mocked(mockBoltService.getInventory).mockRejectedValue(
        new Error("Inventory not found"),
      );

      // Should not throw - initialization is graceful
      await expect(boltPlugin.initialize({})).resolves.not.toThrow();
    });
  });

  describe("Lifecycle - healthCheck()", () => {
    it("should return health status object", async () => {
      const health = await boltPlugin.healthCheck();

      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe("boolean");
      expect(health.lastCheck).toBeDefined();
    });

    it("should include details when available", async () => {
      vi.mocked(mockBoltService.validateBoltInstallation).mockResolvedValue(undefined);
      vi.mocked(mockBoltService.getInventory).mockResolvedValue({
        nodes: [{ name: "node1" }],
        groups: [],
      });

      await boltPlugin.initialize({});
      const health = await boltPlugin.healthCheck();

      expect(health.details).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should expose config schema", () => {
      expect(boltPlugin.configSchema).toBeDefined();
    });

    it("should define default permissions", () => {
      expect(boltPlugin.defaultPermissions).toBeDefined();
      expect(boltPlugin.defaultPermissions["bolt.command.execute"]).toContain("admin");
      expect(boltPlugin.defaultPermissions["bolt.inventory.list"]).toContain("viewer");
    });
  });

  describe("Capability Handlers", () => {
    const mockContext: ExecutionContext = {
      user: {
        id: "test-user",
        username: "tester",
        roles: ["admin"],
        permissions: ["bolt.command.execute"],
      },
      correlationId: "test-correlation-id",
    };

    describe("bolt.command.execute", () => {
      it("should execute command through BoltService", async () => {
        const mockResult = {
          success: true,
          results: [{ node: "node1", status: "success", output: "test" }],
          summary: { total: 1, success: 1, failed: 0 },
        };
        vi.mocked(mockBoltService.runCommand).mockResolvedValue(mockResult);

        await boltPlugin.initialize({});

        const commandCap = boltPlugin.capabilities.find(
          c => c.name === "bolt.command.execute",
        )!;

        const result = await commandCap.handler(
          { command: "uptime", targets: ["node1"] },
          mockContext,
        );

        expect(result).toBeDefined();
        expect(mockBoltService.runCommand).toHaveBeenCalled();
      });
    });

    describe("bolt.inventory.list", () => {
      it("should return inventory from BoltService", async () => {
        const mockInventory = {
          nodes: [{ name: "node1" }, { name: "node2" }],
          groups: [],
        };
        vi.mocked(mockBoltService.getInventory).mockResolvedValue(mockInventory);

        await boltPlugin.initialize({});

        const inventoryCap = boltPlugin.capabilities.find(
          c => c.name === "bolt.inventory.list",
        )!;

        const result = await inventoryCap.handler({}, mockContext);

        expect(result).toBeDefined();
        expect(mockBoltService.getInventory).toHaveBeenCalled();
      });
    });

    describe("bolt.facts.query", () => {
      it("should gather facts through BoltService", async () => {
        const mockFacts = {
          os: { name: "Linux" },
          kernel: "5.4.0",
        };
        vi.mocked(mockBoltService.gatherFacts).mockResolvedValue(mockFacts);

        await boltPlugin.initialize({});

        const factsCap = boltPlugin.capabilities.find(
          c => c.name === "bolt.facts.query",
        )!;

        const result = await factsCap.handler({ target: "node1" }, mockContext);

        expect(result).toBeDefined();
        expect(mockBoltService.gatherFacts).toHaveBeenCalled();
      });
    });

    describe("bolt.task.list", () => {
      it("should return tasks from BoltService", async () => {
        const mockTasks = [
          { name: "package::install", module: "package" },
          { name: "service::restart", module: "service" },
        ];
        vi.mocked(mockBoltService.listTasks).mockResolvedValue(mockTasks);

        await boltPlugin.initialize({});

        const taskListCap = boltPlugin.capabilities.find(
          c => c.name === "bolt.task.list",
        )!;

        const result = await taskListCap.handler({}, mockContext);

        expect(result).toBeDefined();
        expect(mockBoltService.listTasks).toHaveBeenCalled();
      });
    });
  });

  describe("BoltService access", () => {
    it("should expose getBoltService method", () => {
      const service = boltPlugin.getBoltService();
      expect(service).toBe(mockBoltService);
    });
  });
});
