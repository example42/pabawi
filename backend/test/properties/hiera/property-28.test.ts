/**
 * Feature: hiera-codebase-integration, Property 28: Cache Correctness
 * Validates: Requirements 15.1, 15.5
 *
 * This property test verifies that:
 * For any sequence of Hiera operations, cached results SHALL be equivalent
 * to freshly computed results until the underlying data changes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { HieraService, type HieraServiceConfig } from "../../../src/integrations/hiera/HieraService";
import { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import { LoggerService } from "../../../src/services/LoggerService";

describe("Property 28: Cache Correctness", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid key name parts
  const keyPartArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));

  // Generator for Hiera key names
  const hieraKeyArb = fc.array(keyPartArb, { minLength: 1, maxLength: 3 })
    .map((parts) => parts.join("::"));

  // Generator for node names
  const nodeNameArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter((s) => /^[a-z][a-z0-9-]*$/.test(s))
    .map((name) => `${name}.example.com`);

  // Generator for simple values
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("%{")),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean()
  );

  // Helper to create a temp directory with test structure
  function createTestEnvironment(
    nodes: string[],
    keys: string[],
    keyValues: Map<string, unknown>
  ): { tempDir: string; service: HieraService; integrationManager: IntegrationManager } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-cache-test-"));

    // Create directories
    fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "facts"), { recursive: true });

    // Create hiera.yaml
    const hieraConfig = `
version: 5
defaults:
  datadir: data
  data_hash: yaml_data
hierarchy:
  - name: "Common data"
    path: "common.yaml"
`;
    fs.writeFileSync(path.join(tempDir, "hiera.yaml"), hieraConfig);

    // Create common.yaml with all keys
    const commonData: Record<string, unknown> = {};
    for (const key of keys) {
      commonData[key] = keyValues.get(key) ?? "default_value";
    }
    fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), yaml.stringify(commonData));

    // Create fact files for nodes
    for (const nodeId of nodes) {
      const hostname = nodeId.split(".")[0];
      const factData = {
        name: nodeId,
        values: {
          networking: {
            hostname,
            fqdn: nodeId,
          },
        },
      };
      fs.writeFileSync(
        path.join(tempDir, "facts", `${nodeId}.json`),
        JSON.stringify(factData, null, 2)
      );
    }

    // Create integration manager and service with caching enabled
    const integrationManager = new IntegrationManager({ logger: new LoggerService('error') });

    const config: HieraServiceConfig = {
      controlRepoPath: tempDir,
      hieraConfigPath: "hiera.yaml",
      hieradataPath: "data",
      factSources: {
        preferPuppetDB: false,
        localFactsPath: path.join(tempDir, "facts"),
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxEntries: 1000,
      },
    };

    const service = new HieraService(integrationManager, config);

    return { tempDir, service, integrationManager };
  }

  // Helper to cleanup temp directory
  function cleanupTestEnvironment(tempDir: string): void {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  it("should return equivalent results from cache and fresh computation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 3 }),
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 5 }),
        fc.array(simpleValueArb, { minLength: 1, maxLength: 5 }),
        async (nodes, keys, values) => {
          const uniqueNodes = [...new Set(nodes)];
          const uniqueKeys = [...new Set(keys)];
          if (uniqueNodes.length === 0 || uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment(uniqueNodes, uniqueKeys, keyValues);

          try {
            await service.initialize();

            // First call - populates cache
            const firstResults = new Map<string, unknown>();
            for (const nodeId of uniqueNodes) {
              for (const key of uniqueKeys) {
                const resolution = await service.resolveKey(nodeId, key);
                firstResults.set(`${nodeId}:${key}`, resolution.resolvedValue);
              }
            }

            // Second call - should use cache
            const cachedResults = new Map<string, unknown>();
            for (const nodeId of uniqueNodes) {
              for (const key of uniqueKeys) {
                const resolution = await service.resolveKey(nodeId, key);
                cachedResults.set(`${nodeId}:${key}`, resolution.resolvedValue);
              }
            }

            // Results should be equivalent
            for (const [cacheKey, firstValue] of firstResults) {
              const cachedValue = cachedResults.get(cacheKey);
              expect(JSON.stringify(cachedValue)).toBe(JSON.stringify(firstValue));
            }

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should return fresh results after cache invalidation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 2 }),
        hieraKeyArb,
        simpleValueArb,
        async (nodes, key, value) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length === 0) return;

          const keyValues = new Map<string, unknown>([[key, value]]);
          const { tempDir, service } = createTestEnvironment(uniqueNodes, [key], keyValues);

          try {
            await service.initialize();

            // First call - populates cache
            for (const nodeId of uniqueNodes) {
              await service.resolveKey(nodeId, key);
            }

            // Verify cache is populated
            let stats = service.getCacheStats();
            expect(stats.resolutionCacheSize).toBeGreaterThan(0);

            // Invalidate cache
            service.invalidateCache();

            // Verify cache is cleared
            stats = service.getCacheStats();
            expect(stats.resolutionCacheSize).toBe(0);

            // Third call - should compute fresh results
            for (const nodeId of uniqueNodes) {
              const resolution = await service.resolveKey(nodeId, key);
              expect(JSON.stringify(resolution.resolvedValue)).toBe(JSON.stringify(value));
            }

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should cache getAllKeys results correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 10 }),
        fc.array(simpleValueArb, { minLength: 1, maxLength: 10 }),
        async (keys, values) => {
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment(
            ["test-node.example.com"],
            uniqueKeys,
            keyValues
          );

          try {
            await service.initialize();

            // First call
            const firstKeyIndex = await service.getAllKeys();

            // Second call - should return same reference (cached)
            const secondKeyIndex = await service.getAllKeys();

            // Should be the same object reference
            expect(firstKeyIndex).toBe(secondKeyIndex);

            // Should have correct number of keys
            expect(firstKeyIndex.totalKeys).toBe(uniqueKeys.length);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should cache node data correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeNameArb,
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 5 }),
        fc.array(simpleValueArb, { minLength: 1, maxLength: 5 }),
        async (nodeId, keys, values) => {
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment([nodeId], uniqueKeys, keyValues);

          try {
            await service.initialize();

            // First call
            const firstNodeData = await service.getNodeHieraData(nodeId);

            // Verify cache is populated
            let stats = service.getCacheStats();
            expect(stats.nodeDataCacheSize).toBe(1);

            // Second call - should use cache
            const secondNodeData = await service.getNodeHieraData(nodeId);

            // Should be the same object reference
            expect(firstNodeData).toBe(secondNodeData);

            // Data should be correct
            expect(firstNodeData.nodeId).toBe(nodeId);
            expect(firstNodeData.keys.size).toBe(uniqueKeys.length);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should maintain cache consistency across multiple operations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 4 }),
        fc.array(hieraKeyArb, { minLength: 2, maxLength: 5 }),
        fc.array(simpleValueArb, { minLength: 2, maxLength: 5 }),
        async (nodes, keys, values) => {
          const uniqueNodes = [...new Set(nodes)];
          const uniqueKeys = [...new Set(keys)];
          if (uniqueNodes.length < 2 || uniqueKeys.length < 2) return;

          const keyValues = new Map<string, unknown>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment(uniqueNodes, uniqueKeys, keyValues);

          try {
            await service.initialize();

            // Perform various operations
            await service.getAllKeys();

            for (const nodeId of uniqueNodes) {
              await service.resolveKey(nodeId, uniqueKeys[0]);
            }

            await service.getNodeHieraData(uniqueNodes[0]);

            // Verify cache stats are consistent
            const stats = service.getCacheStats();
            expect(stats.keyIndexCached).toBe(true);
            expect(stats.resolutionCacheSize).toBeGreaterThan(0);
            expect(stats.nodeDataCacheSize).toBeGreaterThan(0);

            // Invalidate specific node cache
            service.invalidateNodeCache(uniqueNodes[0]);

            // Node data cache should be reduced
            const statsAfter = service.getCacheStats();
            expect(statsAfter.nodeDataCacheSize).toBe(0);

            // Key index should still be cached
            expect(statsAfter.keyIndexCached).toBe(true);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });
});
