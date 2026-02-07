/**
 * PuppetDB Plugin Frontend Widgets
 *
 * Widget components for the PuppetDB integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/puppetdb/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';
export { default as FactsExplorer } from './FactsExplorer.svelte';
export { default as ReportsViewer } from './ReportsViewer.svelte';
export { default as ReportsSummary } from './ReportsSummary.svelte';
export { default as EventsViewer } from './EventsViewer.svelte';
export { default as CatalogViewer } from './CatalogViewer.svelte';
export { default as NodeBrowser } from './NodeBrowser.svelte';
export { default as NodeDetailTabs } from './NodeDetailTabs.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const PUPPETDB_WIDGET_MANIFEST = {
  'puppetdb:home-widget': {
    id: 'puppetdb:home-widget',
    name: 'PuppetDB Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetdb.nodes'],
  },
  'puppetdb:node-browser': {
    id: 'puppetdb:node-browser',
    name: 'Node Browser',
    load: () => import('./NodeBrowser.svelte'),
    slots: ['dashboard', 'inventory-panel', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.nodes'],
  },
  'puppetdb:facts-explorer': {
    id: 'puppetdb:facts-explorer',
    name: 'Facts Explorer',
    load: () => import('./FactsExplorer.svelte'),
    slots: ['node-detail', 'modal'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.facts'],
  },
  'puppetdb:reports-viewer': {
    id: 'puppetdb:reports-viewer',
    name: 'Reports Viewer',
    load: () => import('./ReportsViewer.svelte'),
    slots: ['dashboard', 'standalone-page', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.reports'],
  },
  'puppetdb:reports-summary': {
    id: 'puppetdb:reports-summary',
    name: 'Reports Summary',
    load: () => import('./ReportsSummary.svelte'),
    slots: ['dashboard', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetdb.reports'],
  },
  'puppetdb:events-viewer': {
    id: 'puppetdb:events-viewer',
    name: 'Events Viewer',
    load: () => import('./EventsViewer.svelte'),
    slots: ['node-detail', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.events'],
  },
  'puppetdb:catalog-viewer': {
    id: 'puppetdb:catalog-viewer',
    name: 'Catalog Viewer',
    load: () => import('./CatalogViewer.svelte'),
    slots: ['node-detail', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.catalog'],
  },
  'puppetdb:node-detail-tabs': {
    id: 'puppetdb:node-detail-tabs',
    name: 'PuppetDB Node Details',
    load: () => import('./NodeDetailTabs.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetdb.facts'],
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
