<!--
  Hiera Explorer Widget

  Explores Hiera keys and values across the hierarchy.
  Can be rendered in dashboard or standalone-page slots.

  Features:
  - Key search/browse
  - Hierarchy visualization
  - Value lookup with interpolation
  - Source file tracking

  @module plugins/native/hiera/frontend/HieraExplorer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface HieraKey {
    key: string;
    source: string;
    environment: string;
    level?: string;
    valueType?: string;
    isEncrypted?: boolean;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Show search */
    showSearch?: boolean;
    /** Show filters */
    showFilters?: boolean;
    /** Show hierarchy levels */
    showHierarchy?: boolean;
    /** Maximum keys to display */
    limit?: number;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when key selected */
    onKeySelect?: (key: HieraKey) => void;
  }

  let {
    showSearch = true,
    showFilters = true,
    showHierarchy = true,
    limit = 50,
    compact = false,
    config = {},
    onKeySelect,
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let keys = $state<HieraKey[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let selectedKey = $state<HieraKey | null>(null);
  let environmentFilter = $state<string>('all');
  let environments = $state<string[]>(['production']);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredKeys = $derived.by(() => {
    let result = keys;

    if (environmentFilter !== 'all') {
      result = result.filter(k => k.environment === environmentFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(k =>
        k.key.toLowerCase().includes(query) ||
        k.source.toLowerCase().includes(query)
      );
    }

    return result.slice(0, limit);
  });

  let keysByLevel = $derived.by(() => {
    const grouped: Record<string, HieraKey[]> = {};
    for (const key of filteredKeys) {
      const level = key.level || 'common';
      if (!grouped[level]) grouped[level] = [];
      grouped[level].push(key);
    }
    return grouped;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchKeys();
    void fetchEnvironments();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchKeys(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await api.get<{ keys: HieraKey[] }>('/api/hiera/keys');
      keys = response.keys || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Hiera keys';
    } finally {
      loading = false;
    }
  }

  async function fetchEnvironments(): Promise<void> {
    try {
      const response = await api.get<{ environments: string[] }>('/api/puppetserver/environments');
      environments = (response.environments || []).map(e => typeof e === 'string' ? e : (e as {name:string}).name);
    } catch {
      // Non-critical
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function selectKey(key: HieraKey): void {
    selectedKey = key;
    onKeySelect?.(key);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getTypeColor(type: string | undefined): string {
    switch (type) {
      case 'string': return 'text-green-600 dark:text-green-400';
      case 'array': return 'text-blue-600 dark:text-blue-400';
      case 'hash': return 'text-purple-600 dark:text-purple-400';
      case 'boolean': return 'text-amber-600 dark:text-amber-400';
      case 'number': return 'text-cyan-600 dark:text-cyan-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getLevelColor(level: string | undefined): string {
    switch (level) {
      case 'node': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'role': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'environment': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'common': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  }
</script>

<div class="hiera-explorer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Hiera Explorer
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {filteredKeys.length} keys
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
            placeholder="Search keys..."
            class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if showFilters && environments.length > 1}
        <select
          bind:value={environmentFilter}
          class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
        >
          <option value="all">All environments</option>
          {#each environments as env}
            <option value={env}>{env}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading keys...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if filteredKeys.length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No keys match your search' : 'No Hiera keys found'}
    </div>
  {:else if showHierarchy}
    <!-- Grouped by Level -->
    <div class="space-y-3 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each Object.entries(keysByLevel) as [level, levelKeys] (level)}
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-1.5 py-0.5 text-xs rounded {getLevelColor(level)}">{level}</span>
            <span class="text-xs text-gray-400">({levelKeys.length})</span>
          </div>
          <div class="space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
            {#each levelKeys as key (key.key + key.source)}
              <button
                type="button"
                onclick={() => selectKey(key)}
                class="w-full px-2 py-1 flex items-center justify-between rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left text-sm group"
              >
                <div class="flex items-center gap-2 min-w-0">
                  {#if key.isEncrypted}
                    <svg class="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  {/if}
                  <span class="text-gray-700 dark:text-gray-300 truncate group-hover:text-red-600 dark:group-hover:text-red-400">
                    {key.key}
                  </span>
                </div>
                {#if key.valueType}
                  <span class="text-xs {getTypeColor(key.valueType)} flex-shrink-0">{key.valueType}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Flat list -->
    <div class="space-y-1 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each filteredKeys as key (key.key + key.source)}
        <button
          type="button"
          onclick={() => selectKey(key)}
          class="w-full px-3 py-2 flex items-center justify-between rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left group"
        >
          <div class="flex items-center gap-2 min-w-0">
            {#if key.isEncrypted}
              <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            {/if}
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-red-600 dark:group-hover:text-red-400">
              {key.key}
            </span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            {#if key.level}
              <span class="px-1.5 py-0.5 text-xs rounded {getLevelColor(key.level)}">{key.level}</span>
            {/if}
            <svg class="w-4 h-4 text-gray-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
