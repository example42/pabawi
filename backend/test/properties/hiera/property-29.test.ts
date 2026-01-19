/**
 * Feature: hiera-codebase-integration, Property 29: Cache Invalidation on File Change
 * Validates: Requirements 15.2
 *
 * This property test verifies that:
 * When a hieradata file changes, all cached values derived from that file
 * SHALL be invalidated and subsequent lookups SHALL return fresh data.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { HieraService, type HieraServiceConfig } from "../../../src/integrations/hiera/HieraService";
import { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import { LoggerService } from "../../../src/services/LoggerService";

describe("Property 29: Cache Invalidation on File Change", () => {
  const propertyTestConfig = {
    numRuns: 50,
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

  // Generator for simple string values
  const simpleValueArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.includes("%{") && !s.includes("\n") && !s.includes(":"));

  // Helper to create a temp directory with test structure
  function createTestEnvironment(
    nodes: string[],
    keys: string[],
    keyValues: Map<string, string>
  ): { tempDir: string; service: HieraService; integrationManager: IntegrationManager } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-invalidation-test-"));

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
    const commonData: Record<string, string> = {};
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

  // Helper to update a hieradata file
  function updateHieradataFile(
    tempDir: string,
    keys: string[],
    newValues: Map<string, string>
  ): void {
    const commonData: Record<string, string> = {};
    for (const key of keys) {
      commonData[key] = newValues.get(key) ?? "updated_value";
    }
    fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), yaml.stringify(commonData));
  }

  it("should invalidate cache when file changes are detected", async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeNameArb,
        hieraKeyArb,
        simpleValueArb,
        simpleValueArb,
        async (nodeId, key, initialValue, newValue) => {
          // Ensure values are different
          if (initialValue === newValue) return;

          const keyValues = new Map<string, string>([[key, initialValue]]);
          const { tempDir, service } = createTestEnvironment([nodeId], [key], keyValues);

          try {
            await service.initialize();

            // First call - populates cache
            const firstResolution = await service.resolveKey(nodeId, key);
            expect(firstResolution.resolvedValue).toBe(initialValue);

            // Verify cache is populated
            let stats = service.getCacheStats();
            expect(stats.resolutionCacheSize).toBeGreaterThan(0);

            // Simulate file change by calling handleFileChanges through the scanner callback
            // Update the file first
            const newKeyValues = new Map<string, string>([[key, newValue]]);
            updateHieradataFile(tempDir, [key], newKeyValues);

            // Trigger cache invalidation (simulating file watcher callback)
            // We access the scanner and trigger the change notification
            const scanner = service.getScanner();

            // Rescan the file to pick up changes
            await scanner.rescanFiles(["data/common.yaml"]);

            // Manually invalidate cache (simulating what handleFileChanges does)
            service.invalidateCache();

            // Verify cache is cleared
            stats = service.getCacheStats();
            expect(stats.resolutionCacheSize).toBe(0);

            // Next call should return fresh data
            const freshResolution = await service.resolveKey(nodeId, key);
            expect(freshResolution.resolvedValue).toBe(newValue);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should invalidate node data cache when underlying data changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeNameArb,
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 3 }),
        fc.array(simpleValueArb, { minLength: 1, maxLength: 3 }),
        async (nodeId, keys, values) => {
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, string>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment([nodeId], uniqueKeys, keyValues);

          try {
            await service.initialize();

            // Get node data - populates cache
            const firstNodeData = await service.getNodeHieraData(nodeId);
            expect(firstNodeData.nodeId).toBe(nodeId);

            // Verify node data cache is populated
            let stats = service.getCacheStats();
            expect(stats.nodeDataCacheSize).toBe(1);

            // Update file with new values
            const newKeyValues = new Map<string, string>();
            for (const key of uniqueKeys) {
              newKeyValues.set(key, `updated_${key}`);
            }
            updateHieradataFile(tempDir, uniqueKeys, newKeyValues);

            // Rescan and invalidate
            const scanner = service.getScanner();
            await scanner.rescanFiles(["data/common.yaml"]);
            service.invalidateCache();

            // Verify cache is cleared
            stats = service.getCacheStats();
            expect(stats.nodeDataCacheSize).toBe(0);

            // Get fresh node data
            const freshNodeData = await service.getNodeHieraData(nodeId);

            // Verify values are updated
            for (const key of uniqueKeys) {
              const resolution = freshNodeData.keys.get(key);
              expect(resolution?.resolvedValue).toBe(`updated_${key}`);
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

  it("should invalidate key index cache when files change", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 5 }),
        hieraKeyArb,
        simpleValueArb,
        async (initialKeys, newKey, value) => {
          const uniqueKeys = [...new Set(initialKeys)];
          if (uniqueKeys.length === 0) return;
          // Ensure new key is different from existing keys
          if (uniqueKeys.includes(newKey)) return;

          const keyValues = new Map<string, string>();
          for (const key of uniqueKeys) {
            keyValues.set(key, value);
          }

          const { tempDir, service } = createTestEnvironment(
            ["test-node.example.com"],
            uniqueKeys,
            keyValues
          );

          try {
            await service.initialize();

            // Get all keys - populates cache
            const firstKeyIndex = await service.getAllKeys();
            expect(firstKeyIndex.totalKeys).toBe(uniqueKeys.length);

            // Verify key index is cached
            let stats = service.getCacheStats();
            expect(stats.keyIndexCached).toBe(true);

            // Add a new key to the file
            const newKeyValues = new Map<string, string>(keyValues);
            newKeyValues.set(newKey, "new_value");
            updateHieradataFile(tempDir, [...uniqueKeys, newKey], newKeyValues);

            // Rescan and invalidate
            const scanner = service.getScanner();
            await scanner.rescanFiles(["data/common.yaml"]);
            service.invalidateCache();

            // Verify key index cache is cleared
            stats = service.getCacheStats();
            expect(stats.keyIndexCached).toBe(false);

            // Get fresh key index
            const freshKeyIndex = await service.getAllKeys();
            expect(freshKeyIndex.totalKeys).toBe(uniqueKeys.length + 1);

            // Verify new key is present
            expect(freshKeyIndex.keys.has(newKey)).toBe(true);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should handle multiple file changes correctly", async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeNameArb,
        hieraKeyArb,
        fc.array(simpleValueArb, { minLength: 3, maxLength: 5 }),
        async (nodeId, key, valueSequence) => {
          const uniqueValues = [...new Set(valueSequence)];
          if (uniqueValues.length < 2) return;

          const keyValues = new Map<string, string>([[key, uniqueValues[0]]]);
          const { tempDir, service } = createTestEnvironment([nodeId], [key], keyValues);

          try {
            await service.initialize();

            // Track all resolved values
            const resolvedValues: string[] = [];

            // Initial resolution
            const initial = await service.resolveKey(nodeId, key);
            resolvedValues.push(initial.resolvedValue as string);

            // Perform multiple updates
            for (let i = 1; i < uniqueValues.length; i++) {
              const newValue = uniqueValues[i];
              const newKeyValues = new Map<string, string>([[key, newValue]]);
              updateHieradataFile(tempDir, [key], newKeyValues);

              // Rescan and invalidate
              const scanner = service.getScanner();
              await scanner.rescanFiles(["data/common.yaml"]);
              service.invalidateCache();

              // Resolve again
              const resolution = await service.resolveKey(nodeId, key);
              resolvedValues.push(resolution.resolvedValue as string);
            }

            // Verify each resolution returned the correct value
            for (let i = 0; i < uniqueValues.length; i++) {
              expect(resolvedValues[i]).toBe(uniqueValues[i]);
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

  it("should preserve cache for unaffected nodes after partial invalidation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 3 }),
        hieraKeyArb,
        simpleValueArb,
        async (nodes, key, value) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length < 2) return;

          const keyValues = new Map<string, string>([[key, value]]);
          const { tempDir, service } = createTestEnvironment(uniqueNodes, [key], keyValues);

          try {
            await service.initialize();

            // First get all keys to populate key index cache
            await service.getAllKeys();

            // Populate resolution cache for all nodes
            for (const nodeId of uniqueNodes) {
              await service.resolveKey(nodeId, key);
            }

            // Verify cache is populated
            let stats = service.getCacheStats();
            expect(stats.resolutionCacheSize).toBe(uniqueNodes.length);
            expect(stats.keyIndexCached).toBe(true);

            // Invalidate cache for only the first node
            service.invalidateNodeCache(uniqueNodes[0]);

            // Verify partial invalidation
            stats = service.getCacheStats();
            // Resolution cache entries for first node should be removed
            // Other nodes' resolution cache should remain
            expect(stats.resolutionCacheSize).toBe(uniqueNodes.length - 1);
            // Key index should still be cached
            expect(stats.keyIndexCached).toBe(true);

            // Verify first node needs fresh resolution
            const firstNodeResolution = await service.resolveKey(uniqueNodes[0], key);
            expect(firstNodeResolution.resolvedValue).toBe(value);

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
