/**
 * HieraService Unit Tests
 *
 * Tests for the HieraService class that orchestrates Hiera operations
 * with caching support.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { HieraService, type HieraServiceConfig } from "../../src/integrations/hiera/HieraService";
import { IntegrationManager } from "../../src/integrations/IntegrationManager";
import { LoggerService } from "../../src/services/LoggerService";

describe("HieraService", () => {
  let service: HieraService;
  let integrationManager: IntegrationManager;
  let testDir: string;
  let config: HieraServiceConfig;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-service-test-"));

    // Create test control repo structure
    createTestControlRepo(testDir);

    // Create integration manager
    integrationManager = new IntegrationManager({ logger: new LoggerService('error') });

    // Create service config
    config = {
      controlRepoPath: testDir,
      hieraConfigPath: "hiera.yaml",
      hieradataPath: "data",
      factSources: {
        preferPuppetDB: false,
        localFactsPath: path.join(testDir, "facts"),
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxEntries: 1000,
      },
    };

    service = new HieraService(integrationManager, config);
  });

  afterEach(async () => {
    // Shutdown service
    if (service.isInitialized()) {
      await service.shutdown();
    }

    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize successfully with valid config", async () => {
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(service.getHieraConfig()).not.toBeNull();
      expect(service.getHieraConfig()?.version).toBe(5);
    });

    it("should throw error if hiera.yaml is invalid", async () => {
      // Write invalid hiera.yaml
      fs.writeFileSync(
        path.join(testDir, "hiera.yaml"),
        "version: 3\nhierarchy: []"
      );

      await expect(service.initialize()).rejects.toThrow("Unsupported Hiera version");
    });

    it("should throw error if hiera.yaml is missing", async () => {
      // Remove hiera.yaml
      fs.unlinkSync(path.join(testDir, "hiera.yaml"));

      await expect(service.initialize()).rejects.toThrow();
    });
  });

  describe("getAllKeys", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return all discovered keys", async () => {
      const keyIndex = await service.getAllKeys();

      expect(keyIndex.totalKeys).toBeGreaterThan(0);
      expect(keyIndex.keys.has("profile::nginx::port")).toBe(true);
      expect(keyIndex.keys.has("profile::nginx::workers")).toBe(true);
    });

    it("should cache key index", async () => {
      // First call
      const keyIndex1 = await service.getAllKeys();

      // Second call should return cached result
      const keyIndex2 = await service.getAllKeys();

      expect(keyIndex1).toBe(keyIndex2);
    });
  });

  describe("searchKeys", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should find keys matching query", async () => {
      const results = await service.searchKeys("nginx");

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(k => k.name.includes("nginx"))).toBe(true);
    });

    it("should be case-insensitive", async () => {
      const results = await service.searchKeys("NGINX");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should return all keys for empty query", async () => {
      const allKeys = await service.getAllKeys();
      const results = await service.searchKeys("");

      expect(results.length).toBe(allKeys.totalKeys);
    });
  });

  describe("getKey", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return key details for existing key", async () => {
      const key = await service.getKey("profile::nginx::port");

      expect(key).toBeDefined();
      expect(key?.name).toBe("profile::nginx::port");
      expect(key?.locations.length).toBeGreaterThan(0);
    });

    it("should return undefined for non-existent key", async () => {
      const key = await service.getKey("nonexistent::key");

      expect(key).toBeUndefined();
    });
  });

  describe("resolveKey", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should resolve key for a node", async () => {
      const resolution = await service.resolveKey("node1.example.com", "profile::nginx::port");

      expect(resolution.key).toBe("profile::nginx::port");
      expect(resolution.found).toBe(true);
      // Node-specific value (9090) should override common value (8080)
      expect(resolution.resolvedValue).toBe(9090);
    });

    it("should return not found for missing key", async () => {
      const resolution = await service.resolveKey("node1.example.com", "nonexistent::key");

      expect(resolution.found).toBe(false);
      expect(resolution.resolvedValue).toBeUndefined();
    });

    it("should cache resolution results", async () => {
      // First call
      await service.resolveKey("node1.example.com", "profile::nginx::port");

      // Check cache stats
      const stats = service.getCacheStats();
      expect(stats.resolutionCacheSize).toBeGreaterThan(0);
    });
  });

  describe("resolveAllKeys", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should resolve all keys for a node", async () => {
      const resolutions = await service.resolveAllKeys("node1.example.com");

      expect(resolutions.size).toBeGreaterThan(0);
      expect(resolutions.has("profile::nginx::port")).toBe(true);
    });
  });

  describe("getNodeHieraData", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return complete node data", async () => {
      const nodeData = await service.getNodeHieraData("node1.example.com");

      expect(nodeData.nodeId).toBe("node1.example.com");
      expect(nodeData.facts).toBeDefined();
      expect(nodeData.keys.size).toBeGreaterThan(0);
    });

    it("should cache node data", async () => {
      // First call
      await service.getNodeHieraData("node1.example.com");

      // Check cache stats
      const stats = service.getCacheStats();
      expect(stats.nodeDataCacheSize).toBeGreaterThan(0);
    });

    it("should include usedKeys and unusedKeys sets", async () => {
      const nodeData = await service.getNodeHieraData("node1.example.com");

      // Without PuppetDB, all keys should be marked as unused
      expect(nodeData.usedKeys).toBeInstanceOf(Set);
      expect(nodeData.unusedKeys).toBeInstanceOf(Set);

      // Total of used + unused should equal total keys
      const totalClassified = nodeData.usedKeys.size + nodeData.unusedKeys.size;
      expect(totalClassified).toBe(nodeData.keys.size);
    });

    it("should mark all keys as unused when PuppetDB is not available", async () => {
      const nodeData = await service.getNodeHieraData("node1.example.com");

      // Without PuppetDB integration, all keys should be unused
      expect(nodeData.unusedKeys.size).toBe(nodeData.keys.size);
      expect(nodeData.usedKeys.size).toBe(0);
    });
  });

  describe("getKeyValuesAcrossNodes", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return key values for all available nodes", async () => {
      const results = await service.getKeyValuesAcrossNodes("profile::nginx::port");

      expect(results.length).toBeGreaterThan(0);

      // Each result should have required fields
      for (const result of results) {
        expect(result.nodeId).toBeDefined();
        expect(typeof result.found).toBe("boolean");
        if (result.found) {
          expect(result.sourceFile).toBeDefined();
          expect(result.hierarchyLevel).toBeDefined();
        }
      }
    });

    it("should include source file info for each node", async () => {
      const results = await service.getKeyValuesAcrossNodes("profile::nginx::port");

      // Find a result where the key was found
      const foundResult = results.find(r => r.found);
      expect(foundResult).toBeDefined();
      expect(foundResult?.sourceFile).toBeTruthy();
      expect(foundResult?.hierarchyLevel).toBeTruthy();
    });

    it("should return different values for different nodes", async () => {
      const results = await service.getKeyValuesAcrossNodes("profile::nginx::port");

      // node1 has port 9090, common has 8080
      const node1Result = results.find(r => r.nodeId === "node1.example.com");
      const node2Result = results.find(r => r.nodeId === "node2.example.com");

      expect(node1Result?.value).toBe(9090);
      expect(node2Result?.value).toBe(8080); // Falls back to common
    });

    it("should indicate when key is not found for a node", async () => {
      const results = await service.getKeyValuesAcrossNodes("nonexistent::key");

      // All results should have found=false
      for (const result of results) {
        expect(result.found).toBe(false);
      }
    });
  });

  describe("cache management", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should invalidate all caches", async () => {
      // Populate caches
      await service.getAllKeys();
      await service.resolveKey("node1.example.com", "profile::nginx::port");
      await service.getNodeHieraData("node1.example.com");

      // Verify caches are populated
      let stats = service.getCacheStats();
      expect(stats.keyIndexCached).toBe(true);
      expect(stats.resolutionCacheSize).toBeGreaterThan(0);
      expect(stats.nodeDataCacheSize).toBeGreaterThan(0);

      // Invalidate
      service.invalidateCache();

      // Verify caches are cleared
      stats = service.getCacheStats();
      expect(stats.keyIndexCached).toBe(false);
      expect(stats.resolutionCacheSize).toBe(0);
      expect(stats.nodeDataCacheSize).toBe(0);
    });

    it("should invalidate cache for specific node", async () => {
      // Populate caches for two nodes
      await service.resolveKey("node1.example.com", "profile::nginx::port");
      await service.resolveKey("node2.example.com", "profile::nginx::port");
      await service.getNodeHieraData("node1.example.com");
      await service.getNodeHieraData("node2.example.com");

      // Invalidate node1 cache
      service.invalidateNodeCache("node1.example.com");

      // Verify node1 cache is cleared but node2 remains
      const stats = service.getCacheStats();
      expect(stats.nodeDataCacheSize).toBe(1);
    });

    it("should return correct cache statistics", async () => {
      const stats = service.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.ttl).toBe(300000);
      expect(stats.maxEntries).toBe(1000);
    });

    it("should cache parsed hieradata", async () => {
      // First call should populate cache
      await service.getAllKeys();

      let stats = service.getCacheStats();
      expect(stats.keyIndexCached).toBe(true);

      // Second call should use cache (same reference)
      const keys1 = await service.getAllKeys();
      const keys2 = await service.getAllKeys();
      expect(keys1).toBe(keys2);
    });

    it("should cache resolved values per node", async () => {
      // First resolution
      await service.resolveKey("node1.example.com", "profile::nginx::port");

      let stats = service.getCacheStats();
      expect(stats.resolutionCacheSize).toBe(1);

      // Second resolution for same key should use cache
      await service.resolveKey("node1.example.com", "profile::nginx::port");

      stats = service.getCacheStats();
      expect(stats.resolutionCacheSize).toBe(1); // Still 1, not 2

      // Different key should add to cache
      await service.resolveKey("node1.example.com", "profile::nginx::workers");

      stats = service.getCacheStats();
      expect(stats.resolutionCacheSize).toBe(2);
    });
  });

  describe("reloadControlRepo", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should reload and invalidate caches", async () => {
      // Populate caches
      await service.getAllKeys();
      await service.resolveKey("node1.example.com", "profile::nginx::port");

      // Reload
      await service.reloadControlRepo();

      // Verify caches are cleared
      const stats = service.getCacheStats();
      expect(stats.resolutionCacheSize).toBe(0);
      expect(stats.nodeDataCacheSize).toBe(0);
    });
  });

  describe("component accessors", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should provide access to parser", () => {
      expect(service.getParser()).toBeDefined();
    });

    it("should provide access to scanner", () => {
      expect(service.getScanner()).toBeDefined();
    });

    it("should provide access to resolver", () => {
      expect(service.getResolver()).toBeDefined();
    });

    it("should provide access to fact service", () => {
      expect(service.getFactService()).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw error when not initialized", async () => {
      // Create a fresh, uninitialized service for this test
      const freshService = new HieraService(integrationManager, config);

      try {
        await freshService.getAllKeys();
        expect.fail("Expected getAllKeys to throw an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("HieraService is not initialized. Call initialize() first.");
      }
    });
  });

  describe("shutdown", () => {
    it("should clean up resources on shutdown", async () => {
      await service.initialize();

      // Populate caches
      await service.getAllKeys();

      // Shutdown
      await service.shutdown();

      expect(service.isInitialized()).toBe(false);
    });
  });
});

/**
 * Create a test control repository structure
 */
