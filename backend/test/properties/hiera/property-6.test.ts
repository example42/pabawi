/**
 * Feature: hiera-codebase-integration, Property 6: Fact Source Priority
 * Validates: Requirements 3.1, 3.5
 *
 * This property test verifies that:
 * For any node where both PuppetDB and local fact files contain facts,
 * the Fact_Service SHALL return the PuppetDB facts when PuppetDB integration
 * is available and configured as preferred.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import { FactService } from "../../../src/integrations/hiera/FactService";
import type { IntegrationManager } from "../../../src/integrations/IntegrationManager";
import type { InformationSourcePlugin } from "../../../src/integrations/types";
import type { Facts, LocalFactFile } from "../../../src/integrations/hiera/types";

// Mock fs module
vi.mock("fs");

describe("Property 6: Fact Source Priority", () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  let factService: FactService;
  let mockIntegrationManager: IntegrationManager;
  let mockPuppetDBSource: InformationSourcePlugin;

  const testLocalFactsPath = "/tmp/facts";  // pragma: allowlist secret

  // Generator for valid node names (hostname-like strings)
  const nodeNameArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => /^[a-z][a-z0-9-]*[a-z0-9]$/.test(s) || /^[a-z]$/.test(s))
    .map((s) => `${s}.example.com`);

  // Generator for simple fact values
  const simpleFactValueArb: fc.Arbitrary<string | number | boolean> = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes("\u0000")),
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.boolean()
  );

  // Generator for fact keys
  const factKeyArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-z][a-z_]*$/.test(s));

  // Generator for fact values object
  const factValuesArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    factKeyArb,
    simpleFactValueArb,
    { minKeys: 1, maxKeys: 10 }
  );

  // Generator for PuppetDB Facts object
  const puppetDBFactsArb: fc.Arbitrary<Facts> = fc.record({
    nodeId: nodeNameArb,
    gatheredAt: fc.constant(new Date().toISOString()),
    facts: factValuesArb.map((values) => ({
      os: {
        family: "RedHat",
        name: "CentOS",
        release: { full: "7.9", major: "7" },
      },
      processors: { count: 4, models: ["Intel Xeon"] },
      memory: { system: { total: "16 GB", available: "8 GB" } },
      networking: { hostname: "puppetdb-node", interfaces: {} },
      ...values,
      source_marker: "puppetdb", // Marker to identify source
    })),
  });

  // Generator for local fact file
  const localFactFileArb: fc.Arbitrary<LocalFactFile> = fc.record({
    name: nodeNameArb,
    values: factValuesArb.map((values) => ({
      os: {
        family: "Debian",
        name: "Ubuntu",
        release: { full: "20.04", major: "20" },
      },
      processors: { count: 2, models: ["AMD EPYC"] },
      memory: { system: { total: "8 GB", available: "4 GB" } },
      networking: { hostname: "local-node", interfaces: {} },
      ...values,
      source_marker: "local", // Marker to identify source
    })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a mock PuppetDB source
   */
  function createMockPuppetDBSource(
    initialized: boolean,
    factsToReturn?: Facts
  ): InformationSourcePlugin {
    return {
      name: "puppetdb",
      type: "information",
      isInitialized: vi.fn().mockReturnValue(initialized),
      getNodeFacts: vi.fn().mockImplementation(async () => {
        if (!initialized) {
          throw new Error("PuppetDB not initialized");
        }
        if (factsToReturn) {
          return factsToReturn;
        }
        throw new Error("No facts available");
      }),
      getInventory: vi.fn().mockResolvedValue([]),
      getNodeData: vi.fn(),
      initialize: vi.fn(),
      healthCheck: vi.fn(),
      getConfig: vi.fn(),
    } as unknown as InformationSourcePlugin;
  }

  /**
   * Helper to setup local fact file mock
   */
  function setupLocalFactFileMock(localFactFile: LocalFactFile): void {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(localFactFile));
  }

  it("should return PuppetDB facts when both sources are available and PuppetDB is preferred", async () => {
    await fc.assert(
      fc.asyncProperty(
        puppetDBFactsArb,
        localFactFileArb,
        async (puppetDBFacts, localFactFile) => {
          // Use the same nodeId for both sources
          const nodeId = puppetDBFacts.nodeId;
          localFactFile.name = nodeId;

          // Setup PuppetDB mock - initialized and returning facts
          mockPuppetDBSource = createMockPuppetDBSource(true, puppetDBFacts);
          mockIntegrationManager = {
            getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
          } as unknown as IntegrationManager;

          // Setup local facts mock
          setupLocalFactFileMock(localFactFile);

          // Create FactService with PuppetDB preferred (default)
          factService = new FactService(mockIntegrationManager, {
            preferPuppetDB: true,
            localFactsPath: testLocalFactsPath,
          });

          // Get facts
          const result = await factService.getFacts(nodeId);

          // Should return PuppetDB facts
          expect(result.source).toBe("puppetdb");
          expect(result.facts.facts.source_marker).toBe("puppetdb");
          expect(result.warnings).toBeUndefined();
        }
      ),
      propertyTestConfig
    );
  });

  it("should return local facts when PuppetDB is not initialized", async () => {
    await fc.assert(
      fc.asyncProperty(
        puppetDBFactsArb,
        localFactFileArb,
        async (puppetDBFacts, localFactFile) => {
          const nodeId = puppetDBFacts.nodeId;
          localFactFile.name = nodeId;

          // Setup PuppetDB mock - NOT initialized
          mockPuppetDBSource = createMockPuppetDBSource(false);
          mockIntegrationManager = {
            getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
          } as unknown as IntegrationManager;

          // Setup local facts mock
          setupLocalFactFileMock(localFactFile);

          factService = new FactService(mockIntegrationManager, {
            preferPuppetDB: true,
            localFactsPath: testLocalFactsPath,
          });

          const result = await factService.getFacts(nodeId);

          // Should fall back to local facts
          expect(result.source).toBe("local");
          expect(result.facts.facts.source_marker).toBe("local");
          expect(result.warnings).toContain(
            "Using local fact files - facts may be outdated"
          );
        }
      ),
      propertyTestConfig
    );
  });

  it("should return local facts when PuppetDB fails to retrieve facts", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;

        // Setup PuppetDB mock - initialized but throws error
        mockPuppetDBSource = {
          name: "puppetdb",
          type: "information",
          isInitialized: vi.fn().mockReturnValue(true),
          getNodeFacts: vi.fn().mockRejectedValue(new Error("Node not found")),
          getInventory: vi.fn().mockResolvedValue([]),
          getNodeData: vi.fn(),
          initialize: vi.fn(),
          healthCheck: vi.fn(),
          getConfig: vi.fn(),
        } as unknown as InformationSourcePlugin;

        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        setupLocalFactFileMock(localFactFile);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const result = await factService.getFacts(nodeId);

        // Should fall back to local facts
        expect(result.source).toBe("local");
        expect(result.facts.facts.source_marker).toBe("local");
      }),
      propertyTestConfig
    );
  });

  it("should return local facts first when preferPuppetDB is false", async () => {
    await fc.assert(
      fc.asyncProperty(
        puppetDBFactsArb,
        localFactFileArb,
        async (puppetDBFacts, localFactFile) => {
          const nodeId = puppetDBFacts.nodeId;
          localFactFile.name = nodeId;

          // Setup PuppetDB mock - initialized and has facts
          mockPuppetDBSource = createMockPuppetDBSource(true, puppetDBFacts);
          mockIntegrationManager = {
            getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
          } as unknown as IntegrationManager;

          setupLocalFactFileMock(localFactFile);

          // Create FactService with PuppetDB NOT preferred
          factService = new FactService(mockIntegrationManager, {
            preferPuppetDB: false,
            localFactsPath: testLocalFactsPath,
          });

          const result = await factService.getFacts(nodeId);

          // Should return local facts since preferPuppetDB is false
          expect(result.source).toBe("local");
          expect(result.facts.facts.source_marker).toBe("local");
        }
      ),
      propertyTestConfig
    );
  });

  it("should return PuppetDB facts as fallback when preferPuppetDB is false but local facts unavailable", async () => {
    await fc.assert(
      fc.asyncProperty(puppetDBFactsArb, async (puppetDBFacts) => {
        const nodeId = puppetDBFacts.nodeId;

        // Setup PuppetDB mock - initialized and has facts
        mockPuppetDBSource = createMockPuppetDBSource(true, puppetDBFacts);
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        // Local facts file does NOT exist
        vi.mocked(fs.existsSync).mockReturnValue(false);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: false,
          localFactsPath: testLocalFactsPath,
        });

        const result = await factService.getFacts(nodeId);

        // Should fall back to PuppetDB
        expect(result.source).toBe("puppetdb");
        expect(result.facts.facts.source_marker).toBe("puppetdb");
      }),
      propertyTestConfig
    );
  });

  it("should return empty facts with warning when neither source is available", async () => {
    await fc.assert(
      fc.asyncProperty(nodeNameArb, async (nodeId) => {
        // Setup PuppetDB mock - NOT initialized
        mockPuppetDBSource = createMockPuppetDBSource(false);
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        // Local facts file does NOT exist
        vi.mocked(fs.existsSync).mockReturnValue(false);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const result = await factService.getFacts(nodeId);

        // Should return empty facts with warning
        expect(result.source).toBe("local");
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toContain(`No facts available for node '${nodeId}'`);
        expect(result.facts.facts.os.family).toBe("Unknown");
      }),
      propertyTestConfig
    );
  });

  it("should correctly report fact source via getFactSource when PuppetDB is available", async () => {
    await fc.assert(
      fc.asyncProperty(puppetDBFactsArb, async (puppetDBFacts) => {
        const nodeId = puppetDBFacts.nodeId;

        // Setup PuppetDB mock - initialized and has facts
        mockPuppetDBSource = createMockPuppetDBSource(true, puppetDBFacts);
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const source = await factService.getFactSource(nodeId);

        expect(source).toBe("puppetdb");
      }),
      propertyTestConfig
    );
  });

  it("should correctly report fact source via getFactSource when only local facts available", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;

        // Setup PuppetDB mock - NOT initialized
        mockPuppetDBSource = createMockPuppetDBSource(false);
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        setupLocalFactFileMock(localFactFile);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const source = await factService.getFactSource(nodeId);

        expect(source).toBe("local");
      }),
      propertyTestConfig
    );
  });

  it("should report 'none' when no fact source is available", async () => {
    await fc.assert(
      fc.asyncProperty(nodeNameArb, async (nodeId) => {
        // Setup PuppetDB mock - NOT initialized
        mockPuppetDBSource = createMockPuppetDBSource(false);
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(mockPuppetDBSource),
        } as unknown as IntegrationManager;

        // Local facts file does NOT exist
        vi.mocked(fs.existsSync).mockReturnValue(false);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const source = await factService.getFactSource(nodeId);

        expect(source).toBe("none");
      }),
      propertyTestConfig
    );
  });

  it("should handle null PuppetDB source gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(localFactFileArb, async (localFactFile) => {
        const nodeId = localFactFile.name;

        // Setup IntegrationManager to return null for PuppetDB
        mockIntegrationManager = {
          getInformationSource: vi.fn().mockReturnValue(null),
        } as unknown as IntegrationManager;

        setupLocalFactFileMock(localFactFile);

        factService = new FactService(mockIntegrationManager, {
          preferPuppetDB: true,
          localFactsPath: testLocalFactsPath,
        });

        const result = await factService.getFacts(nodeId);

        // Should fall back to local facts
        expect(result.source).toBe("local");
        expect(result.facts.facts.source_marker).toBe("local");
      }),
      propertyTestConfig
    );
  });
});
