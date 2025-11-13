<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { router } from '../lib/router.svelte';

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config: Record<string, unknown> & {
      user?: string;
      port?: number;
    };
  }

  // State
  let nodes = $state<Node[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let transportFilter = $state<string>('all');
  let viewMode = $state<'grid' | 'list'>('grid');
  let searchTimeout: number | undefined;

  // Computed filtered nodes
  let filteredNodes = $derived.by(() => {
    let result = nodes;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(node => 
        node.name.toLowerCase().includes(query) ||
        node.uri.toLowerCase().includes(query)
      );
    }

    // Filter by transport type
    if (transportFilter !== 'all') {
      result = result.filter(node => node.transport === transportFilter);
    }

    return result;
  });

  // Fetch inventory from API
  async function fetchInventory(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await fetch('/api/inventory');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch inventory: ${response.statusText}`);
      }

      const data = await response.json();
      nodes = data.nodes || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching inventory:', err);
    } finally {
      loading = false;
    }
  }

  // Handle search with debouncing
  function handleSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for 300ms debounce
    searchTimeout = setTimeout(() => {
      searchQuery = value;
    }, 300) as unknown as number;
  }

  // Navigate to node detail page
  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  // Retry fetching inventory
  function retryFetch(): void {
    fetchInventory();
  }

  // Get transport badge color
  function getTransportColor(transport: string): string {
    switch (transport) {
      case 'ssh':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'winrm':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'docker':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
      case 'local':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  // Fetch inventory on mount
  onMount(() => {
    fetchInventory();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
      Inventory
    </h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      Manage and monitor your infrastructure nodes
    </p>
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading inventory..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert 
      message="Failed to load inventory" 
      details={error}
      onRetry={retryFetch}
    />
  {:else}
    <!-- Filters and Controls -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <!-- Search -->
      <div class="flex-1 max-w-md">
        <label for="search" class="sr-only">Search nodes</label>
        <div class="relative">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="search"
            type="text"
            placeholder="Search by name or URI..."
            class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            oninput={handleSearch}
          />
        </div>
      </div>

      <!-- Transport Filter -->
      <div class="flex items-center gap-3">
        <label for="transport-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Transport:
        </label>
        <select
          id="transport-filter"
          bind:value={transportFilter}
          class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All</option>
          <option value="ssh">SSH</option>
          <option value="winrm">WinRM</option>
          <option value="docker">Docker</option>
          <option value="local">Local</option>
        </select>
      </div>

      <!-- View Toggle -->
      <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
        <button
          type="button"
          aria-label="Grid view"
          class="px-3 py-2 text-sm font-medium {viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'} rounded-l-lg"
          onclick={() => viewMode = 'grid'}
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="List view"
          class="px-3 py-2 text-sm font-medium {viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'} rounded-r-lg border-l border-gray-300 dark:border-gray-600"
          onclick={() => viewMode = 'list'}
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Results Count -->
    <div class="mb-4 text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredNodes.length} of {nodes.length} nodes
    </div>

    <!-- Empty State -->
    {#if filteredNodes.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No nodes found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {searchQuery || transportFilter !== 'all' ? 'Try adjusting your filters' : 'No nodes in inventory'}
        </p>
      </div>
    {:else}
      <!-- Node List/Grid -->
      {#if viewMode === 'grid'}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each filteredNodes as node (node.id)}
            <button
              type="button"
              class="group relative rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
              onclick={() => navigateToNode(node.id)}
            >
              <div class="mb-3 flex items-start justify-between">
                <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                  {node.name}
                </h3>
                <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                  {node.transport}
                </span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
                {node.uri}
              </p>
              {#if node.config.user}
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  User: {node.config.user}
                </p>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Transport
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  URI
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  User
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each filteredNodes as node (node.id)}
                <tr 
                  class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                  onclick={() => navigateToNode(node.id)}
                >
                  <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {node.name}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                      {node.transport}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.uri}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.config.user || '-'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</div>
