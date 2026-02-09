/**
 * Ansible Plugin Frontend Entry Point
 *
 * Widget components for the Ansible integration plugin.
 * These widgets can be rendered in various slots throughout the application.
 *
 * @module plugins/native/ansible/frontend
 * @version 1.0.0
 */

// ==========================================================================
// Static Exports
// ==========================================================================

export { default as HomeWidget } from './HomeWidget.svelte';
export { default as PluginHomePage } from './PluginHomePage.svelte';
export { default as PlaybookRunner } from './PlaybookRunner.svelte';
export { default as CommandExecutor } from './CommandExecutor.svelte';
export { default as InventoryViewer } from './InventoryViewer.svelte';
export { default as NodeDetailTabs } from './NodeDetailTabs.svelte';

// ==========================================================================
// Widget Manifest for Dynamic Loading
// ==========================================================================

/**
 * Maps widget IDs to their dynamic import functions.
 * Used by PluginLoader for lazy loading widgets on demand.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const ANSIBLE_WIDGET_MANIFEST = {
  'ansible:home-widget': {
    id: 'ansible:home-widget',
    name: 'Ansible Summary',
    load: () => import('./HomeWidget.svelte'),
    slots: ['home-summary'] as string[],
    defaultSize: { width: 1, height: 1 },
    requiredCapabilities: ['inventory.list'],
    priority: 20,
  },
  'ansible:home-page': {
    id: 'ansible:home-page',
    name: 'Ansible Home',
    load: () => import('./PluginHomePage.svelte'),
    slots: ['standalone-page'] as string[],
    defaultSize: { width: 4, height: 4 },
    requiredCapabilities: ['inventory.list'],
    route: '/integrations/ansible',
  },
  'ansible:playbook-runner': {
    id: 'ansible:playbook-runner',
    name: 'Playbook Runner',
    load: () => import('./PlaybookRunner.svelte'),
    slots: ['dashboard', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['task.execute'],
    category: 'task',
    nodeScoped: true,
  },
  'ansible:command-executor': {
    id: 'ansible:command-executor',
    name: 'Command Executor',
    load: () => import('./CommandExecutor.svelte'),
    slots: ['dashboard', 'node-detail'] as string[],
    defaultSize: { width: 2, height: 2 },
    requiredCapabilities: ['command.execute'],
    category: 'command',
    nodeScoped: true,
  },
  'ansible:inventory-viewer': {
    id: 'ansible:inventory-viewer',
    name: 'Inventory Viewer',
    load: () => import('./InventoryViewer.svelte'),
    slots: ['dashboard', 'inventory-panel'] as string[],
    defaultSize: { width: 1, height: 2 },
    requiredCapabilities: ['inventory.list'],
    category: 'inventory',
  },
  'ansible:node-detail-tabs': {
    id: 'ansible:node-detail-tabs',
    name: 'Ansible Node Actions',
    load: () => import('./NodeDetailTabs.svelte'),
    slots: ['node-detail'] as string[],
    defaultSize: { width: 4, height: 3 },
    requiredCapabilities: ['command.execute'],
    nodeScoped: true,
    priority: 5,
  },
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

/**
 * Type for widget manifest entries
 */
export type AnsibleWidgetId = keyof typeof ANSIBLE_WIDGET_MANIFEST;

/**
 * Get all Ansible widget IDs
 */
export function getAnsibleWidgetIds(): AnsibleWidgetId[] {
  return Object.keys(ANSIBLE_WIDGET_MANIFEST) as AnsibleWidgetId[];
}

/**
 * Get widget manifest entry by ID
 */
export function getAnsibleWidget(id: AnsibleWidgetId): (typeof ANSIBLE_WIDGET_MANIFEST)[AnsibleWidgetId] {
  return ANSIBLE_WIDGET_MANIFEST[id];
}
