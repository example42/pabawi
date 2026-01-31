/**
 * Widget Registry
 *
 * Centralized registry for plugin widgets with reactive state management.
 * Provides permission-aware widget retrieval and slot-based filtering.
 *
 * Features:
 * - Reactive widget state using Svelte 5 runes
 * - Permission-based widget filtering
 * - Slot-based widget retrieval
 * - Widget priority ordering
 * - Plugin-scoped widget access
 * - Event subscription for widget lifecycle
 *
 * @module lib/plugins/WidgetRegistry
 * @version 1.0.0
 */

import type { Component } from "svelte";
import { logger } from "../logger.svelte";
import type {
  LoadedWidget,
  LoadedPlugin,
  WidgetSlot,
  WidgetSize,
  PluginEvent,
} from "./types";
import { getPluginLoader } from "./PluginLoader";

// =============================================================================
// Types
// =============================================================================

/**
 * Widget filter options
 */
export interface WidgetFilterOptions {
  /** Filter by slot */
  slot?: WidgetSlot;
  /** Filter by plugin name */
  pluginName?: string;
  /** Filter by widget size */
  size?: WidgetSize;
  /** User capabilities for permission filtering */
  userCapabilities?: string[];
  /** Only include widgets with loaded components */
  loadedOnly?: boolean;
  /** Filter by required capability pattern (glob-like) */
  capabilityPattern?: string;
  /** Filter by tags (if available in config) */
  tags?: string[];
}

/**
 * Widget sort options
 */
export interface WidgetSortOptions {
  /** Sort field */
  by: "priority" | "name" | "pluginName";
  /** Sort direction */
  direction: "asc" | "desc";
}

/**
 * Widget registry state
 */
interface WidgetRegistryState {
  /** All registered widgets indexed by ID */
  widgets: Map<string, LoadedWidget>;
  /** Widgets grouped by slot */
  widgetsBySlot: Map<WidgetSlot, Set<string>>;
  /** Widgets grouped by plugin */
  widgetsByPlugin: Map<string, Set<string>>;
  /** Loading state */
  loading: boolean;
  /** Last refresh timestamp */
  lastRefresh: Date | null;
  /** Error message if refresh failed */
  error: string | null;
}

/**
 * Widget registry event types
 */
export type WidgetRegistryEvent =
  | { type: "widget:registered"; widgetId: string; widget: LoadedWidget }
  | { type: "widget:unregistered"; widgetId: string }
  | { type: "widget:updated"; widgetId: string; widget: LoadedWidget }
  | { type: "registry:refreshed"; widgetCount: number }
  | { type: "registry:cleared" }
  | { type: "registry:error"; error: string };

/**
 * Widget registry event handler
 */
export type WidgetRegistryEventHandler = (event: WidgetRegistryEvent) => void;

// =============================================================================
// Widget Registry Class
// =============================================================================

/**
 * Centralized Widget Registry
 *
 * Manages all plugin widgets with reactive state and permission-aware filtering.
 *
 * @example
 * ```typescript
 * const registry = getWidgetRegistry();
 *
 * // Refresh from plugin loader
 * await registry.refresh();
 *
 * // Get widgets for a slot
 * const dashboardWidgets = registry.getWidgetsForSlot('dashboard', userCapabilities);
 *
 * // Get widget by ID
 * const widget = registry.getWidget('bolt:command-executor');
 * ```
 */
class WidgetRegistry {
  // Reactive state using Svelte 5 runes
  private _state = $state<WidgetRegistryState>({
    widgets: new Map(),
    widgetsBySlot: new Map(),
    widgetsByPlugin: new Map(),
    loading: false,
    lastRefresh: null,
    error: null,
  });

  private eventHandlers = new Set<WidgetRegistryEventHandler>();
  private pluginLoaderUnsubscribe: (() => void) | null = null;

  constructor() {
    this.subscribeToPluginLoader();
  }

  // ===========================================================================
  // Reactive Getters
  // ===========================================================================

  /**
   * Get all widgets as an array
   */
  get widgets(): LoadedWidget[] {
    return Array.from(this._state.widgets.values());
  }

  /**
   * Get widget count
   */
  get widgetCount(): number {
    return this._state.widgets.size;
  }

  /**
   * Get loading state
   */
  get loading(): boolean {
    return this._state.loading;
  }

  /**
   * Get last refresh timestamp
   */
  get lastRefresh(): Date | null {
    return this._state.lastRefresh;
  }

  /**
   * Get error state
   */
  get error(): string | null {
    return this._state.error;
  }

