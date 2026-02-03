/**
 * Puppetserver Plugin Frontend Widgets
 *
 * Widget components for the Puppetserver integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/puppetserver/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';
export { default as CatalogCompilation } from './CatalogCompilation.svelte';
export { default as EnvironmentInfo } from './EnvironmentInfo.svelte';
export { default as NodeStatus } from './NodeStatus.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const PUPPETSERVER_WIDGET_MANIFEST = {
  'puppetserver:home-widget': {
    id: 'puppetserver:home-widget',
    name: 'Puppetserver Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetserver.status'],
  },
  'puppetserver:catalog-compilation': {
    id: 'puppetserver:catalog-compilation',
    name: 'Catalog Compilation',
    load: () => import('./CatalogCompilation.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetserver.catalog'],
  },
  'puppetserver:environment-info': {
    id: 'puppetserver:environment-info',
    name: 'Environment Info',
    load: () => import('./EnvironmentInfo.svelte'),
    slots: ['node-detail', 'dashboard'] as string[],
    defaultSize: { width: 2, height: 1 },
    requiredCapabilities: ['puppetserver.environments'],
  },
  'puppetserver:node-status': {
    id: 'puppetserver:node-status',
    name: 'Node Status',
    load: () => import('./NodeStatus.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetserver.status'],
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type PuppetserverWidgetId = keyof typeof PUPPETSERVER_WIDGET_MANIFEST;

/**
 * Get all Puppetserver widget IDs
 */
export function getPuppetserverWidgetIds(): PuppetserverWidgetId[] {
  return Object.keys(PUPPETSERVER_WIDGET_MANIFEST) as PuppetserverWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getPuppetserverWidget(id: PuppetserverWidgetId): (typeof PUPPETSERVER_WIDGET_MANIFEST)[PuppetserverWidgetId] {
  return PUPPETSERVER_WIDGET_MANIFEST[id];
}
