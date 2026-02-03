/**
 * Bolt Plugin Frontend Widgets
 *
 * Widget components for the Bolt integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/bolt/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';
export { default as CommandExecutor } from './CommandExecutor.svelte';
export { default as TaskRunner } from './TaskRunner.svelte';
export { default as InventoryViewer } from './InventoryViewer.svelte';
export { default as TaskBrowser } from './TaskBrowser.svelte';
export { default as FactsViewer } from './FactsViewer.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const BOLT_WIDGET_MANIFEST = {
  'bolt:home-widget': {
    id: 'bolt:home-widget',
    name: 'Bolt Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['bolt.inventory.list'],
  },
  'bolt:command-executor': {
    id: 'bolt:command-executor',
    name: 'Command Executor',
    load: () => import('./CommandExecutor.svelte'),
    slots: ['dashboard', 'node-detail', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['bolt.command.execute'],
  },
  'bolt:task-runner': {
    id: 'bolt:task-runner',
    name: 'Task Runner',
    load: () => import('./TaskRunner.svelte'),
    slots: ['dashboard', 'node-detail', 'standalone-page'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['bolt.task.execute'],
  },
  'bolt:inventory-viewer': {
    id: 'bolt:inventory-viewer',
    name: 'Inventory Viewer',
    load: () => import('./InventoryViewer.svelte'),
    slots: ['dashboard', 'inventory-panel', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 2 },
    requiredCapabilities: ['bolt.inventory.list'],
  },
  'bolt:task-browser': {
    id: 'bolt:task-browser',
    name: 'Task Browser',
    load: () => import('./TaskBrowser.svelte'),
    slots: ['dashboard', 'sidebar'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['bolt.task.list'],
  },
  'bolt:facts-viewer': {
    id: 'bolt:facts-viewer',
    name: 'Facts Viewer',
    load: () => import('./FactsViewer.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['bolt.facts.query'],
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type BoltWidgetId = keyof typeof BOLT_WIDGET_MANIFEST;

/**
 * Get all Bolt widget IDs
 */
export function getBoltWidgetIds(): BoltWidgetId[] {
  return Object.keys(BOLT_WIDGET_MANIFEST) as BoltWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getBoltWidget(id: BoltWidgetId): (typeof BOLT_WIDGET_MANIFEST)[BoltWidgetId] {
  return BOLT_WIDGET_MANIFEST[id];
}
