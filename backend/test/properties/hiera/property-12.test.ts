/**
 * Feature: hiera-codebase-integration, Property 12: Missing Key Handling
 * Validates: Requirements 5.6, 3.6
 *
 * This property test verifies that:
 * For any Hiera key that does not exist in any hierarchy level,
 * the HieraResolver SHALL return an appropriate indicator (found: false)
 * and SHALL NOT throw errors for missing keys.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { HieraResolver } from "../../../src/integrations/hiera/HieraResolver";
import type {
  HieraConfig,
  Facts,
} from "../../../src/integrations/hiera/types";

describe("Property 12: Missing Key Handling", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid key names
  const keyNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Generator for simple values
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("%{") && !s.includes(":")),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean()
  );

  // Generator for facts
  const factsArb: fc.Arbitrary<Facts> = fc.record({
    nodeId: fc.constant("test-node"),
    gatheredAt: fc.constant(new Date().toISOString()),
    facts: fc.record({
      hostname: fc.constant("test-host"),
      os: fc.record({
        family: fc.constantFrom("RedHat", "Debian", "Windows"),
        name: fc.constantFrom("CentOS", "Ubuntu", "Windows"),
      }),
    }),
  });

  // Helper to create a temp directory and resolver
  function createTestEnvironment(): { tempDir: string; resolver: HieraResolver } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-missing-test-"));
    const resolver = new HieraResolver(tempDir);
    return { tempDir, resolver };
  }

  // Helper to cleanup temp directory
  function cleanupTestEnvironment(tempDir: string): void {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  // Helper to create a hieradata file
  function createHieradataFile(
    tempDir: string,
    filePath: string,
    data: Record<string, unknown>
  ): void {
    const fullPath = path.join(tempDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, yaml.stringify(data));
  }

  // Helper to create a basic hierarchy config
  function createBasicConfig(): HieraConfig {
    return {
      version: 5,
      defaults: {
        datadir: "data",
        data_hash: "yaml_data",
      },
      hierarchy: [
        {
          name: "Common",
          path: "common.yaml",
        },
      ],
    };
  }

  it("should return found: false for keys that do not exist", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, keyNameArb, simpleValueArb, factsArb, async (existingKey, missingKey, value, facts) => {
        // Ensure the keys are different
        if (existingKey === missingKey) {
          return; // Skip this case
        }

        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with only the existing key
          createHieradataFile(tempDir, "data/common.yaml", {
            [existingKey]: value,
          });

          const config = createBasicConfig();

          // Try to resolve the missing key
          const result = await resolver.resolve(missingKey, facts, config);

          // Should NOT throw an error
          // Should return found: false
          expect(result.found).toBe(false);
          expect(result.key).toBe(missingKey);
          expect(result.resolvedValue).toBeUndefined();
          expect(result.allValues).toEqual([]);
          expect(result.sourceFile).toBe("");
          expect(result.hierarchyLevel).toBe("");
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should not throw errors when resolving missing keys", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factsArb, async (key, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create empty hieradata file
          createHieradataFile(tempDir, "data/common.yaml", {});

          const config = createBasicConfig();

          // Should not throw
          let error: Error | null = null;
          let result;
          try {
            result = await resolver.resolve(key, facts, config);
          } catch (e) {
            error = e as Error;
          }

          expect(error).toBeNull();
          expect(result).toBeDefined();
          expect(result?.found).toBe(false);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should return default value when provided for missing keys", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, simpleValueArb, factsArb, async (key, defaultValue, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create empty hieradata file
          createHieradataFile(tempDir, "data/common.yaml", {});

          const config = createBasicConfig();

          const result = await resolver.resolve(key, facts, config, {
            defaultValue,
          });

          expect(result.found).toBe(false);
          expect(result.resolvedValue).toEqual(defaultValue);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should handle missing hieradata files gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factsArb, async (key, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Don't create any hieradata files
          const config = createBasicConfig();

          // Should not throw
          let error: Error | null = null;
          let result;
          try {
            result = await resolver.resolve(key, facts, config);
          } catch (e) {
            error = e as Error;
          }

          expect(error).toBeNull();
          expect(result).toBeDefined();
          expect(result?.found).toBe(false);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should return found: false when key exists in no hierarchy levels", async () => {
    await fc.assert(
      fc.asyncProperty(
        keyNameArb,
        fc.array(keyNameArb, { minLength: 1, maxLength: 3 }),
        factsArb,
        async (missingKey, existingKeys, facts) => {
          // Ensure missing key is not in existing keys
          if (existingKeys.includes(missingKey)) {
            return; // Skip this case
          }

          const { tempDir, resolver } = createTestEnvironment();
          try {
            // Create multiple hierarchy levels with different keys
            const config: HieraConfig = {
              version: 5,
              defaults: {
                datadir: "data",
                data_hash: "yaml_data",
              },
              hierarchy: [
                { name: "Level 0", path: "level0.yaml" },
                { name: "Level 1", path: "level1.yaml" },
              ],
            };

            // Create hieradata files with existing keys but not the missing key
            const data0: Record<string, unknown> = {};
            const data1: Record<string, unknown> = {};
            existingKeys.forEach((k, i) => {
              if (i % 2 === 0) {
                data0[k] = `value-${i}`;
              } else {
                data1[k] = `value-${i}`;
              }
            });

            createHieradataFile(tempDir, "data/level0.yaml", data0);
            createHieradataFile(tempDir, "data/level1.yaml", data1);

            const result = await resolver.resolve(missingKey, facts, config);

            expect(result.found).toBe(false);
            expect(result.allValues).toEqual([]);
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });
});
