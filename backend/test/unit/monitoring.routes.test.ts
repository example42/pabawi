import express, { type Express } from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMonitoringRouter } from "../../src/routes/integrations/monitoring";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { CheckmkPlugin } from "../../src/integrations/checkmk/CheckmkPlugin";
import type { DIContainer } from "../../src/container/DIContainer";

/**
 * Unit tests for the monitoring router.
 *
 * These test the router in isolation — no auth/RBAC middleware is mounted
 * (those are applied at the mount level in server.ts). We mock the
 * IntegrationManager and CheckmkPlugin to exercise the router's own logic:
 * 503 when plugin absent, 404 when node unknown, 502 on upstream failure,
 * and 200 with correct shapes on success.
 *
 * Validates: Requirements 11.1–11.7
 */

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockExpertModeService() {
  return {
    generateRequestId: vi.fn().mockReturnValue("test-request-id"),
    createDebugInfo: vi.fn(),
    addWarning: vi.fn(),
    addError: vi.fn(),
    addInfo: vi.fn(),
    addMetadata: vi.fn(),
    setIntegration: vi.fn(),
    collectPerformanceMetrics: vi.fn().mockReturnValue({}),
    collectRequestContext: vi.fn().mockReturnValue({}),
    attachDebugInfo: vi.fn(),
  };
}

function createMockContainer(): DIContainer {
  const logger = createMockLogger();
  const expertMode = createMockExpertModeService();

  return {
    resolve: vi.fn((key: string) => {
      if (key === "logger") return logger;
      if (key === "expertMode") return expertMode;
      throw new Error(`Unknown service: ${key}`);
    }),
    register: vi.fn(),
    has: vi.fn().mockReturnValue(true),
  } as unknown as DIContainer;
}

function createMockPlugin(overrides: Partial<CheckmkPlugin> = {}): CheckmkPlugin {
  return {
    isInitialized: vi.fn().mockReturnValue(true),
    getNodeData: vi.fn().mockResolvedValue([]),
    getInventory: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CheckmkPlugin;
}

function createMockIntegrationManager(
  plugin: CheckmkPlugin | null = null,
): IntegrationManager {
  return {
    getInformationSource: vi.fn().mockReturnValue(plugin),
  } as unknown as IntegrationManager;
}

function buildApp(
  integrationManager: IntegrationManager,
  container?: DIContainer,
): Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/nodes",
    createMonitoringRouter(integrationManager, container ?? createMockContainer()),
  );
  return app;
}

describe("Monitoring Router", () => {
  let app: Express;
  let mockPlugin: CheckmkPlugin;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    mockIntegrationManager = createMockIntegrationManager(mockPlugin);
    app = buildApp(mockIntegrationManager);
  });

  describe("GET /api/nodes/:nodeId/services", () => {
    it("returns 503 when plugin is not configured (getInformationSource returns null)", async () => {
      const mgr = createMockIntegrationManager(null);
      const testApp = buildApp(mgr);

      const response = await request(testApp).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("CHECKMK_NOT_CONFIGURED");
      expect(response.body.error.message).toContain("not configured");
    });

    it("returns 503 when plugin is not initialized", async () => {
      const uninitPlugin = createMockPlugin({
        isInitialized: vi.fn().mockReturnValue(false),
      });
      const mgr = createMockIntegrationManager(uninitPlugin);
      const testApp = buildApp(mgr);

      const response = await request(testApp).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("CHECKMK_NOT_CONFIGURED");
    });

    it("returns 404 when node is unknown (empty services + not in inventory)", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "otherhost", name: "otherhost" },
      ]);

      const response = await request(app).get("/api/nodes/unknownhost/services");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NODE_NOT_FOUND");
      expect(response.body.error.message).toContain("unknownhost");
    });

    it("returns 404 with case-insensitive inventory check", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "WebServer01", name: "WebServer01" },
      ]);

      // Same host, different case — should find it and return 200 with []
      const response = await request(app).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("returns 502 on upstream failure (getNodeData throws)", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection refused"),
      );

      const response = await request(app).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("UPSTREAM_ERROR");
      expect(response.body.error.message).toContain("Connection refused");
    });

    it("returns 502 on upstream timeout", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Upstream timeout")), 50);
        }),
      );

      const response = await request(app).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("UPSTREAM_ERROR");
      expect(response.body.error.message).toContain("timeout");
    });

    it("returns 200 with service array on success", async () => {
      const services = [
        {
          description: "CPU load",
          state: 0,
          stateType: 1,
          pluginOutput: "OK - 15min load: 0.42",
          lastCheck: 1700000000,
          lastState: 0,
          lastStateChange: 1699999000,
        },
        {
          description: "Memory",
          state: 1,
          stateType: 1,
          pluginOutput: "WARN - 85% used",
          lastCheck: 1700000100,
          lastState: 0,
          lastStateChange: 1700000050,
        },
      ];
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue(services);

      const response = await request(app).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(services);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].description).toBe("CPU load");
      expect(response.body[1].state).toBe(1);
    });

    it("returns 200 with empty array when node exists but has no services", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "webserver01", name: "webserver01" },
      ]);

      const response = await request(app).get("/api/nodes/webserver01/services");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe("GET /api/nodes/:nodeId/monitoring-events", () => {
    it("returns 503 when plugin is not configured", async () => {
      const mgr = createMockIntegrationManager(null);
      const testApp = buildApp(mgr);

      const response = await request(testApp).get(
        "/api/nodes/webserver01/monitoring-events",
      );

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("CHECKMK_NOT_CONFIGURED");
    });

    it("returns 404 when node is unknown", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockPlugin.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await request(app).get(
        "/api/nodes/unknownhost/monitoring-events",
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NODE_NOT_FOUND");
    });

    it("returns 502 on upstream failure", async () => {
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ECONNREFUSED"),
      );

      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events",
      );

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("UPSTREAM_ERROR");
    });

    it("returns 200 with events array on success", async () => {
      const events = [
        {
          id: "evt-1",
          nodeId: "webserver01",
          eventType: "state_change",
          source: "checkmk",
          summary: "HTTP: OK → CRIT",
          timestamp: "2024-01-15T10:30:00.000Z",
          isLive: true,
          details: {
            serviceDescription: "HTTP",
            previousState: 0,
            currentState: 2,
            output: "CRITICAL - Connection refused",
          },
        },
      ];
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue(events);

      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].source).toBe("checkmk");
      expect(response.body[0].eventType).toBe("state_change");
      expect(response.body[0].isLive).toBe(true);
    });

    it("respects limit query param", async () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        id: `evt-${i}`,
        nodeId: "webserver01",
        eventType: "state_change",
        source: "checkmk",
        summary: `Event ${i}`,
        timestamp: new Date(2024, 0, 15, 10, i).toISOString(),
        isLive: true,
      }));
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue(events);

      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events?limit=3",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
    });

    it("uses default limit of 200 when not specified", async () => {
      const events = Array.from({ length: 250 }, (_, i) => ({
        id: `evt-${i}`,
        source: "checkmk",
      }));
      (mockPlugin.getNodeData as ReturnType<typeof vi.fn>).mockResolvedValue(events);

      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(200);
    });

    it("returns 400 for invalid limit (out of range)", async () => {
      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events?limit=0",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for limit exceeding 1000", async () => {
      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events?limit=1001",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for non-numeric limit", async () => {
      const response = await request(app).get(
        "/api/nodes/webserver01/monitoring-events?limit=abc",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUEST");
    });
  });
});
