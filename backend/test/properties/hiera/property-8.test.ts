/**
 * Feature: hiera-codebase-integration, Property 8: Key Scanning Completeness
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * This property test verifies that:
 * For any hieradata directory containing YAML files, the Hiera_Scanner SHALL
 * discover all unique keys across all files, tracking for each key: the file
 * path, hierarchy level, line number, and value.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { stringify as yamlStringify } from "yaml";
import { HieraScanner } from "../../../src/integrations/hiera/HieraScanner";

describe("Property 8: Key Scanning Completeness", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  let testDir: string;
  let scanner: HieraScanner;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-prop8-"));
    scanner = new HieraScanner(testDir, "data");
    fs.mkdirSync(path.join(testDir, "data"), { recursive: true });
  });

  afterEach(() => {
    scanner.stopWatching();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // Generator for valid Hiera key names (Puppet-style with double colons)
  const hieraKeyNameArb = fc
    .array(
      fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
      { minLength: 1, maxLength: 4 }
    )
    .map((parts) => parts.join("::"));

  // Generator for simple values (string, number, boolean)
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    fc.integer({ min: 0, max: 10000 }),
    fc.boolean()
  );

  // Generator for hieradata content (flat key-value pairs)
  const hieradataArb = fc
    .array(fc.tuple(hieraKeyNameArb, simpleValueArb), { minLength: 1, maxLength: 10 })
    .map((pairs) => {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of pairs) {
        obj[key] = value;
      }
      return obj;
    });

  // Generator for file names
  const fileNameArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z0-9_-]*$/.test(s))
    .map((s) => `${s}.yaml`);

  /**
   * Helper to create a test file
   */
  function createTestFile(relativePath: string, data: Record<string, unknown>): void {
    const fullPath = path.join(testDir, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, yamlStringify(data), "utf-8");
  }

  it("should discover all keys from any valid hieradata file", async () => {
    await fc.assert(
      fc.asyncProperty(hieradataArb, fileNameArb, async (data, fileName) => {
        // Create the test file
        const relativePath = `data/${fileName}`;
        createTestFile(relativePath, data);

        // Scan the directory
        const index = await scanner.scan();

        // All keys from the data should be discovered
        const expectedKeys = Object.keys(data);
        for (const key of expectedKeys) {
          expect(index.keys.has(key)).toBe(true);
        }

        // Clean up for next iteration
        fs.rmSync(path.join(testDir, relativePath), { force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });


  it("should track file path for each discovered key", async () => {
    await fc.assert(
      fc.asyncProperty(hieradataArb, fileNameArb, async (data, fileName) => {
        const relativePath = `data/${fileName}`;
        createTestFile(relativePath, data);

        const index = await scanner.scan();

        // Each key should have a location with the correct file path
        for (const key of Object.keys(data)) {
          const hieraKey = index.keys.get(key);
          expect(hieraKey).toBeDefined();
          expect(hieraKey!.locations.length).toBeGreaterThan(0);
          expect(hieraKey!.locations[0].file).toBe(relativePath);
        }

        // Clean up
        fs.rmSync(path.join(testDir, relativePath), { force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });

  it("should track hierarchy level for each discovered key", async () => {
    await fc.assert(
      fc.asyncProperty(hieradataArb, async (data) => {
        // Use common.yaml to get predictable hierarchy level
        const relativePath = "data/common.yaml";  // pragma: allowlist secret
        createTestFile(relativePath, data);

        const index = await scanner.scan();

        // Each key should have a location with hierarchy level
        for (const key of Object.keys(data)) {
          const hieraKey = index.keys.get(key);
          expect(hieraKey).toBeDefined();
          expect(hieraKey!.locations[0].hierarchyLevel).toBe("Common data");
        }

        // Clean up
        fs.rmSync(path.join(testDir, relativePath), { force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });

  it("should track value for each discovered key", async () => {
    await fc.assert(
      fc.asyncProperty(hieradataArb, fileNameArb, async (data, fileName) => {
        const relativePath = `data/${fileName}`;
        createTestFile(relativePath, data);

        const index = await scanner.scan();

        // Each key should have the correct value stored
        for (const [key, expectedValue] of Object.entries(data)) {
          const hieraKey = index.keys.get(key);
          expect(hieraKey).toBeDefined();
          expect(hieraKey!.locations[0].value).toEqual(expectedValue);
        }

        // Clean up
        fs.rmSync(path.join(testDir, relativePath), { force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });

  it("should track all occurrences when key appears in multiple files", async () => {
    // Generator for two different hieradata objects that share at least one key
    const sharedKeyArb = hieraKeyNameArb;
    const value1Arb = simpleValueArb;
    const value2Arb = simpleValueArb;

    await fc.assert(
      fc.asyncProperty(sharedKeyArb, value1Arb, value2Arb, async (sharedKey, value1, value2) => {
        // Create two files with the same key
        createTestFile("data/common.yaml", { [sharedKey]: value1 });
        createTestFile("data/nodes/node1.yaml", { [sharedKey]: value2 });

        const index = await scanner.scan();

        // The key should have two locations
        const hieraKey = index.keys.get(sharedKey);
        expect(hieraKey).toBeDefined();
        expect(hieraKey!.locations.length).toBe(2);

        // Both values should be tracked
        const values = hieraKey!.locations.map((loc) => loc.value);
        expect(values).toContain(value1);
        expect(values).toContain(value2);

        // Both files should be tracked
        const files = hieraKey!.locations.map((loc) => loc.file);
        expect(files).toContain("data/common.yaml");
        expect(files).toContain("data/nodes/node1.yaml");

        // Clean up
        fs.rmSync(path.join(testDir, "data/common.yaml"), { force: true });
        fs.rmSync(path.join(testDir, "data/nodes"), { recursive: true, force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });

  it("should handle nested keys with dot notation", async () => {
    // Generator for nested data structure
    const nestedDataArb = fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
        simpleValueArb
      )
      .map(([parent, child, value]) => ({
        [parent]: {
          [child]: value,
        },
      }));

    await fc.assert(
      fc.asyncProperty(nestedDataArb, async (data) => {
        createTestFile("data/common.yaml", data);

        const index = await scanner.scan();

        // Get the parent and child keys
        const parentKey = Object.keys(data)[0];
        const childKey = Object.keys(data[parentKey] as Record<string, unknown>)[0];
        const expectedNestedKey = `${parentKey}.${childKey}`;

        // Both parent and nested key should be discovered
        expect(index.keys.has(parentKey)).toBe(true);
        expect(index.keys.has(expectedNestedKey)).toBe(true);

        // Clean up
        fs.rmSync(path.join(testDir, "data/common.yaml"), { force: true });
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });

  it("should count total keys and files correctly", async () => {
    // Generator for multiple files with different keys
    const multiFileDataArb = fc.array(
      fc.tuple(
        fileNameArb,
        fc.array(fc.tuple(hieraKeyNameArb, simpleValueArb), { minLength: 1, maxLength: 5 })
      ),
      { minLength: 1, maxLength: 3 }
    );

    await fc.assert(
      fc.asyncProperty(multiFileDataArb, async (filesData) => {
        // Create all files
        const allKeys = new Set<string>();
        const fileNames = new Set<string>();

        for (const [fileName, pairs] of filesData) {
          // Ensure unique file names
          if (fileNames.has(fileName)) continue;
          fileNames.add(fileName);

          const data: Record<string, unknown> = {};
          for (const [key, value] of pairs) {
            data[key] = value;
            allKeys.add(key);
          }
          createTestFile(`data/${fileName}`, data);
        }

        const index = await scanner.scan();

        // Total keys should match unique keys
        expect(index.totalKeys).toBe(allKeys.size);

        // Total files should match created files
        expect(index.totalFiles).toBe(fileNames.size);

        // Clean up
        for (const fileName of fileNames) {
          fs.rmSync(path.join(testDir, `data/${fileName}`), { force: true });
        }
        scanner = new HieraScanner(testDir, "data");
      }),
      propertyTestConfig
    );
  });
});
