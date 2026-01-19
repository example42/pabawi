import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";
import type { Facts } from "../../src/integrations/types";

describe("PuppetDB Facts Route - Expert Mode", () => {
  let app: Express;
  let mockPuppetDBService: PuppetDBService;

  beforeAll(() => {
    // Create mock PuppetDB service
    const mockFacts: Facts = {
      nodeId: "test-node-1",
      facts: {
        os: { family: "RedHat", name: "CentOS", release: { major: "7" } },
        networking: { hostname: "test-node-1", domain: "example.com" },
      },
      categories: {
        system: ["os"],
        network: ["networking"],
      },
      source: "puppetdb",
      timestamp: new Date().toISOString(),
    };

    mockPuppetDBService = {
      isInitialized: () => true,
      getNodeFacts: async (certname: string) => {
        if (certname === "test-node-1") {
          return mockFacts;
        }
        throw new Error(`Node '${certname}' not found in PuppetDB`);
      },
    } as unknown as PuppetDBService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(mockPuppetDBService));
  });

  describe("GET /api/integrations/puppetdb/nodes/:certname/facts", () => {
    it("should return facts when node exists", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/facts")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.facts).toBeDefined();
      expect(response.body.facts.nodeId).toBe("test-node-1");
      expect(response.body.source).toBe("puppetdb");
    });

    it("should include debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/facts")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.facts).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname/facts");
      expect(response.body._debug.integration).toBe("puppetdb");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/facts")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.facts).toBeDefined();
      expect(response.body._debug).toBeUndefined();
    });

    it("should attach debug info to error responses when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node/facts")
        .set("X-Expert-Mode", "true")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.warnings).toBeDefined();
      expect(response.body._debug.warnings.length).toBeGreaterThan(0);
      expect(response.body._debug.warnings[0].message).toContain("not found");
    });

    it("should capture error details in debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node/facts")
        .set("X-Expert-Mode", "true")
        .expect(404);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
      expect(response.body._debug.warnings[0].context).toContain("not found");
    });
  });
});
