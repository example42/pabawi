<!--
  Bolt Inventory Viewer Widget

  Displays the Bolt inventory with filtering and search capabilities.
  Can be rendered in dashboard, inventory-panel, or sidebar slots.

  Features:
  - Node list with status indicators
  - Transport type filtering
  - Search/filter functionality
  - Node selection for actions
  - Quick link to node details

  @module plugins/native/bolt/frontend/InventoryViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { router } from '../../../../frontend/src/lib/router.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Node {
    id: string;
    name: string;
    uri?: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config?: Record<string, unknown>;
    source?: string;
    sources?: string[];
    linked?: boolean;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    limit?: number;
    showSearch?: boolean;
    showTransportFilter?: boolean;
    compact?: boolean;
    config?: Record<string, unknown>;
    onNodeSelect?: (node: Node) => void;
  }

  let {
    limit = 50,
    showSearch = true,
    showTransportFilter = false,
    compact = false,
    config = {},
    onNodeSelect,
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let nodes = $state<Node[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let transportFilter = $state<string>('all');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredNodes = $derived.by(() => {
    let result = nodes;

    if (transportFilter !== 'all') {
      result = result.filter(n => n.transport === transportFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        n => n.name.toLowerCase().includes(query) ||
             n.uri?.toLowerCase().includes(query)
      );
    }

    return result.slice(0, limit);
  });

  let transportTypes = $derived.by(() => {
    const types = new Set(nodes.map(n => n.transport));
    return Array.from(types).sort();
  });

  let totalCount = $derived(nodes.length);
  let displayedCount = $derived(filteredNodes.length);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchInventory();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchInventory(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await get<{ nodes: Node[] }>('/api/inventory?source=bolt');
      nodes = response.nodes || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load inventory';
    } finally {
      loading = false;
    }
  }

  async function refreshInventory(): Promise<void> {
    await fetchInventory();
  }

  // ==========================================================================
  // Node Actions
  // ==========================================================================

  function navigateToNode(node: Node): void {
    router.navigate(`/inventory/${encodeURIComponent(node.name)}`);
    onNodeSelect?.(node);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getTransportIcon(transport: string): string {
    switch (transport) {
      case 'ssh':
        return 'M8 9h.01M16 9h.01M9 14c.5.5 1.5 1 3 1s2.5-.5 3-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'winrm':
        return 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
      case 'docker':
        return 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4';
      case 'local':
        return 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2';
      default:
        return 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z';
    }
  }

  function getTransportColor(transport: string): string {
    switch (transport) {
      case 'ssh': return 'text-green-500 dark:text-green-400';
      case 'winrm': return 'text-blue-500 dark:text-blue-400';
      case 'docker': return 'text-cyan-500 dark:text-cyan-400';
      case 'local': return 'text-purple-500 dark:text-purple-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  }
</script>

<div class="bolt-inventory-viewer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Bolt Inventory
      </h3>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {displayedCount}{totalCount > displayedCount ? `/${totalCount}` : ''} nodes
      </span>
      <button
        type="button"
        onclick={refreshInventory}
        disabled={loading}
        class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        title="Refresh inventory"
      >
        <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Search & Filters -->
  {#if showSearch || showTransportFilter}
    <div class="flex gap-2">
      {#if showSearch}
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search nodes..."
            class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if showTransportFilter && transportTypes.length > 1}
        <select
          bind:value={transportFilter}
          class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        >
          <option value="all">All transports</option>
          {#each transportTypes as transport}
            <option value={transport}>{transport}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Node List -->
  {#if loading}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading inventory...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if filteredNodes.length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery || transportFilter !== 'all' ? 'No nodes match your filters' : 'No nodes in inventory'}
    </div>
  {:else}
    <div class="space-y-1 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each filteredNodes as node (node.id)}
        <button
          type="button"
          onclick={() => navigateToNode(node)}
          class="w-full px-3 py-2 flex items-center gap-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors group"
        >
          <div class="{getTransportColor(node.transport)} flex-shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getTransportIcon(node.transport)} />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">
              {node.name}
            </div>
            {#if node.uri && !compact}
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {node.uri}
              </div>
            {/if}
          </div>

          <span class="flex-shrink-0 px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {node.transport}
          </span>

          {#if node.linked}
            <div class="flex-shrink-0" title="Appears in multiple sources">
              <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
          {/if}

          <svg class="w-4 h-4 text-gray-400 group-hover:text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      {/each}
    </div>

    {#if totalCount > displayedCount}
      <div class="text-center">
        <a
          href="/inventory"
          class="text-sm text-amber-600 dark:text-amber-400 hover:underline"
        >
          View all {totalCount} nodes →
        </a>
      </div>
    {/if}
  {/if}
</div>
