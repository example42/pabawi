import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";

describe("PuppetDB Admin Summary Stats - Expert Mode", () => {
  let app: Express;
  let puppetDBService: PuppetDBService;

  beforeAll(async () => {
    // Create a mock PuppetDB service
    puppetDBService = new PuppetDBService();

    // Mock the service methods
    puppetDBService.isInitialized = () => true;
    puppetDBService.getSummaryStats = async () => ({
      num_nodes: 10,
      num_resources: 1000,
      avg_resources_per_node: 100,
      num_reports: 50,
      num_facts: 500,
    });

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(puppetDBService));
  });

  afterAll(() => {
    // Cleanup if needed
  });

  it("should return summary stats without debug info when expert mode is disabled", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .expect(200);

    expect(response.body).toHaveProperty("stats");
    expect(response.body).toHaveProperty("source", "puppetdb");
    expect(response.body).toHaveProperty("warning");
    expect(response.body).not.toHaveProperty("_debug");
  });

  it("should return summary stats with debug info when expert mode is enabled", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .set("X-Expert-Mode", "true")
      .expect(200);

    expect(response.body).toHaveProperty("stats");
    expect(response.body).toHaveProperty("source", "puppetdb");
    expect(response.body).toHaveProperty("warning");
    expect(response.body).toHaveProperty("_debug");

    // Verify debug info structure
    const debug = response.body._debug;
    expect(debug).toHaveProperty("timestamp");
    expect(debug).toHaveProperty("requestId");
    expect(debug).toHaveProperty("operation", "GET /api/integrations/puppetdb/admin/summary-stats");
    expect(debug).toHaveProperty("duration");
    expect(debug).toHaveProperty("integration", "puppetdb");
    expect(debug).toHaveProperty("performance");
    expect(debug).toHaveProperty("context");

    // Verify metadata
    expect(debug.metadata).toHaveProperty("resourceIntensive", true);

    // Verify log levels are captured
    expect(debug).toHaveProperty("info");
    expect(debug).toHaveProperty("warnings");
    expect(Array.isArray(debug.info)).toBe(true);
    expect(Array.isArray(debug.warnings)).toBe(true);

    // Should have info about fetching stats
    expect(debug.info.some((log: { message: string }) =>
      log.message.includes("Fetching PuppetDB summary stats")
    )).toBe(true);

    // Should have warning about resource-intensive operation
    expect(debug.warnings.some((log: { message: string }) =>
      log.message.includes("resource-intensive")
    )).toBe(true);
  });

  it("should attach debug info to error responses when expert mode is enabled", async () => {
    // Create a service that throws an error
    const errorService = new PuppetDBService();
    errorService.isInitialized = () => true;
    errorService.getSummaryStats = async () => {
      throw new Error("Test error");
    };

    const errorApp = express();
    errorApp.use(express.json());
    errorApp.use(expertModeMiddleware);
    errorApp.use("/api/integrations/puppetdb", createPuppetDBRouter(errorService));

    const response = await request(errorApp)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .set("X-Expert-Mode", "true")
      .expect(500);

    expect(response.body).toHaveProperty("error");
    expect(response.body).toHaveProperty("_debug");

    const debug = response.body._debug;
    expect(debug).toHaveProperty("errors");
    expect(Array.isArray(debug.errors)).toBe(true);
    expect(debug.errors.length).toBeGreaterThan(0);

    // Should capture the error message
    expect(debug.errors.some((err: { message: string }) =>
      err.message.includes("Test error")
    )).toBe(true);
  });

  it("should not include debug info in error response when expert mode is disabled", async () => {
    // Create a service that throws an error
    const errorService = new PuppetDBService();
    errorService.isInitialized = () => true;
    errorService.getSummaryStats = async () => {
      throw new Error("Test error");
    };

    const errorApp = express();
    errorApp.use(express.json());
    errorApp.use(expertModeMiddleware);
    errorApp.use("/api/integrations/puppetdb", createPuppetDBRouter(errorService));

    const response = await request(errorApp)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .expect(500);

    expect(response.body).toHaveProperty("error");
    expect(response.body).not.toHaveProperty("_debug");
  });

  it("should capture performance metrics in debug info", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .set("X-Expert-Mode", "true")
      .expect(200);

    expect(response.body._debug.performance).toBeDefined();
    expect(response.body._debug.performance).toHaveProperty("memoryUsage");
    expect(response.body._debug.performance).toHaveProperty("cacheStats");
  });

  it("should capture request context in debug info", async () => {
    const response = await request(app)
      .get("/api/integrations/puppetdb/admin/summary-stats")
      .set("X-Expert-Mode", "true")
      .set("User-Agent", "test-agent")
      .expect(200);

    expect(response.body._debug.context).toBeDefined();
    expect(response.body._debug.context).toHaveProperty("url");
    expect(response.body._debug.context).toHaveProperty("method", "GET");
    expect(response.body._debug.context).toHaveProperty("userAgent", "test-agent");
  });
});
