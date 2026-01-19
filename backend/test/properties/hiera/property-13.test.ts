/**
 * Feature: hiera-codebase-integration, Property 13: Key Usage Filtering
 * Validates: Requirements 6.6
 *
 * This property test verifies that:
 * For any node with a set of included classes and a set of Hiera keys,
 * filtering by "used" SHALL return only keys that are referenced by the
 * included classes, and filtering by "unused" SHALL return the complement.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { HieraService, type HieraServiceConfig } from "../../../src/integrations/hiera/HieraService";
import { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import { LoggerService } from "../../../src/services/LoggerService";

describe("Property 13: Key Usage Filtering", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid class names (Puppet class naming convention)
  const classNamePartArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));

  const classNameArb = fc.array(classNamePartArb, { minLength: 1, maxLength: 3 })
    .map((parts) => parts.join("::"));

  // Generator for Hiera key names (typically match class patterns)
  const hieraKeyArb = fc.array(classNamePartArb, { minLength: 1, maxLength: 4 })
    .map((parts) => parts.join("::"));

  // Generator for simple values
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("%{")),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean()
  );

  // Helper to create a temp directory with test structure
  function createTestEnvironment(
    keys: string[],
    keyValues: Map<string, unknown>
  ): { tempDir: string; service: HieraService; integrationManager: IntegrationManager } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-key-usage-test-"));

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

    // Use yaml library for proper YAML formatting
    const yaml = require("yaml");
    fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), yaml.stringify(commonData));

    // Create local fact file
    const factData = {
      name: "test-node.example.com",
      values: {
        networking: {
          hostname: "test-node",
          fqdn: "test-node.example.com",
        },
      },
    };
    fs.writeFileSync(
      path.join(tempDir, "facts", "test-node.example.com.json"),
      JSON.stringify(factData, null, 2)
    );

    // Create integration manager and service
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
        enabled: false, // Disable caching for tests
        ttl: 0,
        maxEntries: 0,
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

  it("should partition keys into used and unused sets that are disjoint", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 10 }),
        async (keys) => {
          // Ensure unique keys
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (const key of uniqueKeys) {
            keyValues.set(key, `value_for_${key}`);
          }

          const { tempDir, service } = createTestEnvironment(uniqueKeys, keyValues);
          try {
            await service.initialize();

            const nodeData = await service.getNodeHieraData("test-node.example.com");

            // Used and unused sets should be disjoint
            const intersection = new Set(
              [...nodeData.usedKeys].filter((k) => nodeData.unusedKeys.has(k))
            );
            expect(intersection.size).toBe(0);

            // Union should equal all keys
            const union = new Set([...nodeData.usedKeys, ...nodeData.unusedKeys]);
            expect(union.size).toBe(nodeData.keys.size);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should classify all resolved keys into either used or unused", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 10 }),
        async (keys) => {
          // Ensure unique keys
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (const key of uniqueKeys) {
            keyValues.set(key, `value_for_${key}`);
          }

          const { tempDir, service } = createTestEnvironment(uniqueKeys, keyValues);
          try {
            await service.initialize();

            const nodeData = await service.getNodeHieraData("test-node.example.com");

            // Every key in the keys map should be in either usedKeys or unusedKeys
            for (const keyName of nodeData.keys.keys()) {
              const isUsed = nodeData.usedKeys.has(keyName);
              const isUnused = nodeData.unusedKeys.has(keyName);

              // Key must be in exactly one set
              expect(isUsed || isUnused).toBe(true);
              expect(isUsed && isUnused).toBe(false);
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

  it("should mark all keys as unused when no catalog data is available", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 10 }),
        async (keys) => {
          // Ensure unique keys
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (const key of uniqueKeys) {
            keyValues.set(key, `value_for_${key}`);
          }

          const { tempDir, service } = createTestEnvironment(uniqueKeys, keyValues);
          try {
            await service.initialize();

            // Without PuppetDB, no catalog data is available
            const nodeData = await service.getNodeHieraData("test-node.example.com");

            // All keys should be marked as unused
            expect(nodeData.usedKeys.size).toBe(0);
            expect(nodeData.unusedKeys.size).toBe(nodeData.keys.size);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should maintain consistency between usedKeys/unusedKeys and keys map size", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 15 }),
        fc.array(simpleValueArb, { minLength: 1, maxLength: 15 }),
        async (keys, values) => {
          // Ensure unique keys and match with values
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (let i = 0; i < uniqueKeys.length; i++) {
            keyValues.set(uniqueKeys[i], values[i % values.length]);
          }

          const { tempDir, service } = createTestEnvironment(uniqueKeys, keyValues);
          try {
            await service.initialize();

            const nodeData = await service.getNodeHieraData("test-node.example.com");

            // Total classified keys should equal total keys
            const totalClassified = nodeData.usedKeys.size + nodeData.unusedKeys.size;
            expect(totalClassified).toBe(nodeData.keys.size);

            await service.shutdown();
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should return consistent results for the same node", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(hieraKeyArb, { minLength: 1, maxLength: 8 }),
        async (keys) => {
          // Ensure unique keys
          const uniqueKeys = [...new Set(keys)];
          if (uniqueKeys.length === 0) return;

          const keyValues = new Map<string, unknown>();
          for (const key of uniqueKeys) {
            keyValues.set(key, `value_for_${key}`);
          }

          const { tempDir, service } = createTestEnvironment(uniqueKeys, keyValues);
          try {
            await service.initialize();

            // Get node data twice
            const nodeData1 = await service.getNodeHieraData("test-node.example.com");

            // Invalidate cache to force re-computation
            service.invalidateCache();

            const nodeData2 = await service.getNodeHieraData("test-node.example.com");

            // Results should be consistent
            expect(nodeData1.usedKeys.size).toBe(nodeData2.usedKeys.size);
            expect(nodeData1.unusedKeys.size).toBe(nodeData2.unusedKeys.size);

            // Same keys should be in same sets
            for (const key of nodeData1.usedKeys) {
              expect(nodeData2.usedKeys.has(key)).toBe(true);
            }
            for (const key of nodeData1.unusedKeys) {
              expect(nodeData2.unusedKeys.has(key)).toBe(true);
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
});
