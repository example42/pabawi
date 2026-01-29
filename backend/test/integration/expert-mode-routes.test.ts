import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import { BoltService } from "../../src/bolt/BoltService";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { createInventoryRouter } from "../../src/routes/inventory";
import { createIntegrationsRouter } from "../../src/routes/integrations";
import { requestIdMiddleware } from "../../src/middleware/errorHandler";
import { expertModeMiddleware } from "../../src/middleware/expertMode";
import type { Node } from "../../src/bolt/types";

// Mock child_process to avoid actual Bolt CLI execution
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("Expert Mode Routes Integration Tests", () => {
  let app: Express;
  let boltService: BoltService;
  let integrationManager: IntegrationManager;

  beforeEach(() => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(expertModeMiddleware);

    // Initialize services
    boltService = new BoltService("./bolt-project", 5000);
    integrationManager = new IntegrationManager();

    // Mock BoltService methods
    vi.spyOn(boltService, "getInventory").mockResolvedValue([
      {
        id: "node1",
        name: "node1.example.com",
        uri: "ssh://node1.example.com",
      } as Node,
      {
        id: "node2",
        name: "node2.example.com",
        uri: "ssh://node2.example.com",
      } as Node,
    ]);

    // Add routes - pass undefined for puppetDB and puppetserver services
    app.use("/api/inventory", createInventoryRouter(boltService, integrationManager));
    app.use("/api/integrations", createIntegrationsRouter(integrationManager, undefined, undefined));

    vi.clearAllMocks();
  });

  describe("GET /api/inventory", () => {
    it("should include debug info when expert mode is enabled", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/inventory")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.nodes).toBeDefined();
      expect(response.body.sources).toBeDefined();

      // Check for debug info
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.timestamp).toBeDefined();
      expect(response.body._debug.requestId).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/inventory");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.metadata).toBeDefined();
      expect(response.body._debug.metadata.nodeCount).toBe(2);
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/inventory")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.nodes).toBeDefined();
      expect(response.body.sources).toBeDefined();

      // Debug info should not be present
      expect(response.body._debug).toBeUndefined();
    });
  });

  describe("GET /api/integrations/status", () => {
    it("should include debug info when expert mode is enabled", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/integrations/status")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.integrations).toBeDefined();

      // Check for debug info
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.timestamp).toBeDefined();
      expect(response.body._debug.requestId).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/status");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.metadata).toBeDefined();
      expect(response.body._debug.cacheHit).toBeDefined();
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/integrations/status")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.integrations).toBeDefined();

      // Debug info should not be present
      expect(response.body._debug).toBeUndefined();
    });
  });

  describe("GET /api/integrations/puppetdb/nodes/:certname/reports", () => {
    it("should return 503 when PuppetDB is not configured", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node/reports")
        .set("X-Expert-Mode", "true")
        .expect(503);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("PUPPETDB_NOT_CONFIGURED");

      // Check for debug info in error response
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.timestamp).toBeDefined();
      expect(response.body._debug.requestId).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname/reports");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.warnings).toBeDefined();
      expect(response.body._debug.warnings.length).toBeGreaterThan(0);
      expect(response.body._debug.warnings[0].message).toContain("PuppetDB integration is not configured");
    });

    it("should not include debug info in error response when expert mode is disabled", async () => {
      const request = (await import("supertest")).default;
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node/reports")
        .expect(503);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("PUPPETDB_NOT_CONFIGURED");

      // Debug info should not be present
      expect(response.body._debug).toBeUndefined();
    });
  });
});
