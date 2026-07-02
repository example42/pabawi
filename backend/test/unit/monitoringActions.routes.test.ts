import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMonitoringActionsRouter } from "../../src/routes/integrations/monitoringActions";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { CheckmkPlugin } from "../../src/integrations/checkmk/CheckmkPlugin";
import type { DatabaseService } from "../../src/database/DatabaseService";
import type { DIContainer } from "../../src/container/DIContainer";

/**
 * Unit tests for the Checkmk monitoring action router (write operations).
 *
 * Auth/RBAC middleware is applied at the mount level in server.ts and is not
 * exercised here. These tests cover the router's own logic: configuration
 * gating (503), request validation (400), upstream success (200), upstream
 * failure (502), and that successful actions are recorded in the audit log.
 */

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function createMockContainer(): DIContainer {
  const logger = createMockLogger();
  return {
    resolve: vi.fn((key: string) => {
      if (key === "logger") return logger;
      throw new Error(`Unknown service: ${key}`);
    }),
    register: vi.fn(),
    has: vi.fn().mockReturnValue(true),
  } as unknown as DIContainer;
}

const auditExecute = vi.fn().mockResolvedValue(undefined);

function createMockDatabaseService(): DatabaseService {
  return {
    getAdapter: vi.fn().mockReturnValue({ execute: auditExecute }),
  } as unknown as DatabaseService;
}

function createMockPlugin(overrides: Partial<CheckmkPlugin> = {}): CheckmkPlugin {
  return {
    isInitialized: vi.fn().mockReturnValue(true),
    acknowledgeServiceProblem: vi.fn().mockResolvedValue({ success: true }),
    scheduleServiceDowntime: vi.fn().mockResolvedValue({ success: true }),
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
  withUser = false,
): Express {
  const app = express();
  app.use(express.json());
  if (withUser) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        userId: "user-123",
        username: "operator",
        roles: ["operator"],
        iat: 0,
        exp: 0,
      };
      next();
    });
  }
  app.use(
    "/api/monitoring",
    createMonitoringActionsRouter(
      integrationManager,
      createMockDatabaseService(),
      createMockContainer(),
    ),
  );
  return app;
}

const VALID_ACK = {
  hostname: "web01",
  serviceDescription: "CPU load",
  comment: "investigating",
};

const VALID_DOWNTIME = {
  hostname: "web01",
  serviceDescription: "CPU load",
  comment: "maintenance",
  startTime: "2026-01-01T00:00:00.000Z",
  endTime: "2026-01-01T02:00:00.000Z",
};

describe("Monitoring Actions Router", () => {
  let mockPlugin: CheckmkPlugin;
  let app: Express;

  beforeEach(() => {
    auditExecute.mockClear();
    mockPlugin = createMockPlugin();
    app = buildApp(createMockIntegrationManager(mockPlugin));
  });

  describe("POST /api/monitoring/acknowledge", () => {
    it("returns 503 when plugin is not configured", async () => {
      const testApp = buildApp(createMockIntegrationManager(null));
      const res = await request(testApp).post("/api/monitoring/acknowledge").send(VALID_ACK);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("CHECKMK_NOT_CONFIGURED");
    });

    it("returns 400 when comment is missing", async () => {
      const res = await request(app)
        .post("/api/monitoring/acknowledge")
        .send({ hostname: "web01", serviceDescription: "CPU load" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });

    it("acknowledges with default sticky/notify and returns 200", async () => {
      const res = await request(app).post("/api/monitoring/acknowledge").send(VALID_ACK);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPlugin.acknowledgeServiceProblem).toHaveBeenCalledWith({
        hostname: "web01",
        serviceDescription: "CPU load",
        comment: "investigating",
        sticky: true,
        persistent: false,
        notify: true,
      });
    });

    it("returns 502 when the upstream acknowledge fails", async () => {
      const failingPlugin = createMockPlugin({
        acknowledgeServiceProblem: vi
          .fn()
          .mockResolvedValue({ success: false, error: "403 Forbidden" }),
      });
      const testApp = buildApp(createMockIntegrationManager(failingPlugin));
      const res = await request(testApp).post("/api/monitoring/acknowledge").send(VALID_ACK);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("UPSTREAM_ERROR");
    });

    it("writes an audit log entry on success when a user is present", async () => {
      const testApp = buildApp(createMockIntegrationManager(mockPlugin), true);
      const res = await request(testApp).post("/api/monitoring/acknowledge").send(VALID_ACK);
      expect(res.status).toBe(200);
      expect(auditExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/monitoring/downtime", () => {
    it("schedules a downtime and returns 200", async () => {
      const res = await request(app).post("/api/monitoring/downtime").send(VALID_DOWNTIME);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPlugin.scheduleServiceDowntime).toHaveBeenCalledWith({
        hostname: "web01",
        serviceDescription: "CPU load",
        comment: "maintenance",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T02:00:00.000Z",
      });
    });

    it("returns 400 when endTime is not after startTime", async () => {
      const res = await request(app)
        .post("/api/monitoring/downtime")
        .send({ ...VALID_DOWNTIME, endTime: "2025-12-31T23:00:00.000Z" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when the window exceeds 7 days", async () => {
      const res = await request(app)
        .post("/api/monitoring/downtime")
        .send({
          ...VALID_DOWNTIME,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-09T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 502 when the upstream downtime call fails", async () => {
      const failingPlugin = createMockPlugin({
        scheduleServiceDowntime: vi
          .fn()
          .mockResolvedValue({ success: false, error: "timeout" }),
      });
      const testApp = buildApp(createMockIntegrationManager(failingPlugin));
      const res = await request(testApp).post("/api/monitoring/downtime").send(VALID_DOWNTIME);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("UPSTREAM_ERROR");
    });
  });
});
