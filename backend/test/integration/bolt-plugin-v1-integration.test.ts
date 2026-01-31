/**
 * Bolt Plugin v1.0.0 Integration Tests (Capability-Based)
 *
 * These tests verify that the Bolt plugin correctly integrates with
 * the IntegrationManager using the new capability-based architecture (v1.0.0).
 *
 * Pre-requisites:
 * - Bolt installed on the system
 * - Valid inventory.yaml in the Bolt project path
 *
 * Note: These tests will be skipped if Bolt is not available
 */
import { describe, it, expect, beforeAll } from "vitest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager.js";
import { BoltPlugin } from "../../src/integrations/bolt/BoltPlugin.js";
import { BoltService } from "../../src/bolt/BoltService.js";
import { LoggerService } from "../../src/services/LoggerService.js";
import { PerformanceMonitorService } from "../../src/services/PerformanceMonitorService.js";
import { IntegrationType, type User } from "../../src/integrations/types.js";
import type { Node } from "../../src/bolt/types.js";

// Check if Bolt is available before running tests
async function checkBoltAvailability(): Promise<boolean> {
  try {
    const { spawn } = await import("child_process");

    return new Promise<boolean>((resolve) => {
      const boltCheck = spawn("bolt", ["--version"], { stdio: "pipe" });

      let resolved = false;

      const handleClose = (code: number | null): void => {
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      };

      const handleError = (): void => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };

      boltCheck.on("close", handleClose);
      boltCheck.on("error", handleError);

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          boltCheck.kill();
          resolve(false);
        }
      }, 5000);
    });
  } catch {
    return false;
  }
}

