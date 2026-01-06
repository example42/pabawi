/**
 * Feature: hiera-codebase-integration, Property 15: Node Grouping by Value
 * Validates: Requirements 7.5
 *
 * This property test verifies that:
 * For any set of key-node-value tuples, grouping by resolved value SHALL produce
 * groups where all nodes in each group have the same resolved value for the key.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { HieraService, type HieraServiceConfig } from "../../../src/integrations/hiera/HieraService";
import { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import type { KeyNodeValues } from "../../../src/integrations/hiera/types";

describe("Property 15: Node Grouping by Value", () => {
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

  // Generator for KeyNodeValues
  const keyNodeValuesArb = fc.record({
    nodeId: nodeNameArb,
    value: fc.option(simpleValueArb, { nil: undefined }),
    sourceFile: fc.string({ minLength: 1, maxLength: 30 }),
    hierarchyLevel: fc.string({ minLength: 1, maxLength: 20 }),
    found: fc.boolean(),
  }).map((r) => ({
    ...r,
    // If found is false, value should be undefined
    value: r.found ? r.value : undefined,
  }));

  // Helper to create a temp directory with test structure
  function createTestEnvironment(
    nodes: string[],
    nodeKeyValues: Map<string, unknown>,
    commonValue?: unknown
  ): { tempDir: string; service: HieraService; integrationManager: IntegrationManager } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-grouping-test-"));

    // Create directories
    fs.mkdirSync(path.join(tempDir, "data", "nodes"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "facts"), { recursive: true });

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
    fs.writeFileSync(path.join(tempDir, "hiera.yaml"), hieraConfig);

    // Create common.yaml
    const commonData: Record<string, unknown> = {};
    if (commonValue !== undefined) {
      commonData["test_key"] = commonValue;
    }
    fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), yaml.stringify(commonData));

    // Create node-specific data and fact files
    for (const nodeId of nodes) {
      const hostname = nodeId.split(".")[0];

      // Create node-specific hieradata if value is set
      const nodeValue = nodeKeyValues.get(nodeId);
      if (nodeValue !== undefined) {
        const nodeData = { test_key: nodeValue };
        fs.writeFileSync(
          path.join(tempDir, "data", "nodes", `${hostname}.yaml`),
          yaml.stringify(nodeData)
        );
      }

      // Create fact file
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

    // Create integration manager and service
    const integrationManager = new IntegrationManager();

    const config: HieraServiceConfig = {
      controlRepoPath: tempDir,
      hieraConfigPath: "hiera.yaml",
      hieradataPath: "data",
      factSources: {
        preferPuppetDB: false,
        localFactsPath: path.join(tempDir, "facts"),
      },
      cache: {
        enabled: false,
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

  it("should group all nodes with the same value together", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(keyNodeValuesArb, { minLength: 1, maxLength: 10 }),
        async (keyNodeValues) => {
          // Ensure unique node IDs
          const seenNodes = new Set<string>();
          const uniqueKeyNodeValues = keyNodeValues.filter((knv) => {
            if (seenNodes.has(knv.nodeId)) return false;
            seenNodes.add(knv.nodeId);
            return true;
          });

          if (uniqueKeyNodeValues.length === 0) return;

          // Create a minimal service just to use the groupNodesByValue method
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-grouping-test-"));
          fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
          fs.writeFileSync(path.join(tempDir, "hiera.yaml"), "version: 5\nhierarchy: []");
          fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), "");

          const integrationManager = new IntegrationManager();
          const config: HieraServiceConfig = {
            controlRepoPath: tempDir,
            hieraConfigPath: "hiera.yaml",
            hieradataPath: "data",
            factSources: { preferPuppetDB: false },
            cache: { enabled: false, ttl: 0, maxEntries: 0 },
          };
          const service = new HieraService(integrationManager, config);

          try {
            const groups = service.groupNodesByValue(uniqueKeyNodeValues);

            // All nodes in each group should have the same value
            for (const group of groups) {
              const nodesInGroup = uniqueKeyNodeValues.filter((knv) =>
                group.nodes.includes(knv.nodeId)
              );

              for (const node of nodesInGroup) {
                // For not found nodes, group.value should be undefined
                if (!node.found) {
                  expect(group.value).toBeUndefined();
                } else {
                  // For found nodes, values should match
                  expect(JSON.stringify(node.value)).toBe(JSON.stringify(group.value));
                }
              }
            }
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should include every node in exactly one group", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(keyNodeValuesArb, { minLength: 1, maxLength: 10 }),
        async (keyNodeValues) => {
          // Ensure unique node IDs
          const seenNodes = new Set<string>();
          const uniqueKeyNodeValues = keyNodeValues.filter((knv) => {
            if (seenNodes.has(knv.nodeId)) return false;
            seenNodes.add(knv.nodeId);
            return true;
          });

          if (uniqueKeyNodeValues.length === 0) return;

          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-grouping-test-"));
          fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
          fs.writeFileSync(path.join(tempDir, "hiera.yaml"), "version: 5\nhierarchy: []");
          fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), "");

          const integrationManager = new IntegrationManager();
          const config: HieraServiceConfig = {
            controlRepoPath: tempDir,
            hieraConfigPath: "hiera.yaml",
            hieradataPath: "data",
            factSources: { preferPuppetDB: false },
            cache: { enabled: false, ttl: 0, maxEntries: 0 },
          };
          const service = new HieraService(integrationManager, config);

          try {
            const groups = service.groupNodesByValue(uniqueKeyNodeValues);

            // Collect all nodes from all groups
            const allGroupedNodes: string[] = [];
            for (const group of groups) {
              allGroupedNodes.push(...group.nodes);
            }

            // Every input node should appear exactly once
            const inputNodeIds = uniqueKeyNodeValues.map((knv) => knv.nodeId);
            expect(allGroupedNodes.sort()).toEqual(inputNodeIds.sort());

            // No duplicates
            const uniqueGroupedNodes = new Set(allGroupedNodes);
            expect(uniqueGroupedNodes.size).toBe(allGroupedNodes.length);
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should create separate groups for different values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 5 }),
        fc.array(simpleValueArb, { minLength: 2, maxLength: 3 }),
        async (nodes, values) => {
          const uniqueNodes = [...new Set(nodes)];
          const uniqueValues = [...new Set(values.map((v) => JSON.stringify(v)))].map(
            (s) => JSON.parse(s) as unknown
          );

          if (uniqueNodes.length < 2 || uniqueValues.length < 2) return;

          // Assign different values to different nodes
          const keyNodeValues: KeyNodeValues[] = uniqueNodes.map((nodeId, i) => ({
            nodeId,
            value: uniqueValues[i % uniqueValues.length],
            sourceFile: "test.yaml",
            hierarchyLevel: "common",
            found: true,
          }));

          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-grouping-test-"));
          fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
          fs.writeFileSync(path.join(tempDir, "hiera.yaml"), "version: 5\nhierarchy: []");
          fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), "");

          const integrationManager = new IntegrationManager();
          const config: HieraServiceConfig = {
            controlRepoPath: tempDir,
            hieraConfigPath: "hiera.yaml",
            hieradataPath: "data",
            factSources: { preferPuppetDB: false },
            cache: { enabled: false, ttl: 0, maxEntries: 0 },
          };
          const service = new HieraService(integrationManager, config);

          try {
            const groups = service.groupNodesByValue(keyNodeValues);

            // Number of groups should be at most the number of unique values
            const actualUniqueValues = new Set(
              keyNodeValues.map((knv) => JSON.stringify(knv.value))
            );
            expect(groups.length).toBeLessThanOrEqual(actualUniqueValues.size);

            // Each group should have a distinct value
            const groupValues = groups.map((g) => JSON.stringify(g.value));
            const uniqueGroupValues = new Set(groupValues);
            expect(uniqueGroupValues.size).toBe(groups.length);
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should handle nodes where key is not found separately", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 5 }),
        simpleValueArb,
        async (nodes, value) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length < 2) return;

          // Half nodes have the value, half don't
          const midpoint = Math.floor(uniqueNodes.length / 2);
          const keyNodeValues: KeyNodeValues[] = uniqueNodes.map((nodeId, i) => ({
            nodeId,
            value: i < midpoint ? value : undefined,
            sourceFile: i < midpoint ? "test.yaml" : "",
            hierarchyLevel: i < midpoint ? "common" : "",
            found: i < midpoint,
          }));

          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-grouping-test-"));
          fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
          fs.writeFileSync(path.join(tempDir, "hiera.yaml"), "version: 5\nhierarchy: []");
          fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), "");

          const integrationManager = new IntegrationManager();
          const config: HieraServiceConfig = {
            controlRepoPath: tempDir,
            hieraConfigPath: "hiera.yaml",
            hieradataPath: "data",
            factSources: { preferPuppetDB: false },
            cache: { enabled: false, ttl: 0, maxEntries: 0 },
          };
          const service = new HieraService(integrationManager, config);

          try {
            const groups = service.groupNodesByValue(keyNodeValues);

            // Should have at least 2 groups (found and not found)
            expect(groups.length).toBeGreaterThanOrEqual(2);

            // Find the "not found" group
            const notFoundGroup = groups.find((g) => g.value === undefined);
            expect(notFoundGroup).toBeDefined();

            // All nodes in not found group should have found=false
            const notFoundNodes = keyNodeValues.filter((knv) => !knv.found);
            expect(notFoundGroup?.nodes.sort()).toEqual(
              notFoundNodes.map((n) => n.nodeId).sort()
            );
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should work with real HieraService resolution", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 4 }),
        simpleValueArb,
        simpleValueArb,
        async (nodes, commonValue, nodeSpecificValue) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length < 2) return;
          if (JSON.stringify(commonValue) === JSON.stringify(nodeSpecificValue)) return;

          // First node gets specific value, others get common
          const nodeKeyValues = new Map<string, unknown>();
          nodeKeyValues.set(uniqueNodes[0], nodeSpecificValue);

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            nodeKeyValues,
            commonValue
          );

          try {
            await service.initialize();

            const keyValues = await service.getKeyValuesAcrossNodes("test_key");
            const groups = service.groupNodesByValue(keyValues);

            // Should have 2 groups (one for node-specific, one for common)
            expect(groups.length).toBe(2);

            // Verify grouping is correct
            for (const group of groups) {
              const nodesInGroup = keyValues.filter((kv) =>
                group.nodes.includes(kv.nodeId)
              );
              for (const node of nodesInGroup) {
                expect(JSON.stringify(node.value)).toBe(JSON.stringify(group.value));
              }
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
