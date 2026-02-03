/**
 * Widget Bridge
 *
 * Bridges between the local widget manifest system and the plugin loader.
 * Allows widgets to be loaded either from local manifests or from the backend API.
 *
 * @module lib/plugins/WidgetBridge
 * @version 1.0.0
 */

import type { Component } from 'svelte';
import { WIDGET_MANIFEST, getWidgetsForSlot, getAccessibleWidgetsForSlot } from '../../widgets';
import type { LoadedWidget, WidgetSlot } from './types';
import { logger } from '../logger.svelte';

// =============================================================================
// Types
// =============================================================================

interface LocalWidgetEntry {
  id: string;
  name: string;
  load: () => Promise<{ default: unknown }>;
  slots: string[];
  defaultSize: { width: number; height: number };
  requiredCapabilities: string[];
}

// =============================================================================
// Widget Component Cache
// =============================================================================

const componentCache = new Map<string, Component>();
const loadingPromises = new Map<string, Promise<Component | null>>();

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a widget is available in the local manifest
 */
export function hasLocalWidget(widgetId: string): boolean {
  return widgetId in WIDGET_MANIFEST;
}

/**
 * Get local widget manifest entry
 */
export function getLocalWidget(widgetId: string): LocalWidgetEntry | undefined {
  return WIDGET_MANIFEST[widgetId];
}

/**
 * Load a widget component from local manifest
 */
export async function loadLocalWidgetComponent(widgetId: string): Promise<Component | null> {
  // Check cache
  const cached = componentCache.get(widgetId);
  if (cached) {
    return cached;
  }

  // Check if already loading
  const loadingPromise = loadingPromises.get(widgetId);
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  const promise = doLoadWidget(widgetId);
  loadingPromises.set(widgetId, promise);

  try {
    return await promise;
  } finally {
    loadingPromises.delete(widgetId);
  }
}

/**
 * Get local widgets for a slot
 */
export function getLocalWidgetsForSlot(
  slot: WidgetSlot,
  userCapabilities?: string[]
): LoadedWidget[] {
  const manifests = userCapabilities
    ? getAccessibleWidgetsForSlot(slot, userCapabilities)
    : getWidgetsForSlot(slot);

  return manifests.map((manifest) => manifestToLoadedWidget(manifest));
}

/**
 * Convert local manifest to LoadedWidget format
 */
export function manifestToLoadedWidget(manifest: LocalWidgetEntry): LoadedWidget {
  const [pluginName] = manifest.id.split(':');
  const sizeMap: Record<number, 'small' | 'medium' | 'large' | 'full'> = {
    1: 'small',
    2: 'medium',
    3: 'large',
    4: 'full',
  };

  return {
    id: manifest.id,
    name: manifest.name,
    component: `widgets/${pluginName}/${manifest.name.replace(/\s+/g, '')}.svelte`,
    slots: manifest.slots as WidgetSlot[],
    size: sizeMap[manifest.defaultSize.width] || 'medium',
    requiredCapabilities: manifest.requiredCapabilities,
    pluginName,
    componentRef: componentCache.get(manifest.id) || null,
    loadState: componentCache.has(manifest.id) ? 'loaded' : 'pending',
    priority: 100, // Local widgets have default priority
  };
}

/**
 * Preload widgets for a specific slot
 */
export async function preloadWidgetsForSlot(
  slot: WidgetSlot,
  userCapabilities?: string[]
): Promise<void> {
  const widgets = getLocalWidgetsForSlot(slot, userCapabilities);
  await Promise.all(widgets.map((w) => loadLocalWidgetComponent(w.id)));
}

/**
 * Clear the widget component cache
 */
export function clearWidgetCache(): void {
  componentCache.clear();
  logger.debug('WidgetBridge', 'cache', 'Cleared widget component cache');
}

// =============================================================================
// Private Helpers
// =============================================================================

async function doLoadWidget(widgetId: string): Promise<Component | null> {
  const manifest = WIDGET_MANIFEST[widgetId];
  if (!manifest) {
    logger.warn('WidgetBridge', 'load', `Widget not found: ${widgetId}`);
    return null;
  }

  try {
    const module = await manifest.load();
    const component = module.default as Component;

    if (!component) {
      throw new Error('No default export found');
    }

    componentCache.set(widgetId, component);
    logger.debug('WidgetBridge', 'load', `Loaded widget: ${widgetId}`);

    return component;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('WidgetBridge', 'load', `Failed to load widget: ${widgetId} - ${msg}`);
    return null;
  }
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  hasLocalWidget,
  getLocalWidget,
  loadLocalWidgetComponent,
  getLocalWidgetsForSlot,
  manifestToLoadedWidget,
  preloadWidgetsForSlot,
  clearWidgetCache,
};
