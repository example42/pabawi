/**
 * Dynamic Menu Builder
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 21)
 *
 * Generates navigation menus from loaded plugins with:
 * - Grouping by integration type
 * - Permission-based filtering
 * - Priority-based ordering
 * - Reactive state management (Svelte 5 runes)
 * - Event subscription system
 *
 * @module lib/navigation/MenuBuilder
 * @version 1.0.0
 */

import { getPluginLoader, type LoadedPlugin, type PluginEvent } from "../plugins";
import { getAuthStore, type AuthStore } from "../auth.svelte";
import { logger } from "../logger.svelte";
import type { IntegrationType, PluginCapabilitySummary } from "../plugins/types";
import type {
  Menu,
  MenuItem,
  LinkMenuItem,
  GroupMenuItem,
  MenuSection,
  MenuBuilderConfig,
  MenuBuilderEvent,
  MenuBuilderEventHandler,
  PluginMenuContribution,
  IntegrationTypeMetadata,
} from "./types";
import { DEFAULT_MENU_BUILDER_CONFIG, INTEGRATION_TYPE_METADATA } from "./types";

// =============================================================================
// Core Navigation Items
// =============================================================================

/**
 * Default core navigation items (always present)
 */
const CORE_NAV_ITEMS: MenuItem[] = [
  {
    id: "home",
    type: "link",
    label: "Home",
    path: "/",
    exact: true,
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    priority: 1000,
  },
  {
    id: "inventory",
    type: "link",
    label: "Inventory",
    path: "/inventory",
    icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
    priority: 900,
    requiredCapabilities: ["inventory.*", "inventory.list"],
  },
  {
    id: "executions",
    type: "link",
    label: "Executions",
    path: "/executions",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    priority: 800,
    requiredCapabilities: ["command.*", "task.*", "execution.list"],
  },
];

/**
 * Default sections for menu organization
 */
const DEFAULT_SECTIONS: MenuSection[] = [
  {
    id: "core",
    title: "Navigation",
    items: [],
    priority: 1000,
    showTitle: false,
  },
  {
    id: "integrations",
    title: "Integrations",
    items: [],
    priority: 500,
    showTitle: true,
  },
  {
    id: "admin",
    title: "Administration",
    items: [],
    priority: 100,
    showTitle: true,
  },
];

/**
 * Admin navigation items
 */
const ADMIN_NAV_ITEMS: MenuItem[] = [
  {
    id: "users",
    type: "link",
    label: "Users",
    path: "/admin/users",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    priority: 100,
    requiredCapabilities: ["admin.users", "admin.*"],
  },
  {
    id: "roles",
    type: "link",
    label: "Roles",
    path: "/admin/roles",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    priority: 90,
    requiredCapabilities: ["admin.roles", "admin.*"],
  },
  {
    id: "plugins",
    type: "link",
    label: "Plugins",
    path: "/admin/plugins",
    icon: "M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z",
    priority: 80,
    requiredCapabilities: ["admin.plugins", "admin.*"],
  },
  {
    id: "settings",
    type: "link",
    label: "Settings",
    path: "/admin/settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    priority: 70,
    requiredCapabilities: ["admin.settings", "admin.*"],
  },
];

// =============================================================================
// Menu Builder Class
// =============================================================================

/**
 * MenuBuilder class
 *
 * Manages dynamic menu generation from plugins with Svelte 5 reactivity.
 */
class MenuBuilder {
  // Configuration
  private config: Required<MenuBuilderConfig>;

  // Reactive state
  menu = $state<Menu | null>(null);
  isBuilding = $state(false);
  lastError = $state<string | null>(null);

  // Plugin contributions (auto-generated from loaded plugins)
  private pluginContributions = new Map<string, PluginMenuContribution>();

  // Custom contributions (manually added, preserved across rebuilds)
  private customContributions = new Map<string, PluginMenuContribution>();

