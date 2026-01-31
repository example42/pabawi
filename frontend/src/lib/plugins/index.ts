/**
 * Frontend Plugin System
 *
 * Provides the plugin loading and management infrastructure for the frontend.
 *
 * @module lib/plugins
 * @version 1.0.0
 */

// Types
export type {
  WidgetSlot as WidgetSlotType,
  WidgetSize,
  PluginWidget,
  LoadedWidget,
  WidgetLoadState,
  IntegrationType,
  PluginMetadata,
  PluginCapabilitySummary,
  PluginInfo,
  LoadedPlugin,
  PluginLoadState,
  PluginFrontendModule,
  PluginModuleImport,
  PluginEvent,
  PluginEventHandler,
  PluginLoaderConfig,
  WidgetValidationResult,
  PluginValidationResult,
} from "./types";

export { DEFAULT_PLUGIN_LOADER_CONFIG } from "./types";

// Plugin Loader
export {
  PluginLoader,
  getPluginLoader,
  resetPluginLoader,
} from "./PluginLoader";

// Widget Registry
export type {
  WidgetFilterOptions,
  WidgetSortOptions,
  WidgetRegistryEvent,
  WidgetRegistryEventHandler,
  WidgetRegistryState,
} from "./WidgetRegistry.svelte";

export {
  WidgetRegistry,
  getWidgetRegistry,
  resetWidgetRegistry,
  useSlotWidgets,
  usePluginWidgets,
  useWidget,
} from "./WidgetRegistry.svelte";

// Widget Slot Component
export { default as WidgetSlot } from "./WidgetSlot.svelte";
