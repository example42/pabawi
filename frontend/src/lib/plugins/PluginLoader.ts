/**
 * Frontend Plugin Loader
 *
 * Responsible for:
 * - Fetching plugin metadata from the backend API
 * - Dynamically importing plugin frontend bundles
 * - Loading and validating widget components
 * - Managing plugin lifecycle (load, reload, unload)
 * - Caching plugin metadata and components
 * - Error handling and retry logic
 *
 * @module lib/plugins/PluginLoader
 * @version 1.0.0
 */

import type { Component } from "svelte";
import { logger } from "../logger.svelte";
import type {
  PluginInfo,
  PluginWidget,
  LoadedPlugin,
  LoadedWidget,
  PluginFrontendModule,
  PluginLoaderConfig,
  PluginValidationResult,
  WidgetValidationResult,
  PluginEvent,
  PluginEventHandler,
  WidgetSlot,
} from "./types";
import { DEFAULT_PLUGIN_LOADER_CONFIG } from "./types";
import { hasLocalWidget, loadLocalWidgetComponent } from "./WidgetBridge";

/**
 * Plugin Loader class
 *
 * Manages the loading and lifecycle of frontend plugins.
 * Supports lazy loading, caching, and graceful error handling.
 */
export class PluginLoader {
  private config: PluginLoaderConfig;
  private plugins: Map<string, LoadedPlugin> = new Map();
  private widgetComponents: Map<string, Component> = new Map();
  private pluginModules: Map<string, PluginFrontendModule> = new Map();
  private metadataCache: Map<string, { data: PluginInfo; timestamp: number }> = new Map();
  private eventHandlers: Set<PluginEventHandler> = new Set();
  private loadingPromises: Map<string, Promise<LoadedPlugin | null>> = new Map();

  constructor(config: Partial<PluginLoaderConfig> = {}) {
    this.config = { ...DEFAULT_PLUGIN_LOADER_CONFIG, ...config };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Load all available plugins from the backend
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    this.log("debug", "Loading all plugins");

    try {
      const pluginInfos = await this.fetchPluginList();
      const loadPromises = pluginInfos.map((info) => this.loadPlugin(info.metadata.name));
      const results = await Promise.allSettled(loadPromises);

      const loaded: LoadedPlugin[] = [];
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          loaded.push(result.value);
        }
      }

