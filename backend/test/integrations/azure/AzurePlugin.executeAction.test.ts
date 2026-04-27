/**
 * Tests for AzurePlugin.executeAction — provisioning, lifecycle, journal,
 * authentication errors, and initialization validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzurePlugin } from "../../../src/integrations/azure/AzurePlugin";
import { AzureAuthenticationError } from "../../../src/integrations/azure/types";
import type { Action } from "../../../src/integrations/types";
import type { JournalService } from "../../../src/services/journal/JournalService";

// Shared mock methods accessible from tests
const mockProvisionVM = vi.fn().mockResolvedValue("/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.Compute/virtualMachines/my-vm");
const mockStartVM = vi.fn().mockResolvedValue(undefined);
const mockStopVM = vi.fn().mockResolvedValue(undefined);
const mockRestartVM = vi.fn().mockResolvedValue(undefined);
const mockDeallocateVM = vi.fn().mockResolvedValue(undefined);
const mockValidateCredentials = vi.fn().mockResolvedValue({
  subscriptionName: "Test Sub",
  subscriptionId: "sub-1",
  tenantId: "tenant-1",
});

// Mock the AzureService module — must return a proper class
vi.mock("../../../src/integrations/azure/AzureService", () => {
  return {
    AzureService: class MockAzureService {
      provisionVM = mockProvisionVM;
      startVM = mockStartVM;
      stopVM = mockStopVM;
      restartVM = mockRestartVM;
      deallocateVM = mockDeallocateVM;
      validateCredentials = mockValidateCredentials;
      getInventory = vi.fn().mockResolvedValue([]);
      getGroups = vi.fn().mockResolvedValue([]);
      getNodeFacts = vi.fn().mockResolvedValue({});
      getLocations = vi.fn().mockResolvedValue([]);
      getVMSizes = vi.fn().mockResolvedValue([]);
      getImages = vi.fn().mockResolvedValue([]);
      getResourceGroups = vi.fn().mockResolvedValue([]);
    },
  };
});

function createMockJournalService(): JournalService {
  return {
    recordEvent: vi.fn().mockResolvedValue("journal-id-1"),
  } as unknown as JournalService;
}

async function createInitializedPlugin(journalService?: JournalService) {
  const plugin = new AzurePlugin(undefined, undefined, journalService);
  await plugin.initialize({
    enabled: true,
    name: "azure",
    type: "both",
    config: {
      subscriptionId: "sub-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      clientSecret: "fake-client-secret-for-testing", // pragma: allowlist secret
    },
  });
  return plugin;
}

describe("AzurePlugin.executeAction", () => {
  beforeEach(() => {
    mockProvisionVM.mockReset().mockResolvedValue(
      "/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.Compute/virtualMachines/my-vm",
    );
    mockStartVM.mockReset().mockResolvedValue(undefined);
    mockStopVM.mockReset().mockResolvedValue(undefined);
    mockRestartVM.mockReset().mockResolvedValue(undefined);
    mockDeallocateVM.mockReset().mockResolvedValue(undefined);
    mockValidateCredentials.mockReset().mockResolvedValue({
      subscriptionName: "Test Sub",
      subscriptionId: "sub-1",
      tenantId: "tenant-1",
    });
  });

  // ─── Provisioning ───────────────────────────────────────────────────────

  describe("provisioning", () => {
    it("should provision a VM and return success result with type=task", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "task",
        target: "new",
        action: "provision",
        parameters: {
          resourceGroup: "rg-1",
          vmName: "my-vm",
          location: "eastus",
          adminUsername: "azureuser",
          networkInterfaceId: "/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.Network/networkInterfaces/nic-1",
        },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("success");
      expect(result.type).toBe("task");
      expect(result.action).toBe("provision");
      expect(result.results[0].output?.stdout).toContain("my-vm");
    });

    it("should also accept create_vm as provisioning action", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "task",
        target: "new",
        action: "create_vm",
        parameters: { resourceGroup: "rg-1", vmName: "vm-2", location: "eastus" },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("success");
      expect(result.type).toBe("task");
      expect(result.action).toBe("create_vm");
    });

    it("failed provision should return type=task (not command)", async () => {
      mockProvisionVM.mockRejectedValueOnce(new Error("Quota exceeded"));

      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "task",
        target: "new",
        action: "provision",
        parameters: { resourceGroup: "rg-1", vmName: "vm-fail", location: "eastus" },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("failed");
      expect(result.type).toBe("task");
    });
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  describe("lifecycle actions", () => {
    const lifecycleActions = ["start", "stop", "restart", "deallocate"] as const;

    for (const actionName of lifecycleActions) {
      it(`should execute ${actionName} and return success`, async () => {
        const plugin = await createInitializedPlugin();
        const action: Action = {
          type: "command",
          target: "azure:sub-1:rg-1:my-vm",
          action: actionName,
        };

        const result = await plugin.executeAction(action);

        expect(result.status).toBe("success");
        expect(result.type).toBe("command");
        expect(result.action).toBe(actionName);
        expect(result.targetNodes).toContain("azure:sub-1:rg-1:my-vm");
      });
    }

    it("failed lifecycle should return type=command (not task)", async () => {
      mockStopVM.mockRejectedValueOnce(new Error("VM not found"));

      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "stop",
        parameters: { resourceGroup: "rg-1", vmName: "my-vm" },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("failed");
      expect(result.type).toBe("command");
    });
  });

  // ─── Unsupported action ─────────────────────────────────────────────────

  describe("unsupported action", () => {
    it("should return failed result for unsupported action", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "hibernate",
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Unsupported Azure action");
    });
  });

  // ─── Journal Recording ──────────────────────────────────────────────────

  describe("journal recording", () => {
    it("should record journal with canonical nodeId (azure: prefix)", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "start",
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.nodeId).toBe("azure:sub-1:rg-1:my-vm");
      expect(entry.nodeUri).toBe("azure:sub-1:rg-1:my-vm");
      // Should NOT double-prefix the URI
      expect(entry.nodeUri).not.toMatch(/^azure:azure:/);
    });

    it("should not double-prefix nodeId when target already starts with azure:", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "command",
        target: "azure:rg-1:my-vm",
        action: "stop",
      };

      await plugin.executeAction(action);

      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.nodeId).not.toMatch(/^azure:azure:/);
      expect(entry.nodeUri).not.toMatch(/^azure:azure:/);
    });

    it("should record provision journal with source=azure and eventType=provision", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "task",
        target: "new",
        action: "provision",
        parameters: { resourceGroup: "rg-1", vmName: "vm-new", location: "eastus" },
      };

      await plugin.executeAction(action);

      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.source).toBe("azure");
      expect(entry.eventType).toBe("provision");
      expect(entry.summary).toContain("succeeded");
    });

    it("should record failed journal entry on action failure", async () => {
      mockStartVM.mockRejectedValueOnce(new Error("VM not found"));

      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "start",
        parameters: { resourceGroup: "rg-1", vmName: "my-vm" },
      };

      await plugin.executeAction(action);

      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.summary).toContain("failed");
    });

    it("should not fail if journalService is not set", async () => {
      const plugin = await createInitializedPlugin(); // no journal
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "stop",
        parameters: { resourceGroup: "rg-1", vmName: "my-vm" },
      };

      const result = await plugin.executeAction(action);
      expect(result.status).toBe("success");
    });

    it("should allow setting journal service after construction", async () => {
      const plugin = await createInitializedPlugin();
      const journal = createMockJournalService();
      plugin.setJournalService(journal);

      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "restart",
        parameters: { resourceGroup: "rg-1", vmName: "my-vm" },
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Authentication Errors ──────────────────────────────────────────────

  describe("authentication errors", () => {
    it("should throw AzureAuthenticationError when service throws it during lifecycle", async () => {
      mockStartVM.mockRejectedValueOnce(new AzureAuthenticationError("Expired credentials"));

      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);

      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "start",
        parameters: { resourceGroup: "rg-1", vmName: "my-vm" },
      };

      await expect(plugin.executeAction(action)).rejects.toThrow(AzureAuthenticationError);
      // Journal should still be recorded for the auth failure
      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Config Validation ──────────────────────────────────────────────────

  describe("validateAzureConfig — partial credentials", () => {
    it("should throw on partial credentials (tenantId only)", async () => {
      const plugin = new AzurePlugin();
      await expect(
        plugin.initialize({
          enabled: true,
          name: "azure",
          type: "both",
          config: { subscriptionId: "sub-1", tenantId: "tenant-1" },
        }),
      ).rejects.toThrow(/Incomplete Azure client credential/);
    });

    it("should throw on partial credentials (tenantId + clientId, no secret)", async () => {
      const plugin = new AzurePlugin();
      await expect(
        plugin.initialize({
          enabled: true,
          name: "azure",
          type: "both",
          config: { subscriptionId: "sub-1", tenantId: "tenant-1", clientId: "client-1" },
        }),
      ).rejects.toThrow(/Incomplete Azure client credential/);
    });

    it("should succeed with all three explicit credentials", async () => {
      const plugin = new AzurePlugin();
      await expect(
        plugin.initialize({
          enabled: true,
          name: "azure",
          type: "both",
          config: {
            subscriptionId: "sub-1",
            tenantId: "tenant-1",
            clientId: "client-1",
            clientSecret: "fake-client-secret-for-testing", // pragma: allowlist secret
          },
        }),
      ).resolves.not.toThrow();
    });

    it("should succeed with no explicit credentials (default credential chain)", async () => {
      const plugin = new AzurePlugin();
      await expect(
        plugin.initialize({
          enabled: true,
          name: "azure",
          type: "both",
          config: { subscriptionId: "sub-1" },
        }),
      ).resolves.not.toThrow();
    });

    it("should throw if subscriptionId is missing", async () => {
      const plugin = new AzurePlugin();
      await expect(
        plugin.initialize({
          enabled: true,
          name: "azure",
          type: "both",
          config: {},
        }),
      ).rejects.toThrow("AZURE_SUBSCRIPTION_ID is required");
    });
  });

  // ─── Not Initialized ────────────────────────────────────────────────────

  describe("not initialized", () => {
    it("should throw if plugin is not initialized", async () => {
      const plugin = new AzurePlugin();
      const action: Action = {
        type: "command",
        target: "azure:sub-1:rg-1:my-vm",
        action: "start",
      };

      await expect(plugin.executeAction(action)).rejects.toThrow(
        "Azure integration is not initialized",
      );
    });
  });
});