function createTestControlRepo(testDir: string): void {
  // Create directories
  fs.mkdirSync(path.join(testDir, "data", "nodes"), { recursive: true });
  fs.mkdirSync(path.join(testDir, "facts"), { recursive: true });

  // Create hiera.yaml
  const hieraConfig = `
version: 5
defaults:
  datadir: data
  data_hash: yaml_data
hierarchy:
  - name: "Per-node data"
    path: "nodes/%{facts.networking.hostname}.yaml"
  - name: "Common data"
    path: "common.yaml"
`;
  fs.writeFileSync(path.join(testDir, "hiera.yaml"), hieraConfig);

  // Create common.yaml
  const commonData = `
profile::nginx::port: 8080
profile::nginx::workers: 4
profile::base::packages:
  - vim
  - curl
  - wget
`;
  fs.writeFileSync(path.join(testDir, "data", "common.yaml"), commonData);

  // Create node-specific data
  const node1Data = `
profile::nginx::port: 9090
profile::nginx::ssl_enabled: true
`;
  fs.writeFileSync(path.join(testDir, "data", "nodes", "node1.yaml"), node1Data);

  const node2Data = `
profile::nginx::workers: 8
`;
  fs.writeFileSync(path.join(testDir, "data", "nodes", "node2.yaml"), node2Data);

  // Create local fact files
  const node1Facts = {
    name: "node1.example.com",
    values: {
      networking: {
        hostname: "node1",
        fqdn: "node1.example.com",
      },
      os: {
        family: "RedHat",
        name: "CentOS",
      },
    },
  };
  fs.writeFileSync(
    path.join(testDir, "facts", "node1.example.com.json"),
    JSON.stringify(node1Facts, null, 2)
  );

  const node2Facts = {
    name: "node2.example.com",
    values: {
      networking: {
        hostname: "node2",
        fqdn: "node2.example.com",
      },
      os: {
        family: "Debian",
        name: "Ubuntu",
      },
    },
  };
  fs.writeFileSync(
    path.join(testDir, "facts", "node2.example.com.json"),
    JSON.stringify(node2Facts, null, 2)
  );
}
