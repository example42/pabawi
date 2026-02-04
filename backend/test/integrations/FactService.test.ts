/**
 * FactService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FactService } from "../../src/integrations/hiera/FactService";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";
import type { InformationSourcePlugin } from "../../src/integrations/types";
import type { Facts } from "../../src/integrations/bolt";

// Mock fs module
vi.mock("fs");

describe("FactService", () => {
  let factService: FactService;
  let mockIntegrationManager: IntegrationManager;
  let mockPuppetDBSource: InformationSourcePlugin;

  const testNodeId = "node1.example.com";
  const testLocalFactsPath = "/tmp/facts";

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock PuppetDB source
    mockPuppetDBSource = {
      name: "puppetdb",
      type: "information",
      isInitialized: vi.fn().mockReturnValue(true),
      getNodeFacts: vi.fn(),
      getInventory: vi.fn().mockResolvedValue([]),
      getNodeData: vi.fn(),
      initialize: vi.fn(),
      healthCheck: vi.fn(),
      getConfig: vi.fn(),
    } as unknown as InformationSourcePlugin;

    // Create mock integration manager
    mockIntegrationManager = {
      getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
    } as unknown as IntegrationManager;

    factService = new FactService(mockIntegrationManager, {
      preferPuppetDB: true,
      localFactsPath: testLocalFactsPath,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFacts", () => {
    it("should return facts from PuppetDB when available", async () => {
      const puppetDBFacts: Facts = {
        nodeId: testNodeId,
        gatheredAt: "2024-01-01T00:00:00Z",
        facts: {
          os: {
            family: "RedHat",
            name: "CentOS",
            release: { full: "7.9", major: "7" },
          },
          processors: { count: 4, models: ["Intel Xeon"] },
          memory: { system: { total: "16 GB", available: "8 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      };

      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockResolvedValue(puppetDBFacts);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("puppetdb");
      expect(result.facts).toEqual(puppetDBFacts);
      expect(result.warnings).toBeUndefined();
    });

    it("should fall back to local facts when PuppetDB fails", async () => {
      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("PuppetDB error")
      );

      const localFactContent = JSON.stringify({
        name: testNodeId,
        values: {
          os: {
            family: "Debian",
            name: "Ubuntu",
            release: { full: "20.04", major: "20" },
          },
          processors: { count: 2, models: ["AMD EPYC"] },
          memory: { system: { total: "8 GB", available: "4 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(localFactContent);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("Debian");
      expect(result.warnings).toContain("Using local fact files - facts may be outdated");
    });

    it("should return empty facts with warning when no facts available", async () => {
      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Node not found")
      );
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("Unknown");
      expect(result.warnings).toContain(`No facts available for node '${testNodeId}'`);
    });

    it("should return empty facts when PuppetDB not initialized and no local facts", async () => {
      (mockPuppetDBSource.isInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.warnings).toContain(`No facts available for node '${testNodeId}'`);
    });
  });

  describe("local fact file parsing", () => {
    it("should parse Puppetserver format with name and values", async () => {
      (mockPuppetDBSource.isInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const localFactContent = JSON.stringify({
        name: testNodeId,
        values: {
          os: {
            family: "RedHat",
            name: "CentOS",
            release: { full: "8.5", major: "8" },
          },
          processors: { count: 8, models: ["Intel Core i7"] },
          memory: { system: { total: "32 GB", available: "16 GB" } },
          networking: {
            hostname: "node1",
            fqdn: "node1.example.com",
            interfaces: { eth0: { ip: "192.168.1.100" } },
          },
          custom_fact: "custom_value",
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(localFactContent);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("RedHat");
      expect(result.facts.facts.os.name).toBe("CentOS");
      expect(result.facts.facts.processors.count).toBe(8);
      expect(result.facts.facts.networking.hostname).toBe("node1");
      expect(result.facts.facts.custom_fact).toBe("custom_value");
    });

    it("should parse flat fact structure", async () => {
      (mockPuppetDBSource.isInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const flatFactContent = JSON.stringify({
        os: {
          family: "Debian",
          name: "Ubuntu",
          release: { full: "22.04", major: "22" },
        },
        processors: { count: 4, models: ["ARM Cortex"] },
        memory: { system: { total: "4 GB", available: "2 GB" } },
        networking: { hostname: "node2", interfaces: {} },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(flatFactContent);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("Debian");
      expect(result.facts.facts.os.name).toBe("Ubuntu");
    });

    it("should provide default values for missing required fields", async () => {
      (mockPuppetDBSource.isInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const minimalFactContent = JSON.stringify({
        name: testNodeId,
        values: {
          custom_fact: "value",
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(minimalFactContent);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("Unknown");
      expect(result.facts.facts.os.name).toBe("Unknown");
      expect(result.facts.facts.processors.count).toBe(0);
      expect(result.facts.facts.memory.system.total).toBe("Unknown");
      expect(result.facts.facts.networking.hostname).toBe("Unknown");
      expect(result.facts.facts.custom_fact).toBe("value");
    });

    it("should handle invalid JSON gracefully", async () => {
      (mockPuppetDBSource.isInitialized as ReturnType<typeof vi.fn>).mockReturnValue(false);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json {");

      const result = await factService.getFacts(testNodeId);

      // Should return empty facts with warning
      expect(result.source).toBe("local");
      expect(result.warnings).toContain(`No facts available for node '${testNodeId}'`);
    });
  });

  describe("getFactSource", () => {
    it("should return puppetdb when PuppetDB has facts", async () => {
      const puppetDBFacts: Facts = {
        nodeId: testNodeId,
        gatheredAt: "2024-01-01T00:00:00Z",
        facts: {
          os: { family: "RedHat", name: "CentOS", release: { full: "7", major: "7" } },
          processors: { count: 1, models: [] },
          memory: { system: { total: "1 GB", available: "1 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      };

      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockResolvedValue(puppetDBFacts);

      const source = await factService.getFactSource(testNodeId);

      expect(source).toBe("puppetdb");
    });

    it("should return local when only local facts available", async () => {
      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Not found")
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const source = await factService.getFactSource(testNodeId);

      expect(source).toBe("local");
    });

    it("should return none when no facts available", async () => {
      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Not found")
      );
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const source = await factService.getFactSource(testNodeId);

      expect(source).toBe("none");
    });
  });

  describe("listAvailableNodes", () => {
    it("should combine nodes from PuppetDB and local files", async () => {
      (mockPuppetDBSource.getInventory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "node1.example.com" },
        { id: "node2.example.com" },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        "node2.example.com.json",
        "node3.example.com.json",
      ] as unknown as fs.Dirent[]);

      const nodes = await factService.listAvailableNodes();

      expect(nodes).toContain("node1.example.com");
      expect(nodes).toContain("node2.example.com");
      expect(nodes).toContain("node3.example.com");
      expect(nodes).toHaveLength(3); // Deduplicated
    });

    it("should handle PuppetDB errors gracefully", async () => {
      (mockPuppetDBSource.getInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection failed")
      );

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        "node1.example.com.json",
      ] as unknown as fs.Dirent[]);

      const nodes = await factService.listAvailableNodes();

      expect(nodes).toContain("node1.example.com");
      expect(nodes).toHaveLength(1);
    });
  });

  describe("fact source priority", () => {
    it("should prefer PuppetDB when preferPuppetDB is true", async () => {
      const puppetDBFacts: Facts = {
        nodeId: testNodeId,
        gatheredAt: "2024-01-01T00:00:00Z",
        facts: {
          os: { family: "RedHat", name: "CentOS", release: { full: "7", major: "7" } },
          processors: { count: 1, models: [] },
          memory: { system: { total: "1 GB", available: "1 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      };

      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockResolvedValue(puppetDBFacts);

      // Local facts also available
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: testNodeId,
        values: {
          os: { family: "Debian", name: "Ubuntu", release: { full: "20.04", major: "20" } },
        },
      }));

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("puppetdb");
      expect(result.facts.facts.os.family).toBe("RedHat");
    });

    it("should prefer local facts when preferPuppetDB is false", async () => {
      factService.setPreferPuppetDB(false);

      const localFactContent = JSON.stringify({
        name: testNodeId,
        values: {
          os: { family: "Debian", name: "Ubuntu", release: { full: "20.04", major: "20" } },
          processors: { count: 2, models: [] },
          memory: { system: { total: "2 GB", available: "1 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(localFactContent);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("local");
      expect(result.facts.facts.os.family).toBe("Debian");
    });

    it("should fall back to PuppetDB when local facts unavailable and preferPuppetDB is false", async () => {
      factService.setPreferPuppetDB(false);

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const puppetDBFacts: Facts = {
        nodeId: testNodeId,
        gatheredAt: "2024-01-01T00:00:00Z",
        facts: {
          os: { family: "RedHat", name: "CentOS", release: { full: "7", major: "7" } },
          processors: { count: 1, models: [] },
          memory: { system: { total: "1 GB", available: "1 GB" } },
          networking: { hostname: "node1", interfaces: {} },
        },
      };

      (mockPuppetDBSource.getNodeFacts as ReturnType<typeof vi.fn>).mockResolvedValue(puppetDBFacts);

      const result = await factService.getFacts(testNodeId);

      expect(result.source).toBe("puppetdb");
    });
  });
});
