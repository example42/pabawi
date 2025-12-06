/**
 * Unit tests for BoltPlugin
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoltPlugin } from "../../../src/integrations/bolt/BoltPlugin";
import type { BoltService } from "../../../src/bolt/BoltService";
import type { IntegrationConfig } from "../../../src/integrations/types";

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
      getBoltProjectPath: vi.fn().mockReturnValue("/test/bolt-project"),
    } as unknown as BoltService;

    boltPlugin = new BoltPlugin(mockBoltService);
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

    it("should throw error when inventory is not accessible", async () => {
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

      await expect(boltPlugin.initialize(config)).rejects.toThrow(
        "Inventory not found",
      );
      expect(boltPlugin.isInitialized()).toBe(false);
    });
  });

  describe("healthCheck", () => {
    it("should return healthy status when Bolt is operational", async () => {
      const mockInventory = [
        { id: "node1", name: "node1", uri: "ssh://node1", transport: "ssh" as const },
        { id: "node2", name: "node2", uri: "ssh://node2", transport: "ssh" as const },
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
      const health = await boltPlugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain("2 nodes in inventory");
      expect(health.details).toEqual({
        nodeCount: 2,
        projectPath: "/test/bolt-project",
      });
    });

    it("should return unhealthy status when not initialized", async () => {
      const health = await boltPlugin.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("Plugin is not initialized");
    });

    it("should return unhealthy status when inventory check fails", async () => {
      vi.mocked(mockBoltService.getInventory)
        .mockResolvedValueOnce([]) // First call for initialization
        .mockRejectedValueOnce(new Error("Connection failed")); // Second call for health check

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
      expect(health.message).toContain("Connection failed");
    });
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
