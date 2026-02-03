/**
 * Hiera Plugin Frontend Widgets
 *
 * Widget components for the Hiera integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/hiera/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';
export { default as KeyLookup } from './KeyLookup.svelte';
export { default as HierarchyViewer } from './HierarchyViewer.svelte';
export { default as NodeHieraData } from './NodeHieraData.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const HIERA_WIDGET_MANIFEST = {
  'hiera:home-widget': {
    id: 'hiera:home-widget',
    name: 'Hiera Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['hiera.keys'],
  },
  'hiera:key-lookup': {
    id: 'hiera:key-lookup',
    name: 'Key Lookup',
    load: () => import('./KeyLookup.svelte'),
    slots: ['node-detail', 'modal', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['hiera.lookup'],
  },
  'hiera:hierarchy-viewer': {
    id: 'hiera:hierarchy-viewer',
    name: 'Hierarchy Viewer',
    load: () => import('./HierarchyViewer.svelte'),
    slots: ['node-detail', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['hiera.hierarchy'],
  },
  'hiera:node-data': {
    id: 'hiera:node-data',
    name: 'Node Hiera Data',
    load: () => import('./NodeHieraData.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['hiera.node'],
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type HieraWidgetId = keyof typeof HIERA_WIDGET_MANIFEST;

/**
 * Get all Hiera widget IDs
 */
export function getHieraWidgetIds(): HieraWidgetId[] {
  return Object.keys(HIERA_WIDGET_MANIFEST) as HieraWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getHieraWidget(id: HieraWidgetId): (typeof HIERA_WIDGET_MANIFEST)[HieraWidgetId] {
  return HIERA_WIDGET_MANIFEST[id];
}
