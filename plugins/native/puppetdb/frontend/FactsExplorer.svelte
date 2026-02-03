<!--
  PuppetDB Facts Explorer Widget

  Explores facts for a specific node from PuppetDB.
  Can be rendered in node-detail, standalone-page, or modal slots.

  Features:
  - Hierarchical fact tree view
  - Search/filter facts
  - Expand/collapse all
  - Copy fact values
  - JSON view mode

  @module plugins/native/puppetdb/frontend/FactsExplorer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { showSuccess } from '../../../../frontend/src/lib/toast.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

  type FactValue = string | number | boolean | null | FactValue[] | { [key: string]: FactValue };

  interface Facts {
    [key: string]: FactValue;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname to fetch facts for */
    nodeId?: string;
    /** Show search */
    showSearch?: boolean;
    /** Show expand all button */
    showExpandAll?: boolean;
    /** Initial expanded state */
    initiallyExpanded?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    nodeId = '',
    showSearch = true,
    showExpandAll = true,
    initiallyExpanded = false,
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let facts = $state<Facts | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedKeys = $state<Set<string>>(new Set());
  let viewMode = $state<'tree' | 'json'>('tree');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredFacts = $derived.by(() => {
    if (!facts || !searchQuery.trim()) return facts;

    const query = searchQuery.toLowerCase();

    function matchesQuery(key: string, value: FactValue): boolean {
      if (key.toLowerCase().includes(query)) return true;
      if (typeof value === 'string' && value.toLowerCase().includes(query)) return true;
      if (typeof value === 'number' && value.toString().includes(query)) return true;
      return false;
    }

    function filterObject(obj: Facts, path: string = ''): Facts {
      const result: Facts = {};
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (matchesQuery(key, value)) {
          result[key] = value;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const filtered = filterObject(value as Facts, currentPath);
          if (Object.keys(filtered).length > 0) {
            result[key] = filtered;
          }
        }
      }
      return result;
    }

    return filterObject(facts);
  });

  let factCount = $derived.by(() => {
    function countFacts(obj: Facts | null): number {
      if (!obj) return 0;
      let count = 0;
      for (const value of Object.values(obj)) {
        count++;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          count += countFacts(value as Facts);
        }
      }
      return count;
    }
    return countFacts(facts);
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    if (nodeId) {
      void fetchFacts();
    }
  });

  // Watch for nodeId changes
  $effect(() => {
    if (nodeId) {
      void fetchFacts();
    }
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchFacts(): Promise<void> {
    if (!nodeId) return;

    loading = true;
    error = null;
    try {
      const response = await get<{ facts: Facts }>(`/api/puppetdb/nodes/${encodeURIComponent(nodeId)}/facts`);
      facts = response.facts || {};
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load facts';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function toggleExpand(key: string): void {
    const newExpanded = new Set(expandedKeys);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    expandedKeys = newExpanded;
  }

  function expandAll(): void {
    function collectKeys(obj: Facts, path: string = ''): string[] {
      const keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          keys.push(currentPath);
          keys.push(...collectKeys(value as Facts, currentPath));
        }
      }
      return keys;
    }
    if (facts) {
      expandedKeys = new Set(collectKeys(facts));
    }
  }

  function collapseAll(): void {
    expandedKeys = new Set();
  }

  async function copyValue(value: FactValue): Promise<void> {
    try {
      const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      await navigator.clipboard.writeText(text);
      showSuccess('Copied to clipboard');
    } catch {
      // Fallback
    }
  }

  function formatValue(value: FactValue): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
  }

  function getValueType(value: FactValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function getValueColor(type: string): string {
    switch (type) {
      case 'string': return 'text-green-600 dark:text-green-400';
      case 'number': return 'text-blue-600 dark:text-blue-400';
      case 'boolean': return 'text-purple-600 dark:text-purple-400';
      case 'null': return 'text-gray-400 dark:text-gray-500';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }
</script>

<div class="puppetdb-facts-explorer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Facts Explorer
      </h3>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {factCount} facts
      </span>
      <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onclick={() => viewMode = 'tree'}
          class="px-2 py-1 text-xs {viewMode === 'tree' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}"
        >
          Tree
        </button>
        <button
          type="button"
          onclick={() => viewMode = 'json'}
          class="px-2 py-1 text-xs {viewMode === 'json' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}"
        >
          JSON
        </button>
      </div>
    </div>
  </div>

  <!-- Search & Controls -->
  {#if showSearch || showExpandAll}
    <div class="flex gap-2">
      {#if showSearch}
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search facts..."
            class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if showExpandAll && viewMode === 'tree'}
        <div class="flex gap-1">
          <button
            type="button"
            onclick={expandAll}
            class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 border border-gray-300 dark:border-gray-600 rounded-lg"
          >
            Expand All
          </button>
          <button
            type="button"
            onclick={collapseAll}
            class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 border border-gray-300 dark:border-gray-600 rounded-lg"
          >
            Collapse
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading facts...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if !nodeId}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      Select a node to view facts
    </div>
  {:else if !filteredFacts || Object.keys(filteredFacts).length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No facts match your search' : 'No facts available'}
    </div>
  {:else if viewMode === 'json'}
    <pre class="text-xs font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-auto max-h-80 text-gray-700 dark:text-gray-300">{JSON.stringify(filteredFacts, null, 2)}</pre>
  {:else}
    <!-- Tree View -->
    <div class="space-y-1 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto font-mono text-sm">
      {#snippet renderFact(key: string, value: FactValue, path: string, depth: number)}
        {@const currentPath = path ? `${path}.${key}` : key}
        {@const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)}
        {@const isExpanded = expandedKeys.has(currentPath)}

        <div class="fact-item" style="padding-left: {depth * 16}px">
          <div class="flex items-center gap-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 group">
            {#if isObject}
              <button
                type="button"
                onclick={() => toggleExpand(currentPath)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                class="flex-shrink-0 text-gray-400 hover:text-violet-500"
              >
                <svg class="w-4 h-4 transition-transform {isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            {:else}
              <span class="w-4 flex-shrink-0"></span>
            {/if}

            <span class="text-gray-700 dark:text-gray-300">{key}:</span>

            {#if !isObject}
              <span class="{getValueColor(getValueType(value))} truncate max-w-xs">
                {formatValue(value)}
              </span>
              <button
                type="button"
                onclick={() => copyValue(value)}
                class="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-violet-500 transition-opacity"
                title="Copy value"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            {:else}
              <span class="text-gray-400">{`{${Object.keys(value).length}}`}</span>
            {/if}
          </div>

          {#if isObject && isExpanded}
            {#each Object.entries(value as Facts) as [childKey, childValue] (childKey)}
              {@render renderFact(childKey, childValue, currentPath, depth + 1)}
            {/each}
          {/if}
        </div>
      {/snippet}

      {#each Object.entries(filteredFacts) as [key, value] (key)}
        {@render renderFact(key, value, '', 0)}
      {/each}
    </div>
  {/if}
</div>
