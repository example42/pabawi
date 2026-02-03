/**
 * v1 API Routes Integration Tests
 *
 * Verifies that all v1 API routes are accessible and include
 * the X-API-Version response header.
 *
 * @module test/integration/v1-api-routes
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createV1Router, API_VERSION } from "../../src/routes/v1/index.js";
import { IntegrationManager } from "../../src/integrations/IntegrationManager.js";
import { LoggerService } from "../../src/services/LoggerService.js";

describe("v1 API Routes", () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let logger: LoggerService;

  beforeAll(async () => {
    // Create minimal test setup
    logger = new LoggerService("error");
    integrationManager = new IntegrationManager({ logger });

    // Create Express app with v1 routes
    app = express();
    app.use(express.json());
    app.use("/api/v1", createV1Router({ integrationManager, logger }));
  });

  afterAll(async () => {
    // Cleanup
    integrationManager.stopHealthCheckScheduler();
  });

  describe("API Version Header", () => {
    it("should include X-API-Version header on /api/v1/health", async () => {
      const response = await request(app)
        .get("/api/v1/health")
        .expect(200);

      expect(response.headers["x-api-version"]).toBe(API_VERSION);
      expect(response.headers["x-api-version"]).toBe("1.0.0");
    });

    it("should include X-API-Version header on /api/v1/plugins", async () => {
      const response = await request(app)
        .get("/api/v1/plugins")
        .expect(200);

      expect(response.headers["x-api-version"]).toBe(API_VERSION);
    });

    it("should include X-API-Version header on /api/v1/capabilities", async () => {
      const response = await request(app)
        .get("/api/v1/capabilities")
        .expect(200);

      expect(response.headers["x-api-version"]).toBe(API_VERSION);
    });

    it("should include X-API-Version header on /api/v1/widgets", async () => {
      const response = await request(app)
        .get("/api/v1/widgets")
        .expect(200);

      expect(response.headers["x-api-version"]).toBe(API_VERSION);
    });

    it("should include X-API-Version header on /api/v1/nodes", async () => {
      const response = await request(app)
        .get("/api/v1/nodes")
        .expect(200);

      expect(response.headers["x-api-version"]).toBe(API_VERSION);
    });
  });

  describe("Health Endpoint", () => {
    it("should return health status with version", async () => {
      const response = await request(app)
        .get("/api/v1/health")
        .expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body.version).toBe(API_VERSION);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe("Plugins Routes", () => {
    it("GET /api/v1/plugins should return plugins list", async () => {
      const response = await request(app)
        .get("/api/v1/plugins")
        .expect(200);

      expect(response.body.plugins).toBeDefined();
      expect(Array.isArray(response.body.plugins)).toBe(true);
    });

    it("GET /api/v1/plugins/:name should return 404 for non-existent plugin", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/nonexistent")
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("PLUGIN_NOT_FOUND");
    });

    it("GET /api/v1/plugins/:name/capabilities should return capabilities", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/bolt/capabilities")
        .expect(200);

      expect(response.body.capabilities).toBeDefined();
      expect(Array.isArray(response.body.capabilities)).toBe(true);
    });

    it("GET /api/v1/plugins/:name/widgets should return widgets", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/bolt/widgets")
        .expect(200);

      expect(response.body.widgets).toBeDefined();
      expect(Array.isArray(response.body.widgets)).toBe(true);
    });
  });

  describe("Capabilities Routes", () => {
    it("GET /api/v1/capabilities should return capabilities list", async () => {
      const response = await request(app)
        .get("/api/v1/capabilities")
        .expect(200);

      expect(response.body.capabilities).toBeDefined();
      expect(Array.isArray(response.body.capabilities)).toBe(true);
    });

    it("GET /api/v1/capabilities/:name should return 404 for non-existent capability", async () => {
      const response = await request(app)
        .get("/api/v1/capabilities/nonexistent.capability")
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("CAPABILITY_NOT_FOUND");
    });

    it("POST /api/v1/capabilities/:name/execute should return 404 for non-existent capability", async () => {
      const response = await request(app)
        .post("/api/v1/capabilities/nonexistent.capability/execute")
        .send({ params: {} })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe("Nodes Routes", () => {
    it("GET /api/v1/nodes should return nodes list", async () => {
      const response = await request(app)
        .get("/api/v1/nodes")
        .expect(200);

      expect(response.body.nodes).toBeDefined();
      expect(Array.isArray(response.body.nodes)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it("GET /api/v1/nodes/:id should return 404 for non-existent node", async () => {
      const response = await request(app)
        .get("/api/v1/nodes/nonexistent-node")
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NODE_NOT_FOUND");
    });

    it("GET /api/v1/nodes/:id/sources should return sources", async () => {
      const response = await request(app)
        .get("/api/v1/nodes/test-node/sources")
        .expect(200);

      expect(response.body.nodeId).toBe("test-node");
      expect(response.body.sources).toBeDefined();
      expect(Array.isArray(response.body.sources)).toBe(true);
    });
  });

  describe("Widgets Routes", () => {
    it("GET /api/v1/widgets should return widgets list", async () => {
      const response = await request(app)
        .get("/api/v1/widgets")
        .expect(200);

      expect(response.body.widgets).toBeDefined();
      expect(Array.isArray(response.body.widgets)).toBe(true);
      expect(response.body.slots).toBeDefined();
    });

    it("GET /api/v1/widgets/slot/:slot should return widgets for valid slot", async () => {
      const response = await request(app)
        .get("/api/v1/widgets/slot/dashboard")
        .expect(200);

      expect(response.body.slot).toBe("dashboard");
      expect(response.body.widgets).toBeDefined();
      expect(Array.isArray(response.body.widgets)).toBe(true);
    });

    it("GET /api/v1/widgets/slot/:slot should return 400 for invalid slot", async () => {
      const response = await request(app)
        .get("/api/v1/widgets/slot/invalid-slot")
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("INVALID_SLOT");
    });
  });
});
