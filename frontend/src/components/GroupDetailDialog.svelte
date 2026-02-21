<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, del } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    isOpen: boolean;
    groupId: string | null;
    onClose: () => void;
    onSaved: () => void;
  }

  let { isOpen = $bindable(), groupId, onClose, onSaved }: Props = $props();

  interface UserDTO {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
  }

  interface RoleDTO {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
  }

  interface GroupDetailDTO {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    members: UserDTO[];
    roles: RoleDTO[];
  }

  interface RolesResponse {
    roles: RoleDTO[];
  }

  // State
  let group = $state<GroupDetailDTO | null>(null);
  let availableRoles = $state<RoleDTO[]>([]);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let selectedRoleId = $state<string>('');

  // Derived state for roles not yet assigned
  let unassignedRoles = $derived(
    availableRoles.filter(
      (role) => !group?.roles.some((gr) => gr.id === role.id)
    )
  );

  // Load group details when dialog opens
  $effect(() => {
    if (isOpen && groupId) {
      loadGroupDetails();
      loadAvailableRoles();
    }
  });

  async function loadGroupDetails(): Promise<void> {
    if (!groupId) return;

    isLoading = true;
    try {
      group = await get<GroupDetailDTO>(`/api/groups/${groupId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load group details';
      showError('Failed to load group', errorMessage);
      onClose();
    } finally {
      isLoading = false;
    }
  }

  async function loadAvailableRoles(): Promise<void> {
    try {
      const response = await get<RolesResponse>('/api/roles?page=1&limit=100');
      availableRoles = response.roles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load roles';
      showError('Failed to load roles', errorMessage);
    }
  }

  async function handleAddRole(): Promise<void> {
    if (!groupId || !selectedRoleId || !group) return;

    isSaving = true;
    try {
      await post(`/api/groups/${groupId}/roles/${selectedRoleId}`);

      // Add role to group's roles list
      const addedRole = availableRoles.find((r) => r.id === selectedRoleId);
      if (addedRole) {
        group.roles = [...group.roles, addedRole];
      }

      selectedRoleId = '';
      showSuccess('Role assigned', 'Role has been assigned to the group');
      onSaved();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign role';
      showError('Failed to assign role', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleRemoveRole(roleId: string, roleName: string): Promise<void> {
    if (!groupId || !group) return;

    if (!confirm(`Remove role "${roleName}" from group?`)) {
      return;
    }

    isSaving = true;
    try {
      await del(`/api/groups/${groupId}/roles/${roleId}`);

      // Remove role from group's roles list
      group.roles = group.roles.filter((r) => r.id !== roleId);

      showSuccess('Role removed', 'Role has been removed from the group');
      onSaved();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove role';
      showError('Failed to remove role', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function handleClose(): void {
    if (!isSaving) {
      group = null;
      selectedRoleId = '';
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
              Group Details
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
          {:else if group}
            <!-- Group Information -->
            <div class="space-y-6">
              <!-- Basic Info Section -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Basic Information
                </h4>
                <dl class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Group Name</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{group.name}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Created</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(group.createdAt)}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Description</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{group.description}</dd>
                  </div>
                </dl>
              </div>

              <!-- Members Section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    Members ({group.members.length})
                  </h4>
                </div>

                <!-- Members List -->
                {#if group.members.length === 0}
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    No members in this group
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each group.members as member (member.id)}
                      <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div class="flex-1">
                          <p class="text-sm font-medium text-gray-900 dark:text-white">
                            {member.username}
                          </p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            {member.firstName} {member.lastName} • {member.email}
                          </p>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Roles Section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    Assigned Roles ({group.roles.length})
                  </h4>
                </div>

                <!-- Add Role -->
                {#if unassignedRoles.length > 0}
                  <div class="flex gap-2 mb-3">
                    <select
                      bind:value={selectedRoleId}
                      disabled={isSaving}
                      class="flex-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a role to assign...</option>
                      {#each unassignedRoles as role (role.id)}
                        <option value={role.id}>
                          {role.name}{role.isBuiltIn ? ' (Built-in)' : ''}
                        </option>
                      {/each}
                    </select>
                    <button
                      type="button"
                      onclick={handleAddRole}
                      disabled={!selectedRoleId || isSaving}
                      class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assign
                    </button>
                  </div>
                {/if}

                <!-- Roles List -->
                {#if group.roles.length === 0}
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    No roles assigned to this group
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each group.roles as role (role.id)}
                      <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <p class="text-sm font-medium text-gray-900 dark:text-white">
                              {role.name}
                            </p>
                            {#if role.isBuiltIn}
                              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                                Built-in
                              </span>
                            {/if}
                          </div>
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            {role.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onclick={() => handleRemoveRole(role.id, role.name)}
                          disabled={isSaving}
                          class="ml-3 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove role"
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
