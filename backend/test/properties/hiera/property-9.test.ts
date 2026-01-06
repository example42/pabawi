/**
 * Feature: hiera-codebase-integration, Property 9: Key Search Functionality
 * Validates: Requirements 4.5, 7.4
 *
 * This property test verifies that:
 * For any key index and search query string, searching SHALL return all keys
 * whose names contain the query string as a substring (case-insensitive).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { stringify as yamlStringify } from "yaml";
import { HieraScanner } from "../../../src/integrations/hiera/HieraScanner";

describe("Property 9: Key Search Functionality", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  let testDir: string;
  let scanner: HieraScanner;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-prop9-"));
    scanner = new HieraScanner(testDir, "data");
    fs.mkdirSync(path.join(testDir, "data"), { recursive: true });
  });

  afterEach(() => {
    scanner.stopWatching();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // Generator for valid Hiera key names
  const hieraKeyNameArb = fc
    .array(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s)),
      { minLength: 1, maxLength: 3 }
    )
    .map((parts) => parts.join("::"));

  // Generator for simple values
  const simpleValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    fc.integer({ min: 0, max: 1000 })
  );

  // Generator for a set of unique keys
  const keySetArb = fc
    .array(hieraKeyNameArb, { minLength: 3, maxLength: 15 })
    .map((keys) => [...new Set(keys)]);

  /**
   * Helper to create test data with given keys
   */
  function createTestData(keys: string[]): void {
    const data: Record<string, unknown> = {};
    for (const key of keys) {
      data[key] = `value_for_${key}`;
    }
    const fullPath = path.join(testDir, "data/common.yaml");
    fs.writeFileSync(fullPath, yamlStringify(data), "utf-8");
  }

  it("should return all keys containing the query as substring", async () => {
    await fc.assert(
      fc.asyncProperty(keySetArb, async (keys) => {
        if (keys.length === 0) return;

        createTestData(keys);
        await scanner.scan();

        // Pick a random key and extract a substring from it
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const startIdx = Math.floor(Math.random() * Math.max(1, randomKey.length - 2));
        const endIdx = startIdx + Math.min(3, randomKey.length - startIdx);
        const query = randomKey.substring(startIdx, endIdx);

        if (query.length === 0) return;

        const results = scanner.searchKeys(query);

        // All results should contain the query
        for (const result of results) {
          expect(result.name.toLowerCase()).toContain(query.toLowerCase());
        }

        // All keys containing the query should be in results
        const resultNames = results.map((r) => r.name);
        for (const key of keys) {
          if (key.toLowerCase().includes(query.toLowerCase())) {
            expect(resultNames).toContain(key);
          }
        }
      }),
      propertyTestConfig
    );
  });


  it("should be case-insensitive", async () => {
    await fc.assert(
      fc.asyncProperty(keySetArb, async (keys) => {
        if (keys.length === 0) return;

        createTestData(keys);
        await scanner.scan();

        // Pick a random key
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const query = randomKey.substring(0, Math.min(3, randomKey.length));

        if (query.length === 0) return;

        // Search with different cases
        const lowerResults = scanner.searchKeys(query.toLowerCase());
        const upperResults = scanner.searchKeys(query.toUpperCase());
        const mixedResults = scanner.searchKeys(
          query
            .split("")
            .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()))
            .join("")
        );

        // All should return the same results
        const lowerNames = lowerResults.map((r) => r.name).sort();
        const upperNames = upperResults.map((r) => r.name).sort();
        const mixedNames = mixedResults.map((r) => r.name).sort();

        expect(lowerNames).toEqual(upperNames);
        expect(lowerNames).toEqual(mixedNames);
      }),
      propertyTestConfig
    );
  });

  it("should return all keys for empty query", async () => {
    await fc.assert(
      fc.asyncProperty(keySetArb, async (keys) => {
        if (keys.length === 0) return;

        createTestData(keys);
        await scanner.scan();

        const emptyResults = scanner.searchKeys("");
        const whitespaceResults = scanner.searchKeys("   ");

        // Should return all keys
        expect(emptyResults.length).toBe(keys.length);
        expect(whitespaceResults.length).toBe(keys.length);
      }),
      propertyTestConfig
    );
  });

  it("should return empty array for non-matching query", async () => {
    await fc.assert(
      fc.asyncProperty(keySetArb, async (keys) => {
        if (keys.length === 0) return;

        createTestData(keys);
        await scanner.scan();

        // Use a query that definitely won't match any key
        const nonMatchingQuery = "ZZZZNONEXISTENT12345";

        const results = scanner.searchKeys(nonMatchingQuery);

        expect(results.length).toBe(0);
      }),
      propertyTestConfig
    );
  });

  it("should support partial key name matching", async () => {
    // Generator for keys with common prefix - ensure unique suffixes
    const prefixedKeysArb = fc
      .string({ minLength: 3, maxLength: 8 })
      .filter((s) => /^[a-z][a-z0-9_]*$/.test(s))
      .map((prefix) => {
        // Create unique suffixes
        return [`${prefix}::aaa`, `${prefix}::bbb`, `${prefix}::ccc`];
      });

    await fc.assert(
      fc.asyncProperty(prefixedKeysArb, async (keys) => {
        createTestData(keys);
        await scanner.scan();

        // Extract the common prefix
        const prefix = keys[0].split("::")[0];

        const results = scanner.searchKeys(prefix);

        // All keys with the prefix should be found
        expect(results.length).toBe(keys.length);
        for (const result of results) {
          expect(result.name.startsWith(prefix)).toBe(true);
        }
      }),
      propertyTestConfig
    );
  });

  it("should find keys by suffix", async () => {
    // Generator for keys with common suffix - ensure unique prefixes
    const suffixedKeysArb = fc
      .tuple(
        fc.string({ minLength: 3, maxLength: 8 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s))
      )
      .map(([suffix]) => {
        // Create unique prefixes
        return [`aaa::${suffix}`, `bbb::${suffix}`, `ccc::${suffix}`];
      });

    await fc.assert(
      fc.asyncProperty(suffixedKeysArb, async (keys) => {
        createTestData(keys);
        await scanner.scan();

        // Extract the common suffix
        const suffix = keys[0].split("::").pop()!;

        const results = scanner.searchKeys(suffix);

        // All keys with the suffix should be found
        expect(results.length).toBe(keys.length);
        for (const result of results) {
          expect(result.name.endsWith(suffix)).toBe(true);
        }
      }),
      propertyTestConfig
    );
  });

  it("should find keys by middle substring", async () => {
    // Create keys with a known middle part that won't match other keys
    const middlePartArb = fc
      .string({ minLength: 4, maxLength: 6 })
      .filter((s) => /^[xyz][a-z0-9_]*$/.test(s)); // Start with x, y, or z to avoid matching "other"

    await fc.assert(
      fc.asyncProperty(middlePartArb, async (middlePart) => {
        const keys = [
          `aaa::${middlePart}::bbb`,
          `ccc::${middlePart}::ddd`,
          `eee::fff::ggg`,
        ];

        createTestData(keys);
        await scanner.scan();

        const results = scanner.searchKeys(middlePart);

        // Should find exactly the keys containing the middle part
        expect(results.length).toBe(2);
        for (const result of results) {
          expect(result.name).toContain(middlePart);
        }
      }),
      propertyTestConfig
    );
  });
});
