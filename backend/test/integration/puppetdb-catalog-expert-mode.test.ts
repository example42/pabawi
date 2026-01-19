import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";

describe("PuppetDB Catalog Route - Expert Mode", () => {
  let app: Express;
  let mockPuppetDBService: PuppetDBService;

  beforeAll(() => {
    // Create mock PuppetDB service
    mockPuppetDBService = {
      isInitialized: () => true,
      getNodeCatalog: async (certname: string) => {
        if (certname === "test-node-1") {
          return {
            certname: "test-node-1",
            version: "1234567890",
            environment: "production",
            resources: [
              {
                type: "File",
                title: "/etc/test.conf",
                parameters: { ensure: "present" },
              },
              {
                type: "Service",
                title: "nginx",
                parameters: { ensure: "running" },
              },
            ],
          };
        }
        return null;
      },
      getCatalogResources: async (certname: string, resourceType: string) => {
        if (certname === "test-node-1" && resourceType === "File") {
          return {
            File: [
              {
                type: "File",
                title: "/etc/test.conf",
                parameters: { ensure: "present" },
              },
            ],
          };
        }
        return {};
      },
    } as unknown as PuppetDBService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(mockPuppetDBService));
  });

  describe("GET /api/integrations/puppetdb/nodes/:certname/catalog", () => {
    it("should return catalog when node exists", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/catalog")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.catalog).toBeDefined();
      expect(response.body.catalog.certname).toBe("test-node-1");
      expect(response.body.source).toBe("puppetdb");
    });

    it("should return 404 when catalog does not exist", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node/catalog")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("CATALOG_NOT_FOUND");
    });

    it("should include debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/catalog")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.catalog).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname/catalog");
      expect(response.body._debug.integration).toBe("puppetdb");
      expect(response.body._debug.duration).toBeGreaterThanOrEqual(0);
      expect(response.body._debug.performance).toBeDefined();
      expect(response.body._debug.context).toBeDefined();
      expect(response.body._debug.metadata).toBeDefined();
      expect(response.body._debug.metadata.certname).toBe("test-node-1");
    });

    it("should not include debug info when expert mode is disabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/catalog")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.catalog).toBeDefined();
      expect(response.body._debug).toBeUndefined();
    });

    it("should include debug info in error responses when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/non-existent-node/catalog")
        .set("X-Expert-Mode", "true")
        .expect(404);

      expect(response.body).toBeDefined();
      expect(response.body.error).toBeDefined();
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.operation).toBe("GET /api/integrations/puppetdb/nodes/:certname/catalog");
      expect(response.body._debug.warnings).toBeDefined();
      expect(response.body._debug.warnings.length).toBeGreaterThan(0);
      expect(response.body._debug.warnings[0].message).toContain("Catalog not found");
    });

    it("should support resourceType filter with expert mode", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/nodes/test-node-1/catalog?resourceType=File")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.catalog).toBeDefined();
      expect(response.body.filtered).toBe(true);
      expect(response.body.resourceType).toBe("File");
      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.metadata.resourceType).toBe("File");
      expect(response.body._debug.metadata.filtered).toBe(true);
    });
  });
});
