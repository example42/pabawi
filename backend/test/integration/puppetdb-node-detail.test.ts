import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";

describe("PuppetDB Node Detail Route", () => {
  let app: Express;
  let mockPuppetDBService: PuppetDBService;

  beforeAll(() => {
    // Create mock PuppetDB service
    mockPuppetDBService = {
      isInitialized: () => true,
      getInventory: async () => [
        {
          id: "test-node-1",
          name: "test-node-1",
          uri: "bolt://test-node-1",
          source: "puppetdb",
        },
        {
          id: "test-node-2",
          name: "test-node-2",
          uri: "bolt://test-node-2",
          source: "puppetdb",
        },
      ],
      getReport: async (hash: string) => {
        if (hash === "test-report-hash-1") {
          return {
            certname: "test-node-1",
            hash: "test-report-hash-1",
            status: "changed",
            timestamp: "2024-01-19T10:00:00Z",
            duration: 45.5,
          };
        }
        if (hash === "test-report-hash-2") {
          return {
            certname: "test-node-2",
            hash: "test-report-hash-2",
            status: "unchanged",
            timestamp: "2024-01-19T10:00:00Z",
            duration: 30.2,
          };
        }
        return null;
      },
    } as unknown as PuppetDBService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(mockPuppetDBService));
  });

  describe("GET /api/integrations/puppetdb/nodes/:certname", () => {
    it("should return node details when node exists", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.node).toBeDefined();
      expect(response.body.node.id).toBe("test-node-1");
      expect(response.body.source).toBe("puppetdb");
    });

    it("should return 404 when node does not exist", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NODE_NOT_FOUND");
    });

    it("should include debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.node).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname");
      expect(response.body._debug.integration).toBe("puppetdb");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.node).toBeDefined();
      expect(response.body._debug).toBeUndefined();
    });

    it("should attach debug info to error responses when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node")
        .set("X-Expert-Mode", "true")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.warnings).toBeDefined();
      expect(response.body._debug.warnings.length).toBeGreaterThan(0);
      expect(response.body._debug.warnings[0].message).toContain("not found");
    });
  });

  describe("GET /api/integrations/puppetdb/nodes/:certname/reports/:hash", () => {
    it("should return report details when report exists", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/test-report-hash-1")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.report).toBeDefined();
      expect(response.body.report.certname).toBe("test-node-1");
      expect(response.body.report.hash).toBe("test-report-hash-1");
      expect(response.body.source).toBe("puppetdb");
    });

    it("should return 404 when report does not exist", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/non-existent-hash")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
    });

    it("should return 404 when report belongs to different node", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/test-report-hash-2")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
      expect(response.body.error.message).toContain("does not belong to node");
    });

    it("should include debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/test-report-hash-1")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.report).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname/reports/:hash");
      expect(response.body._debug.integration).toBe("puppetdb");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
      expect(response.body._debug.metadata).toBeDefined();
      expect(response.body._debug.metadata.certname).toBe("test-node-1");
      expect(response.body._debug.metadata.hash).toBe("test-report-hash-1");
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/test-report-hash-1")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.report).toBeDefined();
      expect(response.body._debug).toBeUndefined();
    });

    it("should attach debug info to error responses when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/reports/non-existent-hash")
        .set("X-Expert-Mode", "true")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.warnings).toBeDefined();
      expect(response.body._debug.warnings.length).toBeGreaterThan(0);
      expect(response.body._debug.warnings[0].message).toContain("not found");
    });
  });
});
