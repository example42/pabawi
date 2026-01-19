import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";

describe("PuppetDB Resources Endpoint - Expert Mode", () => {
  let app: Express;
  let mockPuppetDBService: PuppetDBService;

  beforeAll(() => {
    // Create mock PuppetDB service
    mockPuppetDBService = {
      isInitialized: () => true,
      getNodeResources: async (certname: string) => {
        if (certname === "test-node") {
          return {
            "File": [
              {
                type: "File",
                title: "/etc/test.conf",
                exported: false,
                tags: ["test"],
                file: "/etc/puppetlabs/code/environments/production/manifests/site.pp",
                line: 10,
                parameters: {
                  ensure: "present",
                  content: "test content",
                },
              },
            ],
            "Service": [
              {
                type: "Service",
                title: "nginx",
                exported: false,
                tags: ["service"],
                file: "/etc/puppetlabs/code/environments/production/manifests/site.pp",
                line: 20,
                parameters: {
                  ensure: "running",
                  enable: true,
                },
              },
            ],
          };
        }
        throw new Error("Node not found");
      },
    } as unknown as PuppetDBService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(mockPuppetDBService));
  });

  afterAll(() => {
    // Cleanup if needed
  });

  it("should return resources without debug info when expert mode is disabled", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/nodes/test-node/resources")
      .expect(200);

    expect(response.body).toHaveProperty("resources");
    expect(response.body).toHaveProperty("source", "puppetdb");
    expect(response.body).toHaveProperty("certname", "test-node");
    expect(response.body).toHaveProperty("typeCount", 2);
    expect(response.body).toHaveProperty("totalResources", 2);
    expect(response.body).not.toHaveProperty("_debug");
  });

  it("should return resources with debug info when expert mode is enabled", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/nodes/test-node/resources")
      .set("X-Expert-Mode", "true")
      .expect(200);

    expect(response.body).toHaveProperty("resources");
    expect(response.body).toHaveProperty("source", "puppetdb");
    expect(response.body).toHaveProperty("certname", "test-node");
    expect(response.body).toHaveProperty("typeCount", 2);
    expect(response.body).toHaveProperty("totalResources", 2);

    // Verify debug info is present
    expect(response.body).toHaveProperty("_debug");
    expect(response.body._debug).toHaveProperty("timestamp");
    expect(response.body._debug).toHaveProperty("requestId");
    expect(response.body._debug).toHaveProperty("operation", "GET /api/integrations/puppetdb/nodes/:certname/resources");
    expect(response.body._debug).toHaveProperty("duration");
    expect(response.body._debug).toHaveProperty("integration", "puppetdb");
    expect(response.body._debug).toHaveProperty("performance");
    expect(response.body._debug).toHaveProperty("context");

    // Verify metadata
    expect(response.body._debug.metadata).toHaveProperty("certname", "test-node");
    expect(response.body._debug.metadata).toHaveProperty("typeCount", 2);
    expect(response.body._debug.metadata).toHaveProperty("totalResources", 2);

    // Verify info messages
    expect(response.body._debug.info).toBeDefined();
    expect(Array.isArray(response.body._debug.info)).toBe(true);
    expect(response.body._debug.info.length).toBeGreaterThan(0);
  });

  it("should include error details in debug info when expert mode is enabled and error occurs", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/nodes/nonexistent-node/resources")
      .set("X-Expert-Mode", "true")
      .expect(500);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toHaveProperty("code", "INTERNAL_SERVER_ERROR");

    // Verify debug info is present in error response
    expect(response.body).toHaveProperty("_debug");
    expect(response.body._debug).toHaveProperty("timestamp");
    expect(response.body._debug).toHaveProperty("requestId");
    expect(response.body._debug).toHaveProperty("operation", "GET /api/integrations/puppetdb/nodes/:certname/resources");
    expect(response.body._debug).toHaveProperty("duration");
    expect(response.body._debug).toHaveProperty("performance");
    expect(response.body._debug).toHaveProperty("context");

    // Verify error details are captured
    expect(response.body._debug.errors).toBeDefined();
    expect(Array.isArray(response.body._debug.errors)).toBe(true);
    expect(response.body._debug.errors.length).toBeGreaterThan(0);
    expect(response.body._debug.errors[0]).toHaveProperty("message");
    expect(response.body._debug.errors[0].message).toContain("Node not found");
    expect(response.body._debug.errors[0]).toHaveProperty("level", "error");
  });

  it("should not include debug info in error response when expert mode is disabled", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/nodes/nonexistent-node/resources")
      .expect(500);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toHaveProperty("code", "INTERNAL_SERVER_ERROR");
    expect(response.body).not.toHaveProperty("_debug");
  });
});
