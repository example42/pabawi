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
    },
    {
      id: "web02.example.com",
      name: "web02.example.com",
      uri: "ssh://web02.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
    },
    {
      id: "web03.example.com",
      name: "web03.example.com",
      uri: "ssh://web03.example.com",
      transport: "ssh",
      config: {},
      source: "puppetserver",
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
      getLinkedInventory: vi.fn().mockResolvedValue({
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
