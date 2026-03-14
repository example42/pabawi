/**
 * Permission checking utilities for RBAC
 *
 * Validates Requirements: 1.3, 9.1, 9.2, 9.3
 */

import { authManager } from './auth.svelte';

/**
 * Check if the current user has provisioning permissions
 *
 * Note: Currently checks if user is authenticated. In the future, this will
 * check specific provisioning permissions from the user's role assignments.
 *
 * Validates Requirements: 1.3, 9.2, 9.3
 */
export function hasProvisioningPermission(): boolean {
  // For now, all authenticated users have provisioning permission
  // This will be enhanced when backend RBAC is fully implemented
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
export function hasPermission(action: string, integration?: string): boolean {
  if (!authManager.isAuthenticated) {
    return false;
  }

  // For now, all authenticated users have all permissions
  // This will be enhanced when backend RBAC provides permission details
  // Future implementation will check:
  // - authManager.user?.permissions?.allowedActions.includes(action)
  // - authManager.user?.permissions?.allowedIntegrations.includes(integration)

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
