<!--
  Bolt Home Widget

  A lightweight summary tile displayed on the home page showing Bolt integration status.
  Uses Bolt's orange color (#FFAE1A) for theming.

  Features:
  - Node count from inventory
  - Available tasks count
  - Health status indicator
  - Quick link to Bolt integration page

  Loads independently from /api/plugins/bolt/summary endpoint.

  @module plugins/native/bolt/frontend/HomeWidget
  @version 1.1.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, router } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PluginSummary {
    pluginName: string;
    displayName: string;
    metrics: {
      nodeCount: number;
      tasksAvailable: number;
      projectPath?: string;
    };
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let { config = {} }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let summary = $state<PluginSummary | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let isHealthy = $derived(summary?.healthy ?? false);
  let nodeCount = $derived(summary?.metrics.nodeCount ?? 0);
  let tasksAvailable = $derived(summary?.metrics.tasksAvailable ?? 0);

  let statusColor = $derived.by(() => {
    if (!summary) return 'bg-gray-400';
    return summary.healthy ? 'bg-green-500' : 'bg-red-500';
  });

  let statusText = $derived.by(() => {
    if (!summary) return 'Unknown';
    return summary.healthy ? 'Healthy' : 'Unhealthy';
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void loadData();
  });

  // ==========================================================================
  // Data Loading
  // ==========================================================================

  async function loadData(): Promise<void> {
    loading = true;
    error = null;

    try {
      // Fetch lightweight summary data from new endpoint
      summary = await api.get<PluginSummary>('/api/plugins/bolt/summary');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Bolt summary';
      console.error('Failed to load Bolt summary:', err);
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToBolt(): void {
    router.navigate('/integrations/bolt');
  }

  function executeCommand(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/bolt?tab=execute');
  }

  function viewInventory(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/bolt?tab=inventory');
  }
</script>

<button
  type="button"
  onclick={navigateToBolt}
  class="w-full h-full p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 hover:border-amber-400 dark:hover:border-amber-600 transition-all duration-200 text-left group"
>
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <LoadingSpinner size="sm" />
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center h-full text-center">
      <svg class="w-8 h-8 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span class="text-xs text-red-600 dark:text-red-400">{error}</span>
      <button
        type="button"
        onclick={(e) => { e.stopPropagation(); void loadData(); }}
        class="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
      >
        Retry
      </button>
    </div>
  {:else if summary}
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-lg bg-amber-500/20">
          <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">Bolt</span>
      </div>

      <!-- Health Indicator -->
      <div class="flex items-center gap-1.5" title={statusText}>
        <span class="w-2 h-2 rounded-full {statusColor}"></span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{statusText}</span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="space-y-2">
      <!-- Node Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Nodes</span>
        <span class="text-lg font-bold text-amber-600 dark:text-amber-400">{nodeCount}</span>
      </div>

      <!-- Available Tasks -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Tasks Available</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{tasksAvailable}</span>
      </div>

      <!-- Last Update -->
      {#if summary.lastUpdate}
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-gray-400">Last Update</span>
          <span class="text-xs text-gray-600 dark:text-gray-300">
            {new Date(summary.lastUpdate).toLocaleTimeString()}
          </span>
        </div>
      {/if}
    </div>

    <!-- Quick Actions -->
    <div class="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50">
      <div class="flex gap-2">
        <button
          type="button"
          onclick={executeCommand}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded transition-colors"
          title="Execute Command"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          type="button"
          onclick={viewInventory}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded transition-colors"
          title="View Inventory"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-2 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Remote Execution</span>
      <svg class="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
