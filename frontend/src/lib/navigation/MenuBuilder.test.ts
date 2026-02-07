/**
 * MenuBuilder Unit Tests
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 21)
 *
 * Tests the dynamic menu system including:
 * - Menu generation from plugins
 * - Permission-based filtering
 * - Integration type grouping
 * - Priority-based ordering
 * - Event subscription
 *
 * @module tests/navigation/MenuBuilder.test
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the plugin loader and auth store before importing MenuBuilder
vi.mock("../plugins", () => ({
  getPluginLoader: vi.fn(() => mockPluginLoader),
}));

vi.mock("../auth.svelte", () => ({
  getAuthStore: vi.fn(() => mockAuthStore),
}));

vi.mock("../logger.svelte", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  MenuBuilder,
  getMenuBuilder,
  resetMenuBuilder,
} from "../navigation/MenuBuilder.svelte";
import type {
  MenuItem,
  PluginMenuContribution,
} from "../navigation/types";
import type { LoadedPlugin, PluginInfo, PluginCapabilitySummary } from "../plugins/types";

// =============================================================================
// Mock Setup
// =============================================================================

// Mock plugin loader
const mockPluginLoader = {
  subscribe: vi.fn(() => vi.fn()),
  getAllPlugins: vi.fn(() => new Map()),
};

// Mock auth store
const mockAuthStore = {
  hasCapability: vi.fn().mockReturnValue(true),
  isAuthenticated: true,
  user: {
    id: "test-user",
    username: "testuser",
    email: "test@example.com",
    groups: [],
    roles: ["admin"],
    active: true,
    createdAt: new Date().toISOString(),
  },
  permissions: {
    allowed: ["*"],
    denied: [],
    roles: ["admin"],
  },
};

// Helper to create mock plugin info
function createMockPluginInfo(
  name: string,
  integrationType = "RemoteExecution",
  capabilities: { name: string; category: string }[] = []
): PluginInfo {
  return {
    metadata: {
      name,
      version: "1.0.0",
      description: `${name} plugin`,
      integrationType: integrationType as any,
      author: "Test Author",
      homepage: `https://example.com/${name}`,
      dependencies: [],
      icon: "M12 6v6m0 0v6m0-6h6m-6 0H6",
    },
    enabled: true,
    healthy: true,
    priority: 10,
    capabilities: capabilities.map((cap): PluginCapabilitySummary => ({
      name: cap.name,
      category: cap.category,
      description: `${cap.name} capability`,
      riskLevel: "read",
      requiredPermissions: [],
    })),
    widgets: [],
  };
}

// Helper to create mock loaded plugin
function createMockLoadedPlugin(
  name: string,
  integrationType = "RemoteExecution",
  capabilities: { name: string; category: string }[] = []
): LoadedPlugin {
  return {
    info: createMockPluginInfo(name, integrationType, capabilities),
    loadState: "loaded",
    loadedAt: new Date(),
    widgets: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("MenuBuilder", () => {
  let menuBuilder: MenuBuilder;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockAuthStore.hasCapability.mockReturnValue(true);
    mockPluginLoader.getAllPlugins.mockReturnValue(new Map());

    // Reset singleton
    resetMenuBuilder();

    // Create fresh instance
    menuBuilder = new MenuBuilder();
  });

  afterEach(() => {
    menuBuilder.destroy();
  });

  describe("initialization", () => {
    it("should create menu builder with default config", () => {
      expect(menuBuilder).toBeDefined();
      expect(menuBuilder.menu).toBeNull();
      expect(menuBuilder.isBuilding).toBe(false);
    });

    it("should subscribe to plugin loader on initialize", () => {
      menuBuilder.initialize();

      expect(mockPluginLoader.subscribe).toHaveBeenCalled();
    });

    it("should build initial menu on initialize", () => {
      menuBuilder.initialize();

      expect(menuBuilder.menu).not.toBeNull();
    });
  });

  describe("menu building", () => {
    it("should include core navigation items by default", () => {
      const menu = menuBuilder.rebuild();

      const coreSection = menu.sections.find((s) => s.id === "core");
      expect(coreSection).toBeDefined();
      expect(coreSection?.items.length).toBeGreaterThan(0);

      // Should include Home, Inventory, Executions
      const homeItem = coreSection?.items.find((i) => i.id === "home");
      expect(homeItem).toBeDefined();
      expect(homeItem?.type).toBe("link");
    });

    it("should include admin items", () => {
      const menu = menuBuilder.rebuild();

      const adminSection = menu.sections.find((s) => s.id === "admin");
      expect(adminSection).toBeDefined();
    });

    it("should generate menu with metadata", () => {
      const menu = menuBuilder.rebuild();

      expect(menu.id).toBe("main-menu");
      expect(menu.metadata).toBeDefined();
      expect(menu.metadata?.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe("plugin contributions", () => {
    it("should add plugin menu items", () => {
      // Setup mock plugin
      const boltPlugin = createMockLoadedPlugin("bolt", "RemoteExecution", [
        { name: "command.execute", category: "command" },
        { name: "task.run", category: "task" },
      ]);

      mockPluginLoader.getAllPlugins.mockReturnValue(
        new Map([["bolt", boltPlugin]])
      );

      const menu = menuBuilder.rebuild();

      const integrationsSection = menu.sections.find(
        (s) => s.id === "integrations"
      );
      expect(integrationsSection).toBeDefined();
      // Plugin should contribute items
      expect(integrationsSection?.items.length).toBeGreaterThan(0);
    });

    it("should group plugins by integration type", () => {
      // Setup multiple plugins
      const boltPlugin = createMockLoadedPlugin("bolt", "RemoteExecution", [
        { name: "bolt.command", category: "command" },
      ]);
      const puppetdbPlugin = createMockLoadedPlugin(
        "puppetdb",
        "InventorySource",
        [{ name: "puppetdb.query", category: "inventory" }]
      );

      mockPluginLoader.getAllPlugins.mockReturnValue(
        new Map([
          ["bolt", boltPlugin],
          ["puppetdb", puppetdbPlugin],
        ])
      );

      const menu = menuBuilder.rebuild();

      const integrationsSection = menu.sections.find(
        (s) => s.id === "integrations"
      );

      // Should have items grouped by integration type
      expect(integrationsSection?.items).toBeDefined();
    });

    it("should add custom contribution", () => {
      const contribution: PluginMenuContribution = {
        pluginName: "custom",
        integrationType: "Info" as any,
        items: [
          {
            id: "custom-item",
            type: "link",
            label: "Custom Item",
            path: "/custom",
          },
        ],
      };

      menuBuilder.addContribution(contribution);

      const menu = menuBuilder.menu;
      expect(menu).not.toBeNull();
    });

    it("should remove contribution", () => {
      const contribution: PluginMenuContribution = {
        pluginName: "custom",
        integrationType: "Info" as any,
        items: [
          {
            id: "custom-item",
            type: "link",
            label: "Custom Item",
            path: "/custom",
          },
        ],
      };

      menuBuilder.addContribution(contribution);
      menuBuilder.removeContribution("custom");

      // Menu should be rebuilt without the contribution
      expect(menuBuilder.menu).not.toBeNull();
    });
  });

  describe("permission filtering", () => {
    it("should filter items based on user permissions", () => {
      // User lacks inventory capability
      mockAuthStore.hasCapability.mockImplementation((cap: string) => {
        return !cap.includes("inventory");
      });

      const menu = menuBuilder.rebuild();

      const coreSection = menu.sections.find((s) => s.id === "core");
      const inventoryItem = coreSection?.items.find((i) => i.id === "inventory");

      // Inventory should be filtered out
      expect(inventoryItem).toBeUndefined();
    });

    it("should show all items when user has all permissions", () => {
      mockAuthStore.hasCapability.mockReturnValue(true);

      const menu = menuBuilder.rebuild();

      const coreSection = menu.sections.find((s) => s.id === "core");
      expect(coreSection?.items.length).toBeGreaterThanOrEqual(3); // Home, Inventory, Executions
    });

    it("should filter admin items based on admin permissions", () => {
      mockAuthStore.hasCapability.mockImplementation((cap: string) => {
        return !cap.startsWith("admin.");
      });

      const menu = menuBuilder.rebuild();

      const adminSection = menu.sections.find((s) => s.id === "admin");
      // Admin section should be empty or filtered
      expect(adminSection?.items.length ?? 0).toBe(0);
    });
  });

  describe("event subscription", () => {
    it("should emit menu:built event on rebuild", () => {
      const handler = vi.fn();
      menuBuilder.subscribe(handler);

      menuBuilder.rebuild();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "menu:built" })
      );
    });

    it("should emit plugin:contributed event on contribution", () => {
      const handler = vi.fn();
      menuBuilder.subscribe(handler);

      const contribution: PluginMenuContribution = {
        pluginName: "test",
        integrationType: "Info" as any,
        items: [
          { id: "test-item", type: "link", label: "Test", path: "/test" },
        ],
      };

      menuBuilder.addContribution(contribution);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plugin:contributed",
          pluginName: "test",
        })
      );
    });

    it("should emit plugin:removed event on removal", () => {
      const handler = vi.fn();
      menuBuilder.subscribe(handler);

      const contribution: PluginMenuContribution = {
        pluginName: "test",
        integrationType: "Info" as any,
        items: [
          { id: "test-item", type: "link", label: "Test", path: "/test" },
        ],
      };

      menuBuilder.addContribution(contribution);
      handler.mockClear(); // Clear events from addContribution
      menuBuilder.removeContribution("test");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "plugin:removed",
          pluginName: "test",
        })
      );
    });

    it("should allow unsubscribing", () => {
      const handler = vi.fn();
      const unsubscribe = menuBuilder.subscribe(handler);

      unsubscribe();
      menuBuilder.rebuild();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("menu operations", () => {
    it("should get section by id", () => {
      menuBuilder.rebuild();

      const coreSection = menuBuilder.getSection("core");
      expect(coreSection).toBeDefined();
      expect(coreSection?.id).toBe("core");
    });

    it("should return undefined for non-existent section", () => {
      menuBuilder.rebuild();

      const section = menuBuilder.getSection("non-existent");
      expect(section).toBeUndefined();
    });

    it("should get flat items list", () => {
      menuBuilder.rebuild();

      const items = menuBuilder.getFlatItems();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it("should check if item is active", () => {
      const linkItem: MenuItem = {
        id: "test",
        type: "link",
        label: "Test",
        path: "/test",
      };

      expect(menuBuilder.isItemActive(linkItem, "/test")).toBe(true);
      expect(menuBuilder.isItemActive(linkItem, "/test/sub")).toBe(true);
      expect(menuBuilder.isItemActive(linkItem, "/other")).toBe(false);
    });

    it("should handle exact path matching", () => {
      const linkItem: MenuItem = {
        id: "home",
        type: "link",
        label: "Home",
        path: "/",
        exact: true,
      };

      expect(menuBuilder.isItemActive(linkItem, "/")).toBe(true);
      expect(menuBuilder.isItemActive(linkItem, "/test")).toBe(false);
    });
  });

  describe("integration type metadata", () => {
    it("should return metadata for known integration types", () => {
      const metadata =
        menuBuilder.getIntegrationTypeMetadata("RemoteExecution");

      expect(metadata.label).toBe("Remote Execution");
      expect(metadata.icon).toBeDefined();
      expect(metadata.priority).toBeGreaterThan(0);
    });

    it("should return default metadata for unknown types", () => {
      const metadata = menuBuilder.getIntegrationTypeMetadata("Unknown");

      expect(metadata.label).toBe("Unknown");
      expect(metadata.priority).toBe(0);
    });
  });

  describe("singleton", () => {
    it("should return same instance with getMenuBuilder", () => {
      const instance1 = getMenuBuilder();
      const instance2 = getMenuBuilder();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = getMenuBuilder();
      resetMenuBuilder();
      const instance2 = getMenuBuilder();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("configuration", () => {
    it("should apply custom configuration", () => {
      const customBuilder = new MenuBuilder({
        includeCoreItems: false,
        showEmptyGroups: true,
      });

      const menu = customBuilder.rebuild();

      const coreSection = menu.sections.find((s) => s.id === "core");
      expect(coreSection?.items.length ?? 0).toBe(0);

      customBuilder.destroy();
    });

    it("should sort items by priority when enabled", () => {
      const builder = new MenuBuilder({ sortByPriority: true });
      builder.rebuild();

      const menu = builder.menu;
      const sections = menu?.sections ?? [];

      // Sections should be sorted by priority (higher first)
      for (let i = 0; i < sections.length - 1; i++) {
        const current = sections[i].priority ?? 0;
        const next = sections[i + 1].priority ?? 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }

      builder.destroy();
    });
  });

  describe("cleanup", () => {
    it("should cleanup on destroy", () => {
      menuBuilder.initialize();
      menuBuilder.destroy();

      expect(menuBuilder.menu).toBeNull();
    });
  });
});
