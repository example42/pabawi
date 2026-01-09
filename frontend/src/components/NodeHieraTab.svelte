<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  // Types based on backend Hiera types
  interface HieraKeyLocation {
    file: string;
    hierarchyLevel: string;
    lineNumber: number;
    value: unknown;
  }

  interface HieraResolutionInfo {
    key: string;
    resolvedValue: unknown;
    lookupMethod: 'first' | 'unique' | 'hash' | 'deep';
    sourceFile: string;
    hierarchyLevel: string;
    found: boolean;
    allValues?: HieraKeyLocation[];
    interpolatedVariables?: Record<string, unknown>;
  }

  interface HierarchyFileInfo {
    path: string;
    hierarchyLevel: string;
    interpolatedPath: string;
    exists: boolean;
    canResolve: boolean;
    unresolvedVariables?: string[];
  }

  interface NodeHieraDataResponse {
    nodeId: string;
    keys: HieraResolutionInfo[];
    usedKeys: string[];
    unusedKeys: string[];
    factSource: 'puppetdb' | 'local';
    warnings?: string[];
    hierarchyFiles: HierarchyFileInfo[];
    totalKeys: number;
  }

  interface Props {
    nodeId: string;
  }

  let { nodeId }: Props = $props();

  // State
  let hieraData = $state<NodeHieraDataResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let filterMode = $state<'all' | 'used' | 'unused'>('used');
  let classificationMode = $state<'found' | 'classes'>('found');
  let expandedKeys = $state<Set<string>>(new Set());
  let selectedKey = $state<HieraResolutionInfo | null>(null);

  // Fetch Hiera data for the node
  async function fetchHieraData(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<NodeHieraDataResponse>(
        `/api/integrations/hiera/nodes/${nodeId}/data`,
        { maxRetries: 2 }
      );
      hieraData = data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      // Check if it's a "not configured" error
      if (errorMessage.includes('not configured') || errorMessage.includes('503')) {
        error = 'Hiera integration is not configured. Please configure a control repository in the Integration Setup page.';
      } else {
        error = errorMessage;
      }
      console.error('Error fetching Hiera data:', err);
    } finally {
      loading = false;
    }
  }

  // Filter keys based on search and filter mode
  let filteredKeys = $state<HieraResolutionInfo[]>([]);

  $effect(() => {
    if (!hieraData || !hieraData.keys) {
      filteredKeys = [];
      return;
    }

    let keys = hieraData.keys;

    // Apply filter mode
    if (filterMode === 'used') {
      keys = keys.filter(k => hieraData.usedKeys.includes(k.key));
    } else if (filterMode === 'unused') {
      keys = keys.filter(k => hieraData.unusedKeys.includes(k.key));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      keys = keys.filter(k =>
        k.key.toLowerCase().includes(query) ||
        formatValue(k.resolvedValue).toLowerCase().includes(query)
      );
    }

    // Sort alphabetically by key name
    filteredKeys = [...keys].sort((a, b) => a.key.localeCompare(b.key));
  });

  // Check if a key is used
  function isKeyUsed(key: string): boolean {
    return hieraData?.usedKeys.includes(key) ?? false;
  }

  // Toggle key expansion
  function toggleKeyExpansion(key: string): void {
    if (expandedKeys.has(key)) {
      expandedKeys.delete(key);
    } else {
      expandedKeys.add(key);
    }
    expandedKeys = new Set(expandedKeys);
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

  // Get badge class for lookup method
  function getLookupMethodBadgeClass(method: string): string {
    switch (method) {
      case 'first':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'unique':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'hash':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'deep':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Get fact source badge class
  function getFactSourceBadgeClass(source: string): string {
    return source === 'puppetdb'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
  }

  // View key details
  function viewKeyDetails(key: HieraResolutionInfo): void {
    selectedKey = key;
  }

  // Close key details modal
  function closeKeyDetails(): void {
    selectedKey = null;
  }

  onMount(() => {
    fetchHieraData();
  });
</script>


<div class="node-hiera-tab space-y-4">
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading Hiera data..." />
    </div>
  {:else if error}
    <ErrorAlert
      message="Failed to load Hiera data"
      details={error}
      onRetry={fetchHieraData}
    />

    <!-- Setup guidance for unconfigured integration -->
    {#if error.includes('not configured')}
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-start gap-3">
          <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Setup Required</h4>
            <p class="text-sm text-blue-800 dark:text-blue-400 mb-2">
              To view Hiera data for this node, you need to configure the Hiera integration with your Puppet control repository.
            </p>
            <ol class="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>Go to the Integration Setup page</li>
              <li>Configure the path to your Puppet control repository</li>
              <li>Ensure the repository contains a valid hiera.yaml file</li>
              <li>Return to this page to view Hiera data</li>
            </ol>
          </div>
        </div>
      </div>
    {/if}
  {:else if hieraData}
    <!-- Header with stats and fact source -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Hiera Data</h3>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getFactSourceBadgeClass(hieraData.factSource)}">
            Facts: {hieraData.factSource === 'puppetdb' ? 'PuppetDB' : 'Local'}
          </span>
        </div>
        <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>{hieraData.keys.length} total keys</span>
          <span class="text-green-600 dark:text-green-400">{hieraData.usedKeys.length} used</span>
          <span class="text-gray-500 dark:text-gray-500">{hieraData.unusedKeys.length} unused</span>
        </div>
      </div>

      <!-- Warnings -->
      {#if hieraData.warnings && hieraData.warnings.length > 0}
        <div class="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div class="flex items-start gap-2">
            <svg class="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="flex-1">
              {#each hieraData.warnings as warning}
                <p class="text-sm text-yellow-800 dark:text-yellow-400">{warning}</p>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Hierarchy Files Section -->
    {#if hieraData.hierarchyFiles && hieraData.hierarchyFiles.length > 0}
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hierarchy Files</h3>
        <div class="space-y-2">
          {#each hieraData.hierarchyFiles as fileInfo}
            <div class="flex items-center justify-between p-3 rounded-lg border {fileInfo.exists ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'}">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900 dark:text-white">{fileInfo.hierarchyLevel}</span>
                  {#if fileInfo.exists}
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                      Found
                    </span>
                  {:else}
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      Not Found
                    </span>
                  {/if}
                  {#if !fileInfo.canResolve}
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                      Unresolved Variables
                    </span>
                  {/if}
                </div>
                <p class="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1 truncate">{fileInfo.interpolatedPath}</p>
                {#if fileInfo.unresolvedVariables && fileInfo.unresolvedVariables.length > 0}
                  <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Unresolved: {fileInfo.unresolvedVariables.join(', ')}
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Search and Filter Controls -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <!-- Search Input -->
        <div class="relative flex-1">
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
            placeholder="Search keys by name or value..."
            class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
          {#if searchQuery}
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onclick={() => searchQuery = ''}
              aria-label="Clear search"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>

        <!-- Filter Buttons -->
        <div class="flex items-center gap-4">
          <!-- Classification Mode Toggle -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Classification:</span>
            <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium rounded-l-lg {classificationMode === 'found' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => classificationMode = 'found'}
              >
                Found Keys
              </button>
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 rounded-r-lg {classificationMode === 'classes' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => classificationMode = 'classes'}
              >
                Class-Matched
              </button>
            </div>
          </div>

          <!-- Filter Mode Toggle -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
            <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium rounded-l-lg {filterMode === 'all' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => filterMode = 'all'}
              >
                All
              </button>
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 {filterMode === 'used' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => filterMode = 'used'}
              >
                Used
              </button>
              <button
                type="button"
                class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 rounded-r-lg {filterMode === 'unused' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => filterMode = 'unused'}
              >
                Unused
              </button>
            </div>
          </div>
        </div>
      </div>

      {#if searchQuery || filterMode !== 'all'}
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredKeys.length} of {hieraData.keys.length} keys
        </p>
      {/if}

      <!-- Classification Mode Info -->
      {#if classificationMode === 'classes'}
        <div class="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div class="flex items-start gap-2">
            <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="flex-1">
              <p class="text-sm text-blue-800 dark:text-blue-400">
                Class-Matched mode shows the same results as Found Keys mode until class detection is fixed.
                Currently showing all keys with resolved values as "used".
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Keys List -->
    <div class="space-y-2">
      {#if filteredKeys.length === 0}
        <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-gray-500 dark:text-gray-400">
            {searchQuery ? 'No keys match your search' : filterMode !== 'all' ? `No ${filterMode} keys found` : 'No Hiera keys found for this node'}
          </p>
        </div>
      {:else}
        {#each filteredKeys as keyInfo (keyInfo.key)}
          <div class="relative rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 {isKeyUsed(keyInfo.key) ? 'border-l-4 border-l-green-500' : ''}">
            <!-- Key Header -->
            <button
              type="button"
              class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onclick={() => toggleKeyExpansion(keyInfo.key)}
              aria-expanded={expandedKeys.has(keyInfo.key)}
            >
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <svg
                  class="h-5 w-5 flex-shrink-0 transition-transform {expandedKeys.has(keyInfo.key) ? 'rotate-90' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium text-gray-900 dark:text-white truncate">
                      {keyInfo.key}
                    </span>
                    {#if isKeyUsed(keyInfo.key)}
                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                        Used
                      </span>
                    {/if}
                    {#if !keyInfo.found}
                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Not Found
                      </span>
                    {/if}
                  </div>
                  {#if keyInfo.found}
                    <div class="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                      {#if isComplexValue(keyInfo.resolvedValue)}
                        <span class="text-gray-500">{Array.isArray(keyInfo.resolvedValue) ? `Array[${(keyInfo.resolvedValue as unknown[]).length}]` : `Object{${Object.keys(keyInfo.resolvedValue as object).length}}`}</span>
                      {:else}
                        {formatValue(keyInfo.resolvedValue)}
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              <div class="flex items-center gap-2 ml-4">
                {#if expertMode.enabled && keyInfo.found}
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getLookupMethodBadgeClass(keyInfo.lookupMethod)}">
                    {keyInfo.lookupMethod}
                  </span>
                {/if}
              </div>
            </button>

            <!-- Info button (outside the main button to avoid nesting) -->
            <div class="absolute right-4 top-4">
              <button
                type="button"
                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onclick={(e) => { e.stopPropagation(); viewKeyDetails(keyInfo); }}
                aria-label="View key details"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            <!-- Expanded Key Details -->
            {#if expandedKeys.has(keyInfo.key)}
              <div class="border-t border-gray-200 p-4 dark:border-gray-700">
                {#if keyInfo.found}
                  <!-- Resolved Value -->
                  <div class="mb-4">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Resolved Value</h4>
                    <div class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                      {#if isComplexValue(keyInfo.resolvedValue)}
                        <pre class="overflow-x-auto font-mono text-sm text-green-800 dark:text-green-400 whitespace-pre-wrap">{formatValue(keyInfo.resolvedValue)}</pre>
                      {:else}
                        <span class="font-mono text-sm text-green-800 dark:text-green-400">{formatValue(keyInfo.resolvedValue)}</span>
                      {/if}
                    </div>
                  </div>

                  <!-- Source Information -->
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Source File</h4>
                      <p class="text-sm font-mono text-gray-600 dark:text-gray-400">{keyInfo.sourceFile}</p>
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Hierarchy Level</h4>
                      <p class="text-sm text-gray-600 dark:text-gray-400">{keyInfo.hierarchyLevel}</p>
                    </div>
                  </div>

                  <!-- Expert Mode: Additional Details -->
                  {#if expertMode.enabled}
                    <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Expert Details</h4>
                      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <span class="text-sm text-gray-500 dark:text-gray-400">Lookup Method:</span>
                          <span class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getLookupMethodBadgeClass(keyInfo.lookupMethod)}">
                            {keyInfo.lookupMethod}
                          </span>
                        </div>
                        {#if keyInfo.interpolatedVariables && Object.keys(keyInfo.interpolatedVariables).length > 0}
                          <div class="sm:col-span-2">
                            <span class="text-sm text-gray-500 dark:text-gray-400">Interpolated Variables:</span>
                            <div class="mt-1 rounded-lg bg-gray-100 p-2 dark:bg-gray-900">
                              <pre class="font-mono text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(keyInfo.interpolatedVariables, null, 2)}</pre>
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>

                    <!-- All Values from Hierarchy -->
                    {#if keyInfo.allValues && keyInfo.allValues.length > 1}
                      <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Values from All Hierarchy Levels</h4>
                        <div class="space-y-2">
                          {#each keyInfo.allValues as location, index}
                            <div class="rounded-lg border p-3 {index === 0 ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'}">
                              <div class="flex items-start justify-between">
                                <div class="flex-1">
                                  <div class="flex items-center gap-2">
                                    <span class="text-sm font-medium text-gray-900 dark:text-white">{location.hierarchyLevel}</span>
                                    {#if index === 0}
                                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                        Winner
                                      </span>
                                    {/if}
                                  </div>
                                  <p class="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">{location.file}:{location.lineNumber}</p>
                                </div>
                              </div>
                              <div class="mt-2">
                                {#if isComplexValue(location.value)}
                                  <pre class="overflow-x-auto font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{formatValue(location.value)}</pre>
                                {:else}
                                  <span class="font-mono text-sm text-gray-700 dark:text-gray-300">{formatValue(location.value)}</span>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {/if}
                {:else}
                  <div class="text-center py-4">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      This key was not found in any hierarchy level for this node's facts.
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Key Details Modal -->
  {#if selectedKey}
    <div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div class="flex min-h-screen items-center justify-center p-4">
        <!-- Backdrop -->
        <button
          type="button"
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onclick={closeKeyDetails}
          aria-label="Close key details"
        ></button>

        <!-- Panel -->
        <div class="relative z-10 w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-800">
          <!-- Header -->
          <div class="flex items-start justify-between border-b border-gray-200 p-6 dark:border-gray-700">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {selectedKey.key}
              </h3>
              <div class="mt-2 flex items-center gap-2">
                {#if isKeyUsed(selectedKey.key)}
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    Used by node classes
                  </span>
                {/if}
                {#if selectedKey.found}
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getLookupMethodBadgeClass(selectedKey.lookupMethod)}">
                    {selectedKey.lookupMethod} lookup
                  </span>
                {:else}
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    Not Found
                  </span>
                {/if}
              </div>
            </div>
            <button
              type="button"
              class="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              onclick={closeKeyDetails}
              aria-label="Close key details"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="max-h-[60vh] overflow-y-auto p-6">
            {#if selectedKey.found}
              <!-- Resolved Value -->
              <div class="mb-6">
                <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Resolved Value</h4>
                <div class="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                  {#if isComplexValue(selectedKey.resolvedValue)}
                    <pre class="overflow-x-auto font-mono text-sm text-green-800 dark:text-green-400 whitespace-pre-wrap">{formatValue(selectedKey.resolvedValue)}</pre>
                  {:else}
                    <span class="font-mono text-sm text-green-800 dark:text-green-400">{formatValue(selectedKey.resolvedValue)}</span>
                  {/if}
                </div>
              </div>

              <!-- Source Information -->
              <div class="mb-6">
                <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Source</h4>
                <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">File</dt>
                    <dd class="mt-1 text-sm font-mono text-gray-900 dark:text-gray-100">{selectedKey.sourceFile}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Hierarchy Level</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-gray-100">{selectedKey.hierarchyLevel}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Lookup Method</dt>
                    <dd class="mt-1">
                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getLookupMethodBadgeClass(selectedKey.lookupMethod)}">
                        {selectedKey.lookupMethod}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              <!-- Interpolated Variables (Expert Mode) -->
              {#if expertMode.enabled && selectedKey.interpolatedVariables && Object.keys(selectedKey.interpolatedVariables).length > 0}
                <div class="mb-6">
                  <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Interpolated Variables</h4>
                  <div class="rounded-lg bg-gray-100 p-3 dark:bg-gray-900">
                    <pre class="font-mono text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(selectedKey.interpolatedVariables, null, 2)}</pre>
                  </div>
                </div>
              {/if}

              <!-- All Values (Expert Mode) -->
              {#if expertMode.enabled && selectedKey.allValues && selectedKey.allValues.length > 0}
                <div>
                  <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">All Hierarchy Values</h4>
                  <div class="space-y-2">
                    {#each selectedKey.allValues as location, index}
                      <div class="rounded-lg border p-3 {index === 0 ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'}">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-sm font-medium text-gray-900 dark:text-white">{location.hierarchyLevel}</span>
                          {#if index === 0}
                            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                              Winner
                            </span>
                          {/if}
                        </div>
                        <p class="text-xs font-mono text-gray-500 dark:text-gray-400 mb-2">{location.file}:{location.lineNumber}</p>
                        <div class="rounded bg-white p-2 dark:bg-gray-800">
                          {#if isComplexValue(location.value)}
                            <pre class="overflow-x-auto font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{formatValue(location.value)}</pre>
                          {:else}
                            <span class="font-mono text-sm text-gray-700 dark:text-gray-300">{formatValue(location.value)}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {:else}
              <div class="text-center py-8">
                <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-gray-500 dark:text-gray-400">
                  This key was not found in any hierarchy level for this node's facts.
                </p>
                <p class="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  The key may be defined in hieradata but doesn't match this node's fact values.
                </p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
