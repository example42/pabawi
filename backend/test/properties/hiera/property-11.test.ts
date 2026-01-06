/**
 * Feature: hiera-codebase-integration, Property 11: Value Interpolation
 * Validates: Requirements 5.5
 *
 * This property test verifies that:
 * For any Hiera value containing %{facts.xxx} or %{::xxx} variables,
 * the HieraResolver SHALL replace them with the corresponding fact values
 * and handle nested interpolation in arrays and objects.
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

describe("Property 11: Value Interpolation", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid fact names (alphanumeric with underscores)
  const factNameArb = fc.string({ minLength: 1, maxLength: 15 })
    .filter((s) => /^[a-z][a-z0-9_]*$/.test(s));

  // Generator for simple fact values (strings and numbers)
  const factValueArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("%{") && !s.includes(":")),
    fc.integer({ min: 0, max: 1000 })
  );

  // Generator for key names
  const keyNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Helper to create a temp directory and resolver
  function createTestEnvironment(): { tempDir: string; resolver: HieraResolver } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hiera-interp-test-"));
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

  it("should interpolate %{facts.xxx} variables with fact values", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factNameArb, factValueArb, async (key, factName, factValue) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with interpolation variable
          const valueWithInterpolation = `prefix-%{facts.${factName}}-suffix`;
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: valueWithInterpolation,
          });

          const config = createBasicConfig();
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              [factName]: factValue,
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          // The value should have the fact interpolated
          const expectedValue = `prefix-${factValue}-suffix`;
          expect(result.resolvedValue).toBe(expectedValue);
          // Should track the interpolated variable
          expect(result.interpolatedVariables).toBeDefined();
          expect(result.interpolatedVariables?.[`facts.${factName}`]).toBe(factValue);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should interpolate %{::xxx} legacy syntax with fact values", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factNameArb, factValueArb, async (key, factName, factValue) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with legacy interpolation variable
          const valueWithInterpolation = `value-%{::${factName}}`;
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: valueWithInterpolation,
          });

          const config = createBasicConfig();
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              [factName]: factValue,
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          // The value should have the fact interpolated
          const expectedValue = `value-${factValue}`;
          expect(result.resolvedValue).toBe(expectedValue);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should interpolate variables in array values", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factNameArb, factValueArb, async (key, factName, factValue) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with array containing interpolation
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: [
              `item1-%{facts.${factName}}`,
              "static-item",
              `item2-%{facts.${factName}}`,
            ],
          });

          const config = createBasicConfig();
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              [factName]: factValue,
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          expect(Array.isArray(result.resolvedValue)).toBe(true);

          const resolvedArray = result.resolvedValue as string[];
          expect(resolvedArray[0]).toBe(`item1-${factValue}`);
          expect(resolvedArray[1]).toBe("static-item");
          expect(resolvedArray[2]).toBe(`item2-${factValue}`);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should interpolate variables in nested object values", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factNameArb, factValueArb, async (key, factName, factValue) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with nested object containing interpolation
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: {
              nested: {
                value: `nested-%{facts.${factName}}`,
              },
              direct: `direct-%{facts.${factName}}`,
            },
          });

          const config = createBasicConfig();
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              [factName]: factValue,
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          expect(typeof result.resolvedValue).toBe("object");

          const resolvedObj = result.resolvedValue as Record<string, unknown>;
          const nestedObj = resolvedObj.nested as Record<string, unknown>;

          expect(nestedObj.value).toBe(`nested-${factValue}`);
          expect(resolvedObj.direct).toBe(`direct-${factValue}`);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should preserve unresolved variables when fact is missing", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, factNameArb, async (key, factName) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with interpolation variable
          const valueWithInterpolation = `value-%{facts.${factName}}`;
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: valueWithInterpolation,
          });

          const config = createBasicConfig();
          // Facts without the required fact
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              other_fact: "other_value",
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          // The unresolved variable should be preserved
          expect(result.resolvedValue).toBe(valueWithInterpolation);
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });

  it("should handle nested fact paths like facts.os.family", async () => {
    await fc.assert(
      fc.asyncProperty(keyNameArb, async (key) => {
        const { tempDir, resolver } = createTestEnvironment();
        try {
          // Create hieradata with nested fact path
          createHieradataFile(tempDir, "data/common.yaml", {
            [key]: "os-family-%{facts.os.family}",
          });

          const config = createBasicConfig();
          const facts: Facts = {
            nodeId: "test-node",
            gatheredAt: new Date().toISOString(),
            facts: {
              os: {
                family: "RedHat",
                name: "CentOS",
              },
            },
          };

          const result = await resolver.resolve(key, facts, config);

          expect(result.found).toBe(true);
          expect(result.resolvedValue).toBe("os-family-RedHat");
        } finally {
          cleanupTestEnvironment(tempDir);
        }
      }),
      propertyTestConfig
    );
  });
});
