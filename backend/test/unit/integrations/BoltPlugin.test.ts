/**
 * Unit tests for BoltPlugin
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoltPlugin } from "../../../src/integrations/bolt/BoltPlugin";
import type { BoltService } from "../../../src/integrations/bolt/BoltService";
import type { IntegrationConfig } from "../../../src/integrations/types";

// Mock child_process
const mockSpawn = vi.fn();
vi.mock("child_process", () => ({
  spawn: mockSpawn,
}));

// Mock fs
const mockExistsSync = vi.fn();
vi.mock("fs", () => ({
  existsSync: mockExistsSync,
}));

describe("BoltPlugin", () => {
  let mockBoltService: BoltService;
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
    } as unknown as BoltService;

    boltPlugin = new BoltPlugin(mockBoltService);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize successfully when inventory is accessible", async () => {
      const mockInventory = [
        { id: "node1", name: "node1", uri: "ssh://node1", transport: "ssh" as const },
      ];
      vi.mocked(mockBoltService.getInventory).mockResolvedValue(mockInventory);

      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };

      await boltPlugin.initialize(config);

      expect(boltPlugin.isInitialized()).toBe(true);
      expect(mockBoltService.getInventory).toHaveBeenCalledOnce();
    });

    it("should initialize gracefully when inventory is not accessible", async () => {
      vi.mocked(mockBoltService.getInventory).mockRejectedValue(
        new Error("Inventory not found"),
      );

      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };

      // Should not throw error - initialization should be graceful
      await expect(boltPlugin.initialize(config)).resolves.not.toThrow();
      expect(boltPlugin.isInitialized()).toBe(true);
    });
  });

  describe("healthCheck", () => {
    it("should return unhealthy status when Bolt is not available", async () => {
      const mockInventory = [
        { id: "node1", name: "node1", uri: "ssh://node1", transport: "ssh" as const },
        { id: "node2", name: "node2", uri: "ssh://node2", transport: "ssh" as const },
      ];
      vi.mocked(mockBoltService.getInventory).mockResolvedValue(mockInventory);

      // Mock spawn to simulate bolt command not available
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === "error") {
            setTimeout(() => callback(new Error("Command not found")), 10);
          }
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };

      await boltPlugin.initialize(config);
      const health = await boltPlugin.healthCheck();

      // Since Bolt is not installed on the test system, health check should fail
      expect(health.healthy).toBe(false);
      expect(health.message).toContain("Bolt");
    }, 10000);

    it("should return unhealthy status when not initialized", async () => {
      const health = await boltPlugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("Plugin is not initialized");
    });

    it("should return unhealthy status when Bolt command is not available", async () => {
      vi.mocked(mockBoltService.getInventory)
        .mockResolvedValueOnce([]); // First call for initialization

      // Mock spawn to simulate bolt command not available
      const mockProcess = {
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(1), 10); // Exit code 1 = failure
          }
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };

      await boltPlugin.initialize(config);
      const health = await boltPlugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain("Bolt command is not available");
    }, 10000);
  });

  describe("executeAction", () => {
    beforeEach(async () => {
      vi.mocked(mockBoltService.getInventory).mockResolvedValue([]);
      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };
      await boltPlugin.initialize(config);
    });

    it("should execute command action", async () => {
      const mockResult = {
        success: true,
        results: [],
        summary: { total: 1, success: 1, failed: 0 },
      };
      vi.mocked(mockBoltService.runCommand).mockResolvedValue(mockResult);

      const action = {
        type: "command" as const,
        target: "node1",
        action: "uptime",
      };

      const result = await boltPlugin.executeAction(action);

      expect(result).toEqual(mockResult);
      expect(mockBoltService.runCommand).toHaveBeenCalledWith("node1", "uptime", undefined);
    });

    it("should execute task action", async () => {
      const mockResult = {
        success: true,
        results: [],
        summary: { total: 1, success: 1, failed: 0 },
      };
      vi.mocked(mockBoltService.runTask).mockResolvedValue(mockResult);

      const action = {
        type: "task" as const,
        target: "node1",
        action: "package::install",
        parameters: { name: "nginx" },
      };

      const result = await boltPlugin.executeAction(action);

      expect(result).toEqual(mockResult);
      expect(mockBoltService.runTask).toHaveBeenCalledWith(
        "node1",
        "package::install",
        { name: "nginx" },
        undefined,
      );
    });

    it("should execute script action", async () => {
      const action = {
        type: "script" as const,
        target: "node1",
        action: "/path/to/script.sh",
      };

      await expect(boltPlugin.executeAction(action)).rejects.toThrow(
        "Script execution not yet implemented",
      );
    });

    it("should throw error for unsupported action type", async () => {
      const action = {
        type: "unsupported" as any,
        target: "node1",
        action: "test",
      };

      await expect(boltPlugin.executeAction(action)).rejects.toThrow(
        "Unsupported action type: unsupported",
      );
    });

    it("should throw error when not initialized", async () => {
      const uninitializedPlugin = new BoltPlugin(mockBoltService);

      const action = {
        type: "command" as const,
        target: "node1",
        action: "uptime",
      };

      await expect(uninitializedPlugin.executeAction(action)).rejects.toThrow(
        "Bolt plugin not initialized",
      );
    });
  });

  describe("getGroups", () => {
    it("should return empty array when inventory file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const config: IntegrationConfig = {
        enabled: true,
        name: "bolt",
        type: "both",
        config: {},
        priority: 5,
      };

      const mockInventory = [
        { id: "node1", name: "node1", uri: "ssh://node1", transport: "ssh" as const },
      ];
      vi.mocked(mockBoltService.getInventory).mockResolvedValue(mockInventory);
      await boltPlugin.initialize(config);

      const groups = await boltPlugin.getGroups();
      expect(groups).toEqual([]);
    });

    it("should throw error when not initialized", async () => {
      const uninitializedPlugin = new BoltPlugin(mockBoltService);

      await expect(uninitializedPlugin.getGroups()).rejects.toThrow(
        "Bolt plugin not initialized",
      );
    });
  });

  describe("getBoltService", () => {
    it("should return the wrapped BoltService instance", () => {
      const service = boltPlugin.getBoltService();
      expect(service).toBe(mockBoltService);
    });
  });

  describe("plugin metadata", () => {
    it("should have correct name and type", () => {
      expect(boltPlugin.name).toBe("bolt");
      expect(boltPlugin.type).toBe("both");
    });
  });
});
