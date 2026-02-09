/**
 * Frontend Plugin Types
 *
 * Type definitions for the frontend plugin system.
 * These types mirror the backend plugin types but are tailored
 * for frontend usage, including widget rendering and permission checks.
 *
 * @module lib/plugins/types
 * @version 1.0.0
 */

import type { Component } from "svelte";

// =============================================================================
// Widget Types
// =============================================================================

/**
 * Slot where a widget can be rendered
 */
export type WidgetSlot =
  | "dashboard"
  | "node-detail"
  | "inventory-panel"
  | "standalone-page"
  | "sidebar"
  | "modal";

/**
 * Widget size hint for layout
 */
export type WidgetSize = "small" | "medium" | "large" | "full";

/**
 * Widget definition from plugin metadata
 */
export interface PluginWidget {
  /** Unique widget ID (format: 'pluginName:widgetName') */
  id: string;
  /** Display name */
  name: string;
  /** Path to Svelte component */
  component: string;
  /** Slots where this widget can render */
  slots: WidgetSlot[];
  /** Size hint for layout */
  size: WidgetSize;
  /** Capabilities required - widget hidden if user lacks permissions */
  requiredCapabilities: string[];
  /** Optional widget-specific configuration */
  config?: Record<string, unknown>;
  /** Optional icon name or path */
  icon?: string;
  /** Priority for ordering (higher = first) */
  priority?: number;
  /** Optional category for grouping (inventory, command, task, info, events, reports, package) */
  category?: string;
  /** Whether widget requires node context (for node-scoped widgets) */
  nodeScoped?: boolean;
}

/**
 * Widget with loaded component reference
 */
export interface LoadedWidget extends PluginWidget {
  /** Plugin that provides this widget */
  pluginName: string;
  /** Loaded Svelte component (null if loading failed) */
  componentRef: Component | null;
  /** Loading state */
  loadState: WidgetLoadState;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Widget loading state
 */
export type WidgetLoadState = "pending" | "loading" | "loaded" | "error";

// =============================================================================
// Plugin Types
// =============================================================================

/**
 * Integration type for categorization
 */
export enum IntegrationType {
  Provisioning = "Provisioning",
  ConfigurationManagement = "ConfigurationManagement",
  InventorySource = "InventorySource",
  RemoteExecution = "RemoteExecution",
  InstallSoftware = "InstallSoftware",
  Info = "Info",
  Monitoring = "Monitoring",
  Orchestration = "Orchestration",
  SecretManagement = "SecretManagement", //pragma: allowlist secret
  ReportingAnalytics = "ReportingAnalytics",
  AuditCompliance = "AuditCompliance",
  BackupRecovery = "BackupRecovery",
}

/**
 * Plugin metadata from backend
 */
export interface PluginMetadata {
  /** Unique plugin name */
  name: string;
  /** Semantic version */
  version: string;
  /** Author name or organization */
  author: string;
  /** Human-readable description */
  description: string;
  /** Integration type for categorization */
  integrationType: IntegrationType;
  /** Homepage or documentation URL */
  homepage?: string;
  /** Other plugins this depends on */
  dependencies?: string[];
  /** Path to frontend bundle entry point */
  frontendEntryPoint?: string;
  /** Color for UI theming (hex) */
  color?: string;
  /** Icon name or path */
  icon?: string;
  /** Minimum Pabawi version required */
  minPabawiVersion?: string;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Plugin capability summary (frontend-facing)
 */
export interface PluginCapabilitySummary {
  /** Capability name */
  name: string;
  /** Category for grouping */
  category: string;
  /** Description */
  description: string;
  /** Risk level */
  riskLevel: "read" | "write" | "execute" | "admin";
  /** Required permissions */
  requiredPermissions: string[];
}

/**
 * Plugin information from backend API
 */
export interface PluginInfo {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /** Whether plugin is enabled */
  enabled: boolean;
  /** Health check status */
  healthy: boolean;
  /** Widget definitions */
  widgets: PluginWidget[];
  /** Capability summaries */
  capabilities: PluginCapabilitySummary[];
  /** Plugin priority */
  priority: number;
}

/**
 * Loaded plugin with frontend resources
 */
export interface LoadedPlugin {
  /** Plugin info from backend */
  info: PluginInfo;
  /** Loaded widgets with component references */
  widgets: LoadedWidget[];
  /** Load state */
  loadState: PluginLoadState;
  /** Error message if loading failed */
  error?: string;
  /** Timestamp when loaded */
  loadedAt: Date;
}

/**
 * Plugin loading state
 */
export type PluginLoadState = "pending" | "loading" | "loaded" | "partial" | "error";

// =============================================================================
// Plugin Module Types
// =============================================================================

/**
 * Plugin frontend module export interface
 * Plugins can export their components and initialization logic
 */
export interface PluginFrontendModule {
  /** Map of component names to Svelte components */
  components?: Record<string, Component>;
  /** Optional initialization function */
  initialize?: () => Promise<void>;
  /** Optional cleanup function */
  cleanup?: () => void;
  /** Plugin-specific stores or state */
  stores?: Record<string, unknown>;
}

/**
 * Dynamic import result for plugin modules
 */
export type PluginModuleImport = () => Promise<PluginFrontendModule>;

// =============================================================================
// Event Types
// =============================================================================

/**
 * Plugin lifecycle events
 */
export type PluginEvent =
  | { type: "plugin:loading"; pluginName: string }
  | { type: "plugin:loaded"; pluginName: string; plugin: LoadedPlugin }
  | { type: "plugin:error"; pluginName: string; error: string }
  | { type: "plugin:unloaded"; pluginName: string }
  | { type: "widget:loading"; widgetId: string }
  | { type: "widget:loaded"; widgetId: string }
  | { type: "widget:error"; widgetId: string; error: string };

/**
 * Plugin event handler
 */
export type PluginEventHandler = (event: PluginEvent) => void;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
  /** Base URL for plugin API */
  apiBaseUrl: string;
  /** Base URL for plugin assets */
  assetsBaseUrl: string;
  /** Whether to load widgets lazily */
  lazyLoadWidgets: boolean;
  /** Cache timeout for plugin metadata (ms) */
  metadataCacheTTL: number;
  /** Maximum retries for failed loads */
  maxRetries: number;
  /** Retry delay (ms) */
  retryDelay: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default plugin loader configuration
 */
export const DEFAULT_PLUGIN_LOADER_CONFIG: PluginLoaderConfig = {
  apiBaseUrl: "/api/v1",
  assetsBaseUrl: "/plugins",
  lazyLoadWidgets: true,
  metadataCacheTTL: 60000, // 1 minute
  maxRetries: 3,
  retryDelay: 1000,
  debug: false,
};

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Widget validation result
 */
export interface WidgetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  valid: boolean;
  pluginName: string;
  errors: string[];
  warnings: string[];
  widgetResults: Record<string, WidgetValidationResult>;
}