  /**
   * Get all available slots that have widgets
   */
  get availableSlots(): WidgetSlot[] {
    return Array.from(this._state.widgetsBySlot.keys());
  }

  /**
   * Get all plugins that have registered widgets
   */
  get pluginsWithWidgets(): string[] {
    return Array.from(this._state.widgetsByPlugin.keys());
  }

  // ===========================================================================
  // Widget Retrieval
  // ===========================================================================

  /**
   * Get a widget by ID
   */
  getWidget(widgetId: string): LoadedWidget | undefined {
    return this._state.widgets.get(widgetId);
  }

  /**
   * Get widgets for a specific slot with permission filtering
   */
  getWidgetsForSlot(slot: WidgetSlot, userCapabilities?: string[]): LoadedWidget[] {
    const widgetIds = this._state.widgetsBySlot.get(slot);
    if (!widgetIds) {
      return [];
    }

    const widgets: LoadedWidget[] = [];
    for (const id of widgetIds) {
      const widget = this._state.widgets.get(id);
      if (!widget) continue;

      // Permission check
      if (userCapabilities && widget.requiredCapabilities.length > 0) {
        const hasPermission = widget.requiredCapabilities.every((cap) =>
          this.matchCapability(cap, userCapabilities)
        );
        if (!hasPermission) continue;
      }

      widgets.push(widget);
    }

    // Sort by priority (higher first)
    return widgets.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get widgets for a plugin
   */
  getWidgetsForPlugin(pluginName: string): LoadedWidget[] {
    const widgetIds = this._state.widgetsByPlugin.get(pluginName);
    if (!widgetIds) {
      return [];
    }

    const widgets: LoadedWidget[] = [];
    for (const id of widgetIds) {
      const widget = this._state.widgets.get(id);
      if (widget) {
        widgets.push(widget);
      }
    }

    return widgets.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get widgets with advanced filtering
   */
  getWidgets(options: WidgetFilterOptions = {}): LoadedWidget[] {
    let widgets = Array.from(this._state.widgets.values());

    // Filter by slot
    if (options.slot) {
      const slot = options.slot;
      widgets = widgets.filter((w) => w.slots.includes(slot));
    }

    // Filter by plugin
    if (options.pluginName) {
      widgets = widgets.filter((w) => w.pluginName === options.pluginName);
    }

    // Filter by size
    if (options.size) {
      widgets = widgets.filter((w) => w.size === options.size);
    }

    // Filter by loaded state
    if (options.loadedOnly) {
      widgets = widgets.filter((w) => w.loadState === "loaded" && w.componentRef !== null);
    }

    // Filter by user capabilities
    if (options.userCapabilities) {
      const caps = options.userCapabilities;
      widgets = widgets.filter((w) => {
        if (w.requiredCapabilities.length === 0) return true;
        return w.requiredCapabilities.every((cap) =>
          this.matchCapability(cap, caps)
        );
      });
    }

    // Filter by capability pattern
    if (options.capabilityPattern) {
      const pattern = this.globToRegex(options.capabilityPattern);
      widgets = widgets.filter((w) =>
        w.requiredCapabilities.some((cap) => pattern.test(cap))
      );
    }

    // Sort by priority (higher first)
    return widgets.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get widgets sorted by specified criteria
   */
  getWidgetsSorted(
    options: WidgetFilterOptions = {},
    sort: WidgetSortOptions = { by: "priority", direction: "desc" }
  ): LoadedWidget[] {
    const widgets = this.getWidgets(options);

    return widgets.sort((a, b) => {
      let comparison = 0;

      switch (sort.by) {
        case "priority":
          comparison = (a.priority ?? 0) - (b.priority ?? 0);
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "pluginName":
          comparison = a.pluginName.localeCompare(b.pluginName);
          break;
      }

      return sort.direction === "desc" ? -comparison : comparison;
    });
  }

  /**
   * Check if user has permission to view a widget
   */
  canViewWidget(widgetId: string, userCapabilities: string[]): boolean {
    const widget = this._state.widgets.get(widgetId);
    if (!widget) return false;

    if (widget.requiredCapabilities.length === 0) return true;

    return widget.requiredCapabilities.every((cap) =>
      this.matchCapability(cap, userCapabilities)
    );
  }

  /**
   * Get widget component (delegates to plugin loader for lazy loading)
   */
  async getWidgetComponent(widgetId: string): Promise<Component | null> {
    const loader = getPluginLoader();
    return loader.loadWidgetComponent(widgetId);
  }

  // ===========================================================================
  // Widget Registration
  // ===========================================================================

  /**
   * Register a widget
   */
  registerWidget(widget: LoadedWidget): void {
    const existingWidget = this._state.widgets.get(widget.id);

    // Update the main widgets map
    this._state.widgets.set(widget.id, widget);

    // Update slot index
    for (const slot of widget.slots) {
      if (!this._state.widgetsBySlot.has(slot)) {
        this._state.widgetsBySlot.set(slot, new Set());
      }
      const slotSet = this._state.widgetsBySlot.get(slot);
      if (slotSet) {
        slotSet.add(widget.id);
      }
    }

    // Update plugin index
    if (!this._state.widgetsByPlugin.has(widget.pluginName)) {
      this._state.widgetsByPlugin.set(widget.pluginName, new Set());
    }
    const pluginSet = this._state.widgetsByPlugin.get(widget.pluginName);
    if (pluginSet) {
      pluginSet.add(widget.id);
    }

    // Emit event
    if (existingWidget) {
      this.emit({ type: "widget:updated", widgetId: widget.id, widget });
    } else {
      this.emit({ type: "widget:registered", widgetId: widget.id, widget });
    }

    this.log("debug", `Registered widget: ${widget.id}`, {
      slots: widget.slots,
      plugin: widget.pluginName,
    });
  }

  /**
   * Unregister a widget
   */
  unregisterWidget(widgetId: string): boolean {
    const widget = this._state.widgets.get(widgetId);
    if (!widget) return false;

    // Remove from main map
    this._state.widgets.delete(widgetId);

    // Remove from slot index
    for (const slot of widget.slots) {
      this._state.widgetsBySlot.get(slot)?.delete(widgetId);
      // Clean up empty sets
      if (this._state.widgetsBySlot.get(slot)?.size === 0) {
        this._state.widgetsBySlot.delete(slot);
      }
    }

    // Remove from plugin index
    this._state.widgetsByPlugin.get(widget.pluginName)?.delete(widgetId);
    if (this._state.widgetsByPlugin.get(widget.pluginName)?.size === 0) {
      this._state.widgetsByPlugin.delete(widget.pluginName);
    }

    this.emit({ type: "widget:unregistered", widgetId });
    this.log("debug", `Unregistered widget: ${widgetId}`);

    return true;
  }

  /**
   * Register all widgets from a loaded plugin
   */
  registerPluginWidgets(plugin: LoadedPlugin): void {
    for (const widget of plugin.widgets) {
      this.registerWidget(widget);
    }
  }

  /**
   * Unregister all widgets from a plugin
   */
  unregisterPluginWidgets(pluginName: string): void {
    const widgetIds = this._state.widgetsByPlugin.get(pluginName);
    if (!widgetIds) return;

    // Create a copy since we're modifying the set
    for (const widgetId of Array.from(widgetIds)) {
      this.unregisterWidget(widgetId);
    }
  }

  // ===========================================================================
  // Refresh & Sync
  // ===========================================================================

  /**
   * Refresh widgets from the plugin loader
   */
  refresh(): void {
    this._state.loading = true;
    this._state.error = null;

    try {
      const loader = getPluginLoader();
      const plugins = loader.getAllPlugins();

      // Clear existing widgets
      this.clear();

      // Register widgets from all loaded plugins
      for (const plugin of plugins) {
        if (plugin.loadState === "loaded" || plugin.loadState === "partial") {
          this.registerPluginWidgets(plugin);
        }
      }

      this._state.lastRefresh = new Date();
      this.emit({ type: "registry:refreshed", widgetCount: this._state.widgets.size });
      this.log("info", `Widget registry refreshed: ${String(this._state.widgets.size)} widgets`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this._state.error = errorMessage;
      this.emit({ type: "registry:error", error: errorMessage });
      this.log("error", "Failed to refresh widget registry", { error: errorMessage });
    } finally {
      this._state.loading = false;
    }
  }

  /**
   * Clear all registered widgets
   */
  clear(): void {
    this._state.widgets.clear();
    this._state.widgetsBySlot.clear();
    this._state.widgetsByPlugin.clear();
    this._state.lastRefresh = null;
    this._state.error = null;

    this.emit({ type: "registry:cleared" });
    this.log("debug", "Widget registry cleared");
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Subscribe to registry events
   */
  subscribe(handler: WidgetRegistryEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: WidgetRegistryEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.log("warn", "Event handler error", {
          eventType: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  // ===========================================================================
  // Plugin Loader Integration
  // ===========================================================================

  /**
   * Subscribe to plugin loader events for auto-sync
   */
  private subscribeToPluginLoader(): void {
    try {
      const loader = getPluginLoader();
      this.pluginLoaderUnsubscribe = loader.subscribe(this.handlePluginEvent.bind(this));
    } catch {
      // Plugin loader may not be initialized yet
      this.log("debug", "Plugin loader not ready, will sync manually");
    }
  }

  /**
   * Handle plugin loader events
   */
  private handlePluginEvent(event: PluginEvent): void {
    switch (event.type) {
      case "plugin:loaded": {
        this.registerPluginWidgets(event.plugin);
        break;
      }
      case "plugin:unloaded": {
        this.unregisterPluginWidgets(event.pluginName);
        break;
      }
      case "widget:loaded": {
        // Widget component was loaded, update the registry
        const widget = this._state.widgets.get(event.widgetId);
        if (widget) {
          const loader = getPluginLoader();
          const component = loader.getWidgetComponent(event.widgetId);
          if (component) {
            const updatedWidget: LoadedWidget = {
              ...widget,
              componentRef: component,
              loadState: "loaded",
            };
            this.registerWidget(updatedWidget);
          }
        }
        break;
      }
      case "widget:error": {
        const widget = this._state.widgets.get(event.widgetId);
        if (widget) {
          const updatedWidget: LoadedWidget = {
            ...widget,
            loadState: "error",
            error: event.error,
          };
          this.registerWidget(updatedWidget);
        }
        break;
      }
    }
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    if (this.pluginLoaderUnsubscribe) {
      this.pluginLoaderUnsubscribe();
      this.pluginLoaderUnsubscribe = null;
    }
    this.eventHandlers.clear();
    this.clear();
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Match a capability against user capabilities
   * Supports wildcard patterns (e.g., "bolt.*" matches "bolt.command", "bolt.task")
   */
  private matchCapability(required: string, userCapabilities: string[]): boolean {
    // Direct match
    if (userCapabilities.includes(required)) {
      return true;
    }

    // Wildcard match - user has broader permission
    for (const cap of userCapabilities) {
      if (cap === "*") return true;
      if (cap.endsWith(".*")) {
        const prefix = cap.slice(0, -2);
        if (required.startsWith(prefix + ".") || required === prefix) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Log helper
   */
  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>
  ): void {
    const component = "WidgetRegistry";
    const operation = "registry";
    switch (level) {
      case "debug":
        logger.debug(component, operation, message, data);
        break;
      case "info":
        logger.info(component, operation, message, data);
        break;
      case "warn":
        logger.warn(component, operation, message, data);
        break;
      case "error":
        logger.error(component, operation, message, undefined, data);
        break;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let registryInstance: WidgetRegistry | null = null;

/**
 * Get the singleton widget registry instance
 */
export function getWidgetRegistry(): WidgetRegistry {
  registryInstance ??= new WidgetRegistry();
  return registryInstance;
}

/**
 * Reset the widget registry (for testing)
 */
export function resetWidgetRegistry(): void {
  if (registryInstance) {
    registryInstance.destroy();
    registryInstance = null;
  }
}

// =============================================================================
// Svelte 5 Reactive Helpers
// =============================================================================

/**
 * Create a reactive widget list for a slot
 *
 * @example
 * ```svelte
 * <script>
 *   import { useSlotWidgets } from '$lib/plugins/WidgetRegistry.svelte';
 *   const widgets = useSlotWidgets('dashboard', () => userCapabilities);
 * </script>
 *
 * {#each widgets as widget}
 *   <WidgetSlot {widget} />
 * {/each}
 * ```
 */
export function useSlotWidgets(
  slot: WidgetSlot,
  getUserCapabilities?: () => string[]
): LoadedWidget[] {
  const registry = getWidgetRegistry();

  // This will be reactive when used in a Svelte component context
  const capabilities = getUserCapabilities?.() ?? [];
  return registry.getWidgetsForSlot(slot, capabilities);
}

/**
 * Create a reactive widget list for a plugin
 */
export function usePluginWidgets(pluginName: string): LoadedWidget[] {
  const registry = getWidgetRegistry();
  return registry.getWidgetsForPlugin(pluginName);
}

/**
 * Create a reactive widget by ID
 */
export function useWidget(widgetId: string): LoadedWidget | undefined {
  const registry = getWidgetRegistry();
  return registry.getWidget(widgetId);
}

// =============================================================================
// Exports
// =============================================================================

export { WidgetRegistry };
export type { WidgetRegistryState };
