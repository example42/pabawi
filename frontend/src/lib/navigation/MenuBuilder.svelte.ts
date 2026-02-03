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

import { get as apiGet } from "../api";
import { getAuthStore, type AuthStore } from "../auth.svelte";
import { logger } from "../logger.svelte";
import type { IntegrationType } from "../plugins/types";
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
// Backend Menu Data Types
// =============================================================================

/**
 * Tab definition from backend
 */
interface IntegrationTab {
  id: string;
  label: string;
  capability: string;
  widget?: string;
  icon?: string;
  priority: number;
}

/**
 * Integration menu item from backend
 */
interface IntegrationMenuItem {
  name: string;
  displayName: string;
  description: string;
  color?: string;
  icon?: string;
  enabled: boolean;
  healthy: boolean;
  path: string;
  tabs: IntegrationTab[];
}

/**
 * Integration category from backend
 */
interface IntegrationCategory {
  type: IntegrationType;
  label: string;
  description?: string;
  icon?: string;
  priority: number;
  integrations: IntegrationMenuItem[];
}

/**
 * Legacy route from backend
 */
interface LegacyRoute {
  label: string;
  path: string;
  icon?: string;
}

/**
 * Menu response from backend
 */
interface MenuResponse {
  categories: IntegrationCategory[];
  legacy: LegacyRoute[];
}

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
    showTitle: false, // Don't show title since we have category groups
  },
  {
    id: "legacy",
    title: "Legacy",
    items: [],
    priority: 300,
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

  constructor(config: Partial<MenuBuilderConfig> = {}) {
    this.config = { ...DEFAULT_MENU_BUILDER_CONFIG, ...config };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Fetch integration menu data from backend API
   */
  private async fetchIntegrationMenu(): Promise<void> {
    try {
      const response = await apiGet<MenuResponse>("/api/integrations/menu");

      // Clear existing plugin contributions
      this.pluginContributions.clear();

      // Build contributions from integration menu categories
      for (const category of response.categories) {
        for (const integration of category.integrations) {
          // Create a contribution for each integration
          this.pluginContributions.set(integration.name, {
            pluginName: integration.name,
            displayName: integration.displayName,
            integrationType: category.type,
            items: [
              {
                id: `integration-${integration.name}`,
                type: "link",
                label: integration.displayName,
                path: integration.path,
                icon: integration.icon || category.icon,
                priority: 500 - category.priority, // Higher backend priority = lower frontend priority number
                requiredCapabilities: [], // No capability filtering yet
                badge: integration.enabled && !integration.healthy ? "offline" : undefined,
                metadata: {
                  description: integration.description,
                  color: integration.color,
                  tabCount: integration.tabs.length,
                },
              } as LinkMenuItem,
            ],
            priority: category.priority,
          });
        }
      }

      // Add legacy routes as custom contributions
      for (const legacyRoute of response.legacy) {
        const legacyId = legacyRoute.path.split("/").filter(Boolean).join("-") || "legacy";
        this.customContributions.set(`legacy-${legacyId}`, {
          pluginName: `legacy-${legacyId}`,
          displayName: legacyRoute.label,
          integrationType: "Info" as IntegrationType, // Placeholder type
          items: [
            {
              id: `legacy-${legacyId}`,
              type: "link",
              label: legacyRoute.label,
              path: legacyRoute.path,
              icon: legacyRoute.icon,
              priority: 800, // Between core (1000) and categories (500)
            } as LinkMenuItem,
          ],
          priority: 800,
        });
      }

      this.log("info", `Loaded ${response.categories.length} categories, ${response.legacy.length} legacy routes`);
    } catch (error) {
      this.log("error", `Failed to fetch integration menu: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Initialize the menu builder, fetch integration menu data, and build menu
   *
   * This method:
   * 1. Fetches dynamic integration menu from backend
   * 2. Builds menu with categories, integrations, legacy, and admin sections
   */
  async initialize(): Promise<void> {
    this.log("debug", "Initializing menu builder");
    this.isBuilding = true;

    try {
      // Fetch integration menu data from backend
      this.log("debug", "Fetching integration menu from backend");
      await this.fetchIntegrationMenu();
      this.log("info", "Integration menu data loaded");

      // Build menu with fetched data
      this.rebuild();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize menu";
      this.lastError = message;
      this.log("error", `Menu initialization failed: ${message}`);

      // Still build the menu with core items even if integrations fail
      this.rebuild();
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Destroy the menu builder and cleanup subscriptions
   */
  destroy(): void {
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

      // Build the menu from current contributions
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
   * Build the complete menu structure
   */
  private buildMenu(): Menu {
    // Start with default sections
    const sections: MenuSection[] = this.config.sections.length > 0
      ? structuredClone(this.config.sections)
      : structuredClone(DEFAULT_SECTIONS);

    // Get auth store for permission filtering
    const authStore = getAuthStore();

    // Get core section reference (used for multiple additions)
    const coreSection = sections.find((s) => s.id === "core");

    // Add core items to core section
    if (this.config.includeCoreItems && coreSection) {
      const filteredCore = this.filterItemsByPermission(
        CORE_NAV_ITEMS,
        authStore
      );
      coreSection.items = filteredCore;
    }

    // Add plugin contributions as a single "Integrations" dropdown in core section
    // This creates a vertical menu: Integrations -> Integration Types -> Integrations
    if (this.contributions.size > 0 && coreSection) {
      if (this.config.groupByIntegrationType) {
        // Group by integration type (category-based structure)
        const grouped = this.groupContributionsByType();

        // Build integration type sub-groups
        const integrationTypeGroups: MenuItem[] = [];

        for (const [integrationType, contributions] of grouped) {
          const metadata = this.getIntegrationTypeMetadata(integrationType);

          // Collect all integration link items for this type
          const groupItems: MenuItem[] = [];
          for (const contrib of contributions) {
            // Filter items by permission
            const filteredItems = this.filterItemsByPermission(
              contrib.items,
              authStore
            );
            groupItems.push(...filteredItems);
          }

          if (groupItems.length === 0 && !this.config.showEmptyGroups) {
            continue;
          }

          // Sort items by priority (higher priority first)
          if (this.config.sortByPriority) {
            groupItems.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
          }

          // Create sub-group for this integration type
          const typeGroup: GroupMenuItem = {
            id: `integration-type:${integrationType}`,
            type: "group",
            label: metadata.label,
            icon: metadata.icon,
            children: groupItems,
            collapsed: false, // Expanded within the dropdown
            priority: metadata.priority,
            integrationType: integrationType as IntegrationType,
          };
          integrationTypeGroups.push(typeGroup);
        }

        // Sort integration type groups by priority
        if (this.config.sortByPriority) {
          integrationTypeGroups.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        }

        // Create single "Integrations" dropdown containing all type groups
        if (integrationTypeGroups.length > 0) {
          const integrationsGroup: GroupMenuItem = {
            id: "integrations-main",
            type: "group",
            label: "Integrations",
            icon: "M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z",
            children: integrationTypeGroups,
            collapsed: false,
            priority: 900, // High priority to appear after Home
          };
          coreSection.items.push(integrationsGroup);
        }
      } else {
        // Flat list of all integration items in a single dropdown
        const allItems: MenuItem[] = [];
        for (const contrib of this.contributions.values()) {
          const filteredItems = this.filterItemsByPermission(
            contrib.items,
            authStore
          );
          allItems.push(...filteredItems);
        }

        if (allItems.length > 0) {
          const integrationsGroup: GroupMenuItem = {
            id: "integrations-main",
            type: "group",
            label: "Integrations",
            icon: "M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z",
            children: allItems,
            collapsed: false,
            priority: 900,
          };
          coreSection.items.push(integrationsGroup);
        }
      }
    }

    // Remove the integrations section since we're adding it to core
    const integrationsSectionIndex = sections.findIndex((s) => s.id === "integrations");
    if (integrationsSectionIndex !== -1) {
      sections.splice(integrationsSectionIndex, 1);
    }

    // Add legacy items as a single dropdown group in the core section
    if (coreSection) {
      const legacyItems: MenuItem[] = [];
      for (const [key, contrib] of this.customContributions) {
        if (key.startsWith("legacy-")) {
          const filteredItems = this.filterItemsByPermission(
            contrib.items,
            authStore
          );
          legacyItems.push(...filteredItems);
        }
      }

      // Sort legacy items by priority
      if (this.config.sortByPriority) {
        legacyItems.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      }

      // Create group dropdown for legacy items
      if (legacyItems.length > 0) {
        const legacyGroup: GroupMenuItem = {
          id: "legacy-group",
          type: "group",
          label: "LEGACY",
          icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
          children: legacyItems,
          collapsed: false,
          priority: 300,
        };
        coreSection.items.push(legacyGroup);
      }
    }

    // Remove the legacy section since we're adding it to core
    const legacySectionIndex = sections.findIndex((s) => s.id === "legacy");
    if (legacySectionIndex !== -1) {
      sections.splice(legacySectionIndex, 1);
    }

    // Add admin items as a single dropdown group in the core section
    if (coreSection) {
      const filteredAdmin = this.filterItemsByPermission(
        ADMIN_NAV_ITEMS,
        authStore
      );

      // Create group dropdown for admin items
      if (filteredAdmin.length > 0) {
        const adminGroup: GroupMenuItem = {
          id: "admin-group",
          type: "group",
          label: "ADMINISTRATION",
          icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
          children: filteredAdmin,
          collapsed: false,
          priority: 100,
        };
        coreSection.items.push(adminGroup);
      }
    }

    // Remove the admin section since we're adding it to core
    const adminSectionIndex = sections.findIndex((s) => s.id === "admin");
    if (adminSectionIndex !== -1) {
      sections.splice(adminSectionIndex, 1);
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
