/**
 * HieraPlugin Unit Tests
 *
 * Tests for the HieraPlugin class that provides Hiera data lookup
 * and code analysis capabilities.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fs from "fs";
import { HieraPlugin } from "../../src/integrations/hiera/HieraPlugin";
import type { IntegrationConfig } from "../../src/integrations/types";
import type { IntegrationManager } from "../../src/integrations/IntegrationManager";

// Mock fs module
vi.mock("fs");

// Create mock instances
const mockHieraService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  isInitialized: vi.fn().mockReturnValue(true),
  getAllKeys: vi.fn().mockResolvedValue({
    keys: new Map(),
    files: new Map(),
    lastScan: new Date().toISOString(),
    totalKeys: 10,
    totalFiles: 5,
  }),
  getHieraConfig: vi.fn().mockReturnValue({ version: 5, hierarchy: [] }),
  getScanner: vi.fn().mockReturnValue({
    getAllKeys: vi.fn().mockReturnValue([]),
  }),
  getFactService: vi.fn().mockReturnValue({
    getFacts: vi.fn().mockResolvedValue({
      facts: { nodeId: "test-node", gatheredAt: new Date().toISOString(), facts: {} },
      source: "local",
    }),
  }),
  reloadControlRepo: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
};

const mockCodeAnalyzer = {
  initialize: vi.fn().mockResolvedValue(undefined),
  isInitialized: vi.fn().mockReturnValue(true),
  setIntegrationManager: vi.fn(),
  setHieraScanner: vi.fn(),
  analyze: vi.fn().mockResolvedValue({
    unusedCode: { unusedClasses: [], unusedDefinedTypes: [], unusedHieraKeys: [] },
    lintIssues: [],
    moduleUpdates: [],
    statistics: {
      totalManifests: 0,
      totalClasses: 0,
      totalDefinedTypes: 0,
      totalFunctions: 0,
      linesOfCode: 0,
      mostUsedClasses: [],
      mostUsedResources: [],
    },
    analyzedAt: new Date().toISOString(),
  }),
  reload: vi.fn().mockResolvedValue(undefined),
  clearCache: vi.fn(),
};

// Mock HieraService as a class
vi.mock("../../src/integrations/hiera/HieraService", () => {
  return {
    HieraService: class MockHieraService {
      initialize = mockHieraService.initialize;
      isInitialized = mockHieraService.isInitialized;
      getAllKeys = mockHieraService.getAllKeys;
      getHieraConfig = mockHieraService.getHieraConfig;
      getScanner = mockHieraService.getScanner;
      getFactService = mockHieraService.getFactService;
      reloadControlRepo = mockHieraService.reloadControlRepo;
      invalidateCache = mockHieraService.invalidateCache;
      shutdown = mockHieraService.shutdown;
    },
  };
});

// Mock CodeAnalyzer as a class
vi.mock("../../src/integrations/hiera/CodeAnalyzer", () => {
  return {
    CodeAnalyzer: class MockCodeAnalyzer {
      initialize = mockCodeAnalyzer.initialize;
      isInitialized = mockCodeAnalyzer.isInitialized;
      setIntegrationManager = mockCodeAnalyzer.setIntegrationManager;
      setHieraScanner = mockCodeAnalyzer.setHieraScanner;
      analyze = mockCodeAnalyzer.analyze;
      reload = mockCodeAnalyzer.reload;
      clearCache = mockCodeAnalyzer.clearCache;
    },
  };
});

/**
 * Helper function to create complete HieraPlugin configuration
 */
function createHieraConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  const baseConfig: IntegrationConfig = {
    enabled: true,
    name: "hiera",
    type: "information" as const,
    config: {
      controlRepoPath: "/valid/repo",
      hieraConfigPath: "hiera.yaml",
      environments: ["production"],
      factSources: {
        preferPuppetDB: true,
        localFactsPath: undefined,
      },
      catalogCompilation: {
        enabled: false,
        timeout: 60000,
        cacheTTL: 300000,
      },
      cache: {
        enabled: true,
        ttl: 300000,
        maxEntries: 10000,
      },
      codeAnalysis: {
        enabled: true,
        lintEnabled: true,
        moduleUpdateCheck: true,
        analysisInterval: 3600000,
        exclusionPatterns: [],
      },
    },
  };

  return {
    ...baseConfig,
    ...overrides,
    config: {
      ...baseConfig.config,
      ...(overrides.config || {}),
    },
  };
}

