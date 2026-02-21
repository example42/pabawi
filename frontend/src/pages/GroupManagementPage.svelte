<script lang="ts">
  import { onMount } from 'svelte';
  import { get, del } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import GroupDetailDialog from '../components/GroupDetailDialog.svelte';

  interface GroupDTO {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    memberCount?: number;
  }

  interface PaginationInfo {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }

  interface GroupsResponse {
    groups: GroupDTO[];
    pagination: PaginationInfo;
  }

  // State
  let groups = $state<GroupDTO[]>([]);
  let pagination = $state<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  let isLoading = $state(false);
  let searchQuery = $state('');
  let isGroupDetailDialogOpen = $state(false);
  let selectedGroupId = $state<string | null>(null);
  let filteredGroups = $derived(
    searchQuery.trim() === ''
      ? groups
      : groups.filter(
          (group) =>
            group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            group.description.toLowerCase().includes(searchQuery.toLowerCase())
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
    loadGroups();
  });

  async function loadGroups(): Promise<void> {
    isLoading = true;
    try {
      const response = await get<GroupsResponse>(
        `/api/groups?page=${pagination.page}&limit=${pagination.limit}`
      );

      groups = response.groups;
      pagination = response.pagination;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('403') || error.message.includes('permission')) {
          showError(
            'Permission denied',
            'You do not have permission to view groups. Contact your administrator.'
          );
        } else {
          showError('Failed to load groups', error.message);
        }
      }
    } finally {
      isLoading = false;
    }
  }

  async function handleDeleteGroup(groupId: string, groupName: string): Promise<void> {
    if (!confirm(`Are you sure you want to delete group "${groupName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await del(`/api/groups/${groupId}`);
      showSuccess('Group deleted', `Group "${groupName}" has been deleted successfully`);

      // Reload groups list
      await loadGroups();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('403') || error.message.includes('permission')) {
          showError(
            'Permission denied',
            'You do not have permission to delete groups. Contact your administrator.'
          );
        } else {
          showError('Failed to delete group', error.message);
        }
      }
    }
  }

  function handleCreateGroup(): void {
    // TODO: Open create group dialog (will be implemented in future task)
    showError('Not implemented', 'Group creation dialog will be implemented in a future task');
  }

  function handleEditGroup(groupId: string): void {
    selectedGroupId = groupId;
    isGroupDetailDialogOpen = true;
  }

  function handleCloseGroupDetailDialog(): void {
    isGroupDetailDialogOpen = false;
    selectedGroupId = null;
  }

  function handleGroupDetailSaved(): void {
    // Reload groups list to reflect any changes
    loadGroups();
  }

  function handlePageChange(newPage: number): void {
    pagination.page = newPage;
    loadGroups();
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
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Group Management</h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Manage groups and their role assignments
      </p>
    </div>

    <!-- Search and Actions Bar -->
    <div class="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <!-- Search -->
      <div class="w-full sm:w-96">
        <label for="search" class="sr-only">Search groups</label>
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

      <!-- Create Group Button -->
      <button
        type="button"
        onclick={handleCreateGroup}
        class="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create Group
      </button>
    </div>

    <!-- Loading State -->
    {#if isLoading}
      <div class="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else if filteredGroups.length === 0}
      <!-- Empty State -->
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          {searchQuery ? 'No groups found' : 'No groups'}
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {searchQuery ? 'Try adjusting your search query' : 'Get started by creating a new group'}
        </p>
      </div>
    {:else}
      <!-- Groups Table -->
      <div class="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Group Name
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Members
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
              {#each filteredGroups as group (group.id)}
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="flex-shrink-0 h-10 w-10">
                        <div class="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center">
                          <svg class="h-6 w-6 text-primary-700 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {group.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div class="text-sm text-gray-900 dark:text-white max-w-md truncate">
                      {group.description}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {group.memberCount ?? 0} {group.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(group.createdAt)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onclick={() => handleEditGroup(group.id)}
                        class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                        title="Edit group"
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onclick={() => handleDeleteGroup(group.id, group.name)}
                        class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title="Delete group"
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
                  groups
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

<!-- Group Detail Dialog -->
<GroupDetailDialog
  bind:isOpen={isGroupDetailDialogOpen}
  groupId={selectedGroupId}
  onClose={handleCloseGroupDetailDialog}
  onSaved={handleGroupDetailSaved}
/>
