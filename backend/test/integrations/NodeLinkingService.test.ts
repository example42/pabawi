/**
 * Unit tests for NodeLinkingService
 * Tests Requirement 3.3, 3.4: Node linking across sources
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NodeLinkingService } from "../../src/integrations/NodeLinkingService";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { Node } from "../../src/bolt/types";

describe("NodeLinkingService", () => {
  let service: NodeLinkingService;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    mockIntegrationManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      getAggregatedInventory: vi.fn(),
      getInformationSource: vi.fn(),
    } as unknown as IntegrationManager;

    service = new NodeLinkingService(mockIntegrationManager);
  });

  describe("linkNodes", () => {
    it("should link nodes with matching certnames from different sources", () => {
      // Requirement 3.3: Verify nodes with matching certnames are linked
      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetserver",
        } as Node & { source: string },
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetdb",
        } as Node & { source: string },
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      // Should have only one linked node
      expect(linkedNodes).toHaveLength(1);

      const linkedNode = linkedNodes[0];

      // Requirement 3.3: Display source attribution for each node
      expect(linkedNode.sources).toContain("puppetserver");
      expect(linkedNode.sources).toContain("puppetdb");
      expect(linkedNode.sources).toContain("bolt");
      expect(linkedNode.sources).toHaveLength(3);

      // Requirement 3.4: Show multi-source indicators
      expect(linkedNode.linked).toBe(true);
    });

    it("should not link nodes with different certnames", () => {
      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetserver",
        } as Node & { source: string },
        {
          id: "web02.example.com",
          name: "web02.example.com",
          uri: "ssh://web02.example.com",
          transport: "ssh",
          config: {},
          source: "puppetdb",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      // Should have two separate nodes
      expect(linkedNodes).toHaveLength(2);

      // Neither should be marked as linked
      expect(linkedNodes[0].linked).toBe(false);
      expect(linkedNodes[1].linked).toBe(false);

      // Each should have only one source
      expect(linkedNodes[0].sources).toHaveLength(1);
      expect(linkedNodes[1].sources).toHaveLength(1);
    });

    it("should handle nodes from single source", () => {
      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      expect(linkedNodes).toHaveLength(1);
      expect(linkedNodes[0].linked).toBe(false);
      expect(linkedNodes[0].sources).toEqual(["bolt"]);
    });

    it("should merge certificate status from puppetserver source", () => {
      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetserver",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      expect(linkedNodes).toHaveLength(1);
      expect(linkedNodes[0].sources).toContain("puppetserver");
    });

    it("should merge lastCheckIn using most recent timestamp", () => {
      const oldDate = "2024-01-01T00:00:00Z";
      const newDate = "2024-01-02T00:00:00Z";

      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
          lastCheckIn: oldDate,
        } as Node & { source: string; lastCheckIn: string },
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetserver",
          lastCheckIn: newDate,
        } as Node & { source: string; lastCheckIn: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      expect(linkedNodes).toHaveLength(1);
      expect(linkedNodes[0].lastCheckIn).toBe(newDate);
    });

    it("should handle nodes with URI-based matching", () => {
      // Test that nodes with same hostname in URI are linked
      const nodes: Node[] = [
        {
          id: "node1",
          name: "web01.example.com",
          uri: "ssh://web01.example.com:22",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
        {
          id: "node2",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetdb",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      // Should link based on matching hostname in URI
      expect(linkedNodes).toHaveLength(1);
      expect(linkedNodes[0].linked).toBe(true);
      expect(linkedNodes[0].sources).toHaveLength(2);
    });

    it("should handle empty node list", () => {
      const linkedNodes = service.linkNodes([]);
      expect(linkedNodes).toHaveLength(0);
    });

    it("should deduplicate sources in linked nodes", () => {
      // Test that duplicate sources are not added
      const nodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "bolt",
        } as Node & { source: string },
      ];

      const linkedNodes = service.linkNodes(nodes);

      expect(linkedNodes).toHaveLength(1);
      expect(linkedNodes[0].sources).toEqual(["bolt"]);
      expect(linkedNodes[0].linked).toBe(false);
    });
  });

  describe("findMatchingNodes", () => {
    it("should find nodes matching the identifier", async () => {
      const mockNodes: Node[] = [
        {
          id: "web01.example.com",
          name: "web01.example.com",
          uri: "ssh://web01.example.com",
          transport: "ssh",
          config: {},
          source: "puppetserver",
        } as Node & { source: string },
        {
          id: "web02.example.com",
          name: "web02.example.com",
          uri: "ssh://web02.example.com",
          transport: "ssh",
          config: {},
          source: "puppetdb",
        } as Node & { source: string },
      ];

      mockIntegrationManager.getAggregatedInventory = vi
        .fn()
        .mockResolvedValue({
          nodes: mockNodes,
          sources: {},
        });

      const matchingNodes = await service.findMatchingNodes("web01.example.com");

      expect(matchingNodes).toHaveLength(1);
      expect(matchingNodes[0].name).toBe("web01.example.com");
    });

    it("should return empty array when no nodes match", async () => {
      mockIntegrationManager.getAggregatedInventory = vi
        .fn()
        .mockResolvedValue({
          nodes: [],
          sources: {},
        });

      const matchingNodes = await service.findMatchingNodes("nonexistent.example.com");

      expect(matchingNodes).toHaveLength(0);
    });

    it("should match case-insensitively", async () => {
      const mockNodes: Node[] = [
        {
          id: "WEB01.EXAMPLE.COM",
          name: "WEB01.EXAMPLE.COM",
          uri: "ssh://WEB01.EXAMPLE.COM",
          transport: "ssh",
          config: {},
          source: "puppetserver",
        } as Node & { source: string },
      ];

      mockIntegrationManager.getAggregatedInventory = vi
        .fn()
        .mockResolvedValue({
          nodes: mockNodes,
          sources: {},
        });

      const matchingNodes = await service.findMatchingNodes("web01.example.com");

      expect(matchingNodes).toHaveLength(1);
    });
  });
});
