/**
 * Puppetserver Plugin Widgets
 *
 * Widget components for the Puppetserver integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module widgets/puppetserver
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as EnvironmentManager } from './EnvironmentManager.svelte';
export { default as StatusDashboard } from './StatusDashboard.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const PUPPETSERVER_WIDGET_MANIFEST = {
  'puppetserver:environment-manager': {
    id: 'puppetserver:environment-manager',
    name: 'Environment Manager',
    load: () => import('./EnvironmentManager.svelte'),
    slots: ['dashboard', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['puppetserver:environments'],
  },
  'puppetserver:status-dashboard': {
    id: 'puppetserver:status-dashboard',
    name: 'Status Dashboard',
    load: () => import('./StatusDashboard.svelte'),
    slots: ['dashboard', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['puppetserver:status'],
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
