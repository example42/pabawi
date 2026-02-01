<!--
  Users Administration Page

  Manages user accounts and permissions.

  @module pages/admin/UsersPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import { AdminOnly } from '../../components';
  import { get, post, del } from '../../lib/api';
  import { showError, showSuccess } from '../../lib/toast.svelte';
  import type { DebugInfo } from '../../lib/api';

  const pageTitle = 'Pabawi - User Management';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface User {
    username: string;
    displayName: string;
    email?: string;
    roles: string[];
    enabled: boolean;
    createdAt: string;
    lastLogin?: string;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let users = $state<User[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedUser = $state<User | null>(null);
  let debugInfo = $state<DebugInfo | null>(null);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;
    void loadUsers();
  });

  // ==========================================================================
  // API Functions
  // ==========================================================================

  async function loadUsers(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await get<{ users: User[]; debugInfo?: DebugInfo }>('/api/auth/users');
      users = response.users || [];
      debugInfo = response.debugInfo || null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load users';
      // Users API might not be implemented yet
      users = [];
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  function selectUser(user: User): void {
    selectedUser = user;
  }

  function closeUserDetails(): void {
    selectedUser = null;
  }
</script>

<AdminOnly>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Manage user accounts, roles, and permissions.
        </p>
      </div>

      {#if loading}
        <div class="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      {:else if error}
        <ErrorAlert
          title="Failed to load users"
          message={error}
          onRetry={loadUsers}
        />
      {:else if users.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No users configured</h3>
          <p class="mt-2 text-gray-500 dark:text-gray-400">
            User management is not yet configured. Check your authentication settings.
          </p>
        </div>
      {:else}
        <!-- Users Table -->
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Roles
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Last Login
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {#each users as user}
                <tr
                  class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onclick={() => selectUser(user)}
                >
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="h-10 w-10 flex-shrink-0">
                        <div class="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                          <span class="text-lg font-medium text-gray-600 dark:text-gray-300">
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">{user.displayName}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">{user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex flex-wrap gap-1">
                      {#each user.roles as role}
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {role}
                        </span>
                      {/each}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if user.enabled}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Active
                      </span>
                    {:else}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        Disabled
                      </span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
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
          You need administrator privileges to access User Management.
        </p>
      </div>
    </div>
  {/snippet}
</AdminOnly>
