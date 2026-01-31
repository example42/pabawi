<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { debugMode } from '../lib/debug';
  import { router } from '../lib/router.svelte';

  // Types based on backend Hiera types
  interface HieraKeyInfo {
    name: string;
    locationCount: number;
    hasLookupOptions: boolean;
  }

  interface KeyNodeValue {
    nodeId: string;
    value: unknown;
    sourceFile: string;
    hierarchyLevel: string;
    found: boolean;
  }

  interface ValueGroup {
    value: unknown;
    valueString: string;
    nodes: string[];
  }

  interface KeySearchResponse {
    keys: HieraKeyInfo[];
    query: string;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    _debug?: DebugInfo;
  }

  interface KeyNodesResponse {
    key: string;
    nodes: KeyNodeValue[];
    groupedByValue: ValueGroup[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    _debug?: DebugInfo;
  }

  interface Props {
    onDebugInfo?: (info: DebugInfo | null) => void;
  }

  let { onDebugInfo }: Props = $props();

  // State
  let searchQuery = $state('');
  let searchResults = $state<HieraKeyInfo[]>([]);
  let selectedKey = $state<string | null>(null);
  let keyNodeData = $state<KeyNodesResponse | null>(null);
  let searchLoading = $state(false);
  let keyDataLoading = $state(false);
  let searchError = $state<string | null>(null);
  let keyDataError = $state<string | null>(null);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let viewMode = $state<'grouped' | 'list'>('grouped');

  // Search for keys
  async function searchKeys(query: string): Promise<void> {
    if (!query.trim()) {
      searchResults = [];
      return;
    }

    searchLoading = true;
    searchError = null;

    try {
      const data = await get<KeySearchResponse>(
        `/api/integrations/hiera/keys/search?q=${encodeURIComponent(query)}&pageSize=20`,
        { maxRetries: 2 }
      );
      searchResults = data.keys;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      if (errorMessage.includes('not configured') || errorMessage.includes('503')) {
        searchError = 'Hiera integration is not configured. Please configure a control repository in the Integration Setup page.';
      } else {
        searchError = errorMessage;
      }
      console.error('Error searching Hiera keys:', err);
    } finally {
      searchLoading = false;
    }
  }

  // Debounced search
  function handleSearchInput(): void {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      searchKeys(searchQuery);
    }, 300);
  }

  // Select a key and fetch node data
  async function selectKey(keyName: string): Promise<void> {
    selectedKey = keyName;
    keyDataLoading = true;
    keyDataError = null;
    keyNodeData = null;

    try {
      const data = await get<KeyNodesResponse>(
        `/api/integrations/hiera/keys/${encodeURIComponent(keyName)}/nodes?pageSize=100`,
        { maxRetries: 2 }
      );
      keyNodeData = data;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      keyDataError = errorMessage;
      console.error('Error fetching key node data:', err);
      showError('Failed to load key data', errorMessage);
    } finally {
      keyDataLoading = false;
    }
  }

  // Clear selection
  function clearSelection(): void {
    selectedKey = null;
    keyNodeData = null;
    keyDataError = null;
  }

  // Format value for display
  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value, null, 2);
  }

  // Check if value is complex (object or array)
  function isComplexValue(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }

  // Navigate to node detail page
  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}?tab=hiera`);
  }

  // Get value display class based on whether key was found
  function getValueClass(found: boolean): string {
    return found
      ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
      : 'bg-gray-50 border-gray-200 dark:bg-gray-900/50 dark:border-gray-700';
  }

  // Clean up on unmount
  onMount(() => {
    return () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
    };
  });
</script>

<div class="global-hiera-tab space-y-4">
  <!-- Search Section -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Global Hiera Key Search</h3>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
      Search for any Hiera key and see its resolved value across all nodes in your infrastructure.
    </p>

    <!-- Search Input -->
    <div class="relative">
      <svg
        class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        oninput={handleSearchInput}
        placeholder="Search for a Hiera key (e.g., profile::nginx::port)..."
        class="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
      />
      {#if searchQuery}
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onclick={() => { searchQuery = ''; searchResults = []; clearSelection(); }}
          aria-label="Clear search"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Search Results Dropdown -->
    {#if searchQuery && !selectedKey}
      <div class="mt-2 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 max-h-64 overflow-y-auto">
        {#if searchLoading}
          <div class="flex items-center justify-center py-4">
            <LoadingSpinner size="sm" message="Searching..." />
          </div>
        {:else if searchError}
          <div class="p-4 text-sm text-red-600 dark:text-red-400">{searchError}</div>
        {:else if searchResults.length === 0}
          <div class="p-4 text-sm text-gray-500 dark:text-gray-400">
            No keys found matching "{searchQuery}"
          </div>
        {:else}
          {#each searchResults as key (key.name)}
            <button
              type="button"
              class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              onclick={() => selectKey(key.name)}
            >
              <div class="flex items-center justify-between">
                <span class="font-mono text-sm text-gray-900 dark:text-white">{key.name}</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {key.locationCount} location{key.locationCount !== 1 ? 's' : ''}
                  </span>
                  {#if key.hasLookupOptions}
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                      lookup_options
                    </span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>


  <!-- Selected Key Results -->
  {#if selectedKey}
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <!-- Key Header -->
      <div class="border-b border-gray-200 p-4 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onclick={clearSelection}
              aria-label="Back to search"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 class="text-lg font-semibold font-mono text-gray-900 dark:text-white">{selectedKey}</h3>
          </div>

          <!-- View Mode Toggle -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">View:</span>
            <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium rounded-l-lg {viewMode === 'grouped' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => viewMode = 'grouped'}
              >
                Grouped
              </button>
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 rounded-r-lg {viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => viewMode = 'list'}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Data Content -->
      <div class="p-4">
        {#if keyDataLoading}
          <div class="flex justify-center py-12">
            <LoadingSpinner size="lg" message="Loading key data across nodes..." />
          </div>
        {:else if keyDataError}
          <ErrorAlert
            message="Failed to load key data"
            details={keyDataError}
            onRetry={() => selectKey(selectedKey!)}
          />
        {:else if keyNodeData}
          <!-- Summary Stats -->
          <div class="mb-4 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>{keyNodeData.total} node{keyNodeData.total !== 1 ? 's' : ''}</span>
            <span class="text-green-600 dark:text-green-400">
              {keyNodeData.nodes.filter(n => n.found).length} with value
            </span>
            <span class="text-gray-500 dark:text-gray-500">
              {keyNodeData.nodes.filter(n => !n.found).length} not defined
            </span>
            {#if keyNodeData.groupedByValue.length > 0}
              <span class="text-purple-600 dark:text-purple-400">
                {keyNodeData.groupedByValue.length} unique value{keyNodeData.groupedByValue.length !== 1 ? 's' : ''}
              </span>
            {/if}
          </div>

          {#if viewMode === 'grouped'}
            <!-- Grouped by Value View -->
            <div class="space-y-4">
              {#if keyNodeData.groupedByValue.length === 0}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
                  <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-gray-500 dark:text-gray-400">
                    This key is not defined for any nodes
                  </p>
                </div>
              {:else}
                {#each keyNodeData.groupedByValue as group, index (index)}
                  {@const nodesWithThisValue = keyNodeData.nodes.filter(n => group.nodes.includes(n.nodeId))}
                  {@const sourceFiles = [...new Set(nodesWithThisValue.map(n => n.sourceFile).filter(Boolean))]}
                  {@const hierarchyLevels = [...new Set(nodesWithThisValue.map(n => n.hierarchyLevel).filter(Boolean))]}
                  <div class="rounded-lg border border-gray-200 dark:border-gray-700">
                    <!-- Value Header -->
                    <div class="border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                            Value {index + 1}
                          </span>
                          <span class="text-sm text-gray-600 dark:text-gray-400">
                            {group.nodes.length} node{group.nodes.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      <!-- Source Files and Hierarchy Info -->
                      {#if sourceFiles.length > 0}
                        <div class="mt-2 space-y-1">
                          {#each sourceFiles as sourceFile}
                            <div class="flex items-start gap-2 text-xs">
                              <svg class="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span class="font-mono text-gray-700 dark:text-gray-300 break-all">{sourceFile}</span>
                            </div>
                          {/each}
                          {#if hierarchyLevels.length > 0 && hierarchyLevels[0]}
                            <div class="flex items-center gap-2 text-xs">
                              <svg class="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                              </svg>
                              <span class="text-gray-600 dark:text-gray-400">
                                Level: <span class="font-medium text-gray-700 dark:text-gray-300">{hierarchyLevels.join(', ')}</span>
                              </span>
                            </div>
                          {/if}
                        </div>
                      {/if}

                      <div class="mt-2 rounded-lg bg-white p-2 dark:bg-gray-800">
                        {#if isComplexValue(group.value)}
                          <pre class="overflow-x-auto font-mono text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{formatValue(group.value)}</pre>
                        {:else}
                          <span class="font-mono text-sm text-gray-800 dark:text-gray-200">{formatValue(group.value)}</span>
                        {/if}
                      </div>
                    </div>

                    <!-- Nodes List -->
                    <div class="p-3">
                      <div class="flex flex-wrap gap-2">
                        {#each group.nodes as nodeId, nodeIndex (`${index}-${nodeIndex}`)}
                          <button
                            type="button"
                            class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                            onclick={() => navigateToNode(nodeId)}
                          >
                            <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                            {nodeId}
                          </button>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}

              <!-- Nodes where key is not defined -->
              {#if keyNodeData.nodes.filter(n => !n.found).length > 0}
                <div class="rounded-lg border border-gray-200 dark:border-gray-700">
                  <div class="border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Not Defined
                      </span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">
                        {keyNodeData.nodes.filter(n => !n.found).length} node{keyNodeData.nodes.filter(n => !n.found).length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      This key is not defined in any hierarchy level for these nodes
                    </p>
                  </div>
                  <div class="p-3">
                    <div class="flex flex-wrap gap-2">
                      {#each keyNodeData.nodes.filter(n => !n.found) as node, nodeIndex (`notfound-${nodeIndex}`)}
                        <button
                          type="button"
                          class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
                          onclick={() => navigateToNode(node.nodeId)}
                        >
                          <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          {node.nodeId}
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <!-- List View -->
            <div class="space-y-2">
              {#if keyNodeData.nodes.length === 0}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
                  <p class="text-gray-500 dark:text-gray-400">No nodes found</p>
                </div>
              {:else}
                {#each keyNodeData.nodes as node (node.nodeId)}
                  <div class="rounded-lg border {getValueClass(node.found)} p-3">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <button
                          type="button"
                          class="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                          onclick={() => navigateToNode(node.nodeId)}
                        >
                          {node.nodeId}
                        </button>
                        {#if node.found}
                          <div class="mt-2">
                            {#if isComplexValue(node.value)}
                              <pre class="overflow-x-auto font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{formatValue(node.value)}</pre>
                            {:else}
                              <span class="font-mono text-sm text-gray-700 dark:text-gray-300">{formatValue(node.value)}</span>
                            {/if}
                          </div>
                          {#if debugMode.enabled}
                            <div class="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span>Source: {node.sourceFile}</span>
                              <span>Level: {node.hierarchyLevel}</span>
                            </div>
                          {/if}
                        {:else}
                          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 italic">Not defined</p>
                        {/if}
                      </div>
                      <div class="ml-4">
                        {#if node.found}
                          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                            Defined
                          </span>
                        {:else}
                          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                            Not Defined
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Empty State when no search -->
  {#if !searchQuery && !selectedKey}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Search for a Hiera Key</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Enter a key name above to see its resolved value across all nodes. You can search by partial key name.
      </p>
      <div class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p class="font-medium mb-2">Example searches:</p>
        <div class="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            onclick={() => { searchQuery = 'profile::'; handleSearchInput(); }}
          >
            profile::
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            onclick={() => { searchQuery = 'ntp'; handleSearchInput(); }}
          >
            ntp
          </button>
          <button
            type="button"
            class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            onclick={() => { searchQuery = 'classes'; handleSearchInput(); }}
          >
            classes
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
