/**
 * Widget Registry - Central Export
 *
 * Aggregates all plugin widget manifests into a unified registry.
 * Used by PluginLoader and WidgetSlot for dynamic widget loading.
 *
 * @module widgets
 * @version 1.0.0
 */

// ==========================================================================
// Plugin Widget Manifests (from plugin directories via alias)
// ==========================================================================

import { BOLT_WIDGET_MANIFEST, getBoltWidgetIds, getBoltWidget } from '@plugins/native/bolt/frontend';
import { PUPPETDB_WIDGET_MANIFEST, getPuppetDBWidgetIds, getPuppetDBWidget } from '@plugins/native/puppetdb/frontend';
import { PUPPETSERVER_WIDGET_MANIFEST, getPuppetserverWidgetIds, getPuppetserverWidget } from '@plugins/native/puppetserver/frontend';
import { HIERA_WIDGET_MANIFEST, getHieraWidgetIds, getHieraWidget } from '@plugins/native/hiera/frontend';

// Re-export individual manifests
export { BOLT_WIDGET_MANIFEST } from '@plugins/native/bolt/frontend';
export { PUPPETDB_WIDGET_MANIFEST } from '@plugins/native/puppetdb/frontend';
export { PUPPETSERVER_WIDGET_MANIFEST } from '@plugins/native/puppetserver/frontend';
export { HIERA_WIDGET_MANIFEST } from '@plugins/native/hiera/frontend';

// ==========================================================================
// Types
// ==========================================================================

export interface WidgetManifestEntry {
  id: string;
  name: string;
  load: () => Promise<{ default: unknown }>;
  slots: string[];
  defaultSize: { width: number; height: number };
  requiredCapabilities: string[];
}

export interface WidgetSize {
  width: number;
  height: number;
}

// ==========================================================================
// Unified Widget Manifest
// ==========================================================================

/**
 * Combined widget manifest from all plugins.
 * Maps widget ID to its manifest entry.
 */
export const WIDGET_MANIFEST: Record<string, WidgetManifestEntry> = {
  ...BOLT_WIDGET_MANIFEST,
  ...PUPPETDB_WIDGET_MANIFEST,
  ...PUPPETSERVER_WIDGET_MANIFEST,
  ...HIERA_WIDGET_MANIFEST,
};

// ==========================================================================
// Widget Registry Functions
// ==========================================================================

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
// Plugin-Specific Helpers (Re-exports)
// ==========================================================================

export { getBoltWidgetIds, getBoltWidget };
export { getPuppetDBWidgetIds, getPuppetDBWidget };
export { getPuppetserverWidgetIds, getPuppetserverWidget };
export { getHieraWidgetIds, getHieraWidget };

// ==========================================================================
// Default Export
// ==========================================================================

export default {
  manifest: WIDGET_MANIFEST,
  getAllWidgetIds,
  getWidget,
  getWidgetsForSlot,
  getWidgetsByPlugin,
  hasWidget,
  loadWidget,
  getAccessibleWidgets,
  getAccessibleWidgetsForSlot,
};
