<!--
  Node Hiera Data Widget

  Displays all Hiera data for a specific node.
  Designed for node-detail slot.

  Features:
  - Complete node data overview
  - Source tracking per key
  - Value preview with expansion
  - Quick key lookup

  @module widgets/hiera/NodeHieraData
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import { get } from '../../lib/api';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface HieraDataItem {
    key: string;
    value: unknown;
    source: string;
    level: string;
    valueType: string;
    isEncrypted?: boolean;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname (required) */
    certname: string;
    /** Environment */
    environment?: string;
    /** Show sources */
    showSources?: boolean;
    /** Show search */
    showSearch?: boolean;
    /** Maximum items to display */
    limit?: number;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    certname,
    environment = 'production',
    showSources = true,
    showSearch = true,
    limit = 100,
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let data = $state<HieraDataItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedKeys = $state<Set<string>>(new Set());
  let levelFilter = $state<string>('all');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let levels = $derived.by(() => {
    const uniqueLevels = new Set(data.map(d => d.level));
    return Array.from(uniqueLevels).sort();
  });

  let filteredData = $derived.by(() => {
    let result = data;

    if (levelFilter !== 'all') {
      result = result.filter(d => d.level === levelFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.key.toLowerCase().includes(query) ||
        String(d.value).toLowerCase().includes(query)
      );
    }

    return result.slice(0, limit);
  });

  let dataByLevel = $derived.by(() => {
    const grouped: Record<string, HieraDataItem[]> = {};
    for (const item of filteredData) {
      if (!grouped[item.level]) grouped[item.level] = [];
      grouped[item.level].push(item);
    }
    return grouped;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchNodeData();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchNodeData(): Promise<void> {
    if (!certname) {
      error = 'Node certname is required';
      loading = false;
      return;
    }

    loading = true;
    error = null;
    try {
      const params = new URLSearchParams({ certname });
      if (environment) params.set('environment', environment);

      const response = await get<{ data: HieraDataItem[] }>(`/api/hiera/node-data?${params}`);
      data = response.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load node data';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function toggleKey(key: string): void {
    if (expandedKeys.has(key)) {
      expandedKeys.delete(key);
    } else {
      expandedKeys.add(key);
    }
    expandedKeys = expandedKeys;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function getPreview(value: unknown): string {
    const str = formatValue(value);
    if (str.length > 60) {
      return str.substring(0, 60) + '...';
    }
    return str;
  }

  function isComplex(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'string': return 'text-green-600 dark:text-green-400';
      case 'array': return 'text-blue-600 dark:text-blue-400';
      case 'hash': case 'object': return 'text-purple-600 dark:text-purple-400';
      case 'boolean': return 'text-amber-600 dark:text-amber-400';
      case 'number': case 'integer': case 'float': return 'text-cyan-600 dark:text-cyan-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getLevelColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'node': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'role': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'environment': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'common': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  }
</script>

<div class="node-hiera-data {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Node Hiera Data
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {filteredData.length} of {data.length} keys
    </span>
  </div>

  <!-- Node info -->
  <div class="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
    <span class="font-mono text-gray-700 dark:text-gray-300">{certname}</span>
    {#if environment !== 'production'}
      <span class="text-gray-400">|</span>
      <span class="text-gray-500">{environment}</span>
    {/if}
  </div>

  <!-- Search & Filters -->
  {#if showSearch || levels.length > 1}
    <div class="flex gap-2">
      {#if showSearch}
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search keys or values..."
            class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if levels.length > 1}
        <select
          bind:value={levelFilter}
          class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
        >
          <option value="all">All levels</option>
          {#each levels as level}
            <option value={level}>{level}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading node data...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if filteredData.length === 0}
    <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No keys match your search' : 'No Hiera data found for this node'}
    </div>
  {:else}
    <!-- Data grouped by level -->
    <div class="space-y-3 {compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto">
      {#each Object.entries(dataByLevel) as [level, items] (level)}
        <div>
          <div class="flex items-center gap-2 mb-1 sticky top-0 bg-white dark:bg-gray-900 py-1">
            <span class="px-2 py-0.5 text-xs font-medium rounded {getLevelColor(level)}">{level}</span>
            <span class="text-xs text-gray-400">({items.length})</span>
          </div>
          <div class="space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
            {#each items as item (item.key)}
              <div class="group">
                <button
                  type="button"
                  onclick={() => isComplex(item.value) && toggleKey(item.key)}
                  class="w-full px-2 py-1.5 flex items-start justify-between gap-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left text-sm"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      {#if item.isEncrypted}
                        <svg class="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      {/if}
                      <span class="font-mono text-gray-700 dark:text-gray-300 truncate">{item.key}</span>
                      <span class="text-xs {getTypeColor(item.valueType)}">{item.valueType}</span>
                    </div>
                    {#if !expandedKeys.has(item.key)}
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {getPreview(item.value)}
                      </div>
                    {/if}
                  </div>
                  {#if isComplex(item.value)}
                    <svg
                      class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform {expandedKeys.has(item.key) ? 'rotate-180' : ''}"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  {/if}
                </button>

                {#if expandedKeys.has(item.key)}
                  <div class="mt-1 ml-2 mb-2">
                    <pre class="text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto text-gray-700 dark:text-gray-300">{formatValue(item.value)}</pre>
                    {#if showSources && item.source}
                      <div class="mt-1 text-xs text-gray-400">
                        Source: <span class="font-mono">{item.source}</span>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
