<!--
  Hiera Key Values Grid Widget

  Displays Hiera keys and values in a grid/table format.
  Can be rendered in standalone-page or modal slots.

  Features:
  - Sortable columns
  - Value type indicators
  - Export capability
  - Inline value editing (if permitted)

  @module plugins/native/hiera/frontend/KeyValuesGrid
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

  interface HieraKeyValue {
    key: string;
    value: unknown;
    source: string;
    level: string;
    environment: string;
    valueType: string;
    isEncrypted?: boolean;
    lastModified?: string;
  }

  type SortField = 'key' | 'level' | 'valueType' | 'source';
  type SortDirection = 'asc' | 'desc';

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Environment filter */
    environment?: string;
    /** Level filter */
    levelFilter?: string;
    /** Show export button */
    showExport?: boolean;
    /** Enable sorting */
    sortable?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when key selected */
    onKeySelect?: (item: HieraKeyValue) => void;
  }

  let {
    environment = 'production',
    levelFilter = '',
    showExport = true,
    sortable = true,
    compact = false,
    config = {},
    onKeySelect,
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let data = $state<HieraKeyValue[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let sortField = $state<SortField>('key');
  let sortDirection = $state<SortDirection>('asc');
  let selectedItem = $state<HieraKeyValue | null>(null);
  let showValueModal = $state(false);
  let internalLevelFilter = $state('');

  // Sync levelFilter prop to internal state
  $effect(() => {
    internalLevelFilter = levelFilter || '';
  });

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredData = $derived.by(() => {
    let result = data;

    if (internalLevelFilter) {
      result = result.filter(d => d.level === internalLevelFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.key.toLowerCase().includes(query) ||
        d.source.toLowerCase().includes(query) ||
        String(d.value).toLowerCase().includes(query)
      );
    }

    if (sortable) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          return sortDirection === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return result;
  });

  let levels = $derived.by(() => {
    const uniqueLevels = new Set(data.map(d => d.level));
    return Array.from(uniqueLevels).sort();
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchData();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchData(): Promise<void> {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (environment) params.set('environment', environment);

      const queryString = params.toString();
      const url = queryString ? `/api/hiera/all-keys?${queryString}` : '/api/hiera/all-keys';

      const response = await api.get<{ keys: HieraKeyValue[] }>(url);
      data = response.keys || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function toggleSort(field: SortField): void {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
  }

  function selectItem(item: HieraKeyValue): void {
    selectedItem = item;
    showValueModal = true;
    onKeySelect?.(item);
  }

  function exportData(): void {
    const csv = [
      ['Key', 'Value', 'Type', 'Level', 'Source', 'Environment'].join(','),
      ...filteredData.map(d => [
        `"${d.key}"`,
        `"${String(d.value).replace(/"/g, '""')}"`,
        d.valueType,
        d.level,
        `"${d.source}"`,
        d.environment
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hiera-keys-${environment}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

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

  function getLevelBadgeColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'node': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'role': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'environment': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'common': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  }

  function formatValuePreview(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      const str = JSON.stringify(value);
      return str.length > 40 ? str.substring(0, 40) + '...' : str;
    }
    const str = String(value);
    return str.length > 40 ? str.substring(0, 40) + '...' : str;
  }

  function formatFullValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
</script>


<div class="key-values-grid {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Hiera Key Values
      </h3>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {filteredData.length} keys
      </span>
      {#if showExport && filteredData.length > 0}
        <button
          type="button"
          onclick={exportData}
          class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          title="Export to CSV"
        >
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Search & Filter -->
  <div class="flex gap-2">
    <div class="flex-1 relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search keys, values, sources..."
        class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
      />
      <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    {#if levels.length > 1}
      <select
        bind:value={internalLevelFilter}
        class="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
      >
        <option value="">All levels</option>
        {#each levels as level}
          <option value={level}>{level}</option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading data...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if filteredData.length === 0}
    <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No keys match your search' : 'No Hiera data found'}
    </div>
  {:else}
    <!-- Table -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div class="{compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {#if sortable}
                  <button
                    type="button"
                    onclick={() => toggleSort('key')}
                    class="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Key
                    {#if sortField === 'key'}
                      <svg class="w-3 h-3 {sortDirection === 'desc' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                      </svg>
                    {/if}
                  </button>
                {:else}
                  Key
                {/if}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Value</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">
                {#if sortable}
                  <button
                    type="button"
                    onclick={() => toggleSort('valueType')}
                    class="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Type
                    {#if sortField === 'valueType'}
                      <svg class="w-3 h-3 {sortDirection === 'desc' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                      </svg>
                    {/if}
                  </button>
                {:else}
                  Type
                {/if}
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                {#if sortable}
                  <button
                    type="button"
                    onclick={() => toggleSort('level')}
                    class="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Level
                    {#if sortField === 'level'}
                      <svg class="w-3 h-3 {sortDirection === 'desc' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                      </svg>
                    {/if}
                  </button>
                {:else}
                  Level
                {/if}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {#each filteredData as item (item.key + item.source)}
              <tr
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onclick={() => selectItem(item)}
              >
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1.5">
                    {#if item.isEncrypted}
                      <svg class="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    {/if}
                    <span class="font-mono text-gray-700 dark:text-gray-300 truncate max-w-xs" title={item.key}>{item.key}</span>
                  </div>
                </td>
                <td class="px-3 py-2">
                  <span class="font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs block" title={formatFullValue(item.value)}>{formatValuePreview(item.value)}</span>
                </td>
                <td class="px-3 py-2">
                  <span class="text-xs {getTypeColor(item.valueType)}">{item.valueType}</span>
                </td>
                <td class="px-3 py-2">
                  <span class="px-1.5 py-0.5 text-xs rounded {getLevelBadgeColor(item.level)}">{item.level}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Value Modal -->
{#if showValueModal && selectedItem}
  <div
    role="button"
    tabindex="0"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={() => showValueModal = false}
    onkeydown={(e) => e.key === 'Escape' && (showValueModal = false)}
    aria-label="Close modal"
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (showValueModal = false)}
    >
      <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 class="font-medium text-gray-900 dark:text-white truncate">{selectedItem.key}</h3>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs {getTypeColor(selectedItem.valueType)}">{selectedItem.valueType}</span>
            <span class="px-1.5 py-0.5 text-xs rounded {getLevelBadgeColor(selectedItem.level)}">{selectedItem.level}</span>
          </div>
        </div>
        <button
          type="button"
          onclick={() => showValueModal = false}
          aria-label="Close value modal"
          class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-4 overflow-y-auto">
        <pre class="font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-4 overflow-x-auto text-gray-800 dark:text-gray-200">{formatFullValue(selectedItem.value)}</pre>
        <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <div>Source: <span class="font-mono">{selectedItem.source}</span></div>
          <div>Environment: {selectedItem.environment}</div>
        </div>
      </div>
    </div>
  </div>
{/if}
