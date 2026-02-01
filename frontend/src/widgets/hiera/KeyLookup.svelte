<!--
  Hiera Key Lookup Widget

  Performs Hiera key lookups with full hierarchy traversal.
  Can be rendered in node-detail, modal, or sidebar slots.

  Features:
  - Key search with autocomplete
  - Value resolution showing full hierarchy
  - Interpolation details
  - Copy to clipboard

  @module widgets/hiera/KeyLookup
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

  interface LookupResult {
    key: string;
    value: unknown;
    found: boolean;
    source?: string;
    hierarchy?: HierarchyLevel[];
    interpolated?: boolean;
    originalValue?: string;
  }

  interface HierarchyLevel {
    level: string;
    path: string;
    exists: boolean;
    value?: unknown;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Initial key to lookup */
    initialKey?: string;
    /** Node certname for node-specific lookups */
    certname?: string;
    /** Environment for lookup */
    environment?: string;
    /** Show hierarchy details */
    showHierarchy?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    initialKey = '',
    certname = '',
    environment = 'production',
    showHierarchy = true,
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  // Capture initial prop value (intentionally non-reactive)
  const initialKeyValue = initialKey;
  let keyInput = $state(initialKeyValue);
  let result = $state<LookupResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let recentKeys = $state<string[]>([]);
  let showSuggestions = $state(false);
  let copied = $state(false);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let formattedValue = $derived.by(() => {
    if (!result?.value) return 'null';
    try {
      return JSON.stringify(result.value, null, 2);
    } catch {
      return String(result.value);
    }
  });

  let valueType = $derived.by(() => {
    if (!result?.value) return 'null';
    if (Array.isArray(result.value)) return 'array';
    return typeof result.value;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    loadRecentKeys();
    if (initialKey) {
      void performLookup();
    }
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function performLookup(): Promise<void> {
    if (!keyInput.trim()) {
      error = 'Please enter a key to lookup';
      return;
    }

    loading = true;
    error = null;
    result = null;

    try {
      const params = new URLSearchParams({ key: keyInput.trim() });
      if (certname) params.set('certname', certname);
      if (environment) params.set('environment', environment);

      const response = await get<LookupResult>(`/api/hiera/lookup?${params}`);
      result = response;
      addToRecentKeys(keyInput.trim());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Lookup failed';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function addToRecentKeys(key: string): void {
    const filtered = recentKeys.filter(k => k !== key);
    recentKeys = [key, ...filtered].slice(0, 10);
    localStorage.setItem('hiera-recent-keys', JSON.stringify(recentKeys));
  }

  function loadRecentKeys(): void {
    try {
      const stored = localStorage.getItem('hiera-recent-keys');
      if (stored) recentKeys = JSON.parse(stored);
    } catch {
      // Ignore
    }
  }

  function selectSuggestion(key: string): void {
    keyInput = key;
    showSuggestions = false;
    void performLookup();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      void performLookup();
    }
  }

  async function copyValue(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formattedValue);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // Ignore
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getTypeColor(type: string): string {
    switch (type) {
      case 'string': return 'text-green-600 dark:text-green-400';
      case 'array': return 'text-blue-600 dark:text-blue-400';
      case 'object': return 'text-purple-600 dark:text-purple-400';
      case 'boolean': return 'text-amber-600 dark:text-amber-400';
      case 'number': return 'text-cyan-600 dark:text-cyan-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }
</script>

<div class="key-lookup {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
      Hiera Key Lookup
    </h3>
  </div>

  <!-- Search Input -->
  <div class="relative">
    <div class="flex gap-2">
      <div class="flex-1 relative">
        <input
          type="text"
          bind:value={keyInput}
          onkeydown={handleKeyDown}
          onfocus={() => showSuggestions = recentKeys.length > 0}
          onblur={() => setTimeout(() => showSuggestions = false, 150)}
          placeholder="Enter Hiera key (e.g., profile::apache::port)"
          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
        />

        <!-- Suggestions -->
        {#if showSuggestions && recentKeys.length > 0}
          <div class="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              Recent lookups
            </div>
            {#each recentKeys as recentKey (recentKey)}
              <button
                type="button"
                onclick={() => selectSuggestion(recentKey)}
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
              >
                {recentKey}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button
        type="button"
        onclick={performLookup}
        disabled={loading || !keyInput.trim()}
        class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-lg transition-colors"
      >
        {#if loading}
          <LoadingSpinner size="xs" />
        {:else}
          Lookup
        {/if}
      </button>
    </div>

    <!-- Context info -->
    {#if certname || environment !== 'production'}
      <div class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {#if certname}
          <span>Node: <span class="text-gray-700 dark:text-gray-300">{certname}</span></span>
        {/if}
        {#if environment !== 'production'}
          <span>Env: <span class="text-gray-700 dark:text-gray-300">{environment}</span></span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Error -->
  {#if error}
    <ErrorAlert message={error} variant="inline" />
  {/if}

  <!-- Result -->
  {#if result}
    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 {compact ? 'p-2' : 'p-4'}">
      {#if !result.found}
        <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="text-sm font-medium">Key not found: {result.key}</span>
        </div>
      {:else}
        <div class="space-y-3">
          <!-- Key & Type -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm font-mono text-gray-700 dark:text-gray-300">{result.key}</span>
              <span class="px-1.5 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 {getTypeColor(valueType)}">
                {valueType}
              </span>
              {#if result.interpolated}
                <span class="px-1.5 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  interpolated
                </span>
              {/if}
            </div>
            <button
              type="button"
              onclick={copyValue}
              class="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Copy value"
            >
              {#if copied}
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              {:else}
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              {/if}
            </button>
          </div>

          <!-- Value -->
          <div class="relative">
            <pre class="text-sm font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto max-h-48 overflow-y-auto text-gray-800 dark:text-gray-200">{formattedValue}</pre>
          </div>

          <!-- Source -->
          {#if result.source}
            <div class="text-xs text-gray-500 dark:text-gray-400">
              Source: <span class="font-mono text-gray-600 dark:text-gray-300">{result.source}</span>
            </div>
          {/if}

          <!-- Hierarchy -->
          {#if showHierarchy && result.hierarchy && result.hierarchy.length > 0}
            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Hierarchy Lookup Order</div>
              <div class="space-y-1">
                {#each result.hierarchy as level, i (level.path)}
                  <div class="flex items-center gap-2 text-xs">
                    <span class="w-4 text-gray-400">{i + 1}.</span>
                    {#if level.exists}
                      <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    {:else}
                      <svg class="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    {/if}
                    <span class="font-medium text-gray-600 dark:text-gray-400">{level.level}:</span>
                    <span class="font-mono text-gray-500 dark:text-gray-500 truncate">{level.path}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
