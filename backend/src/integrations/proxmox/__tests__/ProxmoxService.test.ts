/**
 * ProxmoxService Unit Tests
 *
 * Tests for the ProxmoxService business logic layer.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProxmoxService } from "../ProxmoxService";
import type { ProxmoxConfig, ProxmoxGuest } from "../types";
import type { LoggerService } from "../../../services/LoggerService";
import type { PerformanceMonitorService } from "../../../services/PerformanceMonitorService";

// Create mock client
const mockClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  waitForTask: vi.fn(),
};

// Mock ProxmoxClient module
vi.mock("../ProxmoxClient", () => ({
  ProxmoxClient: class {
    authenticate = mockClient.authenticate;
    get = mockClient.get;
    post = mockClient.post;
    delete = mockClient.delete;
    waitForTask = mockClient.waitForTask;
  },
}));

describe("ProxmoxService", () => {
  let service: ProxmoxService;
  let mockLogger: LoggerService;
  let mockPerfMonitor: PerformanceMonitorService;
  let mockConfig: ProxmoxConfig;

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

    // Create mock config
    mockConfig = {
      host: "proxmox.example.com",
      port: 8006,
      username: "root",
      password: "password", // pragma: allowlist secret
      realm: "pam",
    };

    // Create service instance
    service = new ProxmoxService(mockConfig, mockLogger, mockPerfMonitor);
  });

  describe("getInventory", () => {
    it("should fetch and transform inventory from Proxmox API", async () => {
      // Mock API response
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "test-vm-1",
          node: "pve1",
          type: "qemu",
          status: "running",
          maxmem: 2147483648,
          cpus: 2,
          uptime: 3600,
        },
        {
          vmid: 101,
          name: "test-container-1",
          node: "pve1",
          type: "lxc",
          status: "stopped",
          maxmem: 536870912,
          cpus: 1,
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // Call getInventory
      const nodes = await service.getInventory();

      // Verify API call
      expect(mockClient.get).toHaveBeenCalledWith(
        "/api2/json/cluster/resources?type=vm"
      );

      // Verify results
      expect(nodes).toHaveLength(2);

      // Verify first node (VM)
      expect(nodes[0]).toMatchObject({
        id: "proxmox:pve1:100",
        name: "test-vm-1",
        uri: "proxmox://pve1/100",
        transport: "ssh",
        source: "proxmox",
        status: "running",
      });
      expect(nodes[0].metadata).toMatchObject({
        vmid: 100,
        node: "pve1",
        type: "qemu",
        status: "running",
        maxmem: 2147483648,
        cpus: 2,
        uptime: 3600,
      });

      // Verify second node (LXC)
      expect(nodes[1]).toMatchObject({
        id: "proxmox:pve1:101",
        name: "test-container-1",
        uri: "proxmox://pve1/101",
        transport: "ssh",
        source: "proxmox",
        status: "stopped",
      });
      expect(nodes[1].metadata).toMatchObject({
        vmid: 101,
        node: "pve1",
        type: "lxc",
        status: "stopped",
        maxmem: 536870912,
        cpus: 1,
      });

      // Verify performance monitoring
      expect(mockPerfMonitor.startTimer).toHaveBeenCalledWith(
        "proxmox:getInventory"
      );
    });

    it("should return cached inventory on subsequent calls within TTL", async () => {
      // Mock API response
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "test-vm-1",
          node: "pve1",
          type: "qemu",
          status: "running",
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // First call - should hit API
      const nodes1 = await service.getInventory();
      expect(mockClient.get).toHaveBeenCalledTimes(1);
      expect(nodes1).toHaveLength(1);

      // Second call - should use cache
      const nodes2 = await service.getInventory();
      expect(mockClient.get).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(nodes2).toHaveLength(1);
      expect(nodes2).toEqual(nodes1);
    });

    it("should throw error if client is not initialized", async () => {
      // Don't initialize service
      await expect(service.getInventory()).rejects.toThrow(
        "ProxmoxClient not initialized"
      );
    });

    it("should throw error if API returns non-array response", async () => {
      // Mock invalid API response
      mockClient.get.mockResolvedValue({ invalid: "response" });

      // Initialize service
      await service.initialize();

      // Call should throw
      await expect(service.getInventory()).rejects.toThrow(
        "Unexpected response format from Proxmox API"
      );
    });

    it("should handle empty inventory", async () => {
      // Mock empty API response
      mockClient.get.mockResolvedValue([]);

      // Initialize service
      await service.initialize();

      // Call getInventory
      const nodes = await service.getInventory();

      // Verify empty result
      expect(nodes).toHaveLength(0);
      expect(nodes).toEqual([]);
    });

    it("should omit optional fields when not present", async () => {
      // Mock API response with minimal fields
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "minimal-vm",
          node: "pve1",
          type: "qemu",
          status: "stopped",
          // No optional fields
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // Call getInventory
      const nodes = await service.getInventory();

      // Verify node has only required fields in metadata
      expect(nodes[0].metadata).toMatchObject({
        vmid: 100,
        node: "pve1",
        type: "qemu",
        status: "stopped",
      });

      // Verify optional fields are not present
      expect(nodes[0].metadata).not.toHaveProperty("maxmem");
      expect(nodes[0].metadata).not.toHaveProperty("cpus");
      expect(nodes[0].metadata).not.toHaveProperty("uptime");
    });
  });

  describe("getGroups", () => {
    it("should create groups by node, status, and type", async () => {
      // Mock API response with diverse guests
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "vm-1",
          node: "pve1",
          type: "qemu",
          status: "running",
        },
        {
          vmid: 101,
          name: "vm-2",
          node: "pve1",
          type: "qemu",
          status: "stopped",
        },
        {
          vmid: 200,
          name: "container-1",
          node: "pve2",
          type: "lxc",
          status: "running",
        },
        {
          vmid: 201,
          name: "container-2",
          node: "pve2",
          type: "lxc",
          status: "paused",
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // Call getGroups
      const groups = await service.getGroups();

      // Verify we have groups for nodes, statuses, and types
      // 2 nodes (pve1, pve2) + 3 statuses (running, stopped, paused) + 2 types (qemu, lxc) = 7 groups
      expect(groups).toHaveLength(7);

      // Verify node groups
      const pve1Group = groups.find((g) => g.id === "proxmox:node:pve1");
      expect(pve1Group).toBeDefined();
      expect(pve1Group?.name).toBe("Proxmox Node: pve1");
      expect(pve1Group?.nodes).toHaveLength(2);
      expect(pve1Group?.nodes).toContain("proxmox:pve1:100");
      expect(pve1Group?.nodes).toContain("proxmox:pve1:101");

      const pve2Group = groups.find((g) => g.id === "proxmox:node:pve2");
      expect(pve2Group).toBeDefined();
      expect(pve2Group?.name).toBe("Proxmox Node: pve2");
      expect(pve2Group?.nodes).toHaveLength(2);

      // Verify status groups
      const runningGroup = groups.find((g) => g.id === "proxmox:status:running");
      expect(runningGroup).toBeDefined();
      expect(runningGroup?.name).toBe("Status: running");
      expect(runningGroup?.nodes).toHaveLength(2);

      const stoppedGroup = groups.find((g) => g.id === "proxmox:status:stopped");
      expect(stoppedGroup).toBeDefined();
      expect(stoppedGroup?.nodes).toHaveLength(1);

      const pausedGroup = groups.find((g) => g.id === "proxmox:status:paused");
      expect(pausedGroup).toBeDefined();
      expect(pausedGroup?.nodes).toHaveLength(1);

      // Verify type groups
      const qemuGroup = groups.find((g) => g.id === "proxmox:type:qemu");
      expect(qemuGroup).toBeDefined();
      expect(qemuGroup?.name).toBe("Virtual Machines");
      expect(qemuGroup?.nodes).toHaveLength(2);

      const lxcGroup = groups.find((g) => g.id === "proxmox:type:lxc");
      expect(lxcGroup).toBeDefined();
      expect(lxcGroup?.name).toBe("LXC Containers");
      expect(lxcGroup?.nodes).toHaveLength(2);

      // Verify all groups have correct source
      groups.forEach((group) => {
        expect(group.source).toBe("proxmox");
        expect(group.sources).toEqual(["proxmox"]);
        expect(group.linked).toBe(false);
      });
    });

    it("should return cached groups on subsequent calls within TTL", async () => {
      // Mock API response
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "vm-1",
          node: "pve1",
          type: "qemu",
          status: "running",
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // First call - should hit API
      const groups1 = await service.getGroups();
      expect(mockClient.get).toHaveBeenCalledTimes(1);
      expect(groups1.length).toBeGreaterThan(0);

      // Second call - should use cache
      const groups2 = await service.getGroups();
      expect(mockClient.get).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(groups2).toEqual(groups1);
    });

    it("should throw error if client is not initialized", async () => {
      // Don't initialize service
      await expect(service.getGroups()).rejects.toThrow(
        "ProxmoxClient not initialized"
      );
    });

    it("should handle empty inventory gracefully", async () => {
      // Mock empty API response
      mockClient.get.mockResolvedValue([]);

      // Initialize service
      await service.initialize();

      // Call getGroups
      const groups = await service.getGroups();

      // Should return empty array
      expect(groups).toHaveLength(0);
      expect(groups).toEqual([]);
    });

    it("should use correct group ID formats", async () => {
      // Mock API response
      const mockGuests: ProxmoxGuest[] = [
        {
          vmid: 100,
          name: "test-vm",
          node: "testnode",
          type: "qemu",
          status: "running",
        },
      ];

      mockClient.get.mockResolvedValue(mockGuests);

      // Initialize service
      await service.initialize();

      // Call getGroups
      const groups = await service.getGroups();

      // Verify ID formats
      const nodeGroup = groups.find((g) => g.id.startsWith("proxmox:node:"));
      expect(nodeGroup?.id).toBe("proxmox:node:testnode");

      const statusGroup = groups.find((g) => g.id.startsWith("proxmox:status:"));
      expect(statusGroup?.id).toBe("proxmox:status:running");

      const typeGroup = groups.find((g) => g.id.startsWith("proxmox:type:"));
      expect(typeGroup?.id).toBe("proxmox:type:qemu");
    });
  });

  describe("executeAction", () => {
  it("should execute start action on a VM", async () => {
    // Mock cluster resources response to determine guest type
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "stopped",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve1:00001234:task123");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute start action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "start",
    };

    const result = await service.executeAction(action);

    // Verify API calls
    expect(mockClient.get).toHaveBeenCalledWith(
      "/api2/json/cluster/resources?type=vm"
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve1/qemu/100/status/start",
      {}
    );
    expect(mockClient.waitForTask).toHaveBeenCalledWith(
      "pve1",
      "UPID:pve1:00001234:task123"
    );

    // Verify result
    expect(result.status).toBe("success");
    expect(result.targetNodes).toEqual(["proxmox:pve1:100"]);
    expect(result.action).toBe("start");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("success");
  });

  it("should execute stop action on an LXC container", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 200,
        name: "test-container",
        node: "pve2",
        type: "lxc",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve2:00005678:task456");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute stop action
    const action = {
      type: "task" as const,
      target: "proxmox:pve2:200",
      action: "stop",
    };

    const result = await service.executeAction(action);

    // Verify API calls
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve2/lxc/200/status/stop",
      {}
    );

    // Verify result
    expect(result.status).toBe("success");
    expect(result.targetNodes).toEqual(["proxmox:pve2:200"]);
    expect(result.action).toBe("stop");
  });

  it("should execute shutdown action", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve1:00001234:task123");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute shutdown action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "shutdown",
    };

    const result = await service.executeAction(action);

    // Verify API call
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve1/qemu/100/status/shutdown",
      {}
    );

    // Verify result
    expect(result.status).toBe("success");
  });

  it("should execute reboot action", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve1:00001234:task123");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute reboot action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "reboot",
    };

    const result = await service.executeAction(action);

    // Verify API call
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve1/qemu/100/status/reboot",
      {}
    );

    // Verify result
    expect(result.status).toBe("success");
  });

  it("should execute suspend action on a VM", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve1:00001234:task123");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute suspend action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "suspend",
    };

    const result = await service.executeAction(action);

    // Verify API call
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve1/qemu/100/status/suspend",
      {}
    );

    // Verify result
    expect(result.status).toBe("success");
  });

  it("should execute resume action on a VM", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "paused",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockResolvedValue("UPID:pve1:00001234:task123");
    mockClient.waitForTask.mockResolvedValue(undefined);

    // Initialize service
    await service.initialize();

    // Execute resume action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "resume",
    };

    const result = await service.executeAction(action);

    // Verify API call
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api2/json/nodes/pve1/qemu/100/status/resume",
      {}
    );

    // Verify result
    expect(result.status).toBe("success");
  });

  it("should reject suspend action on LXC container", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 200,
        name: "test-container",
        node: "pve2",
        type: "lxc",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);

    // Initialize service
    await service.initialize();

    // Execute suspend action on LXC
    const action = {
      type: "task" as const,
      target: "proxmox:pve2:200",
      action: "suspend",
    };

    const result = await service.executeAction(action);

    // Verify result is failure
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not supported for LXC containers");
    expect(result.results[0].status).toBe("failed");
  });

  it("should reject resume action on LXC container", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 200,
        name: "test-container",
        node: "pve2",
        type: "lxc",
        status: "paused",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);

    // Initialize service
    await service.initialize();

    // Execute resume action on LXC
    const action = {
      type: "task" as const,
      target: "proxmox:pve2:200",
      action: "resume",
    };

    const result = await service.executeAction(action);

    // Verify result is failure
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not supported for LXC containers");
  });

  it("should handle action failure with error details", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "stopped",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);
    mockClient.post.mockRejectedValue(new Error("API error: VM is locked"));

    // Initialize service
    await service.initialize();

    // Execute start action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "start",
    };

    const result = await service.executeAction(action);

    // Verify result contains error
    expect(result.status).toBe("failed");
    expect(result.error).toContain("API error: VM is locked");
    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toContain("API error: VM is locked");
  });

  it("should reject unsupported action", async () => {
    // Mock cluster resources response
    const mockGuests: ProxmoxGuest[] = [
      {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        type: "qemu",
        status: "running",
      },
    ];

    mockClient.get.mockResolvedValue(mockGuests);

    // Initialize service
    await service.initialize();

    // Execute unsupported action
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "invalid-action",
    };

    const result = await service.executeAction(action);

    // Verify result is failure
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unsupported action");
  });

  it("should throw error if client is not initialized", async () => {
    // Don't initialize service
    const action = {
      type: "task" as const,
      target: "proxmox:pve1:100",
      action: "start",
    };

    await expect(service.executeAction(action)).rejects.toThrow(
      "ProxmoxClient not initialized"
    );
  });

  it("should handle invalid nodeId format", async () => {
    // Initialize service
    await service.initialize();

    // Execute action with invalid nodeId
    const action = {
      type: "task" as const,
      target: "invalid-node-id",
      action: "start",
    };

    const result = await service.executeAction(action);

    // Verify result is failure
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid nodeId format");
  });
});

describe("listCapabilities", () => {
  it("should return all lifecycle action capabilities", () => {
    const capabilities = service.listCapabilities();

    // Verify we have all 6 capabilities
    expect(capabilities).toHaveLength(6);

    // Verify each capability has required fields
    capabilities.forEach((cap) => {
      expect(cap).toHaveProperty("name");
      expect(cap).toHaveProperty("description");
      expect(cap).toHaveProperty("parameters");
      expect(Array.isArray(cap.parameters)).toBe(true);
    });

    // Verify specific capabilities
    const capabilityNames = capabilities.map((c) => c.name);
    expect(capabilityNames).toContain("start");
    expect(capabilityNames).toContain("stop");
    expect(capabilityNames).toContain("shutdown");
    expect(capabilityNames).toContain("reboot");
    expect(capabilityNames).toContain("suspend");
    expect(capabilityNames).toContain("resume");

    // Verify start capability details
    const startCap = capabilities.find((c) => c.name === "start");
    expect(startCap?.description).toBe("Start a VM or container");
    expect(startCap?.parameters).toEqual([]);

    // Verify suspend capability mentions VM-only
    const suspendCap = capabilities.find((c) => c.name === "suspend");
    expect(suspendCap?.description).toContain("VM");
    expect(suspendCap?.description).toContain("not supported for LXC");
  });

  it("should return capabilities without requiring initialization", () => {
    // Don't initialize service
    const capabilities = service.listCapabilities();

    // Should still return capabilities
    expect(capabilities).toHaveLength(6);
  });
});

describe("Provisioning Capabilities", () => {
  describe("createVM", () => {
    it("should create a VM successfully", async () => {
      // Mock guest existence check (should not exist)
      mockClient.get.mockRejectedValueOnce(new Error("Guest not found"));

      // Mock VM creation
      mockClient.post.mockResolvedValueOnce("UPID:pve1:00001234:task");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Create VM
      const params = {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
        cores: 2,
        memory: 2048,
      };

      const result = await service.createVM(params);

      // Verify result
      expect(result.status).toBe("success");
      expect(result.action).toBe("create_vm");
      expect(mockClient.post).toHaveBeenCalledWith(
        "/api2/json/nodes/pve1/qemu",
        params
      );
      expect(mockClient.waitForTask).toHaveBeenCalledWith("pve1", "UPID:pve1:00001234:task");
    });

    it("should reject creation if VMID already exists", async () => {
      // Mock guest existence check (exists) - getGuestType queries cluster resources
      mockClient.get.mockResolvedValueOnce([
        { vmid: 100, node: "pve1", type: "qemu" }
      ]);

      // Initialize service
      await service.initialize();

      // Try to create VM with existing VMID
      const params = {
        vmid: 100,
        name: "test-vm",
        node: "pve1",
      };

      const result = await service.createVM(params);

      // Verify result is failure
      expect(result.status).toBe("failed");
      expect(result.error).toContain("already exists");
      expect(mockClient.post).not.toHaveBeenCalled();
    });
  });

  describe("createLXC", () => {
    it("should create an LXC container successfully", async () => {
      // Mock guest existence check (should not exist)
      mockClient.get.mockRejectedValueOnce(new Error("Guest not found"));

      // Mock LXC creation
      mockClient.post.mockResolvedValueOnce("UPID:pve1:00001235:task");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Create LXC
      const params = {
        vmid: 101,
        hostname: "test-container",
        node: "pve1",
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
        cores: 1,
        memory: 512,
      };

      const result = await service.createLXC(params);

      // Verify result
      expect(result.status).toBe("success");
      expect(result.action).toBe("create_lxc");
      expect(mockClient.post).toHaveBeenCalledWith(
        "/api2/json/nodes/pve1/lxc",
        params
      );
      expect(mockClient.waitForTask).toHaveBeenCalledWith("pve1", "UPID:pve1:00001235:task");
    });

    it("should reject creation if VMID already exists", async () => {
      // Mock guest existence check (exists) - getGuestType queries cluster resources
      mockClient.get.mockResolvedValueOnce([
        { vmid: 101, node: "pve1", type: "lxc" }
      ]);

      // Initialize service
      await service.initialize();

      // Try to create LXC with existing VMID
      const params = {
        vmid: 101,
        hostname: "test-container",
        node: "pve1",
        ostemplate: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
      };

      const result = await service.createLXC(params);

      // Verify result is failure
      expect(result.status).toBe("failed");
      expect(result.error).toContain("already exists");
      expect(mockClient.post).not.toHaveBeenCalled();
    });
  });

  describe("destroyGuest", () => {
    it("should destroy a running guest after stopping it", async () => {
      // Mock guest existence check - getGuestType queries cluster resources (called twice)
      mockClient.get
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // guestExists -> getGuestType
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // getGuestType again
        .mockResolvedValueOnce({ status: "running" }); // status check

      // Mock stop and delete operations
      mockClient.post.mockResolvedValueOnce("UPID:pve1:00001236:stop");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);
      mockClient.delete.mockResolvedValueOnce("UPID:pve1:00001237:delete");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Destroy guest
      const result = await service.destroyGuest("pve1", 100);

      // Verify result
      expect(result.status).toBe("success");
      expect(result.action).toBe("destroy_guest");
      expect(mockClient.post).toHaveBeenCalledWith(
        "/api2/json/nodes/pve1/qemu/100/status/stop",
        {}
      );
      expect(mockClient.delete).toHaveBeenCalledWith(
        "/api2/json/nodes/pve1/qemu/100"
      );
    });

    it("should destroy a stopped guest without stopping it first", async () => {
      // Mock guest existence check - getGuestType queries cluster resources (called twice)
      mockClient.get
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // guestExists -> getGuestType
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // getGuestType again
        .mockResolvedValueOnce({ status: "stopped" }); // status check

      // Mock delete operation
      mockClient.delete.mockResolvedValueOnce("UPID:pve1:00001238:delete");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Destroy guest
      const result = await service.destroyGuest("pve1", 100);

      // Verify result
      expect(result.status).toBe("success");
      expect(mockClient.post).not.toHaveBeenCalled(); // Should not stop
      expect(mockClient.delete).toHaveBeenCalledWith(
        "/api2/json/nodes/pve1/qemu/100"
      );
    });

    it("should return error if guest does not exist", async () => {
      // Mock guest existence check (does not exist)
      mockClient.get.mockRejectedValueOnce(new Error("Guest not found"));

      // Initialize service
      await service.initialize();

      // Try to destroy non-existent guest
      const result = await service.destroyGuest("pve1", 999);

      // Verify result is failure
      expect(result.status).toBe("failed");
      expect(result.error).toContain("not found");
      expect(mockClient.delete).not.toHaveBeenCalled();
    });
  });

  describe("listProvisioningCapabilities", () => {
    it("should return all provisioning capabilities", () => {
      const capabilities = service.listProvisioningCapabilities();

      // Verify we have all 4 provisioning capabilities
      expect(capabilities).toHaveLength(4);

      // Verify each capability has required fields
      capabilities.forEach((cap) => {
        expect(cap).toHaveProperty("name");
        expect(cap).toHaveProperty("description");
        expect(cap).toHaveProperty("operation");
        expect(cap).toHaveProperty("parameters");
        expect(Array.isArray(cap.parameters)).toBe(true);
      });

      // Verify specific capabilities
      const capabilityNames = capabilities.map((c) => c.name);
      expect(capabilityNames).toContain("create_vm");
      expect(capabilityNames).toContain("create_lxc");
      expect(capabilityNames).toContain("destroy_vm");
      expect(capabilityNames).toContain("destroy_lxc");

      // Verify create_vm capability details
      const createVmCap = capabilities.find((c) => c.name === "create_vm");
      expect(createVmCap?.operation).toBe("create");
      expect(createVmCap?.description).toContain("virtual machine");
      expect(createVmCap?.parameters.length).toBeGreaterThan(0);

      // Verify destroy_vm capability details
      const destroyVmCap = capabilities.find((c) => c.name === "destroy_vm");
      expect(destroyVmCap?.operation).toBe("destroy");
      expect(destroyVmCap?.description).toContain("virtual machine");
    });

    it("should return capabilities without requiring initialization", () => {
      // Don't initialize service
      const capabilities = service.listProvisioningCapabilities();

      // Should still return capabilities
      expect(capabilities).toHaveLength(4);
    });
  });

  describe("executeAction with provisioning actions", () => {
    it("should route create_vm action to createVM method", async () => {
      // Mock guest existence check (should not exist)
      mockClient.get.mockRejectedValueOnce(new Error("Guest not found"));

      // Mock VM creation
      mockClient.post.mockResolvedValueOnce("UPID:pve1:00001239:task");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Execute create_vm action
      const action = {
        type: "task" as const,
        target: "",
        action: "create_vm",
        parameters: {
          vmid: 100,
          name: "test-vm",
          node: "pve1",
        },
      };

      const result = await service.executeAction(action);

      // Verify result
      expect(result.status).toBe("success");
      expect(result.action).toBe("create_vm");
    });

    it("should route destroy_vm action to destroyGuest method", async () => {
      // Mock guest existence check - getGuestType queries cluster resources (called twice)
      mockClient.get
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // guestExists -> getGuestType
        .mockResolvedValueOnce([{ vmid: 100, node: "pve1", type: "qemu" }]) // getGuestType again
        .mockResolvedValueOnce({ status: "stopped" }); // status check

      // Mock delete operation
      mockClient.delete.mockResolvedValueOnce("UPID:pve1:00001240:delete");
      mockClient.waitForTask.mockResolvedValueOnce(undefined);

      // Initialize service
      await service.initialize();

      // Execute destroy_vm action
      const action = {
        type: "task" as const,
        target: "",
        action: "destroy_vm",
        parameters: {
          node: "pve1",
          vmid: 100,
        },
      };

      const result = await service.executeAction(action);

      // Verify result
      expect(result.status).toBe("success");
      expect(result.action).toBe("destroy_guest");
    });
  });
});
});
