<!--
  PuppetDB Reports Summary Widget

  A compact summary widget showing report statistics.
  Ideal for dashboard or sidebar placement.

  Features:
  - Status distribution pie/bar
  - Recent trends
  - Quick metrics
  - Link to full reports view

  @module widgets/puppetdb/ReportsSummary
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import { get } from '../../lib/api';
  import { router } from '../../lib/router.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface ReportSummary {
    total: number;
    changed: number;
    unchanged: number;
    failed: number;
    noop: number;
    avgDuration: number;
    period: string;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Time period for summary (e.g., '24h', '7d') */
    period?: string;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    period = '24h',
    compact = false,
    config = {},
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let summary = $state<ReportSummary | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let successRate = $derived.by(() => {
    if (!summary || summary.total === 0) return 0;
    return Math.round(((summary.unchanged + summary.changed) / summary.total) * 100);
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchSummary();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchSummary(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await get<ReportSummary>(`/api/puppetdb/reports/summary?period=${period}`);
      summary = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load summary';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function viewAllReports(): void {
    router.navigate('/reports');
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getBarWidth(value: number, total: number): string {
    if (total === 0) return '0%';
    return `${(value / total) * 100}%`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60000)}m`;
  }
</script>

<div class="puppetdb-reports-summary {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Report Summary
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      Last {period}
    </span>
  </div>

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-4">
      <LoadingSpinner size="sm" />
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if summary}
    <!-- Success Rate -->
    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
        <span class="text-lg font-bold {successRate >= 90 ? 'text-green-600 dark:text-green-400' : successRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}">
          {successRate}%
        </span>
      </div>
      <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
          style="width: {successRate}%"
        ></div>
      </div>
    </div>

    <!-- Status Distribution -->
    <div class="space-y-2">
      <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Distribution</div>

      <!-- Stacked bar -->
      <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
        {#if summary.unchanged > 0}
          <div
            class="bg-green-500 h-full"
            style="width: {getBarWidth(summary.unchanged, summary.total)}"
            title="Unchanged: {summary.unchanged}"
          ></div>
        {/if}
        {#if summary.changed > 0}
          <div
            class="bg-amber-500 h-full"
            style="width: {getBarWidth(summary.changed, summary.total)}"
            title="Changed: {summary.changed}"
          ></div>
        {/if}
        {#if summary.failed > 0}
          <div
            class="bg-red-500 h-full"
            style="width: {getBarWidth(summary.failed, summary.total)}"
            title="Failed: {summary.failed}"
          ></div>
        {/if}
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-3 text-xs">
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-green-500"></span>
          <span class="text-gray-600 dark:text-gray-400">Unchanged ({summary.unchanged})</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span class="text-gray-600 dark:text-gray-400">Changed ({summary.changed})</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-red-500"></span>
          <span class="text-gray-600 dark:text-gray-400">Failed ({summary.failed})</span>
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    {#if !compact}
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
          <div class="text-lg font-bold text-gray-900 dark:text-white">{summary.total}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Total Runs</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
          <div class="text-lg font-bold text-gray-900 dark:text-white">{formatDuration(summary.avgDuration)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Avg Duration</div>
        </div>
      </div>
    {/if}

    <!-- View All Link -->
    <button
      type="button"
      onclick={viewAllReports}
      class="w-full py-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 text-center border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
    >
      View All Reports →
    </button>
  {:else}
    <div class="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
      No report data available
    </div>
  {/if}
</div>
