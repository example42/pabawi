<!--
  Hiera Hierarchy Viewer Widget

  Displays the Hiera hierarchy configuration and data sources.
  Can be rendered in node-detail or standalone-page slots.

  Features:
  - Visual hierarchy tree
  - Backend/lookup configuration
  - Path interpolation preview
  - File existence indicators

  @module widgets/hiera/HierarchyViewer
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

  interface HierarchyLevel {
    name: string;
    path: string;
    datadir?: string;
    resolvedPath?: string;
    exists?: boolean;
    keyCount?: number;
  }

  interface HierarchyConfig {
    version: number;
    defaults?: {
      datadir?: string;
      data_hash?: string;
    };
    hierarchy: HierarchyLevel[];
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname for interpolation preview */
    certname?: string;
    /** Environment */
    environment?: string;
    /** Show resolved paths */
    showResolved?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    certname = '',
    environment = 'production',
    showResolved = true,
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let hierarchy = $state<HierarchyConfig | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let expandedLevels = $state<Set<string>>(new Set());

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchHierarchy();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchHierarchy(): Promise<void> {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (certname) params.set('certname', certname);
      if (environment) params.set('environment', environment);

      const queryString = params.toString();
      const url = queryString ? `/api/hiera/hierarchy?${queryString}` : '/api/hiera/hierarchy';

      const response = await get<HierarchyConfig>(url);
      hierarchy = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load hierarchy';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function toggleLevel(name: string): void {
    if (expandedLevels.has(name)) {
      expandedLevels.delete(name);
    } else {
      expandedLevels.add(name);
    }
    expandedLevels = expandedLevels; // Trigger reactivity
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getLevelIcon(level: HierarchyLevel): string {
    if (level.name.toLowerCase().includes('node')) return '💻';
    if (level.name.toLowerCase().includes('role')) return '🎭';
    if (level.name.toLowerCase().includes('env')) return '🌍';
    if (level.name.toLowerCase().includes('common')) return '📦';
    return '📄';
  }

  function interpolatePath(path: string): string {
    if (!certname && !environment) return path;

    let result = path;
    if (certname) {
      result = result.replace(/%\{::?trusted\.certname\}/g, certname)
                     .replace(/%\{::?certname\}/g, certname)
                     .replace(/%\{::?fqdn\}/g, certname);
    }
    if (environment) {
      result = result.replace(/%\{::?environment\}/g, environment);
    }
    return result;
  }

  function hasInterpolation(path: string): boolean {
    return /%\{/.test(path);
  }
</script>

<div class="hierarchy-viewer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Hiera Hierarchy
      </h3>
    </div>
    {#if hierarchy}
      <span class="text-xs text-gray-500 dark:text-gray-400">
        v{hierarchy.version}
      </span>
    {/if}
  </div>

  <!-- Context -->
  {#if certname || environment !== 'production'}
    <div class="flex items-center gap-3 text-xs bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
      {#if certname}
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span class="text-gray-500">Node:</span>
          <span class="font-medium text-gray-700 dark:text-gray-300">{certname}</span>
        </span>
      {/if}
      {#if environment}
        <span class="flex items-center gap-1.5">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
          <span class="text-gray-500">Environment:</span>
          <span class="font-medium text-gray-700 dark:text-gray-300">{environment}</span>
        </span>
      {/if}
    </div>
  {/if}

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading hierarchy...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if !hierarchy || hierarchy.hierarchy.length === 0}
    <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
      No hierarchy configuration found
    </div>
  {:else}
    <!-- Defaults -->
    {#if hierarchy.defaults}
      <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg {compact ? 'p-2' : 'p-3'}">
        <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Defaults</div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          {#if hierarchy.defaults.datadir}
            <div>
              <span class="text-gray-500">datadir:</span>
              <span class="font-mono text-gray-700 dark:text-gray-300 ml-1">{hierarchy.defaults.datadir}</span>
            </div>
          {/if}
          {#if hierarchy.defaults.data_hash}
            <div>
              <span class="text-gray-500">data_hash:</span>
              <span class="font-mono text-gray-700 dark:text-gray-300 ml-1">{hierarchy.defaults.data_hash}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Hierarchy Levels -->
    <div class="space-y-1 {compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto">
      {#each hierarchy.hierarchy as level, index (level.name)}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onclick={() => toggleLevel(level.name)}
            class="w-full px-3 py-2 flex items-center justify-between bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 w-5">{index + 1}.</span>
              <span class="text-lg">{getLevelIcon(level)}</span>
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{level.name}</span>
              {#if level.exists !== undefined}
                {#if level.exists}
                  <span class="px-1.5 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    exists
                  </span>
                {:else}
                  <span class="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    not found
                  </span>
                {/if}
              {/if}
              {#if level.keyCount !== undefined}
                <span class="text-xs text-gray-400">{level.keyCount} keys</span>
              {/if}
            </div>
            <svg
              class="w-4 h-4 text-gray-400 transition-transform {expandedLevels.has(level.name) ? 'rotate-180' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedLevels.has(level.name)}
            <div class="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <!-- Path -->
              <div>
                <span class="text-xs text-gray-500">Path:</span>
                <div class="mt-1 font-mono text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded px-2 py-1.5 break-all">
                  {level.path}
                  {#if hasInterpolation(level.path)}
                    <span class="ml-1 text-purple-500">%{'{...}'}</span>
                  {/if}
                </div>
              </div>

              <!-- Resolved Path -->
              {#if showResolved && hasInterpolation(level.path) && certname}
                <div>
                  <span class="text-xs text-gray-500">Resolved:</span>
                  <div class="mt-1 font-mono text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1.5 break-all">
                    {interpolatePath(level.path)}
                  </div>
                </div>
              {/if}

              <!-- Datadir -->
              {#if level.datadir}
                <div>
                  <span class="text-xs text-gray-500">Data dir:</span>
                  <span class="ml-1 font-mono text-xs text-gray-600 dark:text-gray-400">{level.datadir}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
