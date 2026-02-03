<!--
  Hiera Code Analysis Widget

  Analyzes Puppet code for Hiera lookups and usage patterns.
  Can be rendered in dashboard or standalone-page slots.

  Features:
  - Scan code for Hiera lookups
  - Find hardcoded values that could be in Hiera
  - Detect unused Hiera keys
  - Identify missing keys

  @module plugins/native/hiera/frontend/CodeAnalysis
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

  interface HieraLookup {
    key: string;
    file: string;
    line: number;
    lookupType: 'lookup' | 'hiera' | 'hiera_include' | 'hiera_hash' | 'hiera_array' | 'automatic';
    defaultValue?: unknown;
    hasDefault: boolean;
  }

  interface AnalysisResult {
    lookups: HieraLookup[];
    missingKeys: string[];
    unusedKeys: string[];
    suggestions: AnalysisSuggestion[];
    summary: {
      totalLookups: number;
      uniqueKeys: number;
      filesScanned: number;
      missingCount: number;
    };
  }

  interface AnalysisSuggestion {
    type: 'warning' | 'info' | 'error';
    message: string;
    key?: string;
    file?: string;
    line?: number;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Environment to analyze */
    environment?: string;
    /** Module filter */
    moduleFilter?: string;
    /** Show suggestions */
    showSuggestions?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    environment = 'production',
    moduleFilter = '',
    showSuggestions = true,
    compact = false,
    config = {},
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let analysis = $state<AnalysisResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<'lookups' | 'missing' | 'unused' | 'suggestions'>('lookups');
  let searchQuery = $state('');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredLookups = $derived.by(() => {
    if (!analysis) return [];
    let result = analysis.lookups;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.key.toLowerCase().includes(query) ||
        l.file.toLowerCase().includes(query)
      );
    }

    return result;
  });

  let lookupsByFile = $derived.by(() => {
    const grouped: Record<string, HieraLookup[]> = {};
    for (const lookup of filteredLookups) {
      if (!grouped[lookup.file]) grouped[lookup.file] = [];
      grouped[lookup.file].push(lookup);
    }
    return grouped;
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function runAnalysis(): Promise<void> {
    loading = true;
    error = null;
    try {
      const params: Record<string, string> = { environment };
      if (moduleFilter) params.module = moduleFilter;

      const response = await api.post<AnalysisResult>('/api/hiera/analyze', params);
      analysis = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Analysis failed';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getLookupTypeColor(type: string): string {
    switch (type) {
      case 'lookup': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'automatic': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  }

  function getSuggestionIcon(type: string): string {
    switch (type) {
      case 'error': return '🔴';
      case 'warning': return '🟡';
      case 'info': return '🔵';
      default: return '⚪';
    }
  }
</script>

<div class="code-analysis {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Hiera Code Analysis
      </h3>
    </div>
    <button
      type="button"
      onclick={runAnalysis}
      disabled={loading}
      class="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-lg transition-colors flex items-center gap-1.5"
    >
      {#if loading}
        <LoadingSpinner size="xs" />
        Analyzing...
      {:else}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Analyze
      {/if}
    </button>
  </div>

  <!-- Results -->
  {#if error}
    <ErrorAlert message={error} />
  {:else if !analysis}
    <div class="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Click "Analyze" to scan Puppet code for Hiera usage
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Environment: {environment}
      </p>
    </div>
  {:else}
    <!-- Summary -->
    <div class="grid grid-cols-4 gap-2">
      <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-center">
        <div class="text-lg font-bold text-blue-600 dark:text-blue-400">{analysis.summary.totalLookups}</div>
        <div class="text-xs text-blue-500 dark:text-blue-300">Lookups</div>
      </div>
      <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
        <div class="text-lg font-bold text-green-600 dark:text-green-400">{analysis.summary.uniqueKeys}</div>
        <div class="text-xs text-green-500 dark:text-green-300">Unique Keys</div>
      </div>
      <div class="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
        <div class="text-lg font-bold text-amber-600 dark:text-amber-400">{analysis.missingKeys.length}</div>
        <div class="text-xs text-amber-500 dark:text-amber-300">Missing</div>
      </div>
      <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
        <div class="text-lg font-bold text-gray-600 dark:text-gray-400">{analysis.unusedKeys.length}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Unused</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onclick={() => activeTab = 'lookups'}
        class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'lookups' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
      >
        Lookups ({analysis.lookups.length})
      </button>
      <button
        type="button"
        onclick={() => activeTab = 'missing'}
        class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'missing' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
      >
        Missing ({analysis.missingKeys.length})
      </button>
      <button
        type="button"
        onclick={() => activeTab = 'unused'}
        class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'unused' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
      >
        Unused ({analysis.unusedKeys.length})
      </button>
      {#if showSuggestions && analysis.suggestions.length > 0}
        <button
          type="button"
          onclick={() => activeTab = 'suggestions'}
          class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'suggestions' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
        >
          Suggestions ({analysis.suggestions.length})
        </button>
      {/if}
    </div>


    <!-- Tab Content -->
    <div class="{compact ? 'max-h-48' : 'max-h-72'} overflow-y-auto">
      {#if activeTab === 'lookups'}
        <!-- Search -->
        <div class="mb-2">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Filter lookups..."
            class="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500"
          />
        </div>

        {#if Object.keys(lookupsByFile).length === 0}
          <div class="text-center py-4 text-sm text-gray-500">No lookups found</div>
        {:else}
          <div class="space-y-3">
            {#each Object.entries(lookupsByFile) as [file, lookups] (file)}
              <div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400 truncate mb-1" title={file}>
                  📄 {file.split('/').pop()}
                </div>
                <div class="space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                  {#each lookups as lookup (lookup.key + lookup.line)}
                    <div class="flex items-center gap-2 text-xs py-0.5">
                      <span class="text-gray-400 w-8">L{lookup.line}</span>
                      <span class="px-1.5 py-0.5 rounded {getLookupTypeColor(lookup.lookupType)}">{lookup.lookupType}</span>
                      <span class="font-mono text-gray-700 dark:text-gray-300 truncate">{lookup.key}</span>
                      {#if lookup.hasDefault}
                        <span class="text-green-500" title="Has default value">✓</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'missing'}
        {#if analysis.missingKeys.length === 0}
          <div class="text-center py-4 text-sm text-green-600 dark:text-green-400">
            ✓ No missing keys detected
          </div>
        {:else}
          <div class="space-y-1">
            {#each analysis.missingKeys as key (key)}
              <div class="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-900/20 text-sm">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="font-mono text-amber-700 dark:text-amber-300">{key}</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'unused'}
        {#if analysis.unusedKeys.length === 0}
          <div class="text-center py-4 text-sm text-green-600 dark:text-green-400">
            ✓ No unused keys detected
          </div>
        {:else}
          <div class="space-y-1">
            {#each analysis.unusedKeys as key (key)}
              <div class="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800 text-sm">
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span class="font-mono text-gray-600 dark:text-gray-400">{key}</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'suggestions'}
        {#if analysis.suggestions.length === 0}
          <div class="text-center py-4 text-sm text-gray-500">No suggestions</div>
        {:else}
          <div class="space-y-1">
            {#each analysis.suggestions as suggestion, i (i)}
              <div class="flex items-start gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800 text-sm">
                <span class="flex-shrink-0">{getSuggestionIcon(suggestion.type)}</span>
                <div class="min-w-0">
                  <div class="text-gray-700 dark:text-gray-300">{suggestion.message}</div>
                  {#if suggestion.file}
                    <div class="text-xs text-gray-500 mt-0.5">
                      {suggestion.file}{suggestion.line ? `:${suggestion.line}` : ''}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
