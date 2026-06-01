/**
 * Unit tests for CheckmkPlugin init & event fallback behavior
 *
 * Validates: Requirements 2.3, 8.2, 8.6, 12.6, 13.6, 13.7
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CheckmkPlugin } from "../../src/integrations/checkmk/CheckmkPlugin";
import type { IntegrationConfig } from "../../src/integrations/types";
import type { CheckmkConfig, CheckmkServiceStatus, CheckmkEvent } from "../../src/integrations/checkmk/types";

// Shared mock instances that the mocked constructors will return
let mockServiceInstance: {
  testConnection: ReturnType<typeof vi.fn>;
  getHosts: ReturnType<typeof vi.fn>;
  getServices: ReturnType<typeof vi.fn>;
};

let mockLivestatusInstance: {
  isEnabled: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  getEvents: ReturnType<typeof vi.fn>;
};

// Mock CheckmkService as a class constructor
vi.mock("../../src/integrations/checkmk/CheckmkService", () => ({
  CheckmkService: class MockCheckmkService {
    constructor() {
      return mockServiceInstance;
    }
  },
}));

// Mock CheckmkLivestatusClient as a class constructor
vi.mock("../../src/integrations/checkmk/CheckmkLivestatusClient", () => ({
  CheckmkLivestatusClient: class MockCheckmkLivestatusClient {
    constructor() {
      return mockLivestatusInstance;
    }
  },
}));

function createValidCheckmkConfig(): CheckmkConfig {
  return {
    enabled: true,
    serverUrl: "https://monitoring.example.com",
    site: "mysite",
    username: "automation",
    password: "secret123", // pragma: allowlist secret
    sslVerify: true,
    healthCheckIntervalMs: 300_000,
  };
}

function createIntegrationConfig(checkmkConfig: CheckmkConfig): IntegrationConfig {
  return {
    enabled: true,
    name: "checkmk",
    type: "information",
    config: checkmkConfig as unknown as Record<string, unknown>,
    priority: 8,
  };
}

describe("CheckmkPlugin", () => {
  let plugin: CheckmkPlugin;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServiceInstance = {
      testConnection: vi.fn().mockResolvedValue({ success: true, version: "2.2.0" }),
      getHosts: vi.fn().mockResolvedValue([]),
      getServices: vi.fn().mockResolvedValue([]),
    };

    mockLivestatusInstance = {
      isEnabled: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue(true),
      getEvents: vi.fn().mockResolvedValue([]),
    };

    plugin = new CheckmkPlugin();
  });

  describe("initialization with REST unreachable", () => {
    it("should complete initialization without throwing when REST is unreachable", async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: false,
        error: "ECONNREFUSED",
      });

      const config = createIntegrationConfig(createValidCheckmkConfig());

      await expect(plugin.initialize(config)).resolves.not.toThrow();
    });

    it("should set initialized to true after init even when REST is unreachable", async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: false,
        error: "ECONNREFUSED",
      });

      const config = createIntegrationConfig(createValidCheckmkConfig());
      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
    });

    it("should report unhealthy when REST is unreachable during init", async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: false,
        error: "ECONNREFUSED",
      });

      const config = createIntegrationConfig(createValidCheckmkConfig());
      await plugin.initialize(config);

      const health = await plugin.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toContain("unreachable");
    });

    it("should flip to healthy on subsequent successful health check without re-init", async () => {
      // Init with REST unreachable, and keep it unreachable for the first health check
      mockServiceInstance.testConnection
        .mockResolvedValueOnce({ success: false, error: "ECONNREFUSED" }) // init
        .mockResolvedValueOnce({ success: false, error: "ECONNREFUSED" }); // first healthCheck

      const checkmkConfig = createValidCheckmkConfig();
      // Use a very short throttle so health checks always make real probes
      checkmkConfig.healthCheckIntervalMs = 0;
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      // Verify unhealthy
      const unhealthyCheck = await plugin.healthCheck();
      expect(unhealthyCheck.healthy).toBe(false);

      // Now REST becomes reachable
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });

      // Next health check should flip to healthy without re-init
      const healthyCheck = await plugin.healthCheck();
      expect(healthyCheck.healthy).toBe(true);
      expect(healthyCheck.message).toContain("2.2.0");
    });
  });

  describe("initialization with invalid config", () => {
    it("should throw when serverUrl is missing", async () => {
      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.serverUrl = "";
      const config = createIntegrationConfig(checkmkConfig);

      await expect(plugin.initialize(config)).rejects.toThrow(
        "serverUrl is required",
      );
    });

    it("should throw when site is missing", async () => {
      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.site = "";
      const config = createIntegrationConfig(checkmkConfig);

      await expect(plugin.initialize(config)).rejects.toThrow(
        "site is required",
      );
    });

    it("should throw when username is missing", async () => {
      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.username = "";
      const config = createIntegrationConfig(checkmkConfig);

      await expect(plugin.initialize(config)).rejects.toThrow(
        "username is required",
      );
    });

    it("should throw when password is missing", async () => {
      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.password = ""; // pragma: allowlist secret
      const config = createIntegrationConfig(checkmkConfig);

      await expect(plugin.initialize(config)).rejects.toThrow(
        "password is required", // pragma: allowlist secret
      );
    });
  });

  describe("events: Livestatus reachable", () => {
    it("should return Livestatus events as journal entries when Livestatus is configured and reachable", async () => {
      const livestatusEvents: CheckmkEvent[] = [
        {
          timestamp: "2024-01-15T10:00:00.000Z",
          serviceDescription: "CPU load",
          previousState: 0,
          currentState: 2,
          output: "CRIT - CPU load is 95%",
        },
        {
          timestamp: "2024-01-15T09:00:00.000Z",
          serviceDescription: "Memory",
          previousState: 0,
          currentState: 1,
          output: "WARN - Memory usage 80%",
        },
      ];

      mockLivestatusInstance.getEvents.mockResolvedValue(livestatusEvents);
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });

      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.livestatus = {
        host: "livestatus.example.com",
        port: 6557,
        tls: false,
        timeoutMs: 5000,
      };
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      const events = await plugin.getNodeData("myhost", "events") as Array<Record<string, unknown>>;

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        nodeId: "myhost",
        eventType: "state_change",
        source: "checkmk",
        summary: "CPU load: OK → CRIT",
        isLive: true,
      });
      expect(events[1]).toMatchObject({
        nodeId: "myhost",
        eventType: "state_change",
        source: "checkmk",
        summary: "Memory: OK → WARN",
        isLive: true,
      });
      // Livestatus was called, not REST getServices
      expect(mockLivestatusInstance.getEvents).toHaveBeenCalledWith("myhost");
      expect(mockServiceInstance.getServices).not.toHaveBeenCalled();
    });
  });

  describe("events: Livestatus unreachable/timeout → REST fallback", () => {
    it("should fall back to REST-derived events when Livestatus throws", async () => {
      mockLivestatusInstance.getEvents.mockRejectedValue(
        new Error("Connection timed out"),
      );

      const services: CheckmkServiceStatus[] = [
        {
          description: "HTTP",
          state: 2,
          stateType: 1,
          pluginOutput: "CRIT - Connection refused",
          lastCheck: 1700000000,
          lastState: 0,
          lastStateChange: 1699999000,
        },
      ];
      mockServiceInstance.getServices.mockResolvedValue(services);
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });

      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.livestatus = {
        host: "livestatus.example.com",
        port: 6557,
        tls: false,
        timeoutMs: 5000,
      };
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      const events = await plugin.getNodeData("myhost", "events") as Array<Record<string, unknown>>;

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        nodeId: "myhost",
        eventType: "state_change",
        source: "checkmk",
        summary: "HTTP: OK → CRIT",
        isLive: true,
      });
      expect(mockServiceInstance.getServices).toHaveBeenCalledWith("myhost");
    });

    it("should not flip overall plugin health when Livestatus fails", async () => {
      mockLivestatusInstance.getEvents.mockRejectedValue(
        new Error("Connection refused"),
      );
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });
      mockServiceInstance.getServices.mockResolvedValue([]);

      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.livestatus = {
        host: "livestatus.example.com",
        port: 6557,
        tls: false,
        timeoutMs: 5000,
      };
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      // Trigger events (Livestatus fails, falls back to REST)
      await plugin.getNodeData("myhost", "events");

      // Plugin should still be healthy (REST is fine)
      const health = await plugin.healthCheck();
      expect(health.healthy).toBe(true);
    });
  });

  describe("REST event derivation filtering", () => {
    beforeEach(async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });
      // No Livestatus configured — goes straight to REST derivation
      const config = createIntegrationConfig(createValidCheckmkConfig());
      await plugin.initialize(config);
    });

    it("should omit services where lastState === state (no synthetic OK→OK)", async () => {
      const services: CheckmkServiceStatus[] = [
        {
          description: "Stable Service",
          state: 0,
          stateType: 1,
          pluginOutput: "OK - all good",
          lastCheck: 1700000000,
          lastState: 0, // same as state → no transition
          lastStateChange: 1699999000,
        },
        {
          description: "Changed Service",
          state: 2,
          stateType: 1,
          pluginOutput: "CRIT - disk full",
          lastCheck: 1700000000,
          lastState: 0, // different from state → real transition
          lastStateChange: 1699999000,
        },
      ];
      mockServiceInstance.getServices.mockResolvedValue(services);

      const events = await plugin.getNodeData("myhost", "events") as Array<Record<string, unknown>>;

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        summary: "Changed Service: OK → CRIT",
      });
    });

    it("should omit services where lastStateChange is 0", async () => {
      const services: CheckmkServiceStatus[] = [
        {
          description: "Never Changed",
          state: 1,
          stateType: 1,
          pluginOutput: "WARN - something",
          lastCheck: 1700000000,
          lastState: 0,
          lastStateChange: 0, // no state change recorded
        },
      ];
      mockServiceInstance.getServices.mockResolvedValue(services);

      const events = await plugin.getNodeData("myhost", "events") as Array<Record<string, unknown>>;

      expect(events).toHaveLength(0);
    });

    it("should produce correct journal entry format from REST derivation", async () => {
      const services: CheckmkServiceStatus[] = [
        {
          description: "Disk /",
          state: 1,
          stateType: 1,
          pluginOutput: "WARN - 85% used",
          lastCheck: 1700000000,
          lastState: 0,
          lastStateChange: 1699990000,
        },
      ];
      mockServiceInstance.getServices.mockResolvedValue(services);

      const events = await plugin.getNodeData("myhost", "events") as Array<Record<string, unknown>>;

      expect(events).toHaveLength(1);
      const entry = events[0];
      expect(entry).toMatchObject({
        nodeId: "myhost",
        nodeUri: "checkmk:myhost",
        eventType: "state_change",
        source: "checkmk",
        action: "state_change",
        summary: "Disk /: OK → WARN",
        isLive: true,
      });
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBe(new Date(1699990000 * 1000).toISOString());
      expect(entry.details).toMatchObject({
        serviceDescription: "Disk /",
        previousState: 0,
        currentState: 1,
        output: "WARN - 85% used",
      });
    });
  });

  describe("health check throttling", () => {
    it("should return cached result within healthCheckIntervalMs", async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });

      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.healthCheckIntervalMs = 300_000; // 5 minutes
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      // First health check uses cached init result
      const first = await plugin.healthCheck();
      expect(first.healthy).toBe(true);

      // Second health check within interval should not call testConnection again
      // (testConnection was called once during init)
      const callCountAfterInit = mockServiceInstance.testConnection.mock.calls.length;
      const second = await plugin.healthCheck();
      expect(second.healthy).toBe(true);
      expect(mockServiceInstance.testConnection.mock.calls.length).toBe(callCountAfterInit);
    });

    it("should make a real probe after interval expires", async () => {
      mockServiceInstance.testConnection.mockResolvedValue({
        success: true,
        version: "2.2.0",
      });

      const checkmkConfig = createValidCheckmkConfig();
      checkmkConfig.healthCheckIntervalMs = 0; // expire immediately
      const config = createIntegrationConfig(checkmkConfig);
      await plugin.initialize(config);

      const callCountAfterInit = mockServiceInstance.testConnection.mock.calls.length;

      // Health check with expired interval should make a real probe
      const health = await plugin.healthCheck();
      expect(health.healthy).toBe(true);
      expect(mockServiceInstance.testConnection.mock.calls.length).toBeGreaterThan(callCountAfterInit);
    });
  });
});
