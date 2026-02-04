/**
 * Widget Infrastructure - Generic Widget System
 *
 * Provides generic widget infrastructure and types for the plugin system.
 * Widget discovery and loading happens dynamically via API calls.
 * This file contains NO plugin-specific code or imports.
 *
 * @module widgets
 * @version 1.0.0
 */

// ==========================================================================
// Types
// ==========================================================================

/**
 * Widget manifest entry describing a widget's metadata and loading function
 */
export interface WidgetManifestEntry {
  id: string;
  name: string;
  load: () => Promise<{ default: unknown }>;
  slots: string[];
  defaultSize: { width: number; height: number };
  requiredCapabilities: string[];
}

/**
 * Widget size dimensions
 */
export interface WidgetSize {
  width: number;
  height: number;
}

/**
 * Widget slot types where widgets can be rendered
 */
export type WidgetSlot =
  | 'home-summary'
  | 'dashboard'
  | 'node-detail'
  | 'node-journal'
  | 'inventory-panel'
  | 'standalone-page'
  | 'sidebar'
  | 'modal';

// ==========================================================================
// Widget Registry (Dynamic)
// ==========================================================================

/**
 * Dynamic widget manifest registry.
 * Populated at runtime via API calls to /api/v1/widgets
 * DO NOT hardcode plugin widgets here - they are discovered dynamically.
 */
export const WIDGET_MANIFEST: Record<string, WidgetManifestEntry> = {};

// ==========================================================================
// Widget Registry Functions
// ==========================================================================

/**
 * Register a widget in the manifest
 * Called by the plugin loader when widgets are discovered
 */
export function registerWidget(widget: WidgetManifestEntry): void {
  WIDGET_MANIFEST[widget.id] = widget;
}

/**
 * Unregister a widget from the manifest
 */
export function unregisterWidget(widgetId: string): void {
  delete WIDGET_MANIFEST[widgetId];
}

/**
 * Clear all registered widgets
 */
export function clearWidgetRegistry(): void {
  Object.keys(WIDGET_MANIFEST).forEach(key => delete WIDGET_MANIFEST[key]);
}

/**
 * Get all registered widget IDs
 */
export function getAllWidgetIds(): string[] {
  return Object.keys(WIDGET_MANIFEST);
}

/**
 * Get widget manifest entry by ID
 */
export function getWidget(id: string): WidgetManifestEntry | undefined {
  return WIDGET_MANIFEST[id];
}

/**
 * Get widgets for a specific slot
 */
export function getWidgetsForSlot(slot: string): WidgetManifestEntry[] {
  return Object.values(WIDGET_MANIFEST).filter(w => w.slots.includes(slot));
}

/**
 * Get widgets by plugin
 */
export function getWidgetsByPlugin(plugin: string): WidgetManifestEntry[] {
  const prefix = `${plugin}:`;
  return Object.values(WIDGET_MANIFEST).filter(w => w.id.startsWith(prefix));
}

/**
 * Check if a widget exists
 */
export function hasWidget(id: string): boolean {
  return id in WIDGET_MANIFEST;
}

/**
 * Load a widget component dynamically
 */
export async function loadWidget(id: string): Promise<unknown> {
  const manifest = WIDGET_MANIFEST[id] as WidgetManifestEntry | undefined;
  if (!manifest) {
    throw new Error(`Widget not found: ${id}`);
  }
  const module = await manifest.load();
  return module.default;
}

/**
 * Get widgets filtered by required capabilities
 * @param userCapabilities - List of capabilities the user has
 */
export function getAccessibleWidgets(userCapabilities: string[]): WidgetManifestEntry[] {
  return Object.values(WIDGET_MANIFEST).filter(widget => {
    // Check if user has all required capabilities
    return widget.requiredCapabilities.every(cap => {
      // Support wildcard matching (e.g., "bolt:*" matches "bolt:command")
      if (userCapabilities.includes('*')) return true;
      if (userCapabilities.includes(cap)) return true;

      // Check plugin-level wildcard (e.g., "bolt:*" for "bolt:command")
      const [plugin] = cap.split(':');
      return userCapabilities.includes(`${plugin}:*`);
    });
  });
}

/**
 * Get widgets accessible for a specific slot with capability filtering
 */
export function getAccessibleWidgetsForSlot(
  slot: string,
  userCapabilities: string[]
): WidgetManifestEntry[] {
  return getWidgetsForSlot(slot).filter(widget => {
    return widget.requiredCapabilities.every(cap => {
      if (userCapabilities.includes('*')) return true;
      if (userCapabilities.includes(cap)) return true;
      const [plugin] = cap.split(':');
      return userCapabilities.includes(`${plugin}:*`);
    });
  });
}

// ==========================================================================
// Capability Matching Utilities
// ==========================================================================

/**
 * Check if a user has a specific capability
 * Supports wildcard matching (e.g., "bolt:*" matches "bolt:command")
 */
export function hasCapability(userCapabilities: string[], requiredCapability: string): boolean {
  if (userCapabilities.includes('*')) return true;
  if (userCapabilities.includes(requiredCapability)) return true;

  const [plugin] = requiredCapability.split(':');
  return userCapabilities.includes(`${plugin}:*`);
}

/**
 * Check if a user has all required capabilities
 */
export function hasAllCapabilities(userCapabilities: string[], requiredCapabilities: string[]): boolean {
  return requiredCapabilities.every(cap => hasCapability(userCapabilities, cap));
}

// ==========================================================================
// Default Export
// ==========================================================================

export default {
  manifest: WIDGET_MANIFEST,
  registerWidget,
  unregisterWidget,
  clearWidgetRegistry,
  getAllWidgetIds,
  getWidget,
  getWidgetsForSlot,
  getWidgetsByPlugin,
  hasWidget,
  loadWidget,
  getAccessibleWidgets,
  getAccessibleWidgetsForSlot,
  hasCapability,
  hasAllCapabilities,
};
