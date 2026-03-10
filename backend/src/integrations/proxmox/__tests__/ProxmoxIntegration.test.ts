/**
 * ProxmoxIntegration Unit Tests
 *
 * Tests for the ProxmoxIntegration plugin class.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProxmoxIntegration } from "../ProxmoxIntegration";
import type { IntegrationConfig } from "../../types";
import type { LoggerService } from "../../../services/LoggerService";
import type { PerformanceMonitorService } from "../../../services/PerformanceMonitorService";

// Mock ProxmoxService
const mockService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn(),
  getInventory: vi.fn(),
  getGroups: vi.fn(),
  getNodeFacts: vi.fn(),
  executeAction: vi.fn(),
  listCapabilities: vi.fn(),
  listProvisioningCapabilities: vi.fn(),
};

vi.mock("../ProxmoxService", () => ({
  ProxmoxService: class {
    initialize = mockService.initialize;
    healthCheck = mockService.healthCheck;
    getInventory = mockService.getInventory;
    getGroups = mockService.getGroups;
    getNodeFacts = mockService.getNodeFacts;
    executeAction = mockService.executeAction;
    listCapabilities = mockService.listCapabilities;
    listProvisioningCapabilities = mockService.listProvisioningCapabilities;
  },
}));

describe("ProxmoxIntegration", () => {
  let plugin: ProxmoxIntegration;
  let mockLogger: LoggerService;
  let mockPerfMonitor: PerformanceMonitorService;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService;

    // Create mock performance monitor
    const mockComplete = vi.fn();
    mockPerfMonitor = {
      startTimer: vi.fn(() => mockComplete),
    } as unknown as PerformanceMonitorService;

    // Create plugin instance
    plugin = new ProxmoxIntegration(mockLogger, mockPerfMonitor);
  });

  describe("initialization", () => {
    it("should initialize with valid configuration", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          username: "root",
          password: "password", // pragma: allowlist secret
          realm: "pam",
        },
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
      expect(mockService.initialize).toHaveBeenCalledOnce();
    });

    it("should throw error for missing host", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          port: 8006,
          username: "root",
          password: "password", // pragma: allowlist secret
          realm: "pam",
        },
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        "Proxmox configuration must include a valid host"
      );
    });

    it("should throw error for invalid port", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 70000,
          username: "root",
          password: "password", // pragma: allowlist secret
          realm: "pam",
        },
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        "Proxmox port must be between 1 and 65535"
      );
    });

    it("should throw error for missing authentication", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          username: "root",
          realm: "pam",
        },
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        "Proxmox configuration must include either token or password authentication"
      );
    });

    it("should throw error for missing realm with password auth", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          username: "root",
          password: "password", // pragma: allowlist secret
        },
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        "Proxmox password authentication requires a realm"
      );
    });

    it("should log warning when SSL verification is disabled", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          username: "root",
          password: "password", // pragma: allowlist secret
          realm: "pam",
          ssl: {
            rejectUnauthorized: false,
          },
        },
      };

      await plugin.initialize(config);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "TLS certificate verification is disabled - this is insecure",
        expect.objectContaining({
          component: "ProxmoxIntegration",
          operation: "validateProxmoxConfig",
        })
      );
    });

    it("should accept token authentication", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          token: "user@realm!tokenid=uuid",
        },
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
      expect(mockService.initialize).toHaveBeenCalledOnce();
    });
  });

  describe("health check", () => {
    beforeEach(async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          token: "user@realm!tokenid=uuid",
        },
      };
      await plugin.initialize(config);
    });

    it("should delegate health check to service", async () => {
      mockService.healthCheck.mockResolvedValue({
        healthy: true,
        message: "Proxmox API is reachable",
      });

      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(mockService.healthCheck).toHaveBeenCalledOnce();
    });
  });

  describe("InformationSourcePlugin methods", () => {
    beforeEach(async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          token: "user@realm!tokenid=uuid",
        },
      };
      await plugin.initialize(config);
    });

    it("should delegate getInventory to service", async () => {
      const mockNodes = [
        {
          id: "proxmox:pve1:100",
          name: "test-vm",
          uri: "proxmox://pve1/100",
          transport: "ssh" as const,
          config: {},
          source: "proxmox",
        },
      ];
      mockService.getInventory.mockResolvedValue(mockNodes);

      const inventory = await plugin.getInventory();

      expect(inventory).toEqual(mockNodes);
      expect(mockService.getInventory).toHaveBeenCalledOnce();
    });

    it("should delegate getGroups to service", async () => {
      const mockGroups = [
        {
          id: "proxmox:node:pve1",
          name: "Proxmox Node: pve1",
          source: "proxmox",
          sources: ["proxmox"],
          linked: false,
          nodes: ["proxmox:pve1:100"],
        },
      ];
      mockService.getGroups.mockResolvedValue(mockGroups);

      const groups = await plugin.getGroups();

      expect(groups).toEqual(mockGroups);
      expect(mockService.getGroups).toHaveBeenCalledOnce();
    });

    it("should delegate getNodeFacts to service", async () => {
      const mockFacts = {
        nodeId: "proxmox:pve1:100",
        gatheredAt: "2024-01-01T00:00:00Z",
        source: "proxmox",
        facts: {
          os: { family: "linux", name: "ubuntu", release: { full: "22.04", major: "22" } },
          processors: { count: 2, models: [] },
          memory: { system: { total: "2 GB", available: "1 GB" } },
          networking: { hostname: "test-vm", interfaces: {} },
        },
      };
      mockService.getNodeFacts.mockResolvedValue(mockFacts);

      const facts = await plugin.getNodeFacts("proxmox:pve1:100");

      expect(facts).toEqual(mockFacts);
      expect(mockService.getNodeFacts).toHaveBeenCalledWith("proxmox:pve1:100");
    });

    it("should return null for getNodeData", async () => {
      const data = await plugin.getNodeData("proxmox:pve1:100", "reports");

      expect(data).toBeNull();
    });
  });

  describe("ExecutionToolPlugin methods", () => {
    beforeEach(async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "proxmox",
        type: "both",
        config: {
          host: "proxmox.example.com",
          port: 8006,
          token: "user@realm!tokenid=uuid",
        },
      };
      await plugin.initialize(config);
    });

    it("should delegate executeAction to service", async () => {
      const mockResult = {
        id: "task-123",
        type: "task" as const,
        targetNodes: ["proxmox:pve1:100"],
        action: "start",
        status: "success" as const,
        startedAt: "2024-01-01T00:00:00Z",
        completedAt: "2024-01-01T00:00:05Z",
        results: [],
      };
      mockService.executeAction.mockResolvedValue(mockResult);

      const action = {
        type: "task" as const,
        target: "proxmox:pve1:100",
        action: "start",
      };

      const result = await plugin.executeAction(action);

      expect(result).toEqual(mockResult);
      expect(mockService.executeAction).toHaveBeenCalledWith(action);
    });

    it("should delegate listCapabilities to service", () => {
      const mockCapabilities = [
        { name: "start", description: "Start a VM or container", parameters: [] },
        { name: "stop", description: "Force stop a VM or container", parameters: [] },
      ];
      mockService.listCapabilities.mockReturnValue(mockCapabilities);

      const capabilities = plugin.listCapabilities();

      expect(capabilities).toEqual(mockCapabilities);
      expect(mockService.listCapabilities).toHaveBeenCalledOnce();
    });

    it("should delegate listProvisioningCapabilities to service", () => {
      const mockCapabilities = [
        {
          name: "create_vm",
          description: "Create a new virtual machine",
          operation: "create" as const,
          parameters: [],
        },
      ];
      mockService.listProvisioningCapabilities.mockReturnValue(mockCapabilities);

      const capabilities = plugin.listProvisioningCapabilities();

      expect(capabilities).toEqual(mockCapabilities);
      expect(mockService.listProvisioningCapabilities).toHaveBeenCalledOnce();
    });
  });

  describe("error handling", () => {
    it("should throw error when calling methods before initialization", async () => {
      await expect(plugin.getInventory()).rejects.toThrow(
        "Proxmox integration is not initialized"
      );
      await expect(plugin.getGroups()).rejects.toThrow(
        "Proxmox integration is not initialized"
      );
      await expect(plugin.getNodeFacts("proxmox:pve1:100")).rejects.toThrow(
        "Proxmox integration is not initialized"
      );
      await expect(
        plugin.executeAction({
          type: "task",
          target: "proxmox:pve1:100",
          action: "start",
        })
      ).rejects.toThrow("Proxmox integration is not initialized");
      expect(() => plugin.listCapabilities()).toThrow(
        "Proxmox integration is not initialized"
      );
      expect(() => plugin.listProvisioningCapabilities()).toThrow(
        "Proxmox integration is not initialized"
      );
    });
  });
});