      this.log("info", `Loaded ${loaded.length}/${pluginInfos.length} plugins`);
      return loaded;
    } catch (error) {
      this.log("error", "Failed to load plugins", { error: this.errorMessage(error) });
      throw error;
    }
  }

  /**
   * Load a specific plugin by name
   */
  async loadPlugin(pluginName: string): Promise<LoadedPlugin | null> {
    // Check if already loaded
    const existing = this.plugins.get(pluginName);
    if (existing && existing.loadState === "loaded") {
      return existing;
    }

    // Check if currently loading (dedup concurrent requests)
    const loadingPromise = this.loadingPromises.get(pluginName);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading
    const promise = this.doLoadPlugin(pluginName);
    this.loadingPromises.set(pluginName, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.loadingPromises.delete(pluginName);
    }
  }

  /**
   * Reload a plugin (fetch fresh metadata and reload widgets)
   */
  async reloadPlugin(pluginName: string): Promise<LoadedPlugin | null> {
    this.log("debug", `Reloading plugin: ${pluginName}`);

    // Clear caches
    this.metadataCache.delete(pluginName);
    this.pluginModules.delete(pluginName);

    // Clear widget components for this plugin
    const existing = this.plugins.get(pluginName);
    if (existing) {
      for (const widget of existing.widgets) {
        this.widgetComponents.delete(widget.id);
      }
    }

    this.plugins.delete(pluginName);
    this.emit({ type: "plugin:unloaded", pluginName });

    return this.loadPlugin(pluginName);
  }

  /**
   * Unload a plugin
   */
  unloadPlugin(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    // Call cleanup if available
    const module = this.pluginModules.get(pluginName);
    if (module?.cleanup) {
      try {
        module.cleanup();
      } catch (error) {
        this.log("warn", `Cleanup error for plugin ${pluginName}`, {
          error: this.errorMessage(error),
        });
      }
    }

    // Clear widget components
    for (const widget of plugin.widgets) {
      this.widgetComponents.delete(widget.id);
    }

    this.plugins.delete(pluginName);
    this.pluginModules.delete(pluginName);
    this.metadataCache.delete(pluginName);

    this.emit({ type: "plugin:unloaded", pluginName });
    this.log("debug", `Unloaded plugin: ${pluginName}`);

    return true;
  }

  /**
   * Get a loaded plugin by name
   */
  getPlugin(pluginName: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get widgets for a specific slot
   */
  getWidgetsForSlot(slot: WidgetSlot, userCapabilities?: string[]): LoadedWidget[] {
    const widgets: LoadedWidget[] = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.loadState !== "loaded" && plugin.loadState !== "partial") {
        continue;
      }

      for (const widget of plugin.widgets) {
        if (!widget.slots.includes(slot)) {
          continue;
        }

        // Check permissions if userCapabilities provided
        if (userCapabilities && widget.requiredCapabilities.length > 0) {
          const hasPermission = widget.requiredCapabilities.every((cap) =>
            userCapabilities.includes(cap)
          );
          if (!hasPermission) {
            continue;
          }
        }

        widgets.push(widget);
      }
    }

    // Sort by priority (higher first)
    return widgets.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get a specific widget component
   */
  getWidgetComponent(widgetId: string): Component | null {
    return this.widgetComponents.get(widgetId) ?? null;
  }

  /**
   * Lazy load a widget component
   */
  async loadWidgetComponent(widgetId: string): Promise<Component | null> {
    // Check cache first
    const cached = this.widgetComponents.get(widgetId);
    if (cached) {
      return cached;
    }

    // First, try local widget manifest (works even if backend plugin not registered)
    if (hasLocalWidget(widgetId)) {
      try {
        const component = await loadLocalWidgetComponent(widgetId);
        if (component) {
          this.widgetComponents.set(widgetId, component);
          this.emit({ type: "widget:loaded", widgetId });
          return component;
        }
      } catch (error) {
        this.log("warn", `Failed to load widget from local manifest: ${widgetId}`, {
          error: this.errorMessage(error),
        });
      }
    }

    // Find the widget in loaded plugins
    let targetWidget: LoadedWidget | undefined;
    let targetPlugin: LoadedPlugin | undefined;

    for (const plugin of this.plugins.values()) {
      const widget = plugin.widgets.find((w) => w.id === widgetId);
      if (widget) {
        targetWidget = widget;
        targetPlugin = plugin;
        break;
      }
    }

    if (!targetWidget || !targetPlugin) {
      this.log("warn", `Widget not found: ${widgetId}`);
      return null;
    }

    // Load the component
    return this.loadWidgetComponentInternal(targetWidget, targetPlugin.info);
  }

  /**
   * Subscribe to plugin events
   */
  subscribe(handler: PluginEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Validate a plugin's widget definitions
   */
  validatePlugin(info: PluginInfo): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const widgetResults: Record<string, WidgetValidationResult> = {};

    // Validate metadata
    if (!info.metadata.name) {
      errors.push("Plugin name is required");
    }
    if (!info.metadata.version) {
      errors.push("Plugin version is required");
    }
    if (!info.metadata.author) {
      warnings.push("Plugin author is recommended");
    }

    // Validate widgets
    for (const widget of info.widgets) {
      widgetResults[widget.id] = this.validateWidget(widget, info.metadata.name);
      if (!widgetResults[widget.id].valid) {
        errors.push(`Widget ${widget.id} has validation errors`);
      }
    }

    return {
      valid: errors.length === 0,
      pluginName: info.metadata.name,
      errors,
      warnings,
      widgetResults,
    };
  }

  /**
   * Clear all caches and loaded plugins
   */
  clearAll(): void {
    // Call cleanup on all modules
    for (const [name, module] of this.pluginModules) {
      if (module.cleanup) {
        try {
          module.cleanup();
        } catch (error) {
          this.log("warn", `Cleanup error for plugin ${name}`, {
            error: this.errorMessage(error),
          });
        }
      }
    }

    this.plugins.clear();
    this.widgetComponents.clear();
    this.pluginModules.clear();
    this.metadataCache.clear();
    this.loadingPromises.clear();

    this.log("debug", "Cleared all plugin caches");
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Internal plugin loading implementation
   */
  private async doLoadPlugin(pluginName: string): Promise<LoadedPlugin | null> {
    this.emit({ type: "plugin:loading", pluginName });
    this.log("debug", `Loading plugin: ${pluginName}`);

    try {
      // Fetch plugin info
      const info = await this.fetchPluginInfo(pluginName);
      if (!info) {
        throw new Error(`Plugin not found: ${pluginName}`);
      }

      // Validate plugin
      const validation = this.validatePlugin(info);
      if (!validation.valid) {
        this.log("warn", `Plugin validation warnings for ${pluginName}`, {
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      // Create LoadedPlugin structure
      const loadedPlugin: LoadedPlugin = {
        info,
        widgets: [],
        loadState: "loading",
        loadedAt: new Date(),
      };

      // Load plugin module if frontend entry point exists
      if (info.metadata.frontendEntryPoint) {
        await this.loadPluginModule(pluginName, info.metadata.frontendEntryPoint);
      }

      // Load widgets
      const widgetPromises = info.widgets.map((widget) =>
        this.createLoadedWidget(widget, info)
      );
      loadedPlugin.widgets = await Promise.all(widgetPromises);

      // Determine final load state
      const hasErrors = loadedPlugin.widgets.some((w) => w.loadState === "error");
      const allLoaded = loadedPlugin.widgets.every((w) => w.loadState === "loaded");

      if (hasErrors && !allLoaded) {
        loadedPlugin.loadState = "partial";
      } else if (allLoaded) {
        loadedPlugin.loadState = "loaded";
      } else {
        loadedPlugin.loadState = "partial";
      }

      this.plugins.set(pluginName, loadedPlugin);
      this.emit({ type: "plugin:loaded", pluginName, plugin: loadedPlugin });
      this.log("info", `Plugin loaded: ${pluginName}`, { state: loadedPlugin.loadState });

      return loadedPlugin;
    } catch (error) {
      const errorMsg = this.errorMessage(error);
      this.log("error", `Failed to load plugin: ${pluginName}`, { error: errorMsg });

      const failedPlugin: LoadedPlugin = {
        info: {
          metadata: {
            name: pluginName,
            version: "unknown",
            author: "unknown",
            description: "Failed to load",
            integrationType: "Info" as any,
          },
          enabled: false,
          healthy: false,
          widgets: [],
          capabilities: [],
          priority: 0,
        },
        widgets: [],
        loadState: "error",
        error: errorMsg,
        loadedAt: new Date(),
      };

      this.plugins.set(pluginName, failedPlugin);
      this.emit({ type: "plugin:error", pluginName, error: errorMsg });

      return null;
    }
  }

  /**
   * Fetch list of available plugins from API
   */
  private async fetchPluginList(): Promise<PluginInfo[]> {
    const response = await fetch(`${this.config.apiBaseUrl}/plugins`);

    if (!response.ok) {
      throw new Error(`Failed to fetch plugin list: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON response but got ${contentType || 'unknown type'}. Response: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.plugins ?? [];
  }

  /**
   * Fetch plugin info from API with caching
   */
  private async fetchPluginInfo(pluginName: string): Promise<PluginInfo | null> {
    // Check cache
    const cached = this.metadataCache.get(pluginName);
    if (cached && Date.now() - cached.timestamp < this.config.metadataCacheTTL) {
      return cached.data;
    }

    const response = await fetch(`${this.config.apiBaseUrl}/plugins/${pluginName}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch plugin info: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON response but got ${contentType || 'unknown type'}. Response: ${text.substring(0, 200)}`);
    }

    const data: PluginInfo = await response.json();

    // Cache the result
    this.metadataCache.set(pluginName, { data, timestamp: Date.now() });

    return data;
  }

  /**
   * Load plugin frontend module
   */
  private async loadPluginModule(
    pluginName: string,
    entryPoint: string
  ): Promise<PluginFrontendModule | null> {
    // Check if already loaded
    const existing = this.pluginModules.get(pluginName);
    if (existing) {
      return existing;
    }

    try {
      const modulePath = `${this.config.assetsBaseUrl}/${pluginName}/${entryPoint}`;
      const module = await import(/* @vite-ignore */ modulePath);

      const frontendModule: PluginFrontendModule = {
        components: module.components ?? module.default?.components,
        initialize: module.initialize ?? module.default?.initialize,
        cleanup: module.cleanup ?? module.default?.cleanup,
        stores: module.stores ?? module.default?.stores,
      };

      // Call initialize if available
      if (frontendModule.initialize) {
        await frontendModule.initialize();
      }

      this.pluginModules.set(pluginName, frontendModule);
      this.log("debug", `Loaded plugin module: ${pluginName}`);

      return frontendModule;
    } catch (error) {
      this.log("warn", `Failed to load plugin module: ${pluginName}`, {
        error: this.errorMessage(error),
      });
      return null;
    }
  }

  /**
   * Create a LoadedWidget from PluginWidget definition
   */
  private async createLoadedWidget(
    widget: PluginWidget,
    pluginInfo: PluginInfo
  ): Promise<LoadedWidget> {
    const loadedWidget: LoadedWidget = {
      ...widget,
      pluginName: pluginInfo.metadata.name,
      componentRef: null,
      loadState: "pending",
    };

    // Load component immediately if not using lazy loading
    if (!this.config.lazyLoadWidgets) {
      const component = await this.loadWidgetComponentInternal(loadedWidget, pluginInfo);
      loadedWidget.componentRef = component;
      loadedWidget.loadState = component ? "loaded" : "error";
      if (!component) {
        loadedWidget.error = "Failed to load widget component";
      }
    }

    return loadedWidget;
  }

  /**
   * Load a widget's Svelte component
   */
  private async loadWidgetComponentInternal(
    widget: LoadedWidget,
    _pluginInfo: PluginInfo
  ): Promise<Component | null> {
    const widgetId = widget.id;
    this.emit({ type: "widget:loading", widgetId });

    // Check cache
    const cached = this.widgetComponents.get(widgetId);
    if (cached) {
      this.emit({ type: "widget:loaded", widgetId });
      return cached;
    }

    // First, try to load from local widget manifest (frontend/src/widgets/)
    if (hasLocalWidget(widgetId)) {
      try {
        const component = await loadLocalWidgetComponent(widgetId);
        if (component) {
          this.widgetComponents.set(widgetId, component);
          this.emit({ type: "widget:loaded", widgetId });
          this.log("debug", `Loaded widget from local manifest: ${widgetId}`);
          return component;
        }
      } catch (error) {
        this.log("warn", `Failed to load widget from local manifest: ${widgetId}`, {
          error: this.errorMessage(error),
        });
        // Fall through to try other loading methods
      }
    }

    // Try to get from plugin module next
    const pluginModule = this.pluginModules.get(widget.pluginName);
    if (pluginModule?.components) {
      const componentName = this.extractComponentName(widget.component);
      const component = pluginModule.components[componentName];
      if (component) {
        this.widgetComponents.set(widgetId, component);
        this.emit({ type: "widget:loaded", widgetId });
        return component;
      }
    }

    // Skip dynamic import fallback - all widgets should be in local manifest or plugin module
    // Dynamic imports from /plugins/ path often fail with HTML responses
    this.log("warn", `Widget not found in local manifest or plugin module: ${widgetId}`);
    this.emit({ type: "widget:error", widgetId, error: "Widget component not available" });
    return null;
  }

  /**
   * Extract component name from path
   */
  private extractComponentName(componentPath: string): string {
    // "./components/CommandExecutor.svelte" -> "CommandExecutor"
    const filename = componentPath.split("/").pop() ?? componentPath;
    return filename.replace(/\.(svelte|ts|js)$/, "");
  }

  /**
   * Validate a widget definition
   */
  private validateWidget(widget: PluginWidget, pluginName: string): WidgetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!widget.id) {
      errors.push("Widget ID is required");
    } else if (!widget.id.includes(":")) {
      warnings.push(`Widget ID should include plugin prefix (e.g., ${pluginName}:${widget.id})`);
    }

    if (!widget.name) {
      errors.push("Widget name is required");
    }

    if (!widget.component) {
      errors.push("Widget component path is required");
    }

    if (!widget.slots || widget.slots.length === 0) {
      errors.push("Widget must specify at least one slot");
    }

    const validSlots: WidgetSlot[] = [
      "dashboard",
      "node-detail",
      "inventory-panel",
      "standalone-page",
      "sidebar",
      "modal",
    ];
    for (const slot of widget.slots) {
      if (!validSlots.includes(slot)) {
        warnings.push(`Unknown slot: ${slot}`);
      }
    }

    if (!widget.size) {
      warnings.push("Widget size not specified, defaulting to 'medium'");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: PluginEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.log("error", "Error in plugin event handler", {
          event: event.type,
          error: this.errorMessage(error),
        });
      }
    }
  }

  /**
   * Log helper
   */
  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.config.debug && level === "debug") {
      return;
    }

    const component = "PluginLoader";
    const operation = "loader";

    switch (level) {
      case "debug":
        logger.debug(component, operation, message, context);
        break;
      case "info":
        logger.info(component, operation, message, context);
        break;
      case "warn":
        logger.warn(component, operation, message, context);
        break;
      case "error":
        logger.error(component, operation, message, undefined, context);
        break;
    }
  }

  /**
   * Extract error message
   */
  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let pluginLoaderInstance: PluginLoader | null = null;

/**
 * Get the singleton PluginLoader instance
 */
export function getPluginLoader(config?: Partial<PluginLoaderConfig>): PluginLoader {
  if (!pluginLoaderInstance) {
    pluginLoaderInstance = new PluginLoader(config);
  }
  return pluginLoaderInstance;
}

/**
 * Reset the PluginLoader instance (for testing)
 */
export function resetPluginLoader(): void {
  if (pluginLoaderInstance) {
    pluginLoaderInstance.clearAll();
  }
  pluginLoaderInstance = null;
}
