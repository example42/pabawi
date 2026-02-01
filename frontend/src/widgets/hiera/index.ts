/**
 * Hiera Plugin Widgets
 *
 * Barrel exports for all Hiera plugin widget components.
 * Includes dynamic import manifest for lazy loading.
 *
 * @module widgets/hiera
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HieraExplorer } from './HieraExplorer.svelte';
export { default as KeyLookup } from './KeyLookup.svelte';
export { default as HierarchyViewer } from './HierarchyViewer.svelte';
export { default as NodeHieraData } from './NodeHieraData.svelte';
export { default as CodeAnalysis } from './CodeAnalysis.svelte';
export { default as KeyValuesGrid } from './KeyValuesGrid.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const HIERA_WIDGET_MANIFEST = {
  'hiera:explorer': {
    id: 'hiera:explorer',
    name: 'Hiera Explorer',
    load: () => import('./HieraExplorer.svelte'),
    slots: ['dashboard', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['hiera.keys', 'hiera.lookup'],
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
  'hiera:code-analysis': {
    id: 'hiera:code-analysis',
    name: 'Code Analysis',
    load: () => import('./CodeAnalysis.svelte'),
    slots: ['dashboard', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['hiera.analysis'],
  },
  'hiera:key-values-grid': {
    id: 'hiera:key-values-grid',
    name: 'Key Values Grid',
    load: () => import('./KeyValuesGrid.svelte'),
    slots: ['standalone-page', 'modal'] as string[],
    defaultSize: { width: 3, height: 2 },
    requiredCapabilities: ['hiera.values'],
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
