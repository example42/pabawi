<!--
  Roles Administration Page

  Manages roles and permissions configuration.

  @module pages/admin/RolesPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import { AdminOnly } from '../../components';
  import { get } from '../../lib/api';
  import type { DebugInfo } from '../../lib/api';

  const pageTitle = 'Pabawi - Role Management';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Role {
    name: string;
    description: string;
    capabilities: string[];
    userCount?: number;
    isSystem?: boolean;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let roles = $state<Role[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedRole = $state<Role | null>(null);
  let debugInfo = $state<DebugInfo | null>(null);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;
    void loadRoles();
  });

  // ==========================================================================
  // API Functions
  // ==========================================================================

  async function loadRoles(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await get<{ roles: Role[]; debugInfo?: DebugInfo }>('/api/auth/roles');
      roles = response.roles || [];
      debugInfo = response.debugInfo || null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load roles';
      // Roles API might not be implemented yet
      roles = [];
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  function selectRole(role: Role): void {
    selectedRole = role;
  }

  function closeRoleDetails(): void {
    selectedRole = null;
  }
</script>

<AdminOnly>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Role Management</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Configure roles and their associated capabilities.
        </p>
      </div>

      {#if loading}
        <div class="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      {:else if error}
        <ErrorAlert
          title="Failed to load roles"
          message={error}
          onRetry={loadRoles}
        />
      {:else if roles.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No roles configured</h3>
          <p class="mt-2 text-gray-500 dark:text-gray-400">
            Role-based access control is not yet configured. Check your RBAC settings.
          </p>
        </div>
      {:else}
        <!-- Roles Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each roles as role}
            <div
              class="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
              onclick={() => selectRole(role)}
            >
              <div class="p-6">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{role.name}</h3>
                  {#if role.isSystem}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                      System
                    </span>
                  {/if}
                </div>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{role.description}</p>
                <div class="mt-4 flex items-center justify-between text-sm">
                  <span class="text-gray-500 dark:text-gray-400">
                    {role.capabilities.length} capabilities
                  </span>
                  {#if role.userCount !== undefined}
                    <span class="text-gray-500 dark:text-gray-400">
                      {role.userCount} users
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Role Details Modal -->
      {#if selectedRole}
        <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <!-- Background overlay -->
            <div
              class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onclick={closeRoleDetails}
            ></div>

            <!-- Modal panel -->
            <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-xl font-semibold text-gray-900 dark:text-white">{selectedRole.name}</h3>
                  <button
                    onclick={closeRoleDetails}
                    class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                  >
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p class="text-gray-600 dark:text-gray-400 mb-4">{selectedRole.description}</p>

                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Capabilities</h4>
                <div class="flex flex-wrap gap-2">
                  {#each selectedRole.capabilities as capability}
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {capability}
                    </span>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Fallback for non-admins -->
  {#snippet fallback()}
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div class="text-center p-8">
        <svg class="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h2 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Administrator Access Required</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          You need administrator privileges to access Role Management.
        </p>
      </div>
    </div>
  {/snippet}
</AdminOnly>
