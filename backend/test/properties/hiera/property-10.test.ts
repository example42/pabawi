/**
 * Feature: hiera-codebase-integration, Property 10: Hiera Resolution Correctness
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 *
 * This property test verifies that:
 * For any Hiera key, fact set, and hierarchy configuration, the Hiera_Resolver SHALL:
 * - Apply the correct lookup method (first, unique, hash, deep) based on lookup_options
 * - Return the value from the first matching hierarchy level (for 'first' lookup)
 * - Merge values according to the specified merge strategy (for merge lookups)
 * - Track which hierarchy level provided the final/winning value
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

describe("Property 10: Hiera Resolution Correctness", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid key names
  const keyNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Generator for simple values (strings, numbers, booleans)
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("%{") && !s.includes(":")),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean()
  );

  // Generator for array values
  const arrayValueArb = fc.array(simpleValueArb, { minLength: 1, maxLength: 5 });

  // Generator for hash values with simple string keys
  const hashKeyArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  const hashValueArb = fc.dictionary(
    hashKeyArb,
    simpleValueArb,
    { minKeys: 1, maxKeys: 5 }
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-resolver-test-"));
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
  function createBasicConfig(levels: string[]): HieraConfig {
    return {
      version: 5,
      defaults: {
        datadir: "data",
        data_hash: "yaml_data",
      },
      hierarchy: levels.map((name, index) => ({
        name,
        path: `level${index}/data.yaml`,
      })),
    };
  }

  it("should return the first matching value for 'first' lookup method", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, simpleValueArb, simpleValueArb, factsArb, async (key, value1, value2, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create two hierarchy levels with different values
          createHieradataFile(tempDir, "data/level0/data.yaml", { [key]: value1 });
          createHieradataFile(tempDir, "data/level1/data.yaml", { [key]: value2 });

          const config = createBasicConfig(["Level 0", "Level 1"]);

          const result = await resolver.resolve(key, facts, config, {
            lookupMethod: "first",
          });

          // Should find the key
          expect(result.found).toBe(true);
          // Should return the first value (from level 0)
          expect(result.resolvedValue).toEqual(value1);
          // Should track the source
          expect(result.hierarchyLevel).toBe("Level 0");
          expect(result.sourceFile).toContain("level0");
          // Should have all values recorded
          expect(result.allValues.length).toBe(2);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should merge arrays with unique values for 'unique' lookup method", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, arrayValueArb, arrayValueArb, factsArb, async (key, arr1, arr2, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create two hierarchy levels with array values
          createHieradataFile(tempDir, "data/level0/data.yaml", { [key]: arr1 });
          createHieradataFile(tempDir, "data/level1/data.yaml", { [key]: arr2 });

          const config = createBasicConfig(["Level 0", "Level 1"]);

          const result = await resolver.resolve(key, facts, config, {
            lookupMethod: "unique",
          });

          expect(result.found).toBe(true);
          expect(Array.isArray(result.resolvedValue)).toBe(true);

          const resolvedArray = result.resolvedValue as unknown[];

          // All items from arr1 should be present
          for (const item of arr1) {
            expect(resolvedArray.some((r) => JSON.stringify(r) === JSON.stringify(item))).toBe(true);
          }

          // Items from arr2 should be present (if not duplicates)
          for (const item of arr2) {
            const isDuplicate = arr1.some((a) => JSON.stringify(a) === JSON.stringify(item));
            if (!isDuplicate) {
              expect(resolvedArray.some((r) => JSON.stringify(r) === JSON.stringify(item))).toBe(true);
            }
          }

          // No duplicates in result
          const uniqueItems = new Set(resolvedArray.map((r) => JSON.stringify(r)));
          expect(uniqueItems.size).toBe(resolvedArray.length);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should merge hashes for 'hash' lookup method with higher priority winning", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, hashValueArb, hashValueArb, factsArb, async (key, hash1, hash2, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create two hierarchy levels with hash values
          createHieradataFile(tempDir, "data/level0/data.yaml", { [key]: hash1 });
          createHieradataFile(tempDir, "data/level1/data.yaml", { [key]: hash2 });

          const config = createBasicConfig(["Level 0", "Level 1"]);

          const result = await resolver.resolve(key, facts, config, {
            lookupMethod: "hash",
          });

          expect(result.found).toBe(true);
          expect(typeof result.resolvedValue).toBe("object");
          expect(Array.isArray(result.resolvedValue)).toBe(false);

          const resolvedHash = result.resolvedValue as Record<string, unknown>;

          // Keys from hash1 (higher priority) should have their values
          for (const [k, v] of Object.entries(hash1)) {
            expect(resolvedHash[k]).toEqual(v);
          }

          // Keys only in hash2 should also be present
          for (const [k, v] of Object.entries(hash2)) {
            if (!(k in hash1)) {
              expect(resolvedHash[k]).toEqual(v);
            }
          }
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should track all values from all hierarchy levels", async () => {
    await fc.assert(
      fc.asyncProperty(
        keyNameArb,
        fc.array(simpleValueArb, { minLength: 2, maxLength: 4 }),
        factsArb,
        async (key, values, facts) => {
          const { tempDir, resolver } = createTestEnvironment();
          try {
            // Create hierarchy levels with different values
            const levelNames: string[] = [];
            for (let i = 0; i < values.length; i++) {
              createHieradataFile(tempDir, `data/level${i}/data.yaml`, { [key]: values[i] });
              levelNames.push(`Level ${i}`);
            }

            const config = createBasicConfig(levelNames);

            const result = await resolver.resolve(key, facts, config);

            expect(result.found).toBe(true);
            // Should have recorded all values
            expect(result.allValues.length).toBe(values.length);

            // Each value should be tracked with its source
            for (let i = 0; i < values.length; i++) {
              const location = result.allValues[i];
              expect(location.value).toEqual(values[i]);
              expect(location.hierarchyLevel).toBe(`Level ${i}`);
              expect(location.file).toContain(`level${i}`);
            }
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }
      ),
      propertyTestConfig
    );
  });

  it("should apply lookup_options from hieradata files", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, arrayValueArb, arrayValueArb, factsArb, async (key, arr1, arr2, facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with lookup_options specifying 'unique' merge
          createHieradataFile(tempDir, "data/level0/data.yaml", {
            lookup_options: {
              [key]: { merge: "unique" },
            },
            [key]: arr1,
          });
          createHieradataFile(tempDir, "data/level1/data.yaml", { [key]: arr2 });

          const config = createBasicConfig(["Level 0", "Level 1"]);

          // Don't specify lookup method - should use lookup_options
          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          expect(result.lookupMethod).toBe("unique");
          expect(Array.isArray(result.resolvedValue)).toBe(true);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should support knockout_prefix for deep merges", async () => {
    await fc.assert(
      fc.asyncProperty(factsArb, async (facts) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          const key = "test_hash";
          const knockoutPrefix = "--";

          // Create hieradata with knockout_options
          createHieradataFile(tempDir, "data/level0/data.yaml", {
            lookup_options: {
              [key]: { merge: "deep", knockout_prefix: knockoutPrefix },
            },
            [key]: {
              keep_this: "value1",
              [`${knockoutPrefix}remove_this`]: null,
            },
          });
          createHieradataFile(tempDir, "data/level1/data.yaml", {
            [key]: {
              keep_this: "value2",
              remove_this: "should_be_removed",
              another_key: "value3",
            },
          });

          const config = createBasicConfig(["Level 0", "Level 1"]);

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          const resolvedHash = result.resolvedValue as Record<string, unknown>;

          // The knocked-out key should not be present
          expect("remove_this" in resolvedHash).toBe(false);
          // Other keys should be present
          expect(resolvedHash.keep_this).toBe("value1");
          expect(resolvedHash.another_key).toBe("value3");
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });
});
