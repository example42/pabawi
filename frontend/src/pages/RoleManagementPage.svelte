<script lang="ts">
  import { onMount } from 'svelte';
  import { get, del } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import RoleDetailDialog from '../components/RoleDetailDialog.svelte';

  interface RoleDTO {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    createdAt: string;
    updatedAt: string;
  }

  interface PaginationInfo {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }

  interface RolesResponse {
    roles: RoleDTO[];
    pagination: PaginationInfo;
  }

  // State
  let roles = $state<RoleDTO[]>([]);
  let pagination = $state<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  let isLoading = $state(false);
  let searchQuery = $state('');
  let isRoleDialogOpen = $state(false);
  let selectedRoleId = $state<string | null>(null);
  let filteredRoles = $derived(
    searchQuery.trim() === ''
      ? roles
      : roles.filter(
          (role) =>
            role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            role.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
  );

  // Check permissions on mount
  onMount(() => {
    if (!authManager.isAuthenticated) {
      showError('Authentication required', 'Please log in to access this page');
      router.navigate('/login');
      return;
    }

    // Load initial data
    loadRoles();
  });

  async function loadRoles(): Promise<void> {
    isLoading = true;
    try {
      const response = await get<RolesResponse>(
        `/api/roles?page=${pagination.page}&limit=${pagination.limit}`
      );

      roles = response.roles;
      pagination = response.pagination;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('403') || error.message.includes('permission')) {
          showError(
            'Permission denied',
            'You do not have permission to view roles. Contact your administrator.'
          );
        } else {
          showError('Failed to load roles', error.message);
        }
      }
    } finally {
      isLoading = false;
    }
  }

  async function handleDeleteRole(roleId: string, roleName: string, isBuiltIn: boolean): Promise<void> {
    if (isBuiltIn) {
      showError(
        'Cannot delete built-in role',
        'Built-in system roles cannot be deleted. They are required for the system to function properly.'
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await del(`/api/roles/${roleId}`);
      showSuccess('Role deleted', `Role "${roleName}" has been deleted successfully`);

      // Reload roles list
      await loadRoles();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('403') || error.message.includes('permission')) {
          showError(
            'Permission denied',
            'You do not have permission to delete roles. Contact your administrator.'
          );
        } else if (error.message.includes('built-in')) {
          showError(
            'Cannot delete built-in role',
            'Built-in system roles cannot be deleted.'
          );
        } else {
          showError('Failed to delete role', error.message);
        }
      }
    }
  }

  function handleCreateRole(): void {
    // TODO: Open create role dialog (will be implemented in future task)
    showError('Not implemented', 'Role creation dialog will be implemented in a future task');
  }

  function handleEditRole(roleId: string): void {
    selectedRoleId = roleId;
    isRoleDialogOpen = true;
  }

  function handleRoleDialogClose(): void {
    isRoleDialogOpen = false;
    selectedRoleId = null;
  }

  function handleRoleSaved(): void {
    // Reload roles list to reflect changes
    loadRoles();
  }

  function handlePageChange(newPage: number): void {
    pagination.page = newPage;
    loadRoles();
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
</script>

<div class="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Role Management</h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Manage roles and their permissions
      </p>
    </div>

    <!-- Search and Actions Bar -->
    <div class="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <!-- Search -->
      <div class="w-full sm:w-96">
        <label for="search" class="sr-only">Search roles</label>
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="search"
            type="text"
            bind:value={searchQuery}
            placeholder="Search by name or description..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          />
        </div>
      </div>

      <!-- Create Role Button -->
      <button
        type="button"
        onclick={handleCreateRole}
        class="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create Role
      </button>
    </div>

    <!-- Loading State -->
    {#if isLoading}
      <div class="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else if filteredRoles.length === 0}
      <!-- Empty State -->
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          {searchQuery ? 'No roles found' : 'No roles'}
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {searchQuery ? 'Try adjusting your search query' : 'Get started by creating a new role'}
        </p>
      </div>
    {:else}
      <!-- Roles Table -->
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {#each filteredRoles as role (role.id)}
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="flex-shrink-0 h-10 w-10">
                        <div class="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center">
                          <svg class="h-6 w-6 text-primary-700 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {role.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div class="text-sm text-gray-900 dark:text-white max-w-md truncate">
                      {role.description}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if role.isBuiltIn}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                        Built-in
                      </span>
                    {:else}
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        Custom
                      </span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(role.createdAt)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onclick={() => handleEditRole(role.id)}
                        class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                        title="View role details"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onclick={() => handleDeleteRole(role.id, role.name, role.isBuiltIn)}
                        class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 {role.isBuiltIn ? 'opacity-50 cursor-not-allowed' : ''}"
                        title={role.isBuiltIn ? 'Cannot delete built-in role' : 'Delete role'}
                        disabled={role.isBuiltIn}
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if !searchQuery && pagination.totalPages > 1}
          <div class="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
            <div class="flex-1 flex justify-between sm:hidden">
              <button
                type="button"
                onclick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onclick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  Showing
                  <span class="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span>
                  to
                  <span class="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span>
                  of
                  <span class="font-medium">{pagination.total}</span>
                  roles
                </p>
              </div>
              <div>
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    type="button"
                    onclick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span class="sr-only">Previous</span>
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {#each Array.from({ length: pagination.totalPages }, (_, i) => i + 1) as page}
                    {#if page === 1 || page === pagination.totalPages || (page >= pagination.page - 1 && page <= pagination.page + 1)}
                      <button
                        type="button"
                        onclick={() => handlePageChange(page)}
                        class="relative inline-flex items-center px-4 py-2 border text-sm font-medium {page === pagination.page
                          ? 'z-10 bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}"
                      >
                        {page}
                      </button>
                    {:else if page === pagination.page - 2 || page === pagination.page + 2}
                      <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                        ...
                      </span>
                    {/if}
                  {/each}

                  <button
                    type="button"
                    onclick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span class="sr-only">Next</span>
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Role Detail Dialog -->
<RoleDetailDialog
  bind:isOpen={isRoleDialogOpen}
  roleId={selectedRoleId}
  onClose={handleRoleDialogClose}
  onSaved={handleRoleSaved}
/>
