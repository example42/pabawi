/**
 * Permission checking utilities for RBAC
 *
 * Validates Requirements: 1.3, 9.1, 9.2, 9.3, 27.1, 27.2, 27.3, 27.4, 28.1
 */

import { authManager } from './auth.svelte';

/**
 * Permission resource types matching backend RBAC model
 */
export type PermissionResource =
  | 'proxmox'
  | 'aws'
  | 'azure'
  | 'journal'
  | 'integration_config'
  | 'ansible'
  | 'bolt'
  | 'puppetdb'
  | 'hiera'
  | 'ssh'
  | 'users'
  | 'groups'
  | 'roles'
  | 'rbac'
  | 'puppetserver'
  | 'executions'
  | 'provisioning'
  | 'checkmk';

/**
 * Permission action types matching backend RBAC model
 */
export type PermissionAction =
  | 'read'
  | 'write'
  | 'execute'
  | 'admin'
  | 'provision'
  | 'destroy'
  | 'lifecycle'
  | 'configure'
  | 'note'
  | 'export';

/**
 * Resource categories for UI grouping in role management
 */
export const RESOURCE_CATEGORIES: Record<string, { label: string; resources: PermissionResource[] }> = {
  infrastructure: {
    label: 'Infrastructure',
    resources: ['proxmox', 'aws', 'azure'],
  },
  operations: {
    label: 'Operations',
    resources: ['journal', 'executions', 'provisioning'],
  },
  configuration: {
    label: 'Configuration',
    resources: ['integration_config', 'hiera'],
  },
  system: {
    label: 'System',
    resources: ['users', 'groups', 'roles', 'rbac', 'ansible', 'bolt', 'puppetdb', 'puppetserver', 'ssh', 'checkmk'],
  },
};

/**
 * Human-readable labels for permission resources
 */
export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  proxmox: 'Proxmox',
  aws: 'AWS',
  azure: 'Azure',
  journal: 'Journal',
  integration_config: 'Integration Config',
  ansible: 'Ansible',
  bolt: 'Bolt',
  puppetdb: 'PuppetDB',
  hiera: 'Hiera',
  ssh: 'SSH',
  users: 'Users',
  groups: 'Groups',
  roles: 'Roles',
  rbac: 'Entitlement administration',
  puppetserver: 'Puppetserver',
  executions: 'Executions',
  provisioning: 'Provisioning discovery',
  checkmk: 'Checkmk',
};

/**
 * Human-readable labels for permission actions
 */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'Read',
  write: 'Write',
  execute: 'Execute',
  admin: 'Admin',
  provision: 'Provision',
  destroy: 'Destroy',
  lifecycle: 'Lifecycle',
  configure: 'Configure',
  note: 'Note',
  export: 'Export',
};

/**
 * Get the category key for a given resource
 */
export function getResourceCategory(resource: string): string | null {
  for (const [key, category] of Object.entries(RESOURCE_CATEGORIES)) {
    if ((category.resources as string[]).includes(resource)) {
      return key;
    }
  }
  return null;
}

/**
 * Check if the current user has provisioning permissions
 *
 * Validates Requirements: 1.3, 9.2, 9.3
 */
export function hasProvisioningPermission(): boolean {
  return authManager.hasPermission("provisioning", "read") && ["proxmox", "aws", "azure"].some(provider => hasPermission("provision", provider));
}

/**
 * Check if the current user has permission for a specific action
 *
 * @param action - The action to check (e.g., 'provision', 'manage', 'destroy')
 * @param integration - Optional integration name to check permission for
 * @returns true if user has permission, false otherwise
 *
 * Validates Requirements: 9.1, 9.2, 9.3
 */
export function hasPermission(action: string, integration?: string): boolean {
  if (!integration) return ["proxmox", "aws", "azure"].some(provider => hasPermission(action, provider));
  return authManager.hasPermission(integration, action)
    && (!['provision', 'lifecycle', 'destroy'].includes(action) || authManager.hasPermission(integration, 'read'));
}

/**
 * Check if the current user can manage VMs/containers
 *
 * Validates Requirements: 9.2, 9.3
 */
export function hasManagePermission(): boolean {
  return hasPermission("lifecycle");
}

/**
 * Check if the current user can destroy VMs/containers
 *
 * Validates Requirements: 9.2, 9.3
 */
export function hasDestroyPermission(): boolean {
  return hasPermission("destroy");
}
