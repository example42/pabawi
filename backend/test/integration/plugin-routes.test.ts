/**
 * Generic Plugin Routes Integration Tests
 *
 * Verifies that the generic plugin route pattern `/api/v1/plugins/:pluginName/*`
 * correctly forwards requests to plugin-registered route handlers.
 *
 * @module test/integration/plugin-routes
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import { createV1Router } from "../../src/routes/v1/index.js";
import { IntegrationManager } from "../../src/integrations/IntegrationManager.js";
import { LoggerService } from "../../src/services/LoggerService.js";
import { BasePlugin } from "../../src/integrations/BasePlugin.js";
import type {
  PluginMetadata,
  PluginCapability,
  PluginRoute,
  HealthStatus,
  IntegrationType,
} from "../../src/integrations/types.js";

/**
 * Test plugin with custom routes
 */
class TestPluginWithRoutes extends BasePlugin {
  metadata: PluginMetadata = {
    name: "test-plugin",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin with custom routes",
    integrationType: "Info" as IntegrationType,
  };

  capabilities: PluginCapability[] = [];

  routes: PluginRoute[] = [
    {
      method: "GET",
      path: "hello",
      description: "Simple hello endpoint",
      handler: async (_req, res) => {
        (res as Response).json({ message: "Hello from test plugin!" });
      },
    },
    {
      method: "POST",
      path: "echo",
      description: "Echo back the request body",
      handler: async (req, res) => {
        const body = (req as Request).body;
        (res as Response).json({ echo: body });
      },
    },
    {
      method: "GET",
      path: "data/:id",
      description: "Get data by ID",
      handler: async (req, res) => {
        const id = (req as Request).params.id;
        (res as Response).json({ id, data: `Data for ${id}` });
      },
    },
  ];

  protected async performInitialization(): Promise<void> {
    // No initialization needed for test
  }

  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    return {
      healthy: true,
      message: "Test plugin is healthy",
    };
  }
}

/**
 * Test plugin without custom routes
 */
class TestPluginWithoutRoutes extends BasePlugin {
  metadata: PluginMetadata = {
    name: "test-plugin-no-routes",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin without custom routes",
    integrationType: "Info" as IntegrationType,
  };

  capabilities: PluginCapability[] = [];

  protected async performInitialization(): Promise<void> {
    // No initialization needed for test
  }

  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    return {
      healthy: true,
      message: "Test plugin is healthy",
    };
  }
}

describe("Generic Plugin Routes", () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let logger: LoggerService;

  beforeAll(async () => {
    // Create minimal test setup
    logger = new LoggerService("error");
    integrationManager = new IntegrationManager({ logger });

    // Register test plugins
    const pluginWithRoutes = new TestPluginWithRoutes(logger);
    const pluginWithoutRoutes = new TestPluginWithoutRoutes(logger);

    pluginWithRoutes.setConfig({ enabled: true });
    pluginWithoutRoutes.setConfig({ enabled: true });

    integrationManager.registerCapabilityPlugin(pluginWithRoutes);
    integrationManager.registerCapabilityPlugin(pluginWithoutRoutes);

    await integrationManager.initializePlugins({ loadV1Plugins: false });

    // Create Express app with v1 routes
    app = express();
    app.use(express.json());
    app.use("/api/v1", createV1Router({ integrationManager, logger }));
  });

  afterAll(async () => {
    // Cleanup
    integrationManager.stopHealthCheckScheduler();
  });

  describe("Custom Plugin Routes", () => {
    it("should handle GET request to custom route", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/test-plugin/hello")
        .expect(200);

      expect(response.body.message).toBe("Hello from test plugin!");
    });

    it("should handle POST request to custom route", async () => {
      const testData = { test: "data", value: 123 };
      const response = await request(app)
        .post("/api/v1/plugins/test-plugin/echo")
        .send(testData)
        .expect(200);

      expect(response.body.echo).toEqual(testData);
    });

    it("should handle parameterized routes", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/test-plugin/data/test-id-123")
        .expect(200);

      expect(response.body.id).toBe("test-id-123");
      expect(response.body.data).toBe("Data for test-id-123");
    });

    it("should return 404 for non-existent route", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/test-plugin/nonexistent")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    });

    it("should return 404 for wrong HTTP method", async () => {
      const response = await request(app)
        .post("/api/v1/plugins/test-plugin/hello")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    });

    it("should return 404 when plugin has no routes", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/test-plugin-no-routes/anything")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("NO_ROUTES");
    });
  });

  describe("Error Handling", () => {
    it("should return available routes in error response", async () => {
      const response = await request(app)
        .get("/api/v1/plugins/test-plugin/invalid-route")
        .expect(404);

      expect(response.body.error.availableRoutes).toBeDefined();
      expect(response.body.error.availableRoutes.length).toBe(3);
      expect(response.body.error.availableRoutes).toContain("GET hello");
      expect(response.body.error.availableRoutes).toContain("POST echo");
      expect(response.body.error.availableRoutes).toContain("GET data/:id");
    });
  });
});
