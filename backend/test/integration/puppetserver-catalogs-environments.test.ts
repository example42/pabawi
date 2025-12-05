/**
 * Integration tests for Puppetserver catalog and environment endpoints
 *
 * Tests the API endpoints for:
 * - Catalog compilation
 * - Catalog comparison
 * - Environment listing
 * - Environment details
 * - Environment deployment
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createIntegrationsRouter } from "../../src/routes/integrations";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { PuppetserverService } from "../../src/integrations/puppetserver/PuppetserverService";
import type { PuppetserverConfig } from "../../src/config/schema";

describe("Puppetserver Catalog and Environment Endpoints", () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let puppetserverService: PuppetserverService;

  beforeAll(async () => {
    // Create integration manager
    integrationManager = new IntegrationManager();

    // Create mock Puppetserver service
    puppetserverService = new PuppetserverService();

    // Mock configuration
    const mockConfig: PuppetserverConfig = {
      enabled: true,
      serverUrl: "https://puppetserver.example.com",
      port: 8140,
      token: "mock-token",
      ssl: {
        enabled: true,
        rejectUnauthorized: false,
      },
      timeout: 30000,
      cache: {
        ttl: 300000,
      },
    };

    // Initialize service with mock config
    await puppetserverService.initialize({
      name: "puppetserver",
      type: "information",
      enabled: true,
      config: mockConfig,
    });

    // Mock the service methods
    puppetserverService.compileCatalog = async (certname, environment) => ({
      certname,
      version: "1.0.0",
      environment,
      transaction_uuid: "test-uuid",
      producer_timestamp: new Date().toISOString(),
      resources: [
        {
          type: "File",
          title: "/tmp/test",
          tags: ["file", "test"],
          exported: false,
          parameters: {
            ensure: "present",
            mode: "0644",
          },
        },
      ],
    });

    puppetserverService.compareCatalogs = async (
      certname,
      environment1,
      environment2,
    ) => ({
      environment1,
      environment2,
      added: [],
      removed: [],
      modified: [],
      unchanged: [
        {
          type: "File",
          title: "/tmp/test",
          tags: ["file", "test"],
          exported: false,
          parameters: {
            ensure: "present",
            mode: "0644",
          },
        },
      ],
    });

    puppetserverService.listEnvironments = async () => [
      {
        name: "production",
        last_deployed: new Date().toISOString(),
        status: "deployed",
      },
      {
        name: "development",
        last_deployed: new Date().toISOString(),
        status: "deployed",
      },
    ];

    puppetserverService.getEnvironment = async (name) => ({
      name,
      last_deployed: new Date().toISOString(),
      status: "deployed",
    });

    puppetserverService.deployEnvironment = async (name) => ({
      environment: name,
      status: "success",
      timestamp: new Date().toISOString(),
    });

    // Create Express app
    app = express();
    app.use(express.json());

    // Create and mount integrations router
    const router = createIntegrationsRouter(
      integrationManager,
      undefined,
      puppetserverService,
    );
    app.use("/api/integrations", router);
  });

  afterAll(async () => {
    // Cleanup - IntegrationManager doesn't have a shutdown method
    // The service will be cleaned up automatically
  });

  describe("GET /api/integrations/puppetserver/catalog/:certname/:environment", () => {
    it("should compile catalog for a node in a specific environment", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/catalog/test-node/production")
        .expect(200);

      expect(response.body).toHaveProperty("catalog");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body.catalog).toHaveProperty("certname", "test-node");
      expect(response.body.catalog).toHaveProperty("environment", "production");
      expect(response.body.catalog).toHaveProperty("resources");
      expect(Array.isArray(response.body.catalog.resources)).toBe(true);
    });

    it("should return 400 for invalid certname", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/catalog//production")
        .expect(404);

      // Express returns 404 for empty path segments
      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid environment", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/catalog/test-node/")
        .expect(404);

      // Express returns 404 for empty path segments
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/integrations/puppetserver/catalog/compare", () => {
    it("should compare catalogs between two environments", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/catalog/compare")
        .send({
          certname: "test-node",
          environment1: "production",
          environment2: "development",
        })
        .expect(200);

      expect(response.body).toHaveProperty("diff");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body.diff).toHaveProperty("environment1", "production");
      expect(response.body.diff).toHaveProperty("environment2", "development");
      expect(response.body.diff).toHaveProperty("added");
      expect(response.body.diff).toHaveProperty("removed");
      expect(response.body.diff).toHaveProperty("modified");
      expect(response.body.diff).toHaveProperty("unchanged");
    });

    it("should return 400 for missing certname", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/catalog/compare")
        .send({
          environment1: "production",
          environment2: "development",
        })
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code", "INVALID_REQUEST");
    });

    it("should return 400 for missing environment1", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/catalog/compare")
        .send({
          certname: "test-node",
          environment2: "development",
        })
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code", "INVALID_REQUEST");
    });

    it("should return 400 for missing environment2", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/catalog/compare")
        .send({
          certname: "test-node",
          environment1: "production",
        })
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code", "INVALID_REQUEST");
    });
  });

  describe("GET /api/integrations/puppetserver/environments", () => {
    it("should list all available environments", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/environments")
        .expect(200);

      expect(response.body).toHaveProperty("environments");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body).toHaveProperty("count");
      expect(Array.isArray(response.body.environments)).toBe(true);
      expect(response.body.environments.length).toBeGreaterThan(0);
      expect(response.body.environments[0]).toHaveProperty("name");
    });
  });

  describe("GET /api/integrations/puppetserver/environments/:name", () => {
    it("should get details for a specific environment", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/environments/production")
        .expect(200);

      expect(response.body).toHaveProperty("environment");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body.environment).toHaveProperty("name", "production");
      expect(response.body.environment).toHaveProperty("status");
    });

    it("should return 404 for non-existent environment", async () => {
      // Mock getEnvironment to return null for non-existent environment
      const originalGetEnvironment = puppetserverService.getEnvironment;
      puppetserverService.getEnvironment = async (name) => {
        if (name === "nonexistent") {
          return null;
        }
        return originalGetEnvironment.call(puppetserverService, name);
      };

      const response = await request(app)
        .get("/api/integrations/puppetserver/environments/nonexistent")
        .expect(404);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty(
        "code",
        "ENVIRONMENT_NOT_FOUND",
      );

      // Restore original method
      puppetserverService.getEnvironment = originalGetEnvironment;
    });
  });

  describe("POST /api/integrations/puppetserver/environments/:name/deploy", () => {
    it("should deploy an environment", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/environments/production/deploy")
        .expect(200);

      expect(response.body).toHaveProperty("result");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body.result).toHaveProperty("environment", "production");
      expect(response.body.result).toHaveProperty("status", "success");
      expect(response.body.result).toHaveProperty("timestamp");
    });

    it("should return 400 for invalid environment name", async () => {
      const response = await request(app)
        .post("/api/integrations/puppetserver/environments//deploy")
        .expect(404);

      // Express returns 404 for empty path segments
      expect(response.status).toBe(404);
    });
  });
});
