/**
 * Feature: hiera-codebase-integration, Property 24: Catalog Compilation Mode Behavior
 * Validates: Requirements 12.2, 12.3, 12.4
 *
 * This property test verifies that:
 * For any Hiera key resolution request:
 * - When catalog compilation is disabled, only facts SHALL be used for variable interpolation
 * - When catalog compilation is enabled and succeeds, code-defined variables SHALL also be available
 * - When catalog compilation is enabled but fails, the resolver SHALL fall back to fact-only resolution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { HieraResolver } from "../../../src/integrations/hiera/HieraResolver";
import { CatalogCompiler } from "../../../src/integrations/hiera/CatalogCompiler";
import type { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import type {
  HieraConfig,
  Facts,
  CatalogCompilationConfig,
} from "../../../src/integrations/hiera/types";

describe("Property 24: Catalog Compilation Mode Behavior", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid key names
  const keyNameArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Generator for simple values
  const simpleValueArb = fc.oneof(
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => !s.includes("%{") && !s.includes(":")),
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
      environment: fc.constant("production"),
    }),
  });

  // Generator for catalog variables
  const catalogVariablesArb = fc.dictionary(
    keyNameArb,
    simpleValueArb,
    { minKeys: 1, maxKeys: 5 }
  );

  // Helper to create a temp directory and resolver
  function createTestEnvironment(): {
    tempDir: string;
    resolver: HieraResolver;
  } {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "hiera-catalog-test-")
    );
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

  // Mock integration manager
  function createMockIntegrationManager(
    puppetserverAvailable: boolean = false,
    compilationResult: unknown = null
  ): IntegrationManager {
    const mockPuppetserver = {
      isInitialized: () => puppetserverAvailable,
      compileCatalog: vi.fn().mockResolvedValue(compilationResult),
      getNodeData: vi.fn().mockResolvedValue(compilationResult),
    };

    return {
      getInformationSource: (name: string) => {
        if (name === "puppetserver" && puppetserverAvailable) {
          return mockPuppetserver as unknown as ReturnType<
            IntegrationManager["getInformationSource"]
          >;
        }
        return null;
      },
    } as unknown as IntegrationManager;
  }

  describe("When catalog compilation is disabled", () => {
    it("should only use facts for variable interpolation", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyNameArb,
          simpleValueArb,
          factsArb,
          catalogVariablesArb,
          async (key, value, facts, catalogVars) => {
            const { tempDir, resolver } = createTestEnvironment();
            try {
              // Create hieradata with a value that uses variable interpolation
              const valueWithVar = `prefix_%{facts.hostname}_suffix`;
              createHieradataFile(tempDir, "data/common.yaml", {
                [key]: valueWithVar,
              });

              const config = createBasicConfig();

              // Resolve WITHOUT catalog variables (simulating disabled compilation)
              const result = await resolver.resolve(key, facts, config, {
                catalogVariables: {}, // Empty - compilation disabled
              });

              expect(result.found).toBe(true);
              // The value should be interpolated using facts only
              expect(result.resolvedValue).toBe(
                `prefix_${facts.facts.hostname}_suffix`
              );
            } finally {
              cleanupTestEnvironment(tempDir);
            }
          }
        ),
        propertyTestConfig
      );
    });
  });

  describe("When catalog compilation is enabled and succeeds", () => {
    it("should use catalog variables for interpolation", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyNameArb,
          factsArb,
          async (key, facts) => {
            const { tempDir, resolver } = createTestEnvironment();
            try {
              // Create hieradata with a value that uses a catalog variable
              const valueWithVar = `value_is_%{custom_var}`;
              createHieradataFile(tempDir, "data/common.yaml", {
                [key]: valueWithVar,
              });

              const config = createBasicConfig();

              // Resolve WITH catalog variables
              const catalogVariables = {
                custom_var: "from_catalog",
              };

              const result = await resolver.resolve(key, facts, config, {
                catalogVariables,
              });

              expect(result.found).toBe(true);
              // The value should be interpolated using catalog variables
              expect(result.resolvedValue).toBe("value_is_from_catalog");
            } finally {
              cleanupTestEnvironment(tempDir);
            }
          }
        ),
        propertyTestConfig
      );
    });

    it("should prefer catalog variables over facts for non-prefixed variables", async () => {
      await fc.assert(
        fc.asyncProperty(keyNameArb, factsArb, async (key, facts) => {
          const { tempDir, resolver } = createTestEnvironment();
          try {
            // Create hieradata with a value that uses a variable that exists in both
            const valueWithVar = `value_is_%{hostname}`;
            createHieradataFile(tempDir, "data/common.yaml", {
              [key]: valueWithVar,
            });

            const config = createBasicConfig();

            // Catalog variable should override fact
            const catalogVariables = {
              hostname: "catalog_hostname",
            };

            const result = await resolver.resolve(key, facts, config, {
              catalogVariables,
            });

            expect(result.found).toBe(true);
            // Catalog variable should win for non-prefixed variables
            expect(result.resolvedValue).toBe("value_is_catalog_hostname");
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }),
        propertyTestConfig
      );
    });

    it("should still use facts for facts.xxx prefixed variables", async () => {
      await fc.assert(
        fc.asyncProperty(keyNameArb, factsArb, async (key, facts) => {
          const { tempDir, resolver } = createTestEnvironment();
          try {
            // Create hieradata with a value that explicitly uses facts.xxx syntax
            const valueWithVar = `value_is_%{facts.hostname}`;
            createHieradataFile(tempDir, "data/common.yaml", {
              [key]: valueWithVar,
            });

            const config = createBasicConfig();

            // Even with catalog variables, facts.xxx should use facts
            const catalogVariables = {
              hostname: "catalog_hostname",
              "facts.hostname": "should_not_be_used",
            };

            const result = await resolver.resolve(key, facts, config, {
              catalogVariables,
            });

            expect(result.found).toBe(true);
            // facts.xxx syntax should always use facts
            expect(result.resolvedValue).toBe(
              `value_is_${facts.facts.hostname}`
            );
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }),
        propertyTestConfig
      );
    });
  });

  describe("When catalog compilation fails", () => {
    it("should fall back to fact-only resolution", async () => {
      await fc.assert(
        fc.asyncProperty(keyNameArb, factsArb, async (key, facts) => {
          const { tempDir, resolver } = createTestEnvironment();
          try {
            // Create hieradata with a value using facts
            const valueWithVar = `value_is_%{facts.hostname}`;
            createHieradataFile(tempDir, "data/common.yaml", {
              [key]: valueWithVar,
            });

            const config = createBasicConfig();

            // Simulate failed compilation by passing empty variables with warning
            const result = await resolver.resolve(key, facts, config, {
              catalogVariables: {}, // Empty due to failure
              catalogWarnings: [
                "Catalog compilation failed - using fact-only resolution",
              ],
            });

            expect(result.found).toBe(true);
            // Should still resolve using facts
            expect(result.resolvedValue).toBe(
              `value_is_${facts.facts.hostname}`
            );
            // Warnings should be tracked
            expect(result.interpolatedVariables?.__catalogWarnings).toContain(
              "Catalog compilation failed - using fact-only resolution"
            );
          } finally {
            cleanupTestEnvironment(tempDir);
          }
        }),
        propertyTestConfig
      );
    });
  });

  describe("CatalogCompiler behavior", () => {
    it("should return disabled result when compilation is disabled", async () => {
      await fc.assert(
        fc.asyncProperty(factsArb, async (facts) => {
          const mockManager = createMockIntegrationManager(false);
          const config: CatalogCompilationConfig = {
            enabled: false,
            timeout: 60000,
            cacheTTL: 300000,
          };

          const compiler = new CatalogCompiler(mockManager, config);

          expect(compiler.isEnabled()).toBe(false);

          const result = await compiler.compileCatalog(
            "test-node",
            "production",
            facts
          );

          expect(result.success).toBe(false);
          expect(result.error).toBe("Catalog compilation is disabled");
          expect(result.variables).toEqual({});
        }),
        propertyTestConfig
      );
    });

    it("should return failed result when Puppetserver is unavailable", async () => {
      await fc.assert(
        fc.asyncProperty(factsArb, async (facts) => {
          const mockManager = createMockIntegrationManager(false);
          const config: CatalogCompilationConfig = {
            enabled: true,
            timeout: 60000,
            cacheTTL: 300000,
          };

          const compiler = new CatalogCompiler(mockManager, config);

          expect(compiler.isEnabled()).toBe(true);

          const result = await compiler.compileCatalog(
            "test-node",
            "production",
            facts
          );

          expect(result.success).toBe(false);
          expect(result.error).toContain("Puppetserver integration not available");
          expect(result.variables).toEqual({});
        }),
        propertyTestConfig
      );
    });

    it("should extract variables from compiled catalog", async () => {
      await fc.assert(
        fc.asyncProperty(factsArb, async (facts) => {
          // Mock a successful catalog compilation
          const mockCatalog = {
            resources: [
              {
                type: "Class",
                title: "profile::nginx",
                parameters: {
                  port: 8080,
                  enabled: true,
                },
              },
              {
                type: "Class",
                title: "profile::base",
                parameters: {
                  timezone: "UTC",
                },
              },
            ],
            environment: "production",
          };

          const mockManager = createMockIntegrationManager(true, mockCatalog);
          const config: CatalogCompilationConfig = {
            enabled: true,
            timeout: 60000,
            cacheTTL: 300000,
          };

          const compiler = new CatalogCompiler(mockManager, config);
          const result = await compiler.compileCatalog(
            "test-node",
            "production",
            facts
          );

          expect(result.success).toBe(true);
          expect(result.variables).toHaveProperty("profile::nginx::port", 8080);
          expect(result.variables).toHaveProperty("profile::nginx::enabled", true);
          expect(result.variables).toHaveProperty("profile::base::timezone", "UTC");
          expect(result.variables).toHaveProperty("environment", "production");
          expect(result.classes).toContain("profile::nginx");
          expect(result.classes).toContain("profile::base");
        }),
        propertyTestConfig
      );
    });

    it("should cache compiled catalogs", async () => {
      await fc.assert(
        fc.asyncProperty(factsArb, async (facts) => {
          const mockCatalog = {
            resources: [
              {
                type: "Class",
                title: "test::class",
                parameters: { value: "cached" },
              },
            ],
            environment: "production",
          };

          const mockManager = createMockIntegrationManager(true, mockCatalog);
          const config: CatalogCompilationConfig = {
            enabled: true,
            timeout: 60000,
            cacheTTL: 300000,
          };

          const compiler = new CatalogCompiler(mockManager, config);

          // First call
          const result1 = await compiler.compileCatalog(
            "test-node",
            "production",
            facts
          );
          expect(result1.success).toBe(true);

          // Second call should use cache
          const result2 = await compiler.compileCatalog(
            "test-node",
            "production",
            facts
          );
          expect(result2.success).toBe(true);
          expect(result2.variables).toEqual(result1.variables);

          // Verify cache stats
          const stats = compiler.getCacheStats();
          expect(stats.size).toBe(1);
        }),
        propertyTestConfig
      );
    });
  });
});
