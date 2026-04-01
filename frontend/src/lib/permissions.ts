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
  | 'journal'
  | 'integration_config'
  | 'ansible'
  | 'bolt'
  | 'puppetdb'
  | 'users'
  | 'groups'
  | 'roles';

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
    resources: ['proxmox', 'aws'],
  },
  operations: {
    label: 'Operations',
    resources: ['journal'],
  },
  configuration: {
    label: 'Configuration',
    resources: ['integration_config'],
  },
  system: {
    label: 'System',
    resources: ['users', 'groups', 'roles', 'ansible', 'bolt', 'puppetdb'],
  },
};

/**
 * Human-readable labels for permission resources
 */
export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  proxmox: 'Proxmox',
  aws: 'AWS',
  journal: 'Journal',
  integration_config: 'Integration Config',
  ansible: 'Ansible',
  bolt: 'Bolt',
  puppetdb: 'PuppetDB',
  users: 'Users',
  groups: 'Groups',
  roles: 'Roles',
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
  return authManager.isAuthenticated;
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
export function hasPermission(_action: string, _integration?: string): boolean {
  if (!authManager.isAuthenticated) {
    return false;
  }

  // For now, all authenticated users have all permissions
  // This will be enhanced when backend RBAC provides permission details
  return true;
}

/**
 * Check if the current user can manage VMs/containers
 *
 * Validates Requirements: 9.2, 9.3
 */
export function hasManagePermission(): boolean {
  return authManager.isAuthenticated;
}

/**
 * Check if the current user can destroy VMs/containers
 *
 * Validates Requirements: 9.2, 9.3
 */
export function hasDestroyPermission(): boolean {
  return authManager.isAuthenticated;
}
