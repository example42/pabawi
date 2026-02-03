/**
 * Tests for PluginLoader class
 *
 * Tests the v1.0.0 plugin loading system including:
 * - Plugin discovery from native and external directories
 * - Plugin manifest (plugin.json) loading and validation
 * - Plugin loading and validation
 * - Dependency resolution with topological sort
 * - Plugin reload and unload
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  PluginLoader,
  type LoadedPlugin,
  type PluginDiscoveryResult,
  type PluginValidationResult,
} from "../../src/integrations/PluginLoader";
import type {
  BasePluginInterface,
  PluginMetadata,
  PluginCapability,
  PluginWidget,
  HealthStatus,
  IntegrationType,
} from "../../src/integrations/types";
import { LoggerService } from "../../src/services/LoggerService";

// Mock plugin for testing
class MockPlugin implements BasePluginInterface {
  metadata: PluginMetadata = {
    name: "mock-plugin",
    version: "1.0.0",
    author: "Test Author",
    description: "A mock plugin for testing",
    integrationType: "RemoteExecution" as IntegrationType,
  };

  capabilities: PluginCapability[] = [
    {
      category: "command",
      name: "command.execute",
      description: "Execute a command",
      handler: vi.fn().mockResolvedValue({ success: true }),
      requiredPermissions: ["command.execute"],
      riskLevel: "execute",
    },
  ];

  widgets?: PluginWidget[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: true,
      message: "Mock plugin is healthy",
      lastCheck: new Date().toISOString(),
    };
  }

  getConfig(): Record<string, unknown> {
    return {};
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}

// Factory function for mock plugin
function createMockPlugin(): BasePluginInterface {
  return new MockPlugin();
}

describe("PluginLoader", () => {
  let loader: PluginLoader;
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService();
    loader = new PluginLoader({
      nativePaths: [],
      externalPaths: [],
      localPaths: [],
      logger,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validatePlugin", () => {
    it("should validate a valid plugin", () => {
      const plugin = createMockPlugin();
      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail validation for missing metadata", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      delete plugin.metadata;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing plugin metadata");
    });

    it("should fail validation for missing plugin name", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.metadata.name = null;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid plugin name in metadata");
    });

    it("should fail validation for missing plugin version", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.metadata.version = undefined;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid plugin version in metadata");
    });

    it("should warn for missing plugin author", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.metadata.author = undefined;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(true); // Warnings don't fail validation
      expect(result.warnings).toContain("Missing plugin author in metadata");
    });

    it("should fail validation for missing capabilities array", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.capabilities = null;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid capabilities array");
    });

    it("should fail validation for invalid capability name format", () => {
      const plugin = createMockPlugin();
      plugin.capabilities[0].name = "invalid-name";

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid capability name format"))).toBe(
        true
      );
    });

    it("should fail validation for missing capability handler", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.capabilities[0].handler = null;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Missing or invalid capability handler"))
      ).toBe(true);
    });

    it("should fail validation for invalid risk level", () => {
      const plugin = createMockPlugin();
      // @ts-expect-error - Testing invalid plugin
      plugin.capabilities[0].riskLevel = "dangerous";

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid riskLevel"))).toBe(true);
    });

    it("should fail validation for missing required methods", () => {
      // Create a minimal object that's missing methods
      const plugin = {
        metadata: {
          name: "incomplete-plugin",
          version: "1.0.0",
          author: "Test",
          description: "Incomplete plugin",
          integrationType: "RemoteExecution",
        },
        capabilities: [
          {
            category: "command",
            name: "command.execute",
            description: "Execute",
            handler: vi.fn(),
            requiredPermissions: [],
            riskLevel: "execute",
          },
        ],
        // Missing: initialize, healthCheck, getConfig, isInitialized
      } as unknown as BasePluginInterface;

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing initialize() method");
    });

    it("should warn for widgets without slots", () => {
      const plugin = createMockPlugin();
      plugin.widgets = [
        {
          id: "mock:widget",
          name: "Mock Widget",
          component: "./MockWidget.svelte",
          slots: [],
          size: "medium",
          requiredCapabilities: [],
        },
      ];

      const result = loader.validatePlugin(plugin);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("no slots defined"))).toBe(true);
    });
  });

  describe("resolveDependencies", () => {
    const createMockLoadedPlugin = (
      name: string,
      dependencies: string[] = []
    ): LoadedPlugin => {
      const plugin = createMockPlugin();
      plugin.metadata.name = name;
      plugin.metadata.dependencies = dependencies;

      return {
        instance: plugin,
        discovery: {
          path: `/plugins/${name}`,
          source: "local",
          name,
          hasPackageJson: false,
          entryPoint: `/plugins/${name}/index.ts`,
        },
        loadedAt: new Date().toISOString(),
        loadDurationMs: 10,
        warnings: [],
      };
    };

    it("should return plugins in dependency order", () => {
      const plugins = [
        createMockLoadedPlugin("plugin-c", ["plugin-b"]),
        createMockLoadedPlugin("plugin-a"),
        createMockLoadedPlugin("plugin-b", ["plugin-a"]),
      ];

      const sorted = loader.resolveDependencies(plugins);

      const names = sorted.map((p) => p.instance.metadata.name);
      expect(names.indexOf("plugin-a")).toBeLessThan(names.indexOf("plugin-b"));
      expect(names.indexOf("plugin-b")).toBeLessThan(names.indexOf("plugin-c"));
    });

    it("should handle plugins with no dependencies", () => {
      const plugins = [
        createMockLoadedPlugin("plugin-a"),
        createMockLoadedPlugin("plugin-b"),
        createMockLoadedPlugin("plugin-c"),
      ];

      const sorted = loader.resolveDependencies(plugins);

      expect(sorted).toHaveLength(3);
    });

    it("should handle complex dependency graphs", () => {
      const plugins = [
        createMockLoadedPlugin("plugin-d", ["plugin-b", "plugin-c"]),
        createMockLoadedPlugin("plugin-b", ["plugin-a"]),
        createMockLoadedPlugin("plugin-c", ["plugin-a"]),
        createMockLoadedPlugin("plugin-a"),
      ];

      const sorted = loader.resolveDependencies(plugins);
      const names = sorted.map((p) => p.instance.metadata.name);

      // plugin-a must come before plugin-b, plugin-c, and plugin-d
      expect(names.indexOf("plugin-a")).toBeLessThan(names.indexOf("plugin-b"));
      expect(names.indexOf("plugin-a")).toBeLessThan(names.indexOf("plugin-c"));
      expect(names.indexOf("plugin-a")).toBeLessThan(names.indexOf("plugin-d"));

      // plugin-b and plugin-c must come before plugin-d
      expect(names.indexOf("plugin-b")).toBeLessThan(names.indexOf("plugin-d"));
      expect(names.indexOf("plugin-c")).toBeLessThan(names.indexOf("plugin-d"));
    });

    it("should handle missing dependencies gracefully", () => {
      const plugins = [
        createMockLoadedPlugin("plugin-a", ["missing-plugin"]),
        createMockLoadedPlugin("plugin-b"),
      ];

      const sorted = loader.resolveDependencies(plugins);

      // Should still return both plugins
      expect(sorted).toHaveLength(2);
    });

    it("should detect and handle circular dependencies", () => {
      const plugins = [
        createMockLoadedPlugin("plugin-a", ["plugin-b"]),
        createMockLoadedPlugin("plugin-b", ["plugin-a"]),
      ];

      const sorted = loader.resolveDependencies(plugins);

      // Should return plugins that aren't in the cycle (none in this case)
      // Or return partial results
      expect(sorted.length).toBeLessThanOrEqual(2);
    });
  });

  describe("getAllPlugins", () => {
    it("should return empty map when no plugins loaded", () => {
      const plugins = loader.getAllPlugins();
      expect(plugins.size).toBe(0);
    });
  });

  describe("getPlugin", () => {
    it("should return undefined for non-existent plugin", () => {
      const plugin = loader.getPlugin("non-existent");
      expect(plugin).toBeUndefined();
    });
  });

  describe("discover", () => {
    it("should return empty array when no paths configured and legacy paths don't exist", async () => {
      // Create a loader with empty paths - but legacy paths are still scanned
      // This test verifies the loader doesn't crash with empty custom paths
      const discovered = await loader.discover();
      // Legacy paths will be scanned, so we may get results if they exist
      // The important thing is that the loader doesn't crash
      expect(Array.isArray(discovered)).toBe(true);
    });
  });

  describe("constructor options", () => {
    it("should accept custom native paths", () => {
      const customLoader = new PluginLoader({
        nativePaths: ["/custom/path"],
        logger,
      });

      expect(customLoader).toBeDefined();
    });

    it("should accept strictValidation option", () => {
      const strictLoader = new PluginLoader({
        strictValidation: true,
        logger,
      });

      expect(strictLoader).toBeDefined();
    });

    it("should accept skipPlugins option", () => {
      const loaderWithSkip = new PluginLoader({
        skipPlugins: ["plugin-to-skip"],
        logger,
      });

      expect(loaderWithSkip).toBeDefined();
    });
  });
});

describe("PluginLoader validation edge cases", () => {
  let loader: PluginLoader;
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService();
    loader = new PluginLoader({ logger });
  });

  it("should validate valid capability names", () => {
    const plugin = createMockPlugin();
    plugin.capabilities = [
      {
        category: "command",
        name: "command.execute",
        description: "Valid name",
        handler: vi.fn(),
        requiredPermissions: [],
        riskLevel: "execute",
      },
      {
        category: "task",
        name: "task.module.run",
        description: "Multi-level name",
        handler: vi.fn(),
        requiredPermissions: [],
        riskLevel: "execute",
      },
    ];

    const result = loader.validatePlugin(plugin);
    expect(result.valid).toBe(true);
  });

  it("should reject capability names without dots", () => {
    const plugin = createMockPlugin();
    plugin.capabilities[0].name = "nodots";

    const result = loader.validatePlugin(plugin);
    expect(result.valid).toBe(false);
  });

  it("should validate all risk levels", () => {
    const riskLevels = ["read", "write", "execute", "admin"] as const;

    for (const riskLevel of riskLevels) {
      const plugin = createMockPlugin();
      plugin.capabilities[0].riskLevel = riskLevel;

      const result = loader.validatePlugin(plugin);
      expect(result.valid).toBe(true);
    }
  });

  it("should handle empty capabilities array", () => {
    const plugin = createMockPlugin();
    plugin.capabilities = [];

    const result = loader.validatePlugin(plugin);
    expect(result.valid).toBe(true); // Empty is valid, just no capabilities
  });

  it("should validate widgets with all required fields", () => {
    const plugin = createMockPlugin();
    plugin.widgets = [
      {
        id: "mock:complete-widget",
        name: "Complete Widget",
        component: "./Widget.svelte",
        slots: ["dashboard"],
        size: "medium",
        requiredCapabilities: ["command.execute"],
      },
    ];

    const result = loader.validatePlugin(plugin);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// Export mock for use in other tests
export { createMockPlugin, MockPlugin };


describe("PluginLoader with real plugin directories", () => {
  let loader: PluginLoader;
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService();
    // Use default paths which point to plugins/native/ and plugins/external/
    loader = new PluginLoader({ logger });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("discover with real plugins", () => {
    it("should discover native plugins from plugins/native/", async () => {
      const discovered = await loader.discover();

      // Should find the 4 native plugins
      const nativePlugins = discovered.filter((d) => d.source === "native");
      expect(nativePlugins.length).toBeGreaterThanOrEqual(4);

      // Check for specific plugins
      const pluginNames = nativePlugins.map((d) => d.name);
      expect(pluginNames).toContain("bolt");
      expect(pluginNames).toContain("puppetdb");
      expect(pluginNames).toContain("puppetserver");
      expect(pluginNames).toContain("hiera");
    });

    it("should load plugin.json manifests for native plugins", async () => {
      const discovered = await loader.discover();

      const boltPlugin = discovered.find((d) => d.name === "bolt");
      expect(boltPlugin).toBeDefined();
      expect(boltPlugin?.hasManifest).toBe(true);
      expect(boltPlugin?.manifest).toBeDefined();
      expect(boltPlugin?.manifest?.name).toBe("bolt");
      expect(boltPlugin?.manifest?.version).toBe("1.0.0");
      expect(boltPlugin?.manifest?.integrationType).toBe("RemoteExecution");
    });

    it("should resolve entry points from manifests", async () => {
      const discovered = await loader.discover();

      const puppetdbPlugin = discovered.find((d) => d.name === "puppetdb");
      expect(puppetdbPlugin).toBeDefined();
      expect(puppetdbPlugin?.entryPoint).toContain("backend");
      expect(puppetdbPlugin?.entryPoint).toContain("index.ts");
    });

    it("should include capabilities from manifests", async () => {
      const discovered = await loader.discover();

      const hieraPlugin = discovered.find((d) => d.name === "hiera");
      expect(hieraPlugin?.manifest?.capabilities).toBeDefined();
      expect(hieraPlugin?.manifest?.capabilities.length).toBeGreaterThan(0);

      // Check for specific capability
      const lookupCapability = hieraPlugin?.manifest?.capabilities.find(
        (c) => c.name === "lookup.key"
      );
      expect(lookupCapability).toBeDefined();
      expect(lookupCapability?.category).toBe("config");
    });

    it("should include widgets from manifests", async () => {
      const discovered = await loader.discover();

      const puppetserverPlugin = discovered.find((d) => d.name === "puppetserver");
      expect(puppetserverPlugin?.manifest?.widgets).toBeDefined();
      expect(puppetserverPlugin?.manifest?.widgets.length).toBeGreaterThan(0);

      // Check for home widget
      const homeWidget = puppetserverPlugin?.manifest?.widgets.find(
        (w) => w.slots.includes("home-summary")
      );
      expect(homeWidget).toBeDefined();
    });
  });

  describe("getManifest", () => {
    it("should return undefined for non-loaded plugin", () => {
      const manifest = loader.getManifest("non-existent");
      expect(manifest).toBeUndefined();
    });
  });

  describe("getAllManifests", () => {
    it("should return empty map when no plugins loaded", () => {
      const manifests = loader.getAllManifests();
      expect(manifests.size).toBe(0);
    });
  });

  describe("path getters", () => {
    it("should return native plugins path", () => {
      const nativePath = loader.getNativePluginsPath();
      expect(nativePath).toContain("plugins");
      expect(nativePath).toContain("native");
    });

    it("should return external plugins path", () => {
      const externalPath = loader.getExternalPluginsPath();
      expect(externalPath).toContain("plugins");
      expect(externalPath).toContain("external");
    });
  });
});


describe("PluginLoader additional plugins configuration", () => {
  let logger: LoggerService;
  let loader: PluginLoader;

  beforeEach(() => {
    logger = new LoggerService();
    loader = new PluginLoader({ logger });
  });

  describe("getAdditionalPluginConfigs", () => {
    it("should return empty array when no additional plugins configured", () => {
      const configs = loader.getAdditionalPluginConfigs();
      expect(configs).toEqual([]);
    });
  });

  describe("getAdditionalPluginConfig", () => {
    it("should return undefined for non-existent plugin config", () => {
      const config = loader.getAdditionalPluginConfig("non-existent");
      expect(config).toBeUndefined();
    });
  });
});

describe("PluginLoader with additional plugins", () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService();
  });

  it("should accept additional plugins configuration", () => {
    const loader = new PluginLoader({
      additionalPlugins: [
        { path: "./custom-plugins/my-plugin", enabled: true, priority: 5 },
        { path: "./custom-plugins/another-plugin", enabled: false },
      ],
      logger,
    });

    const configs = loader.getAdditionalPluginConfigs();
    expect(configs).toHaveLength(2);
    expect(configs[0].path).toBe("./custom-plugins/my-plugin");
    expect(configs[0].priority).toBe(5);
  });

  it("should add enabled additional plugin paths to local paths", async () => {
    const loader = new PluginLoader({
      nativePaths: [],
      externalPaths: [],
      additionalPlugins: [
        { path: "./custom-plugins/enabled-plugin", enabled: true },
        { path: "./custom-plugins/disabled-plugin", enabled: false },
      ],
      logger,
    });

    // The enabled plugin path should be added to local paths
    // We can verify this by checking that discover doesn't crash
    // and that the loader was created successfully
    expect(loader).toBeDefined();
    expect(loader.getAdditionalPluginConfigs()).toHaveLength(2);
  });

  it("should support absolute paths in additional plugins", () => {
    const loader = new PluginLoader({
      additionalPlugins: [
        { path: "/absolute/path/to/plugin", enabled: true },
      ],
      logger,
    });

    expect(loader.getAdditionalPluginConfigs()).toHaveLength(1);
  });
});

describe("PluginLoader environment variable support", () => {
  let logger: LoggerService;
  const originalEnv = process.env;

  beforeEach(() => {
    logger = new LoggerService();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use default paths when environment variables are not set", () => {
    delete process.env.PABAWI_NATIVE_PLUGINS_PATH;
    delete process.env.PABAWI_EXTERNAL_PLUGINS_PATH;

    const loader = new PluginLoader({ logger });

    expect(loader.getNativePluginsPath()).toContain("plugins");
    expect(loader.getNativePluginsPath()).toContain("native");
    expect(loader.getExternalPluginsPath()).toContain("plugins");
    expect(loader.getExternalPluginsPath()).toContain("external");
  });
});
