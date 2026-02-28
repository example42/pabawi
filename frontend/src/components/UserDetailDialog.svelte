<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post, put, del } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    isOpen: boolean;
    userId: string | null;
    onClose: () => void;
    onSaved: () => void;
  }

  let { isOpen = $bindable(), userId, onClose, onSaved }: Props = $props();

  interface GroupDTO {
    id: string;
    name: string;
    description: string;
  }

  interface RoleDTO {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
  }

  interface UserDetailDTO {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    isAdmin: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
    groups: GroupDTO[];
    roles: RoleDTO[];
  }

  interface GroupsResponse {
    groups: GroupDTO[];
  }

  interface RolesResponse {
    roles: RoleDTO[];
  }

  // State
  let user = $state<UserDetailDTO | null>(null);
  let availableGroups = $state<GroupDTO[]>([]);
  let availableRoles = $state<RoleDTO[]>([]);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let selectedGroupId = $state<string>('');
  let selectedRoleId = $state<string>('');

  // Derived state for groups/roles not yet assigned
  let unassignedGroups = $derived(
    availableGroups.filter(
      (group) => !user?.groups.some((ug) => ug.id === group.id)
    )
  );

  let unassignedRoles = $derived(
    availableRoles.filter(
      (role) => !user?.roles.some((ur) => ur.id === role.id)
    )
  );

  // Load user details when dialog opens
  $effect(() => {
    if (isOpen && userId) {
      loadUserDetails();
      loadAvailableGroups();
      loadAvailableRoles();
    }
  });

  async function loadUserDetails(): Promise<void> {
    if (!userId) return;

    isLoading = true;
    try {
      user = await get<UserDetailDTO>(`/api/users/${userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load user details';
      showError('Failed to load user', errorMessage);
      onClose();
    } finally {
      isLoading = false;
    }
  }

  async function loadAvailableGroups(): Promise<void> {
    try {
      const response = await get<GroupsResponse>('/api/groups?page=1&limit=100');
      availableGroups = response.groups;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load groups';
      showError('Failed to load groups', errorMessage);
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

  async function handleAddGroup(): Promise<void> {
    if (!userId || !selectedGroupId || !user) return;

    isSaving = true;
    try {
      await post(`/api/users/${userId}/groups/${selectedGroupId}`);

      // Add group to user's groups list
      const addedGroup = availableGroups.find((g) => g.id === selectedGroupId);
      if (addedGroup) {
        user.groups = [...user.groups, addedGroup];
      }

      selectedGroupId = '';
      showSuccess('Group added', 'User has been added to the group');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add group';
      showError('Failed to add group', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleRemoveGroup(groupId: string, groupName: string): Promise<void> {
    if (!userId || !user) return;

    if (!confirm(`Remove user from group "${groupName}"?`)) {
      return;
    }

    isSaving = true;
    try {
      await del(`/api/users/${userId}/groups/${groupId}`);

      // Remove group from user's groups list
      user.groups = user.groups.filter((g) => g.id !== groupId);

      showSuccess('Group removed', 'User has been removed from the group');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove group';
      showError('Failed to remove group', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleAddRole(): Promise<void> {
    if (!userId || !selectedRoleId || !user) return;

    isSaving = true;
    try {
      await post(`/api/users/${userId}/roles/${selectedRoleId}`);

      // Add role to user's roles list
      const addedRole = availableRoles.find((r) => r.id === selectedRoleId);
      if (addedRole) {
        user.roles = [...user.roles, addedRole];
      }

      selectedRoleId = '';
      showSuccess('Role assigned', 'Role has been assigned to the user');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign role';
      showError('Failed to assign role', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleRemoveRole(roleId: string, roleName: string): Promise<void> {
    if (!userId || !user) return;

    if (!confirm(`Remove role "${roleName}" from user?`)) {
      return;
    }

    isSaving = true;
    try {
      await del(`/api/users/${userId}/roles/${roleId}`);

      // Remove role from user's roles list
      user.roles = user.roles.filter((r) => r.id !== roleId);

      showSuccess('Role removed', 'Role has been removed from the user');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove role';
      showError('Failed to remove role', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleToggleActive(): Promise<void> {
    if (!userId || !user) return;

    const newActiveState = !user.isActive;
    const action = newActiveState ? 'activate' : 'deactivate';

    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    isSaving = true;
    try {
      await put(`/api/users/${userId}`, { isActive: newActiveState });

      user.isActive = newActiveState;

      showSuccess(
        `User ${action}d`,
        `User has been ${action}d successfully`
      );
      onSaved();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${action} user`;
      showError(`Failed to ${action} user`, errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function handleClose(): void {
    if (!isSaving) {
      user = null;
      selectedGroupId = '';
      selectedRoleId = '';
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
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
              User Details
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
          {:else if user}
            <!-- User Information -->
            <div class="space-y-6">
              <!-- Basic Info Section -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Basic Information
                </h4>
                <dl class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Username</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{user.username}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Email</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{user.email}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">First Name</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{user.firstName}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Last Name</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{user.lastName}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Status</dt>
                    <dd class="mt-1">
                      <div class="flex items-center gap-2">
                        {#if user.isActive}
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                            Active
                          </span>
                        {:else}
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                            Inactive
                          </span>
                        {/if}
                        {#if user.isAdmin}
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400">
                            Admin
                          </span>
                        {/if}
                      </div>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(user.lastLoginAt)}</dd>
                  </div>
                </dl>
              </div>

              <!-- Groups Section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    Groups ({user.groups.length})
                  </h4>
                </div>

                <!-- Add Group -->
                {#if unassignedGroups.length > 0}
                  <div class="flex gap-2 mb-3">
                    <select
                      bind:value={selectedGroupId}
                      disabled={isSaving}
                      class="flex-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a group to add...</option>
                      {#each unassignedGroups as group (group.id)}
                        <option value={group.id}>{group.name}</option>
                      {/each}
                    </select>
                    <button
                      type="button"
                      onclick={handleAddGroup}
                      disabled={!selectedGroupId || isSaving}
                      class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                  </div>
                {/if}

                <!-- Groups List -->
                {#if user.groups.length === 0}
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    No groups assigned
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each user.groups as group (group.id)}
                      <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                        <div class="flex-1">
                          <p class="text-sm font-medium text-gray-900 dark:text-white">
                            {group.name}
                          </p>
                          <p class="text-xs text-gray-500 dark:text-gray-400">
                            {group.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onclick={() => handleRemoveGroup(group.id, group.name)}
                          disabled={isSaving}
                          class="ml-3 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove from group"
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

              <!-- Roles Section -->
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                    Roles ({user.roles.length})
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
                {#if user.roles.length === 0}
                  <p class="text-sm text-gray-500 dark:text-gray-400 italic">
                    No roles assigned
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each user.roles as role (role.id)}
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
                  onclick={handleToggleActive}
                  disabled={isSaving}
                  class="flex-1 inline-flex justify-center items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {#if isSaving}
                    <LoadingSpinner size="sm" />
                  {/if}
                  {user.isActive ? 'Deactivate User' : 'Activate User'}
                </button>
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
