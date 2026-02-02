<!--
  Bolt Facts Viewer Widget

  Displays facts gathered from a node via Bolt.
  Designed for the node-detail slot.

  Features:
  - Categorized fact display
  - Search/filter functionality
  - Expandable sections
  - Copy to clipboard

  @module plugins/native/bolt/frontend/FactsViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, toast } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Facts {
    nodeId: string;
    gatheredAt: string;
    source?: string;
    facts: {
      os?: {
        family: string;
        name: string;
        release: {
          full: string;
          major: string;
        };
      };
      processors?: {
        count: number;
        models: string[];
      };
      memory?: {
        system: {
          total: string;
          available: string;
        };
      };
      networking?: {
        hostname: string;
        interfaces: Record<string, unknown>;
      };
      [key: string]: unknown;
    };
    command?: string;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node ID to fetch facts for */
    nodeId: string;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    nodeId,
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let facts = $state<Facts | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedSections = $state<Set<string>>(new Set(['os', 'processors', 'memory', 'networking']));

  // ==========================================================================
  // Derived
  // ==========================================================================

  let factCategories = $derived.by(() => {
    if (!facts?.facts) return [];

    const categories: { key: string; label: string; data: unknown }[] = [];
    const priorityKeys = ['os', 'processors', 'memory', 'networking'];

    // Add priority categories first
    for (const key of priorityKeys) {
      if (facts.facts[key]) {
        categories.push({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          data: facts.facts[key],
        });
      }
    }

    // Add remaining categories
    for (const [key, value] of Object.entries(facts.facts)) {
      if (!priorityKeys.includes(key) && value !== undefined) {
        categories.push({
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
          data: value,
        });
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return categories.filter(cat => {
        const dataStr = JSON.stringify(cat.data).toLowerCase();
        return cat.label.toLowerCase().includes(query) || dataStr.includes(query);
      });
    }

    return categories;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchFacts();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchFacts(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await api.get<Facts>(`/api/nodes/${encodeURIComponent(nodeId)}/facts?source=bolt`);
      facts = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load facts';
    } finally {
      loading = false;
    }
  }

  async function refreshFacts(): Promise<void> {
    await fetchFacts();
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function toggleSection(key: string): void {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    expandedSections = newExpanded;
  }

  async function copyToClipboard(data: unknown): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success('Copied to clipboard');
    } catch {
      // Fallback for older browsers
      const text = JSON.stringify(data, null, 2);
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Copied to clipboard');
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  function isSimpleValue(value: unknown): boolean {
    return typeof value !== 'object' || value === null;
  }
</script>

<div class="bolt-facts-viewer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Facts (Bolt)
      </h3>
    </div>
    <div class="flex items-center gap-2">
      {#if facts?.gatheredAt}
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {new Date(facts.gatheredAt).toLocaleString()}
        </span>
      {/if}
      <button
        type="button"
        onclick={refreshFacts}
        disabled={loading}
        class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        title="Refresh facts"
      >
        <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      {#if facts}
        <button
          type="button"
          onclick={() => copyToClipboard(facts?.facts)}
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Copy all facts"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Search -->
  <div class="relative">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search facts..."
      class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
    />
    <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  </div>

  <!-- Facts Content -->
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner />
      <span class="ml-2 text-sm text-gray-500">Loading facts...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if factCategories.length === 0}
    <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No facts match your search' : 'No facts available'}
    </div>
  {:else}
    <div class="space-y-2 {compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto">
      {#each factCategories as category (category.key)}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onclick={() => toggleSection(category.key)}
            class="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
          >
            <span class="font-medium text-sm text-gray-700 dark:text-gray-300">{category.label}</span>
            <svg class="w-4 h-4 text-gray-400 transition-transform {expandedSections.has(category.key) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedSections.has(category.key)}
            <div class="p-3 bg-white dark:bg-gray-900">
              {#if isSimpleValue(category.data)}
                <span class="text-sm text-gray-700 dark:text-gray-300 font-mono">
                  {formatValue(category.data)}
                </span>
              {:else if typeof category.data === 'object' && category.data !== null}
                <div class="space-y-1">
                  {#each Object.entries(category.data) as [key, value] (key)}
                    <div class="flex items-start gap-2">
                      <span class="text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[100px]">{key}:</span>
                      {#if isSimpleValue(value)}
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-mono break-all">
                          {formatValue(value)}
                        </span>
                      {:else}
                        <pre class="text-xs text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-800 p-1 rounded overflow-x-auto max-w-full">{formatValue(value)}</pre>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <pre class="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">{formatValue(category.data)}</pre>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
