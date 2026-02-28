/**
 * Feature: hiera-codebase-integration, Property 7: Local Fact File Parsing
 * Validates: Requirements 3.3, 3.4
 *
 * This property test verifies that:
 * For any valid JSON file in Puppetserver fact format (with "name" and "values" fields),
 * the Fact_Service SHALL parse it and return a Facts object with all values accessible.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import { FactService } from "../../../src/integrations/hiera/FactService";
import type { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import type { InformationSourcePlugin } from "../../../src/integrations/types";
import type { LocalFactFile } from "../../../src/integrations/hiera/types";

// Mock fs module
vi.mock("fs");

describe("Property 7: Local Fact File Parsing", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  let factService: FactService;
  let mockIntegrationManager: IntegrationManager;
  let mockPuppetDBSource: InformationSourcePlugin;

  const testLocalFactsPath = "/tmp/facts";  // pragma: allowlist secret

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock PuppetDB source that is NOT initialized
    // This forces the FactService to use local facts
    mockPuppetDBSource = {
      name: "puppetdb",
      type: "information",
      isInitialized: vi.fn().mockReturnValue(false),
      getNodeFacts: vi.fn(),
      getInventory: vi.fn().mockResolvedValue([]),
      getNodeData: vi.fn(),
      initialize: vi.fn(),
      healthCheck: vi.fn(),
      getConfig: vi.fn(),
    } as unknown as InformationSourcePlugin;

    mockIntegrationManager = {
      getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
    } as unknown as IntegrationManager;

    factService = new FactService(mockIntegrationManager, {
      preferPuppetDB: true,
      localFactsPath: testLocalFactsPath,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Generator for valid node names (hostname-like strings)
  const nodeNameArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => /^[a-z][a-z0-9-]*[a-z0-9]$/.test(s) || /^[a-z]$/.test(s))
    .map((s) => `${s}.example.com`);

  // Generator for simple fact values (strings, numbers, booleans)
  const simpleFactValueArb: fc.Arbitrary<string | number | boolean> = fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }).filter((s) => !s.includes("\u0000")),
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.boolean()
  );

  // Generator for fact keys (valid identifier-like strings)
  const factKeyArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Generator for nested fact objects (up to 2 levels deep)
  const nestedFactValueArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    factKeyArb,
    fc.oneof(
      simpleFactValueArb,
      fc.array(simpleFactValueArb, { minLength: 0, maxLength: 5 })
    ),
    { minKeys: 0, maxKeys: 5 }
  );

  // Generator for fact values (can be simple, array, or nested object)
  const factValueArb: fc.Arbitrary<unknown> = fc.oneof(
    simpleFactValueArb,
    fc.array(simpleFactValueArb, { minLength: 0, maxLength: 5 }),
    nestedFactValueArb
  );

  // Generator for the values object in LocalFactFile
  const factValuesArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    factKeyArb,
    factValueArb,
    { minKeys: 1, maxKeys: 10 }
  );

  // Generator for valid LocalFactFile (Puppetserver format)
  const localFactFileArb: fc.Arbitrary<LocalFactFile> = fc.record({
    name: nodeNameArb,
    values: factValuesArb,
  });

  /**
   * Helper to check if a value is accessible in the parsed facts
   */
  function isValueAccessible(
    facts: Record<string, unknown>,
    key: string,
    expectedValue: unknown
  ): boolean {
    const actualValue = facts[key];

    // Handle nested objects
    if (
      typeof expectedValue === "object" &&
      expectedValue !== null &&
      !Array.isArray(expectedValue)
    ) {
      if (typeof actualValue !== "object" || actualValue === null) {
        return false;
      }
      // Check all nested keys
      for (const [nestedKey, nestedValue] of Object.entries(
        expectedValue as Record<string, unknown>
      )) {
        if (
          !isValueAccessible(
            actualValue as Record<string, unknown>,
            nestedKey,
            nestedValue
          )
        ) {
          return false;
        }
      }
      return true;
    }

    // Handle arrays
    if (Array.isArray(expectedValue)) {
      if (!Array.isArray(actualValue)) {
        return false;
      }
      if (actualValue.length !== expectedValue.length) {
        return false;
      }
      for (let i = 0; i < expectedValue.length; i++) {
        if (actualValue[i] !== expectedValue[i]) {
          return false;
        }
      }
      return true;
    }

    // Handle simple values
    return actualValue === expectedValue;
  }

  it("should parse any valid Puppetserver format fact file and make all values accessible", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        // Mock file system
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        // Parse the fact file
        const result = await factService.getFacts(nodeId);

        // Should successfully parse
        expect(result.source).toBe("local");
        expect(result.facts).toBeDefined();
        expect(result.facts.nodeId).toBe(nodeId);

        // All original values should be accessible in the parsed facts
        for (const [key, value] of Object.entries(localFactFile.values)) {
          expect(
            isValueAccessible(result.facts.facts, key, value),
            `Value for key '${key}' should be accessible`
          ).toBe(true);
        }
      }),
      propertyTestConfig
    );
  });

  it("should preserve the node name from the fact file", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // The nodeId in the result should match the requested nodeId
        expect(result.facts.nodeId).toBe(nodeId);
      }),
      propertyTestConfig
    );
  });

  it("should include a gatheredAt timestamp for any parsed fact file", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // Should have a valid ISO timestamp
        expect(result.facts.gatheredAt).toBeDefined();
        expect(() => new Date(result.facts.gatheredAt)).not.toThrow();
        expect(new Date(result.facts.gatheredAt).toISOString()).toBe(
          result.facts.gatheredAt
        );
      }),
      propertyTestConfig
    );
  });

  it("should provide default values for standard fact fields when missing", async () => {
    // Generator for fact files with only custom facts (no standard fields)
    const customOnlyFactFileArb = fc.record({
      name: nodeNameArb,
      values: fc.dictionary(
        factKeyArb.filter(
          (k) => !["os", "processors", "memory", "networking"].includes(k)
        ),
        simpleFactValueArb,
        { minKeys: 1, maxKeys: 5 }
      ),
    });

    await fc.assert(
      fc.asyncProperty(customOnlyFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // Standard fields should have default values
        expect(result.facts.facts.os).toBeDefined();
        expect(result.facts.facts.os.family).toBe("Unknown");
        expect(result.facts.facts.os.name).toBe("Unknown");
        expect(result.facts.facts.processors).toBeDefined();
        expect(result.facts.facts.processors.count).toBe(0);
        expect(result.facts.facts.memory).toBeDefined();
        expect(result.facts.facts.memory.system.total).toBe("Unknown");
        expect(result.facts.facts.networking).toBeDefined();
        expect(result.facts.facts.networking.hostname).toBe("Unknown");
      }),
      propertyTestConfig
    );
  });

  it("should return local source indicator for any parsed local fact file", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // Source should always be 'local' when using local fact files
        expect(result.source).toBe("local");
      }),
      propertyTestConfig
    );
  });

  it("should include warning about outdated facts for any local fact file", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;
        const factFileContent = JSON.stringify(localFactFile);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // Should include warning about potentially outdated facts
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toContain(
          "Using local fact files - facts may be outdated"
        );
      }),
      propertyTestConfig
    );
  });

  // Test for flat fact structure (alternative format)
  it("should also parse flat fact structure (non-Puppetserver format)", async () => {
    // Generator for flat fact structure (no name/values wrapper)
    const flatFactsArb = factValuesArb;

    await fc.assert(
      fc.asyncProperty(nodeNameArb, flatFactsArb, async (nodeId, flatFacts) => {
        const factFileContent = JSON.stringify(flatFacts);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(factFileContent);

        const result = await factService.getFacts(nodeId);

        // Should successfully parse
        expect(result.source).toBe("local");
        expect(result.facts).toBeDefined();
        expect(result.facts.nodeId).toBe(nodeId);

        // All original values should be accessible
        for (const [key, value] of Object.entries(flatFacts)) {
          expect(
            isValueAccessible(result.facts.facts, key, value),
            `Value for key '${key}' should be accessible in flat format`
          ).toBe(true);
        }
      }),
      propertyTestConfig
    );
  });
});