  // Combined view of all contributions
  private get contributions(): Map<string, PluginMenuContribution> {
    const combined = new Map<string, PluginMenuContribution>();
    // Plugin contributions first, then custom (custom can override)
    for (const [key, value] of this.pluginContributions) {
      combined.set(key, value);
    }
    for (const [key, value] of this.customContributions) {
      combined.set(key, value);
    }
    return combined;
  }

  // Event subscribers
  private eventHandlers = new Set<MenuBuilderEventHandler>();

  // Plugin loader subscription cleanup
  private pluginLoaderUnsubscribe: (() => void) | null = null;

  constructor(config: Partial<MenuBuilderConfig> = {}) {
    this.config = { ...DEFAULT_MENU_BUILDER_CONFIG, ...config };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Initialize the menu builder, load plugins, and subscribe to plugin events
   *
   * This method:
   * 1. Subscribes to plugin loader events for future updates
   * 2. Loads all available plugins from the backend
   * 3. Builds the initial menu from loaded plugins
   */
  async initialize(): Promise<void> {
    this.log("debug", "Initializing menu builder");
    this.isBuilding = true;

    try {
      // Subscribe to plugin loader events for future updates
      const pluginLoader = getPluginLoader();
      this.pluginLoaderUnsubscribe = pluginLoader.subscribe((event) => {
        this.handlePluginEvent(event);
      });

      // Load all plugins from the backend API
      this.log("debug", "Loading plugins from backend");
      const loadedPlugins = await pluginLoader.loadAll();
      this.log("info", `Loaded ${loadedPlugins.length} plugins`);

      // Build initial menu with loaded plugins
      this.rebuild();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize menu";
      this.lastError = message;
      this.log("error", `Menu initialization failed: ${message}`);

      // Still build the menu with core items even if plugins fail
      this.rebuild();
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Destroy the menu builder and cleanup subscriptions
   */
  destroy(): void {
    if (this.pluginLoaderUnsubscribe) {
      this.pluginLoaderUnsubscribe();
      this.pluginLoaderUnsubscribe = null;
    }

    this.pluginContributions.clear();
    this.customContributions.clear();
    this.eventHandlers.clear();
    this.menu = null;
  }

  /**
   * Rebuild the entire menu from scratch
   */
  rebuild(): Menu {
    this.isBuilding = true;
    this.lastError = null;

    try {
      this.log("debug", "Rebuilding menu");

      // Clear plugin contributions (custom contributions are preserved)
      this.pluginContributions.clear();

      // Load plugin contributions
      const pluginLoader = getPluginLoader();
      const plugins = pluginLoader.getAllPlugins();

      for (const plugin of plugins.values()) {
        if (plugin.loadState === "loaded") {
          this.addPluginContribution(plugin);
        }
      }

      // Build the menu
      const menu = this.buildMenu();
      this.menu = menu;

      this.emit({ type: "menu:built", menu });
      this.log("info", `Menu built with ${String(this.countMenuItems(menu))} items`);

      return menu;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to build menu";
      this.lastError = message;
      this.log("error", message);
      throw error;
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Add a custom menu contribution (for non-plugin items)
   */
  addContribution(contribution: PluginMenuContribution): void {
    this.customContributions.set(contribution.pluginName, contribution);
    this.emit({
      type: "plugin:contributed",
      pluginName: contribution.pluginName,
      itemCount: contribution.items.length,
    });

    // Rebuild menu with new contribution
    this.rebuild();
  }

  /**
   * Remove a plugin's contribution
   */
  removeContribution(pluginName: string): void {
    if (this.customContributions.has(pluginName)) {
      this.customContributions.delete(pluginName);
      this.emit({ type: "plugin:removed", pluginName });

      // Rebuild menu without the plugin
      this.rebuild();
    }
  }

  /**
   * Subscribe to menu builder events
   */
  subscribe(handler: MenuBuilderEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get filtered menu items for a specific section
   */
  getSection(sectionId: string): MenuSection | undefined {
    return this.menu?.sections.find((s) => s.id === sectionId);
  }

  /**
   * Get all menu items as a flat array (for search/filtering)
   */
  getFlatItems(): MenuItem[] {
    if (!this.menu) return [];

    const items: MenuItem[] = [];
    for (const section of this.menu.sections) {
      items.push(...this.flattenItems(section.items));
    }
    return items;
  }

  /**
   * Check if a menu item is active based on current path
   */
  isItemActive(item: MenuItem, currentPath: string): boolean {
    if (item.type !== "link") return false;

    // After type guard, we know this is a LinkMenuItem
    if (item.exact === true) {
      return currentPath === item.path;
    }
    return currentPath.startsWith(item.path);
  }

  /**
   * Get integration type metadata
   */
  getIntegrationTypeMetadata(
    integrationType: IntegrationType | string
  ): IntegrationTypeMetadata {
    return (
      INTEGRATION_TYPE_METADATA[integrationType] ?? {
        label: integrationType,
        description: "",
        icon: INTEGRATION_TYPE_METADATA.Info.icon,
        priority: 0,
      }
    );
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Handle plugin events from the plugin loader
   */
  private handlePluginEvent(event: PluginEvent): void {
    switch (event.type) {
      case "plugin:loaded":
        if (event.plugin.loadState === "loaded") {
          this.addPluginContribution(event.plugin);
          this.rebuild();
        }
        break;

      case "plugin:unloaded":
        this.removeContribution(event.pluginName);
        break;

      // Other events don't require menu rebuild
      default:
        break;
    }
  }

  /**
   * Add menu contribution from a loaded plugin
   */
  private addPluginContribution(plugin: LoadedPlugin): void {
    const metadata = plugin.info.metadata;

    // Create menu items from plugin capabilities
    const items: MenuItem[] = this.createPluginMenuItems(plugin);

    if (items.length === 0) {
      return;
    }

    const contribution: PluginMenuContribution = {
      pluginName: metadata.name,
      integrationType: metadata.integrationType,
      items,
      section: "integrations",
      color: metadata.color,
      icon: metadata.icon,
    };

    this.pluginContributions.set(metadata.name, contribution);
  }

  /**
   * Create menu items from a plugin's metadata
   */
  private createPluginMenuItems(plugin: LoadedPlugin): MenuItem[] {
    const metadata = plugin.info.metadata;
    const capabilities = plugin.info.capabilities;
    const items: MenuItem[] = [];

    // Create a group item for the plugin if it has multiple capabilities
    if (capabilities.length > 0) {
      // Determine the main page route for this plugin
      const mainPath = `/${metadata.name.toLowerCase()}`;

      // Create child items for each capability category
      const capabilityItems = this.createCapabilityItems(
        plugin,
        mainPath
      );

      if (capabilityItems.length > 1) {
        // Create a group with children
        const groupItem: GroupMenuItem = {
          id: `plugin:${metadata.name}`,
          type: "group",
          label: this.formatPluginLabel(metadata.name),
          icon: metadata.icon ?? this.getDefaultPluginIcon(metadata.integrationType),
          children: capabilityItems,
          collapsed: false,
          integrationType: metadata.integrationType,
          pluginName: metadata.name,
          priority: this.getIntegrationPriority(metadata.integrationType),
          requiredCapabilities: this.getPluginCapabilities(plugin),
        };
        items.push(groupItem);
      } else if (capabilityItems.length === 1) {
        // Single capability - use a simple link
        const capItem = capabilityItems[0];
        items.push({
          ...capItem,
          id: `plugin:${metadata.name}`,
          label: this.formatPluginLabel(metadata.name),
          icon: metadata.icon ?? this.getDefaultPluginIcon(metadata.integrationType),
          priority: this.getIntegrationPriority(metadata.integrationType),
        });
      }
    } else {
      // Plugin without capabilities - just add a link to the plugin page
      const linkItem: LinkMenuItem = {
        id: `plugin:${metadata.name}`,
        type: "link",
        label: this.formatPluginLabel(metadata.name),
        path: `/${metadata.name.toLowerCase()}`,
        icon: metadata.icon ?? this.getDefaultPluginIcon(metadata.integrationType),
        priority: this.getIntegrationPriority(metadata.integrationType),
      };
      items.push(linkItem);
    }

    return items;
  }

  /**
   * Create menu items from plugin capabilities
   */
  private createCapabilityItems(
    plugin: LoadedPlugin,
    basePath: string
  ): LinkMenuItem[] {
    const capabilities = plugin.info.capabilities;
    if (capabilities.length === 0) return [];

    // Group capabilities by category
    const categoryMap = new Map<string, PluginCapabilitySummary[]>();

    for (const cap of capabilities) {
      const existing = categoryMap.get(cap.category) ?? [];
      existing.push(cap);
      categoryMap.set(cap.category, existing);
    }

    const items: LinkMenuItem[] = [];
    const pluginName = plugin.info.metadata.name;

    for (const [category, caps] of categoryMap) {
      // Create a link for each category
      const item: LinkMenuItem = {
        id: `plugin:${pluginName}:${category}`,
        type: "link",
        label: this.formatCategoryLabel(category),
        path: `${basePath}/${category.toLowerCase()}`,
        icon: this.getCategoryIcon(category),
        priority: this.getCategoryPriority(category),
        requiredCapabilities: caps.map((c) => c.name),
      };
      items.push(item);
    }

    // Sort by priority
    items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return items;
  }

  /**
   * Build the complete menu structure
   */
  private buildMenu(): Menu {
    // Start with default sections
    const sections: MenuSection[] = this.config.sections.length > 0
      ? structuredClone(this.config.sections)
      : structuredClone(DEFAULT_SECTIONS);

    // Get auth store for permission filtering
    const authStore = getAuthStore();

    // Add core items to core section
    if (this.config.includeCoreItems) {
      const coreSection = sections.find((s) => s.id === "core");
      if (coreSection) {
        const filteredCore = this.filterItemsByPermission(
          CORE_NAV_ITEMS,
          authStore
        );
        coreSection.items = filteredCore;
      }
    }

    // Add plugin contributions to integrations section
    const integrationsSection = sections.find(
      (s) => s.id === this.config.defaultPluginSection
    );

    if (integrationsSection && this.contributions.size > 0) {
      if (this.config.groupByIntegrationType) {
        // Group by integration type
        const grouped = this.groupContributionsByType();

        for (const [integrationType, contributions] of grouped) {
          const metadata = this.getIntegrationTypeMetadata(integrationType);

          // Collect all items for this integration type
          const groupItems: MenuItem[] = [];
          for (const contrib of contributions) {
            const filteredItems = this.filterItemsByPermission(
              contrib.items,
              authStore
            );
            groupItems.push(...filteredItems);
          }

          if (groupItems.length === 0 && !this.config.showEmptyGroups) {
            continue;
          }

          // Sort items by priority
          if (this.config.sortByPriority) {
            groupItems.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
          }

          // If only one plugin in this type, don't create extra nesting
          if (contributions.length === 1 && groupItems.length === 1) {
            integrationsSection.items.push(groupItems[0]);
          } else {
            // Create group for this integration type
            const typeGroup: GroupMenuItem = {
              id: `integration-type:${integrationType}`,
              type: "group",
              label: metadata.label,
              icon: metadata.icon,
              children: groupItems,
              collapsed: false,
              priority: metadata.priority,
            };
            integrationsSection.items.push(typeGroup);
          }
        }
      } else {
        // Flat list of all plugin items
        for (const contrib of this.contributions.values()) {
          const filteredItems = this.filterItemsByPermission(
            contrib.items,
            authStore
          );
          integrationsSection.items.push(...filteredItems);
        }
      }

      // Sort integrations section items by priority
      if (this.config.sortByPriority) {
        integrationsSection.items.sort(
          (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
        );
      }
    }

    // Add admin items
    const adminSection = sections.find((s) => s.id === "admin");
    if (adminSection) {
      const filteredAdmin = this.filterItemsByPermission(
        ADMIN_NAV_ITEMS,
        authStore
      );
      adminSection.items = filteredAdmin;
    }

    // Filter out empty sections
    const nonEmptySections = this.config.showEmptyGroups
      ? sections
      : sections.filter((s) => s.items.length > 0);

    // Sort sections by priority
    if (this.config.sortByPriority) {
      nonEmptySections.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    return {
      id: "main-menu",
      sections: nonEmptySections,
      metadata: {
        lastUpdated: new Date(),
        pluginCount: this.contributions.size,
        itemCount: this.countSectionItems(nonEmptySections),
      },
    };
  }

  /**
   * Group contributions by integration type
   */
  private groupContributionsByType(): Map<IntegrationType, PluginMenuContribution[]> {
    const grouped = new Map<IntegrationType, PluginMenuContribution[]>();

    for (const contrib of this.contributions.values()) {
      const existing = grouped.get(contrib.integrationType) ?? [];
      existing.push(contrib);
      grouped.set(contrib.integrationType, existing);
    }

    // Sort groups by integration type priority
    const sorted = new Map(
      [...grouped.entries()].sort(([a], [b]) => {
        const metaA = INTEGRATION_TYPE_METADATA[a];
        const metaB = INTEGRATION_TYPE_METADATA[b];
        const priorityA = metaA ? metaA.priority : 0;
        const priorityB = metaB ? metaB.priority : 0;
        return priorityB - priorityA;
      })
    );

    return sorted;
  }

  /**
   * Filter menu items by user permissions
   */
  private filterItemsByPermission(
    items: MenuItem[],
    authStore: AuthStore
  ): MenuItem[] {
    if (!this.config.filterByPermissions) {
      return items;
    }

    return items.filter((item) => {
      // Check visibility flag
      if (item.visible === false) {
        return false;
      }

      // Check required capabilities
      if (item.requiredCapabilities && item.requiredCapabilities.length > 0) {
        // User needs at least one of the required capabilities
        const hasPermission = item.requiredCapabilities.some((cap) =>
          authStore.hasCapability(cap)
        );
        if (!hasPermission) {
          return false;
        }
      }

      // For group items, recursively filter children
      if (item.type === "group") {
        // After type guard, we know this is a GroupMenuItem
        const filteredChildren = this.filterItemsByPermission(
          item.children,
          authStore
        );

        // If no visible children and not showing empty groups, hide the group
        if (filteredChildren.length === 0 && !this.config.showEmptyGroups) {
          return false;
        }

        // Update children with filtered list
        item.children = filteredChildren;
      }

      return true;
    });
  }

  /**
   * Flatten nested menu items into a flat array
   */
  private flattenItems(items: MenuItem[]): MenuItem[] {
    const flat: MenuItem[] = [];

    for (const item of items) {
      flat.push(item);
      if (item.type === "group") {
        // After type guard, we know this is a GroupMenuItem
        flat.push(...this.flattenItems(item.children));
      }
    }

    return flat;
  }

  /**
   * Count total menu items
   */
  private countMenuItems(menu: Menu): number {
    return this.countSectionItems(menu.sections);
  }

  /**
   * Count items in sections
   */
  private countSectionItems(sections: MenuSection[]): number {
    let count = 0;
    for (const section of sections) {
      count += this.flattenItems(section.items).length;
    }
    return count;
  }

  /**
   * Get capabilities from a plugin for permission filtering
   */
  private getPluginCapabilities(plugin: LoadedPlugin): string[] {
    const capabilities = plugin.info.capabilities;
    return capabilities.map((c) => c.name);
  }

  /**
   * Format plugin name for display
   */
  private formatPluginLabel(name: string): string {
    // Convert camelCase/snake_case to Title Case
    return name
      .replace(/[-_]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format category name for display
   */
  private formatCategoryLabel(category: string): string {
    return this.formatPluginLabel(category);
  }

  /**
   * Get default icon for integration type
   */
  private getDefaultPluginIcon(integrationType: IntegrationType): string {
    const meta = INTEGRATION_TYPE_METADATA[integrationType];
    return meta ? meta.icon : INTEGRATION_TYPE_METADATA.Info.icon;
  }

  /**
   * Get icon for capability category
   */
  private getCategoryIcon(category: string): string {
    const categoryIcons: Record<string, string> = {
      command: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
      inventory: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
      facts: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      reports: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      catalog: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
      config: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
      hiera: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
    };

    const normalizedCategory = category.toLowerCase();
    const icon = categoryIcons[normalizedCategory];
    return icon ? icon : INTEGRATION_TYPE_METADATA.Info.icon;
  }

  /**
   * Get priority for integration type
   */
  private getIntegrationPriority(integrationType: IntegrationType): number {
    const meta = INTEGRATION_TYPE_METADATA[integrationType];
    return meta ? meta.priority : 0;
  }

  /**
   * Get priority for capability category
   */
  private getCategoryPriority(category: string): number {
    const categoryPriorities: Record<string, number> = {
      command: 100,
      task: 90,
      inventory: 80,
      facts: 70,
      reports: 60,
      catalog: 50,
      config: 40,
      hiera: 30,
    };

    return categoryPriorities[category.toLowerCase()] ?? 0;
  }

  /**
   * Emit an event to subscribers
   */
  private emit(event: MenuBuilderEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[MenuBuilder] Event handler error:", err);
      }
    }
  }

  /**
   * Log a message with the component context
   */
  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (level === "error") {
      logger.error("MenuBuilder", "navigation", message, undefined, data);
    } else {
      logger[level]("MenuBuilder", "navigation", message, data);
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let menuBuilderInstance: MenuBuilder | null = null;

/**
 * Get the singleton MenuBuilder instance
 */
export function getMenuBuilder(
  config?: Partial<MenuBuilderConfig>
): MenuBuilder {
  menuBuilderInstance ??= new MenuBuilder(config);
  return menuBuilderInstance;
}

/**
 * Reset the MenuBuilder instance (for testing)
 */
export function resetMenuBuilder(): void {
  if (menuBuilderInstance) {
    menuBuilderInstance.destroy();
    menuBuilderInstance = null;
  }
}

// =============================================================================
// Reactive Helpers
// =============================================================================

/**
 * Reactive helper to get the current menu
 *
 * @returns Reactive state accessor for the menu
 */
export function useMenu(): { readonly value: Menu | null } {
  const builder = getMenuBuilder();
  return {
    get value(): Menu | null {
      return builder.menu;
    },
  };
}

/**
 * Reactive helper to get a specific menu section
 *
 * @param sectionId - Section ID to retrieve
 * @returns Reactive state accessor for the section
 */
export function useMenuSection(
  sectionId: string
): { readonly value: MenuSection | undefined } {
  const builder = getMenuBuilder();
  return {
    get value(): MenuSection | undefined {
      return builder.getSection(sectionId);
    },
  };
}

/**
 * Reactive helper to check if menu is currently building
 *
 * @returns Reactive state accessor for building state
 */
export function useMenuIsBuilding(): { readonly value: boolean } {
  const builder = getMenuBuilder();
  return {
    get value(): boolean {
      return builder.isBuilding;
    },
  };
}

// Export the class for direct instantiation if needed
export { MenuBuilder };
