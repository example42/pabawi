/**
 * Integration tests for Puppetserver node API endpoints
 */

import { describe, it, expect, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { PuppetserverService } from "../../src/integrations/puppetserver/PuppetserverService";
import { createIntegrationsRouter } from "../../src/routes/integrations";
import { requestIdMiddleware } from "../../src/middleware";
import type { IntegrationConfig } from "../../src/integrations/types";
import type { Node, Facts } from "../../src/bolt/types";
import type { NodeStatus } from "../../src/integrations/puppetserver/types";

/**
 * Mock PuppetserverService for testing node endpoints
 */
class MockPuppetserverService extends PuppetserverService {
  private mockNodes: Node[] = [
    {
      id: "node1.example.com",
      name: "node1.example.com",
      uri: "ssh://node1.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
    },
    {
      id: "node2.example.com",
      name: "node2.example.com",
      uri: "ssh://node2.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
    },
  ];

  private mockNodeStatuses: Record<string, NodeStatus> = {
    "node1.example.com": {
      certname: "node1.example.com",
      latest_report_status: "changed",
      catalog_timestamp: "2024-01-15T10:00:00Z",
      facts_timestamp: "2024-01-15T09:55:00Z",
      report_timestamp: "2024-01-15T10:05:00Z",
      catalog_environment: "production",
      report_environment: "production",
    },
    "node2.example.com": {
      certname: "node2.example.com",
      latest_report_status: "unchanged",
      catalog_timestamp: "2024-01-10T10:00:00Z",
      facts_timestamp: "2024-01-10T09:55:00Z",
      report_timestamp: "2024-01-10T10:05:00Z",
      catalog_environment: "production",
      report_environment: "production",
    },
  };

  private mockFacts: Record<string, Facts> = {
    "node1.example.com": {
      nodeId: "node1.example.com",
      gatheredAt: "2024-01-15T09:55:00Z",
      source: "puppetserver",
      facts: {
        os: {
          family: "RedHat",
          name: "CentOS",
          release: {
            full: "7.9",
            major: "7",
          },
        },
        processors: {
          count: 4,
          models: ["Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"],
        },
        memory: {
          system: {
            total: "16.00 GiB",
            available: "8.00 GiB",
          },
        },
        networking: {
          hostname: "node1",
          interfaces: {
            eth0: {
              ip: "192.168.1.10",
              mac: "00:11:22:33:44:55",
            },
          },
        },
        categories: {
          system: {},
          network: {},
          hardware: {},
          custom: {},
        },
      },
    },
    "node2.example.com": {
      nodeId: "node2.example.com",
      gatheredAt: "2024-01-10T09:55:00Z",
      source: "puppetserver",
      facts: {
        os: {
          family: "Debian",
          name: "Ubuntu",
          release: {
            full: "20.04",
            major: "20",
          },
        },
        processors: {
          count: 2,
          models: ["Intel(R) Core(TM) i7-8550U CPU @ 1.80GHz"],
        },
        memory: {
          system: {
            total: "8.00 GiB",
            available: "4.00 GiB",
          },
        },
        networking: {
          hostname: "node2",
          interfaces: {
            eth0: {
              ip: "192.168.1.20",
              mac: "00:11:22:33:44:66",
            },
          },
        },
        categories: {
          system: {},
          network: {},
          hardware: {},
          custom: {},
        },
      },
    },
  };

  protected async performInitialization(): Promise<void> {
    // Mock initialization
  }

  protected async performHealthCheck(): Promise<{ healthy: boolean; message: string }> {
    return {
      healthy: true,
      message: "Puppetserver is healthy",
    };
  }

  async getInventory(): Promise<Node[]> {
    return this.mockNodes;
  }

  async getNode(certname: string): Promise<Node | null> {
    return this.mockNodes.find((node) => node.id === certname) ?? null;
  }

  async getNodeStatus(certname: string): Promise<NodeStatus> {
    const status = this.mockNodeStatuses[certname];
    if (!status) {
      throw new Error(`Node status not found for '${certname}'`);
    }
    return status;
  }

  categorizeNodeActivity(status: NodeStatus): "active" | "inactive" | "never_checked_in" {
    if (!status.report_timestamp) {
      return "never_checked_in";
    }

    const reportTime = new Date(status.report_timestamp).getTime();
    const now = Date.now();
    const secondsSinceReport = (now - reportTime) / 1000;

    // Use 1 hour threshold for testing
    if (secondsSinceReport > 3600) {
      return "inactive";
    }

    return "active";
  }

  shouldHighlightNode(status: NodeStatus): boolean {
    const activity = this.categorizeNodeActivity(status);
    return activity === "inactive" || activity === "never_checked_in";
  }

  getSecondsSinceLastCheckIn(status: NodeStatus): number | null {
    if (!status.report_timestamp) {
      return null;
    }

    const reportTime = new Date(status.report_timestamp).getTime();
    const now = Date.now();
    return (now - reportTime) / 1000;
  }

  async getNodeFacts(nodeId: string): Promise<Facts> {
    const facts = this.mockFacts[nodeId];
    if (!facts) {
      // Return empty facts structure instead of throwing error (requirement 4.4, 4.5)
      return {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: "puppetserver",
        facts: {
          os: {
            family: "unknown",
            name: "unknown",
            release: {
              full: "unknown",
              major: "unknown",
            },
          },
          processors: {
            count: 0,
            models: [],
          },
          memory: {
            system: {
              total: "0 MB",
              available: "0 MB",
            },
          },
          networking: {
            hostname: nodeId,
            interfaces: {},
          },
          categories: {
            system: {},
            network: {},
            hardware: {},
            custom: {},
          },
        },
      };
    }
    return facts;
  }
}

describe("Puppetserver Node API", () => {
  let app: Express;
  let integrationManager: IntegrationManager;
  let puppetserverService: MockPuppetserverService;

  beforeEach(async () => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Initialize integration manager
    integrationManager = new IntegrationManager();

    // Create mock Puppetserver service
    puppetserverService = new MockPuppetserverService();

    const config: IntegrationConfig = {
      enabled: true,
      name: "puppetserver",
      type: "information",
      config: {
        serverUrl: "https://puppetserver.example.com",
        port: 8140,
      },
      priority: 10,
    };

    integrationManager.registerPlugin(puppetserverService, config);
    await integrationManager.initializePlugins();

    // Add routes
    app.use(
      "/api/integrations",
      createIntegrationsRouter(integrationManager, undefined, puppetserverService),
    );
  });

  describe("GET /api/integrations/puppetserver/nodes", () => {
    it("should return all nodes from Puppetserver CA", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes")
        .expect(200);

      expect(response.body).toHaveProperty("nodes");
      expect(response.body).toHaveProperty("source", "puppetserver");
      expect(response.body).toHaveProperty("count", 2);
      expect(Array.isArray(response.body.nodes)).toBe(true);
      expect(response.body.nodes).toHaveLength(2);
      expect(response.body.nodes[0]).toHaveProperty("id");
      expect(response.body.nodes[0]).toHaveProperty("name");
      expect(response.body.nodes[0]).toHaveProperty("source", "puppetserver");
    });
  });

  describe("GET /api/integrations/puppetserver/nodes/:certname", () => {
    it("should return specific node details", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com")
        .expect(200);

      expect(response.body).toHaveProperty("node");
      expect(response.body.node.id).toBe("node1.example.com");
      expect(response.body.node.name).toBe("node1.example.com");
      expect(response.body.node.source).toBe("puppetserver");
      expect(response.body.source).toBe("puppetserver");
    });

    it("should return 404 for non-existent node", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/nonexistent.example.com")
        .expect(404);

      expect(response.body.error.code).toBe("NODE_NOT_FOUND");
      expect(response.body.error.message).toContain("not found");
    });

    it("should return all nodes when path ends with slash", async () => {
      // When path ends with /, Express routes to /nodes instead of /nodes/:certname
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/")
        .expect(200);

      expect(response.body).toHaveProperty("nodes");
      expect(response.body.source).toBe("puppetserver");
    });
  });

  describe("GET /api/integrations/puppetserver/nodes/:certname/status", () => {
    it("should return node status with activity categorization", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/status")
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body.status.certname).toBe("node1.example.com");
      expect(response.body.status).toHaveProperty("latest_report_status");
      expect(response.body.status).toHaveProperty("catalog_timestamp");
      expect(response.body.status).toHaveProperty("report_timestamp");
      expect(response.body).toHaveProperty("activityCategory");
      expect(["active", "inactive", "never_checked_in"]).toContain(
        response.body.activityCategory,
      );
      expect(response.body).toHaveProperty("shouldHighlight");
      expect(typeof response.body.shouldHighlight).toBe("boolean");
      expect(response.body).toHaveProperty("secondsSinceLastCheckIn");
      expect(response.body.source).toBe("puppetserver");
    });

    it("should return 404 for non-existent node status", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/nonexistent.example.com/status")
        .expect(404);

      expect(response.body.error.code).toBe("NODE_STATUS_NOT_FOUND");
    });

    it("should include activity metadata", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/status")
        .expect(200);

      // Verify activity categorization is present
      expect(response.body.activityCategory).toBeDefined();
      expect(response.body.shouldHighlight).toBeDefined();
      expect(response.body.secondsSinceLastCheckIn).toBeDefined();
    });
  });

  describe("GET /api/integrations/puppetserver/nodes/:certname/facts", () => {
    it("should return node facts with categorization", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/facts")
        .expect(200);

      expect(response.body).toHaveProperty("facts");
      expect(response.body.facts.nodeId).toBe("node1.example.com");
      expect(response.body.facts).toHaveProperty("gatheredAt");
      expect(response.body.facts.source).toBe("puppetserver");
      expect(response.body.facts.facts).toHaveProperty("os");
      expect(response.body.facts.facts).toHaveProperty("processors");
      expect(response.body.facts.facts).toHaveProperty("memory");
      expect(response.body.facts.facts).toHaveProperty("networking");
      expect(response.body.facts.facts).toHaveProperty("categories");
      expect(response.body.source).toBe("puppetserver");
    });

    it("should return facts with proper categorization", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/facts")
        .expect(200);

      const categories = response.body.facts.facts.categories;
      expect(categories).toHaveProperty("system");
      expect(categories).toHaveProperty("network");
      expect(categories).toHaveProperty("hardware");
      expect(categories).toHaveProperty("custom");
    });

    it("should return empty facts structure for non-existent node (graceful handling)", async () => {
      // Requirement 4.4, 4.5: Handle missing facts gracefully
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/nonexistent.example.com/facts")
        .expect(200);

      expect(response.body.facts).toBeDefined();
      expect(response.body.facts.nodeId).toBe("nonexistent.example.com");
      expect(response.body.facts.source).toBe("puppetserver");
      expect(response.body.facts.facts.os.family).toBe("unknown");
      expect(response.body.facts.facts.os.name).toBe("unknown");
      expect(response.body.source).toBe("puppetserver");
    });

    it("should include timestamp for freshness comparison", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/facts")
        .expect(200);

      expect(response.body.facts.gatheredAt).toBeDefined();
      expect(typeof response.body.facts.gatheredAt).toBe("string");
      // Verify it's a valid ISO timestamp
      expect(() => new Date(response.body.facts.gatheredAt)).not.toThrow();
    });
  });

  describe("Service not configured", () => {
    it("should return 503 when Puppetserver is not configured", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      const testManager = new IntegrationManager();
      await testManager.initializePlugins();

      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(testManager, undefined, undefined),
      );

      const response = await request(testApp)
        .get("/api/integrations/puppetserver/nodes")
        .expect(503);

      expect(response.body.error.code).toBe("PUPPETSERVER_NOT_CONFIGURED");
    });

    it("should return 503 for node status when not configured", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      const testManager = new IntegrationManager();
      await testManager.initializePlugins();

      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(testManager, undefined, undefined),
      );

      const response = await request(testApp)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/status")
        .expect(503);

      expect(response.body.error.code).toBe("PUPPETSERVER_NOT_CONFIGURED");
    });

    it("should return 503 for node facts when not configured", async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use(requestIdMiddleware);

      const testManager = new IntegrationManager();
      await testManager.initializePlugins();

      testApp.use(
        "/api/integrations",
        createIntegrationsRouter(testManager, undefined, undefined),
      );

      const response = await request(testApp)
        .get("/api/integrations/puppetserver/nodes/node1.example.com/facts")
        .expect(503);

      expect(response.body.error.code).toBe("PUPPETSERVER_NOT_CONFIGURED");
    });
  });
});
