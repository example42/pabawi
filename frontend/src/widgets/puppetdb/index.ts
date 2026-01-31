/**
 * PuppetDB Plugin Widgets
 *
 * Widget components for the PuppetDB integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module widgets/puppetdb
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as NodeBrowser } from './NodeBrowser.svelte';
export { default as FactsExplorer } from './FactsExplorer.svelte';
export { default as ReportsViewer } from './ReportsViewer.svelte';
export { default as ReportsSummary } from './ReportsSummary.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const PUPPETDB_WIDGET_MANIFEST = {
  'puppetdb:node-browser': {
    id: 'puppetdb:node-browser',
    name: 'Node Browser',
    load: () => import('./NodeBrowser.svelte'),
    slots: ['dashboard', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb:nodes'],
  },
  'puppetdb:facts-explorer': {
    id: 'puppetdb:facts-explorer',
    name: 'Facts Explorer',
    load: () => import('./FactsExplorer.svelte'),
    slots: ['node-detail', 'modal'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb:facts'],
  },
  'puppetdb:reports-viewer': {
    id: 'puppetdb:reports-viewer',
    name: 'Reports Viewer',
    load: () => import('./ReportsViewer.svelte'),
    slots: ['dashboard', 'standalone-page', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb:reports'],
  },
  'puppetdb:reports-summary': {
    id: 'puppetdb:reports-summary',
    name: 'Reports Summary',
    load: () => import('./ReportsSummary.svelte'),
    slots: ['dashboard', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetdb:reports'],
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type PuppetDBWidgetId = keyof typeof PUPPETDB_WIDGET_MANIFEST;

/**
 * Get all PuppetDB widget IDs
 */
export function getPuppetDBWidgetIds(): PuppetDBWidgetId[] {
  return Object.keys(PUPPETDB_WIDGET_MANIFEST) as PuppetDBWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getPuppetDBWidget(id: PuppetDBWidgetId): (typeof PUPPETDB_WIDGET_MANIFEST)[PuppetDBWidgetId] {
  return PUPPETDB_WIDGET_MANIFEST[id];
}
