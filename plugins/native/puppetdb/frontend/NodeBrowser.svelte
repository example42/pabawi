<!--
  PuppetDB Node Browser Widget

  Displays nodes from PuppetDB with filtering and search capabilities.
  Can be rendered in dashboard, inventory-panel, or standalone-page slots.

  Features:
  - Node list with status indicators
  - PQL query support
  - Search/filter functionality
  - Last check-in timestamps
  - Quick link to node details

  @module plugins/native/puppetdb/frontend/NodeBrowser
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, router } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PuppetDBNode {
    certname: string;
    deactivated: string | null;
    expired: string | null;
    catalog_timestamp: string | null;
    facts_timestamp: string | null;
    report_timestamp: string | null;
    catalog_environment: string | null;
    latest_report_status: string | null;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Maximum nodes to display */
    limit?: number;
    /** Show search */
    showSearch?: boolean;
    /** Show PQL query input */
    showFilters?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when node selected */
    onNodeSelect?: (node: PuppetDBNode) => void;
  }

  let {
    limit = 50,
    showSearch = true,
    showFilters = false,
    compact = false,
    config = {},
    onNodeSelect,
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let nodes = $state<PuppetDBNode[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let statusFilter = $state<string>('all');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredNodes = $derived.by(() => {
    let result = nodes;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(n => n.latest_report_status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        n => n.certname.toLowerCase().includes(query) ||
             n.catalog_environment?.toLowerCase().includes(query)
      );
    }

    return result.slice(0, limit);
  });

  let statusCounts = $derived.by(() => {
    const counts: Record<string, number> = { all: nodes.length };
    for (const node of nodes) {
      const status = node.latest_report_status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchNodes();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchNodes(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await api.get<{ nodes: PuppetDBNode[] }>('/api/puppetdb/nodes');
      nodes = response.nodes || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load PuppetDB nodes';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToNode(node: PuppetDBNode): void {
    router.navigate(`/inventory/${encodeURIComponent(node.certname)}`);
    onNodeSelect?.(node);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getStatusColor(status: string | null): string {
    switch (status) {
      case 'changed': return 'text-amber-600 dark:text-amber-400';
      case 'unchanged': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  }

  function getStatusBg(status: string | null): string {
    switch (status) {
      case 'changed': return 'bg-amber-100 dark:bg-amber-900/30';
      case 'unchanged': return 'bg-green-100 dark:bg-green-900/30';
      case 'failed': return 'bg-red-100 dark:bg-red-900/30';
      default: return 'bg-gray-100 dark:bg-gray-700';
    }
  }

  function formatTimestamp(timestamp: string | null): string {
    if (!timestamp) return 'Never';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  }
</script>

<div class="puppetdb-node-browser {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        PuppetDB Nodes
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {filteredNodes.length} nodes
    </span>
  </div>

  <!-- Search & Filters -->
  {#if showSearch || showFilters}
    <div class="flex gap-2">
      {#if showSearch}
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search by certname..."
            class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if showFilters}
        <select
          bind:value={statusFilter}
          class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">All ({statusCounts.all})</option>
          {#if statusCounts.unchanged}
            <option value="unchanged">Unchanged ({statusCounts.unchanged})</option>
          {/if}
          {#if statusCounts.changed}
            <option value="changed">Changed ({statusCounts.changed})</option>
          {/if}
          {#if statusCounts.failed}
            <option value="failed">Failed ({statusCounts.failed})</option>
          {/if}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Node List -->
  {#if loading}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading nodes...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if filteredNodes.length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No nodes match your search' : 'No nodes found in PuppetDB'}
    </div>
  {:else}
    <div class="space-y-1 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each filteredNodes as node (node.certname)}
        <button
          type="button"
          onclick={() => navigateToNode(node)}
          class="w-full px-3 py-2 flex items-center gap-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors group"
        >
          <!-- Status Indicator -->
          <div class="w-2 h-2 rounded-full flex-shrink-0 {getStatusBg(node.latest_report_status)}"></div>

          <!-- Node Info -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
              {node.certname}
            </div>
            {#if !compact}
              <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {#if node.catalog_environment}
                  <span>{node.catalog_environment}</span>
                  <span>·</span>
                {/if}
                <span>Last report: {formatTimestamp(node.report_timestamp)}</span>
              </div>
            {/if}
          </div>

          <!-- Status Badge -->
          {#if node.latest_report_status}
            <span class="flex-shrink-0 px-1.5 py-0.5 text-xs rounded capitalize {getStatusColor(node.latest_report_status)} {getStatusBg(node.latest_report_status)}">
              {node.latest_report_status}
            </span>
          {/if}

          <!-- Arrow -->
          <svg class="w-4 h-4 text-gray-400 group-hover:text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      {/each}
    </div>
  {/if}
</div>
