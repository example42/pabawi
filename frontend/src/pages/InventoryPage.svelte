<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config: Record<string, unknown> & {
      user?: string;
      port?: number;
    };
    source?: string;
  }

  interface SourceInfo {
    nodeCount: number;
    lastSync: string;
    status: 'healthy' | 'degraded' | 'unavailable';
  }

  interface InventoryResponse {
    nodes: Node[];
    sources?: Record<string, SourceInfo>;
  }

  // State
  let nodes = $state<Node[]>([]);
  let sources = $state<Record<string, SourceInfo>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let transportFilter = $state<string>('all');
  let sourceFilter = $state<string>('all');
  let viewMode = $state<'grid' | 'list'>('grid');
  let searchTimeout: number | undefined;
  let pqlQuery = $state('');
  let pqlError = $state<string | null>(null);
  let showPqlInput = $state(false);

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

    // Filter by source
    if (sourceFilter !== 'all') {
      result = result.filter(node => (node.source || 'bolt') === sourceFilter);
    }

    return result;
  });

  // Computed node counts by source
  let nodeCountsBySource = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const source = node.source || 'bolt';
      counts[source] = (counts[source] || 0) + 1;
    }
    return counts;
  });

  // Fetch inventory from API
  async function fetchInventory(pql?: string): Promise<void> {
    loading = true;
    error = null;
    pqlError = null;

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (pql) {
        params.append('pql', pql);
      }

      const url = `/api/inventory${params.toString() ? `?${params.toString()}` : ''}`;

      const data = await get<InventoryResponse>(url, {
        maxRetries: 2,
        onRetry: (attempt) => {
          console.log(`Retrying inventory fetch (attempt ${attempt})...`);
        },
      });

      nodes = data.nodes || [];
      sources = data.sources || {};

      // Show success toast only on retry success
      if (error) {
        showSuccess('Inventory loaded successfully');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching inventory:', err);
      showError('Failed to load inventory', error);
    } finally {
      loading = false;
    }
  }

  // Apply PQL query
  async function applyPqlQuery(): Promise<void> {
    if (!pqlQuery.trim()) {
      // Clear PQL filter
      await fetchInventory();
      return;
    }

    // Validate PQL query format (basic check)
    try {
      JSON.parse(pqlQuery);
    } catch (err) {
      pqlError = 'Invalid PQL query: must be valid JSON';
      showError('Invalid PQL query', pqlError);
      return;
    }

    // Fetch with PQL filter
    try {
      await fetchInventory(pqlQuery);
      pqlError = null;
      showSuccess('PQL query applied successfully');
    } catch (err) {
      pqlError = err instanceof Error ? err.message : 'Failed to apply PQL query';
      showError('PQL query failed', pqlError);
    }
  }

  // Clear PQL query
  async function clearPqlQuery(): Promise<void> {
    pqlQuery = '';
    pqlError = null;
    await fetchInventory();
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

  // Get source badge color
  function getSourceColor(source: string): string {
    switch (source) {
      case 'bolt':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'puppetdb':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  // Get source display name
  function getSourceDisplayName(source: string): string {
    switch (source) {
      case 'bolt':
        return 'Bolt';
      case 'puppetdb':
        return 'PuppetDB';
      default:
        return source.charAt(0).toUpperCase() + source.slice(1);
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
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Inventory
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Manage and monitor your infrastructure nodes
        </p>
      </div>
      {#if Object.keys(sources).includes('puppetdb')}
        <button
          type="button"
          onclick={() => showPqlInput = !showPqlInput}
          class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {showPqlInput ? 'Hide' : 'Show'} PQL Query
        </button>
      {/if}
    </div>
  </div>

  <!-- PQL Query Input -->
  {#if showPqlInput && Object.keys(sources).includes('puppetdb')}
    <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <label for="pql-query" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          PuppetDB PQL Query
        </label>
        <a
          href="https://puppet.com/docs/puppetdb/latest/api/query/v4/pql.html"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          PQL Documentation ↗
        </a>
      </div>
      <div class="flex gap-2">
        <textarea
          id="pql-query"
          bind:value={pqlQuery}
          placeholder='Example: ["=", "certname", "node1.example.com"]'
          rows="3"
          class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        ></textarea>
        <div class="flex flex-col gap-2">
          <button
            type="button"
            onclick={applyPqlQuery}
            disabled={loading}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <button
            type="button"
            onclick={clearPqlQuery}
            disabled={loading || !pqlQuery}
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>
      {#if pqlError}
        <p class="mt-2 text-sm text-red-600 dark:text-red-400">
          {pqlError}
        </p>
      {/if}
      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Enter a PQL query to filter PuppetDB nodes. The query must be valid JSON array format.
      </p>
    </div>
  {/if}

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

      <!-- Filters -->
      <div class="flex items-center gap-4">
        <!-- Source Filter -->
        <div class="flex items-center gap-2">
          <label for="source-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Source:
          </label>
          <select
            id="source-filter"
            bind:value={sourceFilter}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">All ({nodes.length})</option>
            {#each Object.keys(nodeCountsBySource).sort() as source}
              <option value={source}>
                {getSourceDisplayName(source)} ({nodeCountsBySource[source]})
              </option>
            {/each}
          </select>
        </div>

        <!-- Transport Filter -->
        <div class="flex items-center gap-2">
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
              <div class="mb-3 flex items-start justify-between gap-2">
                <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 flex-1 min-w-0">
                  {node.name}
                </h3>
                <div class="flex flex-col gap-1 items-end">
                  <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                    {node.transport}
                  </span>
                  <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(node.source || 'bolt')}">
                    {getSourceDisplayName(node.source || 'bolt')}
                  </span>
                </div>
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
                  Source
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
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(node.source || 'bolt')}">
                      {getSourceDisplayName(node.source || 'bolt')}
                    </span>
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
