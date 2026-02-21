<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, del } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    isOpen: boolean;
    roleId: string | null;
    onClose: () => void;
    onSaved: () => void;
  }

  let { isOpen = $bindable(), roleId, onClose, onSaved }: Props = $props();

  interface PermissionDTO {
    id: string;
    resource: string;
    action: string;
    description: string;
  }

  interface RoleDetailDTO {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    createdAt: string;
    updatedAt: string;
    permissions: PermissionDTO[];
  }

  interface PermissionsResponse {
    permissions: PermissionDTO[];
  }

  // State
  let role = $state<RoleDetailDTO | null>(null);
  let availablePermissions = $state<PermissionDTO[]>([]);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let selectedPermissionId = $state<string>('');

  // Derived state for permissions not yet assigned
  let unassignedPermissions = $derived(
    availablePermissions.filter(
      (permission) => !role?.permissions.some((rp) => rp.id === permission.id)
    )
  );

  // Load role details when dialog opens
  $effect(() => {
    if (isOpen && roleId) {
      loadRoleDetails();
      loadAvailablePermissions();
    }
  });

  async function loadRoleDetails(): Promise<void> {
    if (!roleId) return;

    isLoading = true;
    try {
      role = await get<RoleDetailDTO>(`/api/roles/${roleId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load role details';
      showError('Failed to load role', errorMessage);
      onClose();
    } finally {
      isLoading = false;
    }
  }

  async function loadAvailablePermissions(): Promise<void> {
    try {
      const response = await get<PermissionsResponse>('/api/permissions?page=1&limit=100');
      availablePermissions = response.permissions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load permissions';
      showError('Failed to load permissions', errorMessage);
    }
  }

  async function handleAddPermission(): Promise<void> {
    if (!roleId || !selectedPermissionId || !role) return;

    isSaving = true;
    try {
      await post(`/api/roles/${roleId}/permissions/${selectedPermissionId}`);

      // Add permission to role's permissions list
      const addedPermission = availablePermissions.find((p) => p.id === selectedPermissionId);
      if (addedPermission) {
        role.permissions = [...role.permissions, addedPermission];
      }

      selectedPermissionId = '';
      showSuccess('Permission assigned', 'Permission has been assigned to the role');
      onSaved();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign permission';
      showError('Failed to assign permission', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleRemovePermission(permissionId: string, permissionName: string): Promise<void> {
    if (!roleId || !role) return;

    if (!confirm(`Remove permission "${permissionName}" from role?`)) {
      return;
    }

    isSaving = true;
    try {
      await del(`/api/roles/${roleId}/permissions/${permissionId}`);

      // Remove permission from role's permissions list
      role.permissions = role.permissions.filter((p) => p.id !== permissionId);

      showSuccess('Permission removed', 'Permission has been removed from the role');
      onSaved();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove permission';
      showError('Failed to remove permission', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function handleClose(): void {
    if (!isSaving) {
      role = null;
      selectedPermissionId = '';
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  function formatPermissionName(permission: PermissionDTO): string {
    return `${permission.resource}:${permission.action}`;
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity z-40"
    onclick={handleBackdropClick}
    role="presentation"
  ></div>

  <!-- Dialog -->
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
      <div class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl">
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Role Details
            </h3>
            <button
              type="button"
              onclick={handleClose}
              disabled={isSaving}
              class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">Close</span>
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Loading State -->
          {#if isLoading}
            <div class="flex justify-center items-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          {:else if role}
            <!-- Role Information -->
            <div class="space-y-6">
              <!-- Basic Info Section -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Basic Information
                </h4>
                <dl class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Role Name</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      {role.name}
                      {#if role.isBuiltIn}
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                          Built-in
                        </span>
                      {/if}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Created</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(role.createdAt)}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Description</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{role.description}</dd>
                  </div>
                </dl>
              </div>

              <!-- Permissions Section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    Assigned Permissions ({role.permissions.length})
                  </h4>
                </div>

                <!-- Add Permission -->
                {#if unassignedPermissions.length > 0}
                  <div class="flex gap-2 mb-3">
                    <select
                      bind:value={selectedPermissionId}
                      disabled={isSaving}
                      class="flex-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a permission to assign...</option>
                      {#each unassignedPermissions as permission (permission.id)}
                        <option value={permission.id}>
                          {formatPermissionName(permission)} - {permission.description}
                        </option>
                      {/each}
                    </select>
                    <button
                      type="button"
                      onclick={handleAddPermission}
                      disabled={!selectedPermissionId || isSaving}
                      class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assign
                    </button>
                  </div>
                {/if}

                <!-- Permissions List -->
                {#if role.permissions.length === 0}
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    No permissions assigned to this role
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each role.permissions as permission (permission.id)}
                      <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 font-mono">
                              {formatPermissionName(permission)}
                            </span>
                          </div>
                          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {permission.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onclick={() => handleRemovePermission(permission.id, formatPermissionName(permission))}
                          disabled={isSaving}
                          class="ml-3 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove permission"
                        >
                          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onclick={handleClose}
                  disabled={isSaving}
                  class="flex-1 inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