describe("HieraPlugin", () => {
  let plugin: HieraPlugin;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockHieraService.initialize.mockResolvedValue(undefined);
    mockHieraService.isInitialized.mockReturnValue(true);
    mockCodeAnalyzer.initialize.mockResolvedValue(undefined);

    // Create mock IntegrationManager
    mockIntegrationManager = {
      getInformationSource: vi.fn().mockReturnValue(null),
    } as unknown as IntegrationManager;

    plugin = new HieraPlugin();
    plugin.setIntegrationManager(mockIntegrationManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create plugin with correct name and type", () => {
      expect(plugin.name).toBe("hiera");
      expect(plugin.type).toBe("information");
    });
  });

  describe("validateControlRepository", () => {
    it("should return invalid when path does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = plugin.validateControlRepository("/nonexistent/path");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Control repository path does not exist: /nonexistent/path");
    });

    it("should return invalid when path is not a directory", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);

      const result = plugin.validateControlRepository("/some/file");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Control repository path is not a directory: /some/file");
    });

    it("should return invalid when hiera.yaml is missing", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === "/valid/repo") return true;
        if (pathStr.includes("hiera.yaml")) return false;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const result = plugin.validateControlRepository("/valid/repo");

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("hiera.yaml not found"))).toBe(true);
    });

    it("should return valid with warnings when optional directories are missing", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === "/valid/repo") return true;
        if (pathStr.includes("hiera.yaml")) return true;
        return false;
      });
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const result = plugin.validateControlRepository("/valid/repo");

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.structure.hasHieraYaml).toBe(true);
    });

    it("should detect all structure components when present", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const result = plugin.validateControlRepository("/valid/repo");

      expect(result.valid).toBe(true);
      expect(result.structure.hasHieraYaml).toBe(true);
      expect(result.structure.hasHieradataDir).toBe(true);
      expect(result.structure.hasManifestsDir).toBe(true);
      expect(result.structure.hasPuppetfile).toBe(true);
    });
  });

  describe("initialize", () => {
    it("should not initialize when disabled", async () => {
      const config: IntegrationConfig = {
        enabled: false,
        name: "hiera",
        type: "information",
        config: {
          controlRepoPath: "/some/path",
        },
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(false);
    });

    it("should not fully initialize when controlRepoPath is missing", async () => {
      const config: IntegrationConfig = {
        enabled: true,
        name: "hiera",
        type: "information",
        config: {
          controlRepoPath: "",
          hieraConfigPath: "hiera.yaml",
          environments: ["production"],
          factSources: {
            preferPuppetDB: true,
            localFactsPath: undefined,
          },
          catalogCompilation: {
            enabled: false,
            timeout: 60000,
            cacheTTL: 300000,
          },
          cache: {
            enabled: true,
            ttl: 300000,
            maxEntries: 10000,
          },
          codeAnalysis: {
            enabled: true,
            lintEnabled: true,
            moduleUpdateCheck: true,
            analysisInterval: 3600000,
            exclusionPatterns: [],
          },
        },
      };

      await plugin.initialize(config);

      // Plugin is technically initialized but services are not set up
      // The health check will report not configured
      const health = await plugin.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it("should throw error when control repo validation fails", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config: IntegrationConfig = {
        enabled: true,
        name: "hiera",
        type: "information",
        config: {
          controlRepoPath: "/nonexistent/path",
          hieraConfigPath: "hiera.yaml",
          environments: ["production"],
          factSources: {
            preferPuppetDB: true,
            localFactsPath: undefined,
          },
          catalogCompilation: {
            enabled: false,
            timeout: 60000,
            cacheTTL: 300000,
          },
          cache: {
            enabled: true,
            ttl: 300000,
            maxEntries: 10000,
          },
          codeAnalysis: {
            enabled: true,
            lintEnabled: true,
            moduleUpdateCheck: true,
            analysisInterval: 3600000,
            exclusionPatterns: [],
          },
        },
      };

      await expect(plugin.initialize(config)).rejects.toThrow(
        "Control repository validation failed"
      );
    });

    it("should initialize successfully with valid config", async () => {
      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config: IntegrationConfig = {
        enabled: true,
        name: "hiera",
        type: "information",
        config: {
          controlRepoPath: "/valid/repo",
          hieraConfigPath: "hiera.yaml",
          environments: ["production"],
          factSources: {
            preferPuppetDB: true,
            localFactsPath: undefined,
          },
          catalogCompilation: {
            enabled: true,
            timeout: 60000,
            cacheTTL: 300000,
          },
          cache: { enabled: true, ttl: 300000, maxEntries: 10000 },
          codeAnalysis: {
            enabled: true,
            lintEnabled: true,
            moduleUpdateCheck: true,
            analysisInterval: 3600000,
            exclusionPatterns: [],
          },
        },
      };

      await plugin.initialize(config);

      expect(plugin.isInitialized()).toBe(true);
    });
  });

  describe("healthCheck", () => {
    it("should return not initialized when plugin is not initialized", async () => {
      const config = createHieraConfig({ enabled: false });

      await plugin.initialize(config);
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      // Base class returns "not initialized" when plugin is disabled (because it doesn't initialize)
      expect(health.message).toContain("not initialized");
    });

    it("should return not initialized when integration is disabled", async () => {
      const config = createHieraConfig({ enabled: false, config: { controlRepoPath: "/some/path" } });

      await plugin.initialize(config);
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(false);
      // Base class returns "not initialized" when plugin is disabled (because it doesn't initialize)
      expect(health.message).toContain("not initialized");
    });

    it("should return healthy status when properly initialized", async () => {
      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config = createHieraConfig();

      await plugin.initialize(config);
      const health = await plugin.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain("healthy");
    });
  });

  describe("enable/disable", () => {
    beforeEach(async () => {
      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config = createHieraConfig();
      await plugin.initialize(config);
    });

    it("should disable the integration", async () => {
      expect(plugin.isEnabled()).toBe(true);

      await plugin.disable();

      expect(plugin.isEnabled()).toBe(false);
      expect(plugin.isInitialized()).toBe(false);
    });

    it("should re-enable the integration", async () => {
      await plugin.disable();
      expect(plugin.isEnabled()).toBe(false);

      await plugin.enable();

      expect(plugin.isEnabled()).toBe(true);
      expect(plugin.isInitialized()).toBe(true);
    });
  });

  describe("reload", () => {
    beforeEach(async () => {
      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config = createHieraConfig();
      await plugin.initialize(config);
    });

    it("should reload control repository data", async () => {
      await expect(plugin.reload()).resolves.not.toThrow();
      expect(mockHieraService.reloadControlRepo).toHaveBeenCalled();
    });

    it("should throw error when not initialized", async () => {
      await plugin.disable();

      await expect(plugin.reload()).rejects.toThrow("not initialized");
    });
  });

  describe("getInventory", () => {
    it("should return empty array when PuppetDB is not available", async () => {
      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config = createHieraConfig();
      await plugin.initialize(config);
      const inventory = await plugin.getInventory();

      expect(inventory).toEqual([]);
    });

    it("should delegate to PuppetDB when available", async () => {
      const mockNodes = [{ id: "node1", certname: "node1.example.com" }];
      const mockPuppetDB = {
        isInitialized: vi.fn().mockReturnValue(true),
        getInventory: vi.fn().mockResolvedValue(mockNodes),
      };

      mockIntegrationManager.getInformationSource = vi.fn().mockReturnValue(mockPuppetDB);

      // Mock valid control repo
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);

      const config = createHieraConfig();
      await plugin.initialize(config);
      const inventory = await plugin.getInventory();

      expect(mockPuppetDB.getInventory).toHaveBeenCalled();
      expect(inventory).toEqual(mockNodes);
    });
  });
});
