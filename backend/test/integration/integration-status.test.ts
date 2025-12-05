/**
 * Integration tests for /api/integrations/status endpoint
 */

import { describe, it, expect, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { BasePlugin } from "../../src/integrations/BasePlugin";
import { createIntegrationsRouter } from "../../src/routes/integrations";
import { requestIdMiddleware } from "../../src/middleware";
import type {
  IntegrationConfig,
  HealthStatus,
  InformationSourcePlugin,
} from "../../src/integrations/types";
import type { Node, Facts } from "../../src/bolt/types";

/**
 * Mock information source plugin for testing
 */
class MockInformationSource
  extends BasePlugin
  implements InformationSourcePlugin
{
  private healthy: boolean;

  constructor(name: string, healthy = true) {
    super(name, "information");
    this.healthy = healthy;
  }

  protected async performInitialization(): Promise<void> {
    // Mock initialization
  }

  protected async performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  > {
    if (!this.healthy) {
      throw new Error("Health check failed");
    }
    return {
      healthy: true,
      message: `${this.name} is healthy`,
    };
  }

  async getInventory(): Promise<Node[]> {
    return [];
  }

  async getNodeFacts(_nodeId: string): Promise<Facts> {
    return {
      nodeId: _nodeId,
      gatheredAt: new Date().toISOString(),
      facts: {},
    };
  }

  async getNodeData(_nodeId: string, _dataType: string): Promise<unknown> {
    return {};
  }
}

describe("Integration Status API", () => {
  let app: Express;
  let integrationManager: IntegrationManager;

  beforeEach(async () => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Initialize integration manager
    integrationManager = new IntegrationManager();

    // Register mock plugins
    const plugin1 = new MockInformationSource("puppetdb", true);
    const plugin2 = new MockInformationSource("bolt", true);

    const config1: IntegrationConfig = {
      enabled: true,
      name: "puppetdb",
      type: "information",
      config: {},
      priority: 10,
    };

    const config2: IntegrationConfig = {
      enabled: true,
      name: "bolt",
      type: "information",
      config: {},
      priority: 5,
    };

    integrationManager.registerPlugin(plugin1, config1);
    integrationManager.registerPlugin(plugin2, config2);

    await integrationManager.initializePlugins();

    // Add routes
    app.use("/api/integrations", createIntegrationsRouter(integrationManager));
  });

  describe("GET /api/integrations/status", () => {
    it("should return status for all configured integrations", async () => {
      const response = await request(app)
        .get("/api/integrations/status")
        .expect(200);

      expect(response.body).toHaveProperty("integrations");
      expect(response.body).toHaveProperty("timestamp");
      expect(Array.isArray(response.body.integrations)).toBe(true);
      // Now includes unconfigured Puppetserver
      expect(response.body.integrations).toHaveLength(3);

      // Check first integration
      const puppetdb = response.body.integrations.find(
        (i: { name: string }) => i.name === "puppetdb",
      );
      expect(puppetdb).toBeDefined();
      expect(puppetdb.type).toBe("information");
      expect(puppetdb.status).toBe("connected");
      expect(puppetdb.lastCheck).toBeDefined();
      expect(puppetdb.message).toBe("puppetdb is healthy");

      // Check second integration
      const bolt = response.body.integrations.find(
        (i: { name: string }) => i.name === "bolt",
      );
      expect(bolt).toBeDefined();
      expect(bolt.type).toBe("information");
      expect(bolt.status).toBe("connected");
      expect(bolt.lastCheck).toBeDefined();
      expect(bolt.message).toBe("bolt is healthy");

      // Check unconfigured Puppetserver
      const puppetserver = response.body.integrations.find(
        (i: { name: string }) => i.name === "puppetserver",
      );
      expect(puppetserver).toBeDefined();
      expect(puppetserver.type).toBe("information");
      expect(puppetserver.status).toBe("not_configured");
    });

    it("should return error status for unhealthy integrations", async () => {
      // Create a new manager with an unhealthy plugin
      const newManager = new IntegrationManager();
      const unhealthyPlugin = new MockInformationSource("unhealthy", false);

      const config: IntegrationConfig = {
        enabled: true,
        name: "unhealthy",
        type: "information",
        config: {},
      };

      newManager.registerPlugin(unhealthyPlugin, config);
      await newManager.initializePlugins();

      // Create new app with unhealthy plugin
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);
      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(newManager),
      );

      const response = await request(testApp)
        .get("/api/integrations/status")
        .expect(200);

      // Should have unhealthy integration + unconfigured puppetdb
      expect(response.body.integrations.length).toBeGreaterThanOrEqual(1);
      const unhealthy = response.body.integrations.find(
        (i: { name: string }) => i.name === "unhealthy",
      );
      expect(unhealthy).toBeDefined();
      expect(unhealthy.status).toBe("error");
      expect(unhealthy.message).toContain("Health check failed");
    });

    it("should include unconfigured PuppetDB and Puppetserver when no integrations configured", async () => {
      // Create new manager with no plugins
      const emptyManager = new IntegrationManager();
      await emptyManager.initializePlugins();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);
      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(emptyManager),
      );

      const response = await request(testApp)
        .get("/api/integrations/status")
        .expect(200);

      // Should have unconfigured puppetdb and puppetserver entries
      expect(response.body.integrations).toHaveLength(2);
      expect(response.body.timestamp).toBeDefined();

      const puppetdb = response.body.integrations.find(
        (i: { name: string }) => i.name === "puppetdb",
      );
      expect(puppetdb).toBeDefined();
      expect(puppetdb.status).toBe("not_configured");
      expect(puppetdb.message).toBe("PuppetDB integration is not configured");

      const puppetserver = response.body.integrations.find(
        (i: { name: string }) => i.name === "puppetserver",
      );
      expect(puppetserver).toBeDefined();
      expect(puppetserver.status).toBe("not_configured");
      expect(puppetserver.message).toBe("Puppetserver integration is not configured");
    });

    it("should use cached results by default", async () => {
      const response = await request(app)
        .get("/api/integrations/status")
        .expect(200);

      expect(response.body.cached).toBe(true);
      // Now includes unconfigured Puppetserver
      expect(response.body.integrations).toHaveLength(3);
    });

    it("should refresh health checks when requested", async () => {
      const response = await request(app)
        .get("/api/integrations/status?refresh=true")
        .expect(200);

      expect(response.body.cached).toBe(false);
      // Now includes unconfigured Puppetserver
      expect(response.body.integrations).toHaveLength(3);
    });
  });
});
