<script lang="ts">
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface PuppetReportsSummaryProps {
    reports: {
      total: number;
      failed: number;
      changed: number;
      unchanged: number;
      noop: number;
    };
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    timeRange?: number;
    onTimeRangeChange?: (hours: number) => void;
    integration?: string;
  }

  let {
    reports,
    loading = false,
    error = null,
    onRetry,
    timeRange = 1,
    onTimeRangeChange,
    integration = 'puppetdb'
  }: PuppetReportsSummaryProps = $props();

  function getStatusColor(status: string): string {
    switch (status) {
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'changed':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'unchanged':
        return 'text-green-600 dark:text-green-400';
      case 'noop':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'failed':
        return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'changed':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'unchanged':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'noop':
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">
        Puppet Reports
      </h2>
      <IntegrationBadge integration={integration} variant="badge" size="sm" />
    </div>
    <button
      type="button"
      class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
      onclick={() => router.navigate('/puppet?tab=reports')}
    >
      View All
      <svg class="ml-1.5 -mr-0.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <!-- Time Range Selector -->
  <div class="mb-6 flex items-center gap-2">
    <span class="text-sm text-gray-600 dark:text-gray-400">Time range:</span>
    <div class="inline-flex rounded-md shadow-sm" role="group">
      <button
        type="button"
        class={`px-3 py-1.5 text-sm font-medium rounded-l-md border ${
          timeRange === 1
            ? 'bg-purple-600 text-white border-purple-600'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
        onclick={() => onTimeRangeChange?.(1)}
      >
        1h
      </button>
      <button
        type="button"
        class={`px-3 py-1.5 text-sm font-medium border-t border-b ${
          timeRange === 2
            ? 'bg-purple-600 text-white border-purple-600'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
        onclick={() => onTimeRangeChange?.(2)}
      >
        2h
      </button>
      <button
        type="button"
        class={`px-3 py-1.5 text-sm font-medium rounded-r-md border ${
          timeRange === 6
            ? 'bg-purple-600 text-white border-purple-600'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
        onclick={() => onTimeRangeChange?.(6)}
      >
        6h
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-8">
      <LoadingSpinner size="md" message="Loading Puppet reports..." />
    </div>
  {:else if error}
    <ErrorAlert
      message="Failed to load Puppet reports"
      details={error}
      onRetry={onRetry}
    />
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <!-- Total Reports -->
      <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div class="flex items-center justify-center mb-2">
          <svg class="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-2xl font-bold text-gray-900 dark:text-white">{reports.total}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Total</p>
      </div>

      <!-- Failed Reports -->
      <div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div class="flex items-center justify-center mb-2">
          <svg class={`h-5 w-5 ${getStatusColor('failed')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon('failed')} />
          </svg>
        </div>
        <p class={`text-2xl font-bold ${getStatusColor('failed')}`}>{reports.failed}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Failed</p>
      </div>

      <!-- Changed Reports -->
      <div class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
        <div class="flex items-center justify-center mb-2">
          <svg class={`h-5 w-5 ${getStatusColor('changed')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon('changed')} />
          </svg>
        </div>
        <p class={`text-2xl font-bold ${getStatusColor('changed')}`}>{reports.changed}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Changed</p>
      </div>

      <!-- Unchanged Reports -->
      <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <div class="flex items-center justify-center mb-2">
          <svg class={`h-5 w-5 ${getStatusColor('unchanged')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon('unchanged')} />
          </svg>
        </div>
        <p class={`text-2xl font-bold ${getStatusColor('unchanged')}`}>{reports.unchanged}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">Unchanged</p>
      </div>

      <!-- Noop Reports -->
      <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div class="flex items-center justify-center mb-2">
          <svg class={`h-5 w-5 ${getStatusColor('noop')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon('noop')} />
          </svg>
        </div>
        <p class={`text-2xl font-bold ${getStatusColor('noop')}`}>{reports.noop}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">No-op</p>
      </div>
    </div>

    {#if reports.total === 0}
      <div class="mt-4 text-center py-8">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          No Puppet reports available yet
        </p>
      </div>
    {/if}
  {/if}
</div>
