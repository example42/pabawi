/**
 * SSH Plugin Frontend Entry Point
 *
 * Widget components for the SSH integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/ssh/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const SSH_WIDGET_MANIFEST = {
  'ssh:home-widget': {
    id: 'ssh:home-widget',
    name: 'SSH Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['inventory.list'],
    priority: 20,
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type SSHWidgetId = keyof typeof SSH_WIDGET_MANIFEST;

/**
 * Get all SSH widget IDs
 */
export function getSSHWidgetIds(): SSHWidgetId[] {
  return Object.keys(SSH_WIDGET_MANIFEST) as SSHWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getSSHWidget(id: SSHWidgetId): (typeof SSH_WIDGET_MANIFEST)[SSHWidgetId] {
  return SSH_WIDGET_MANIFEST[id];
}
