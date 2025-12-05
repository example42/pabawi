/**
 * Integration tests for inventory endpoint filtering and sorting
 * Tests Requirement 2.2: Puppetserver source support with filtering and sorting
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Node } from "../../src/bolt/types";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { BoltService } from "../../src/bolt/BoltService";
import { createInventoryRouter } from "../../src/routes/inventory";
import express, { type Express } from "express";
import request from "supertest";

describe("Inventory Filtering and Sorting", () => {
  let app: Express;
  let mockBoltService: BoltService;
  let mockIntegrationManager: IntegrationManager;

  const mockBoltNodes: Node[] = [
    {
      id: "bolt-node-1",
      name: "bolt-node-1",
      uri: "ssh://bolt-node-1",
      transport: "ssh",
      config: {},
      source: "bolt",
    },
  ];

  const mockPuppetserverNodes: Node[] = [
    {
      id: "web01.example.com",
      name: "web01.example.com",
      uri: "ssh://web01.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
      certificateStatus: "signed",
    },
    {
      id: "web02.example.com",
      name: "web02.example.com",
      uri: "ssh://web02.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
      certificateStatus: "requested",
    },
    {
      id: "web03.example.com",
      name: "web03.example.com",
      uri: "ssh://web03.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
      certificateStatus: "revoked",
    },
  ];

  const mockPuppetDBNodes: Node[] = [
    {
      id: "db01.example.com",
      name: "db01.example.com",
      uri: "ssh://db01.example.com",
      transport: "ssh",
      config: {},
      source: "puppetdb",
    },
  ];

  beforeEach(() => {
    // Create mock services
    mockBoltService = {
      getInventory: vi.fn().mockResolvedValue(mockBoltNodes),
    } as unknown as BoltService;

    mockIntegrationManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      getAggregatedInventory: vi.fn().mockResolvedValue({
        nodes: [
          ...mockBoltNodes,
          ...mockPuppetserverNodes,
          ...mockPuppetDBNodes,
        ],
        sources: {
          bolt: {
            nodeCount: mockBoltNodes.length,
            lastSync: new Date().toISOString(),
            status: "healthy",
          },
          puppetserver: {
            nodeCount: mockPuppetserverNodes.length,
            lastSync: new Date().toISOString(),
            status: "healthy",
          },
          puppetdb: {
            nodeCount: mockPuppetDBNodes.length,
            lastSync: new Date().toISOString(),
            status: "healthy",
          },
        },
      }),
    } as unknown as IntegrationManager;

    // Create Express app with inventory router
    app = express();
    app.use(express.json());
    app.use(
      "/api/inventory",
      createInventoryRouter(mockBoltService, mockIntegrationManager),
    );
  });

  describe("Certificate Status Filtering", () => {
    it("should filter Puppetserver nodes by certificate status (signed)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ certificateStatus: "signed" });

      expect(response.status).toBe(200);
      expect(response.body.nodes).toBeDefined();

      // Should include signed Puppetserver nodes and all non-Puppetserver nodes
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );
      expect(puppetserverNodes).toHaveLength(1);
      expect(puppetserverNodes[0].certificateStatus).toBe("signed");
    });

    it("should filter Puppetserver nodes by certificate status (requested)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ certificateStatus: "requested" });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );
      expect(puppetserverNodes).toHaveLength(1);
      expect(puppetserverNodes[0].certificateStatus).toBe("requested");
    });

    it("should filter Puppetserver nodes by certificate status (revoked)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ certificateStatus: "revoked" });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );
      expect(puppetserverNodes).toHaveLength(1);
      expect(puppetserverNodes[0].certificateStatus).toBe("revoked");
    });

    it("should filter by multiple certificate statuses", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ certificateStatus: "signed,requested" });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );
      expect(puppetserverNodes).toHaveLength(2);
      expect(
        puppetserverNodes.every(
          (n: Node & { certificateStatus?: string }) =>
            n.certificateStatus === "signed" ||
            n.certificateStatus === "requested",
        ),
      ).toBe(true);
    });

    it("should not filter non-Puppetserver nodes when certificate status filter is applied", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ certificateStatus: "signed" });

      expect(response.status).toBe(200);

      // Should still include Bolt and PuppetDB nodes
      const boltNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "bolt",
      );
      const puppetdbNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetdb",
      );

      expect(boltNodes.length).toBeGreaterThan(0);
      expect(puppetdbNodes.length).toBeGreaterThan(0);
    });
  });

  describe("Sorting", () => {
    it("should sort nodes by certificate status (ascending)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sortBy: "certificateStatus", sortOrder: "asc" });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );

      // Should be ordered: signed, requested, revoked
      expect(puppetserverNodes[0].certificateStatus).toBe("signed");
      expect(puppetserverNodes[1].certificateStatus).toBe("requested");
      expect(puppetserverNodes[2].certificateStatus).toBe("revoked");
    });

    it("should sort nodes by certificate status (descending)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sortBy: "certificateStatus", sortOrder: "desc" });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );

      // Should be ordered: revoked, requested, signed
      expect(puppetserverNodes[0].certificateStatus).toBe("revoked");
      expect(puppetserverNodes[1].certificateStatus).toBe("requested");
      expect(puppetserverNodes[2].certificateStatus).toBe("signed");
    });

    it("should sort nodes by name (ascending)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sortBy: "name", sortOrder: "asc" });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Verify nodes are sorted alphabetically by name
      for (let i = 0; i < nodes.length - 1; i++) {
        expect(nodes[i].name.localeCompare(nodes[i + 1].name)).toBeLessThanOrEqual(0);
      }
    });

    it("should sort nodes by source (ascending)", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sortBy: "source", sortOrder: "asc" });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Verify nodes are sorted by source
      for (let i = 0; i < nodes.length - 1; i++) {
        const sourceA = nodes[i].source ?? "";
        const sourceB = nodes[i + 1].source ?? "";
        expect(sourceA.localeCompare(sourceB)).toBeLessThanOrEqual(0);
      }
    });

    it("should default to ascending order when sortOrder is not specified", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sortBy: "name" });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Verify nodes are sorted alphabetically by name (ascending)
      for (let i = 0; i < nodes.length - 1; i++) {
        expect(nodes[i].name.localeCompare(nodes[i + 1].name)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("Combined Filtering and Sorting", () => {
    it("should filter by certificate status and sort by name", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({
          certificateStatus: "signed,requested",
          sortBy: "name",
          sortOrder: "asc",
        });

      expect(response.status).toBe(200);
      const puppetserverNodes = response.body.nodes.filter(
        (n: Node & { source?: string }) => n.source === "puppetserver",
      );

      // Should only have signed and requested nodes
      expect(puppetserverNodes).toHaveLength(2);
      expect(
        puppetserverNodes.every(
          (n: Node & { certificateStatus?: string }) =>
            n.certificateStatus === "signed" ||
            n.certificateStatus === "requested",
        ),
      ).toBe(true);

      // Should be sorted by name
      expect(puppetserverNodes[0].name).toBe("web01.example.com");
      expect(puppetserverNodes[1].name).toBe("web02.example.com");
    });

    it("should filter by source and certificate status", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({
          sources: "puppetserver",
          certificateStatus: "signed",
        });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Should only have Puppetserver nodes with signed status
      expect(nodes).toHaveLength(1);
      expect(nodes[0].source).toBe("puppetserver");
      expect(nodes[0].certificateStatus).toBe("signed");
    });
  });

  describe("Source Filtering", () => {
    it("should filter nodes by Puppetserver source", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sources: "puppetserver" });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Should only have Puppetserver nodes
      expect(nodes).toHaveLength(mockPuppetserverNodes.length);
      expect(
        nodes.every((n: Node & { source?: string }) => n.source === "puppetserver"),
      ).toBe(true);
    });

    it("should filter nodes by multiple sources", async () => {
      const response = await request(app)
        .get("/api/inventory")
        .query({ sources: "puppetserver,puppetdb" });

      expect(response.status).toBe(200);
      const nodes = response.body.nodes;

      // Should have Puppetserver and PuppetDB nodes, but not Bolt
      expect(nodes.length).toBe(
        mockPuppetserverNodes.length + mockPuppetDBNodes.length,
      );
      expect(
        nodes.every(
          (n: Node & { source?: string }) =>
            n.source === "puppetserver" || n.source === "puppetdb",
        ),
      ).toBe(true);
    });
  });
});
