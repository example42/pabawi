/**
 * Feature: hiera-codebase-integration, Property 14: Global Key Resolution Across Nodes
 * Validates: Requirements 7.2, 7.3, 7.6
 *
 * This property test verifies that:
 * For any Hiera key and set of nodes, querying the key across all nodes SHALL return
 * for each node: the resolved value (or indication of not found), the source file,
 * and the hierarchy level.
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

describe("Property 14: Global Key Resolution Across Nodes", () => {
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
    nodeKeyValues: Map<string, Map<string, unknown>>,
    commonKeyValues: Map<string, unknown>
  ): { tempDir: string; service: HieraService; integrationManager: IntegrationManager } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-global-key-test-"));

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

    // Create common.yaml with common key values
    const commonData: Record<string, unknown> = {};
    for (const [key, value] of commonKeyValues) {
      commonData[key] = value;
    }
    fs.writeFileSync(path.join(tempDir, "data", "common.yaml"), yaml.stringify(commonData));

    // Create node-specific data and fact files
    for (const nodeId of nodes) {
      const hostname = nodeId.split(".")[0];

      // Create node-specific hieradata
      const nodeData: Record<string, unknown> = {};
      const nodeValues = nodeKeyValues.get(nodeId);
      if (nodeValues) {
        for (const [key, value] of nodeValues) {
          nodeData[key] = value;
        }
      }
      if (Object.keys(nodeData).length > 0) {
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

  it("should return results for all available nodes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 5 }),
        hieraKeyArb,
        simpleValueArb,
        async (nodes, key, commonValue) => {
          // Ensure unique nodes
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length === 0) return;

          const nodeKeyValues = new Map<string, Map<string, unknown>>();
          const commonKeyValues = new Map<string, unknown>([[key, commonValue]]);

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            [key],
            nodeKeyValues,
            commonKeyValues
          );

          try {
            await service.initialize();

            const results = await service.getKeyValuesAcrossNodes(key);

            // Should have results for all nodes
            expect(results.length).toBe(uniqueNodes.length);

            // Each node should be represented
            const resultNodeIds = new Set(results.map((r) => r.nodeId));
            for (const nodeId of uniqueNodes) {
              expect(resultNodeIds.has(nodeId)).toBe(true);
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

  it("should include source file and hierarchy level for found keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 3 }),
        hieraKeyArb,
        simpleValueArb,
        async (nodes, key, value) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length === 0) return;

          const nodeKeyValues = new Map<string, Map<string, unknown>>();
          const commonKeyValues = new Map<string, unknown>([[key, value]]);

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            [key],
            nodeKeyValues,
            commonKeyValues
          );

          try {
            await service.initialize();

            const results = await service.getKeyValuesAcrossNodes(key);

            for (const result of results) {
              if (result.found) {
                // Source file should be defined and non-empty
                expect(result.sourceFile).toBeTruthy();
                // Hierarchy level should be defined and non-empty
                expect(result.hierarchyLevel).toBeTruthy();
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

  it("should indicate when key is not defined for a node", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 3 }),
        hieraKeyArb,
        async (nodes, key) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length === 0) return;

          // Don't define the key anywhere
          const nodeKeyValues = new Map<string, Map<string, unknown>>();
          const commonKeyValues = new Map<string, unknown>();

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            [],
            nodeKeyValues,
            commonKeyValues
          );

          try {
            await service.initialize();

            const results = await service.getKeyValuesAcrossNodes(key);

            // All results should indicate key not found
            for (const result of results) {
              expect(result.found).toBe(false);
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

  it("should return node-specific values when they override common values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 2, maxLength: 4 }),
        hieraKeyArb,
        simpleValueArb,
        simpleValueArb,
        async (nodes, key, commonValue, nodeSpecificValue) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length < 2) return;
          // Ensure values are different
          if (JSON.stringify(commonValue) === JSON.stringify(nodeSpecificValue)) return;

          // First node gets a specific value, others use common
          const firstNode = uniqueNodes[0];
          const nodeKeyValues = new Map<string, Map<string, unknown>>();
          nodeKeyValues.set(firstNode, new Map([[key, nodeSpecificValue]]));

          const commonKeyValues = new Map<string, unknown>([[key, commonValue]]);

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            [key],
            nodeKeyValues,
            commonKeyValues
          );

          try {
            await service.initialize();

            const results = await service.getKeyValuesAcrossNodes(key);

            // Find results for first node and others
            const firstNodeResult = results.find((r) => r.nodeId === firstNode);
            const otherResults = results.filter((r) => r.nodeId !== firstNode);

            // First node should have node-specific value
            expect(firstNodeResult?.found).toBe(true);
            expect(firstNodeResult?.value).toEqual(nodeSpecificValue);

            // Other nodes should have common value
            for (const result of otherResults) {
              expect(result.found).toBe(true);
              expect(result.value).toEqual(commonValue);
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

  it("should return consistent results across multiple calls", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeNameArb, { minLength: 1, maxLength: 3 }),
        hieraKeyArb,
        simpleValueArb,
        async (nodes, key, value) => {
          const uniqueNodes = [...new Set(nodes)];
          if (uniqueNodes.length === 0) return;

          const nodeKeyValues = new Map<string, Map<string, unknown>>();
          const commonKeyValues = new Map<string, unknown>([[key, value]]);

          const { tempDir, service } = createTestEnvironment(
            uniqueNodes,
            [key],
            nodeKeyValues,
            commonKeyValues
          );

          try {
            await service.initialize();

            // Call twice
            const results1 = await service.getKeyValuesAcrossNodes(key);
            const results2 = await service.getKeyValuesAcrossNodes(key);

            // Results should be consistent
            expect(results1.length).toBe(results2.length);

            for (let i = 0; i < results1.length; i++) {
              const r1 = results1.find((r) => r.nodeId === results2[i].nodeId);
              expect(r1).toBeDefined();
              expect(r1?.value).toEqual(results2[i].value);
              expect(r1?.found).toBe(results2[i].found);
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
