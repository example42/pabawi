/**
 * Pabawi Plugin System
 *
 * This module provides the plugin infrastructure for Pabawi:
 * - Plugin SDK for widget development
 * - Plugin context provider for dependency injection
 * - Plugin widget loader for dynamic rendering
 *
 * @module frontend/src/lib/plugins
 * @version 1.0.0
 */

// SDK exports
export {
  PLUGIN_CONTEXT_KEY,
  getPluginContext,
  setPluginContext,
  type PluginContext,
  type PluginUIComponents,
  type PluginApiClient,
  type PluginRouter,
  type PluginToast,
  type PluginDebug,
  type PluginExecutionStream,
  type ExecutionStream,
  type ExecutionStreamState,
  type LoadingSpinnerProps,
  type ErrorAlertProps,
  type StatusBadgeProps,
  type RealtimeOutputViewerProps,
  type TaskParameterFormProps,
  type TaskParameter,
  type ApiRequestOptions,
  type ToastOptions,
} from './sdk/index.js';

// Context provider
export { default as PluginContextProvider } from './PluginContextProvider.svelte';

// Widget slot for rendering plugin widgets
export { default as WidgetSlot } from './WidgetSlot.svelte';

// Plugin loader
export { PluginLoader, getPluginLoader, resetPluginLoader } from './PluginLoader.js';

// Types
export type {
  WidgetSlot as WidgetSlotType,
  WidgetSize,
  PluginWidget,
  LoadedWidget,
  WidgetLoadState,
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
} from './types.js';

export { IntegrationType, DEFAULT_PLUGIN_LOADER_CONFIG } from './types.js';
