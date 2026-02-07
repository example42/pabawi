<!--
  PuppetDB Home Widget

  A summary tile displayed on the home page showing PuppetDB integration status.
  Uses PuppetDB's violet color (#9063CD) for theming.

  Features:
  - Total node count from PuppetDB
  - Recent reports summary
  - Failed runs count
  - Quick link to PuppetDB integration page

  @module plugins/native/puppetdb/frontend/HomeWidget
  @version 1.0.0
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
      healthyNodes: number;
      failedNodes: number;
      totalReports: number;
      successRate: number;
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
  let healthyNodes = $derived(summary?.metrics.healthyNodes ?? 0);
  let totalReports = $derived(summary?.metrics.totalReports ?? 0);
  let successRate = $derived(summary?.metrics.successRate ?? 0);

  let statusColor = $derived.by(() => {
    if (!summary) return 'bg-gray-400';
    if (summary.healthy) return 'bg-green-500';
    return 'bg-red-500';
  });

  let statusText = $derived.by(() => {
    if (!summary) return 'Unknown';
    if (summary.healthy) return 'Healthy';
    return 'Unhealthy';
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
      // Fetch lightweight summary from the new endpoint
      // This endpoint calls the plugin's getSummary() method
      summary = await api.get<PluginSummary>('/api/v1/plugins/puppetdb/summary');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load PuppetDB summary';
      summary = null;
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToPuppetDB(): void {
    router.navigate('/integrations/puppetdb');
  }

  function viewReports(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/puppetdb?tab=reports');
  }

  function viewNodes(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/puppetdb?tab=nodes');
  }

  function getSuccessRateColor(rate: number): string {
    if (rate >= 90) return 'text-green-600 dark:text-green-400';
    if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }
</script>

<button
  type="button"
  onclick={navigateToPuppetDB}
  class="w-full h-full p-4 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 hover:border-violet-400 dark:hover:border-violet-600 transition-all duration-200 text-left group"
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
    </div>
  {:else}
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-lg bg-violet-500/20">
          <svg class="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">PuppetDB</span>
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
        <span class="text-sm text-gray-600 dark:text-gray-400">Total Nodes</span>
        <span class="text-lg font-bold text-violet-600 dark:text-violet-400">{nodeCount}</span>
      </div>

      <!-- Recent Reports -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Reports</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{totalReports}</span>
      </div>

      <!-- Success Rate -->
      {#if totalReports > 0}
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
          <span class="text-lg font-bold {getSuccessRateColor(successRate)}">
            {successRate}%
          </span>
        </div>
      {/if}
    </div>

    <!-- Quick Actions -->
    <div class="mt-3 pt-3 border-t border-violet-200/50 dark:border-violet-800/50">
      <div class="flex gap-2">
        <button
          type="button"
          onclick={viewReports}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 rounded transition-colors"
          title="View Reports"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          type="button"
          onclick={viewNodes}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-900/50 rounded transition-colors"
          title="View Nodes"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-2 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Infrastructure Data</span>
      <svg class="w-4 h-4 text-violet-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