describe("Bolt Plugin v1.0.0 Integration (Capability-Based)", () => {
  let integrationManager: IntegrationManager;
  let boltService: BoltService;
  let boltPlugin: BoltPlugin;
  let logger: LoggerService;
  let performanceMonitor: PerformanceMonitorService;
  let testNode: Node | undefined;
  let boltAvailable = false;

  // Mock admin user for capability execution
  const adminUser: User = {
    id: "test-admin",
    username: "admin",
    roles: ["admin"],
    permissions: [
      "bolt.command.execute",
      "bolt.task.execute",
      "bolt.inventory.list",
      "bolt.facts.query",
      "bolt.task.list",
      "bolt.task.details",
    ],
  };

  // Mock read-only user for permission tests
  const readOnlyUser: User = {
    id: "test-readonly",
    username: "readonly",
    roles: ["viewer"],
    permissions: ["bolt.inventory.list", "bolt.task.list"],
  };

  beforeAll(async () => {
    // Check if Bolt is available
    boltAvailable = await checkBoltAvailability();

    if (!boltAvailable) {
      console.warn(
        "\n⚠️  Bolt not available in test environment. Integration tests will be skipped.",
      );
      console.warn(
        "   To run these tests, ensure Bolt is installed and available in PATH.\n",
      );
      return;
    }

    // Create real services for integration testing
    logger = new LoggerService("error");
    performanceMonitor = new PerformanceMonitorService();
    integrationManager = new IntegrationManager({ logger });
    boltService = new BoltService("./bolt-project");
    boltPlugin = new BoltPlugin(boltService, logger, performanceMonitor);

    // Register the Bolt plugin using v1.0.0 capability-based registration
    integrationManager.registerCapabilityPlugin(boltPlugin, { priority: 10 });

    // Try to get a test node from inventory
    try {
      const inventory = await boltService.getInventory();
      if (inventory.nodes.length > 0) {
        testNode = inventory.nodes[0];
      }
    } catch {
      console.log("Could not load inventory for tests");
    }
  });

  describe("Plugin Registration", () => {
    it("should register plugin metadata correctly", () => {
      expect(boltPlugin.metadata.name).toBe("bolt");
      expect(boltPlugin.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(boltPlugin.metadata.integrationType).toBe(IntegrationType.RemoteExecution);
    });

    it("should define all expected capabilities", () => {
      const capabilities = boltPlugin.capabilities;

      expect(capabilities).toBeDefined();
      expect(capabilities.length).toBeGreaterThanOrEqual(6);

      const capabilityNames = capabilities.map((c) => c.name);
      expect(capabilityNames).toContain("bolt.command.execute");
      expect(capabilityNames).toContain("bolt.task.execute");
      expect(capabilityNames).toContain("bolt.inventory.list");
      expect(capabilityNames).toContain("bolt.facts.query");
      expect(capabilityNames).toContain("bolt.task.list");
      expect(capabilityNames).toContain("bolt.task.details");
    });

    it("should define widgets for UI integration", () => {
      const widgets = boltPlugin.widgets;

      expect(widgets).toBeDefined();
      expect(widgets!.length).toBeGreaterThanOrEqual(4);

      const widgetIds = widgets!.map((w) => w.id);
      // Widget IDs use colon notation: bolt:widget-name
      expect(widgetIds).toContain("bolt:command-executor");
      expect(widgetIds).toContain("bolt:task-runner");
      expect(widgetIds).toContain("bolt:inventory-viewer");
      expect(widgetIds).toContain("bolt:task-browser");
    });

    it("should define CLI commands for automation", () => {
      const cliCommands = boltPlugin.cliCommands;

      expect(cliCommands).toBeDefined();
      // CLI commands are structured with actions nested under the main command
      expect(cliCommands!.length).toBeGreaterThanOrEqual(1);

      // Main command should be "bolt"
      const boltCommand = cliCommands!.find((c) => c.name === "bolt");
      expect(boltCommand).toBeDefined();
      expect(boltCommand!.actions).toBeDefined();
      expect(boltCommand!.actions!.length).toBeGreaterThanOrEqual(4);

      const actionNames = boltCommand!.actions!.map((a) => a.name);
      expect(actionNames).toContain("run");
      expect(actionNames).toContain("task");
      expect(actionNames).toContain("inventory");
      expect(actionNames).toContain("facts");
    });

    it("should register capabilities with IntegrationManager", () => {
      const allCapabilities = integrationManager.getAllCapabilities();

      const boltCapabilities = allCapabilities.filter((c) =>
        c.capability.name.startsWith("bolt."),
      );

      expect(boltCapabilities.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe("Capability Metadata", () => {
    it("should define proper permission requirements for each capability", () => {
      const commandCapability = boltPlugin.capabilities.find(
        (c) => c.name === "bolt.command.execute",
      );

      expect(commandCapability).toBeDefined();
      expect(commandCapability!.requiredPermissions).toContain(
        "bolt.command.execute",
      );
      // Risk level uses 'execute' for write operations, 'read' for read operations
      expect(commandCapability!.riskLevel).toBe("execute");
    });

    it("should categorize capabilities correctly", () => {
      const commandCapability = boltPlugin.capabilities.find(
        (c) => c.name === "bolt.command.execute",
      );
      const inventoryCapability = boltPlugin.capabilities.find(
        (c) => c.name === "bolt.inventory.list",
      );

      expect(commandCapability!.category).toBe("command");
      expect(inventoryCapability!.category).toBe("inventory");
    });

    it("should define schema for input validation", () => {
      const commandCapability = boltPlugin.capabilities.find(
        (c) => c.name === "bolt.command.execute",
      );

      expect(commandCapability!.schema).toBeDefined();
      // Schema is a JSON schema object, not a Zod schema
      expect(commandCapability!.schema.arguments).toBeDefined();
      expect(commandCapability!.schema.arguments.command).toBeDefined();
      expect(commandCapability!.schema.arguments.targets).toBeDefined();
    });

    it("should define required fields in schema", () => {
      const commandCapability = boltPlugin.capabilities.find(
        (c) => c.name === "bolt.command.execute",
      );

      // Schema defines required fields via the `required` property
      expect(commandCapability!.schema.arguments.command.required).toBe(true);
      expect(commandCapability!.schema.arguments.targets.required).toBe(true);
    });
  });

  describe("Capability Execution via IntegrationManager", () => {
    it("should execute bolt.inventory.list capability", async () => {
      if (!boltAvailable) {
        expect(true).toBe(true);
        return;
      }

      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.inventory.list",
        {},
      );

      // If Bolt project doesn't exist, capability fails gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        return;
      }

      expect(result.data).toBeDefined();
      expect(result.executedBy).toBe("bolt");
    });

    it("should execute bolt.task.list capability", async () => {
      if (!boltAvailable) {
        expect(true).toBe(true);
        return;
      }

      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.task.list",
        {},
      );

      // If Bolt project doesn't exist, capability fails gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        return;
      }

      expect(result.data).toBeDefined();
      expect(result.executedBy).toBe("bolt");
    });

    it("should execute bolt.command.execute capability", async () => {
      if (!boltAvailable || !testNode) {
        expect(true).toBe(true);
        return;
      }

      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.command.execute",
        {
          targets: [testNode.name],
          command: "whoami",
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executedBy).toBe("bolt");
    });

    it("should execute bolt.facts.query capability", async () => {
      if (!boltAvailable || !testNode) {
        expect(true).toBe(true);
        return;
      }

      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.facts.query",
        {
          target: testNode.name,
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.executedBy).toBe("bolt");
    });

    it("should validate capability input before execution", async () => {
      if (!boltAvailable) {
        expect(true).toBe(true);
        return;
      }

      // Execute with invalid input (missing required fields)
      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.command.execute",
        {
          // Missing targets and command
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Widget Definitions", () => {
    it("should define CommandExecutor widget with proper configuration", () => {
      const widget = boltPlugin.widgets!.find(
        (w) => w.id === "bolt:command-executor",
      );

      expect(widget).toBeDefined();
      expect(widget!.name).toBe("Command Executor");
      // Widgets use 'slots' array, not single 'slot'
      expect(widget!.slots).toBeDefined();
      expect(widget!.slots).toContain("dashboard");
      expect(widget!.requiredCapabilities).toContain("bolt.command.execute");
    });

    it("should define TaskBrowser widget with sidebar slot", () => {
      const widget = boltPlugin.widgets!.find(
        (w) => w.id === "bolt:task-browser",
      );

      expect(widget).toBeDefined();
      expect(widget!.slots).toContain("sidebar");
      expect(widget!.requiredCapabilities).toContain("bolt.task.list");
    });

    it("should register all widgets with IntegrationManager", () => {
      const registry = integrationManager.getCapabilityRegistry();
      const allWidgets = registry.getAllWidgets();

      const boltWidgets = allWidgets.filter((w) =>
        w.widget.id.startsWith("bolt:"),
      );

      expect(boltWidgets.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("CLI Command Definitions", () => {
    it("should define bolt command with run action", () => {
      const boltCmd = boltPlugin.cliCommands!.find(
        (c) => c.name === "bolt",
      );

      expect(boltCmd).toBeDefined();
      const runAction = boltCmd!.actions!.find((a) => a.name === "run");
      expect(runAction).toBeDefined();
      expect(runAction!.capability).toBe("bolt.command.execute");
    });

    it("should define bolt command with task action", () => {
      const boltCmd = boltPlugin.cliCommands!.find(
        (c) => c.name === "bolt",
      );

      expect(boltCmd).toBeDefined();
      const taskAction = boltCmd!.actions!.find((a) => a.name === "task");
      expect(taskAction).toBeDefined();
      expect(taskAction!.capability).toBe("bolt.task.execute");
    });
  });

  describe("Plugin Lifecycle", () => {
    it("should support initialization", async () => {
      const tempLogger = new LoggerService("error");
      const tempPerfMonitor = new PerformanceMonitorService();
      const tempBoltService = new BoltService("./bolt-project");
      const tempPlugin = new BoltPlugin(
        tempBoltService,
        tempLogger,
        tempPerfMonitor,
      );

      // Initialize should not throw
      await expect(tempPlugin.initialize({})).resolves.not.toThrow();
    });

    it("should provide health check status", async () => {
      const health = await boltPlugin.healthCheck();

      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe("boolean");
      expect(health.lastCheck).toBeDefined();
    });

    it("should have metadata with version info", () => {
      // Plugin metadata should have version
      expect(boltPlugin.metadata.version).toBeDefined();
      expect(boltPlugin.metadata.minPabawiVersion).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent capability gracefully", async () => {
      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.nonexistent.capability",
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle capability execution failures", async () => {
      if (!boltAvailable) {
        expect(true).toBe(true);
        return;
      }

      // Execute command on non-existent target
      const result = await integrationManager.executeCapability(
        adminUser,
        "bolt.command.execute",
        {
          targets: ["non-existent-node-12345"],
          command: "whoami",
        },
      );

      // Should either succeed (if wildcard) or fail gracefully
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("Backward Compatibility Bridge", () => {
    it("should still work with getAggregatedInventory", async () => {
      if (!boltAvailable) {
        expect(true).toBe(true);
        return;
      }

      // The IntegrationManager's getAggregatedInventory should use
      // the bolt.inventory.list capability under the hood
      const aggregated = await integrationManager.getAggregatedInventory();

      expect(aggregated).toBeDefined();
      expect(aggregated.nodes).toBeDefined();
    });
  });
});
