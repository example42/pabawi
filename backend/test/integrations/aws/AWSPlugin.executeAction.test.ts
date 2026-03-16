/**
 * Tests for AWSPlugin.executeAction — provisioning and lifecycle actions
 *
 * Validates: Requirements 10.1-10.4, 11.1-11.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AWSPlugin } from "../../../src/integrations/aws/AWSPlugin";
import { AWSAuthenticationError } from "../../../src/integrations/aws/types";
import type { Action } from "../../../src/integrations/types";
import type { JournalService } from "../../../src/services/journal/JournalService";

// Shared mock methods accessible from tests
const mockProvisionInstance = vi.fn().mockResolvedValue("i-new123");
const mockStartInstance = vi.fn().mockResolvedValue(undefined);
const mockStopInstance = vi.fn().mockResolvedValue(undefined);
const mockRebootInstance = vi.fn().mockResolvedValue(undefined);
const mockTerminateInstance = vi.fn().mockResolvedValue(undefined);

// Mock the AWSService module — must return a proper class
vi.mock("../../../src/integrations/aws/AWSService", () => {
  return {
    AWSService: class MockAWSService {
      provisionInstance = mockProvisionInstance;
      startInstance = mockStartInstance;
      stopInstance = mockStopInstance;
      rebootInstance = mockRebootInstance;
      terminateInstance = mockTerminateInstance;
    },
  };
});

function createMockJournalService(): JournalService {
  return {
    recordEvent: vi.fn().mockResolvedValue("journal-id-1"),
  } as unknown as JournalService;
}

async function createInitializedPlugin(journalService?: JournalService) {
  const plugin = new AWSPlugin(undefined, undefined, journalService);
  await plugin.initialize({
    enabled: true,
    name: "aws",
    type: "both",
    config: {
      accessKeyId: "AKIATEST",
      secretAccessKey: "secret",
      region: "us-east-1",
    },
  });
  return plugin;
}

describe("AWSPlugin.executeAction", () => {
  beforeEach(() => {
    mockProvisionInstance.mockReset().mockResolvedValue("i-new123");
    mockStartInstance.mockReset().mockResolvedValue(undefined);
    mockStopInstance.mockReset().mockResolvedValue(undefined);
    mockRebootInstance.mockReset().mockResolvedValue(undefined);
    mockTerminateInstance.mockReset().mockResolvedValue(undefined);
  });
  describe("provisioning", () => {
    it("should provision an instance and return success with instance ID", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "task",
        target: "new",
        action: "provision",
        parameters: { imageId: "ami-123", instanceType: "t2.micro" },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("success");
      expect(result.action).toBe("provision");
      expect(result.results[0].nodeId).toBe("i-new123");
      expect(result.results[0].output?.stdout).toContain("i-new123");
    });

    it("should also accept create_instance as provisioning action", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "task",
        target: "new",
        action: "create_instance",
        parameters: { imageId: "ami-456" },
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("success");
      expect(result.action).toBe("create_instance");
    });
  });

  describe("lifecycle actions", () => {
    const lifecycleActions = ["start", "stop", "reboot", "terminate"] as const;

    for (const actionName of lifecycleActions) {
      it(`should execute ${actionName} and return success`, async () => {
        const plugin = await createInitializedPlugin();
        const action: Action = {
          type: "command",
          target: "aws:us-east-1:i-abc123",
          action: actionName,
        };

        const result = await plugin.executeAction(action);

        expect(result.status).toBe("success");
        expect(result.action).toBe(actionName);
        expect(result.targetNodes).toContain("aws:us-east-1:i-abc123");
      });
    }
  });

  describe("unsupported action", () => {
    it("should return failed result for unsupported action", async () => {
      const plugin = await createInitializedPlugin();
      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "hibernate",
      };

      const result = await plugin.executeAction(action);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Unsupported AWS action");
    });
  });

  describe("journal recording", () => {
    it("should record a journal entry on successful action", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "start",
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.source).toBe("aws");
      expect(entry.eventType).toBe("start");
      expect(entry.summary).toContain("succeeded");
    });

    it("should record a journal entry on failed action", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "unknown_action",
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.summary).toContain("failed");
    });

    it("should record journal on provision success", async () => {
      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);
      const action: Action = {
        type: "task",
        target: "new",
        action: "provision",
        parameters: { imageId: "ami-123" },
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
      const entry = (journal.recordEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.eventType).toBe("provision");
      expect(entry.source).toBe("aws");
    });

    it("should not fail if journalService is not set", async () => {
      const plugin = await createInitializedPlugin(); // no journal
      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "stop",
      };

      const result = await plugin.executeAction(action);
      expect(result.status).toBe("success");
    });
  });

  describe("setJournalService", () => {
    it("should allow setting journal service after construction", async () => {
      const plugin = await createInitializedPlugin();
      const journal = createMockJournalService();
      plugin.setJournalService(journal);

      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "reboot",
      };

      await plugin.executeAction(action);

      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("authentication errors", () => {
    it("should throw AWSAuthenticationError when service throws it", async () => {
      mockStartInstance.mockRejectedValueOnce(
        new AWSAuthenticationError("Expired credentials")
      );

      const journal = createMockJournalService();
      const plugin = await createInitializedPlugin(journal);

      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "start",
      };

      await expect(plugin.executeAction(action)).rejects.toThrow(AWSAuthenticationError);
      // Journal should still be recorded for the failure
      expect(journal.recordEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("not initialized", () => {
    it("should throw if plugin is not initialized", async () => {
      const plugin = new AWSPlugin();
      const action: Action = {
        type: "command",
        target: "aws:us-east-1:i-abc123",
        action: "start",
      };

      expect(() => plugin.executeAction(action)).rejects.toThrow(
        "AWS integration is not initialized"
      );
    });
  });
});
