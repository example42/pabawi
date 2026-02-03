<!--
  PuppetDB Reports Viewer Widget

  Displays Puppet reports from PuppetDB with filtering.
  Can be rendered in dashboard, node-detail, or standalone-page slots.

  Features:
  - Report list with status indicators
  - Status filtering
  - Timeline view
  - Report details on selection
  - Quick metrics summary

  @module plugins/native/puppetdb/frontend/ReportsViewer
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

  interface Report {
    hash: string;
    certname: string;
    puppet_version: string;
    report_format: number;
    configuration_version: string;
    start_time: string;
    end_time: string;
    producer_timestamp: string;
    transaction_uuid: string;
    status: 'changed' | 'unchanged' | 'failed';
    noop: boolean;
    environment: string;
    metrics?: {
      resources?: Record<string, number>;
      time?: Record<string, number>;
    };
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname to filter reports (optional) */
    nodeId?: string;
    /** Maximum reports to display */
    limit?: number;
    /** Show status filter */
    showStatusFilter?: boolean;
    /** Show timeline visualization */
    showTimeline?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when report selected */
    onReportSelect?: (report: Report) => void;
  }

  let {
    nodeId,
    limit = 20,
    showStatusFilter = true,
    showTimeline = false,
    compact = false,
    config = {},
    onReportSelect,
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let reports = $state<Report[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let statusFilter = $state<string>('all');
  let selectedReport = $state<Report | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredReports = $derived.by(() => {
    let result = reports;
    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }
    return result.slice(0, limit);
  });

  let statusCounts = $derived.by(() => {
    const counts: Record<string, number> = { all: reports.length };
    for (const report of reports) {
      counts[report.status] = (counts[report.status] || 0) + 1;
    }
    return counts;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchReports();
  });

  $effect(() => {
    if (nodeId !== undefined) {
      void fetchReports();
    }
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchReports(): Promise<void> {
    loading = true;
    error = null;
    try {
      const url = nodeId
        ? `/api/puppetdb/nodes/${encodeURIComponent(nodeId)}/reports`
        : '/api/puppetdb/reports';
      const response = await api.get<{ reports: Report[] }>(url);
      reports = response.reports || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load reports';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function selectReport(report: Report): void {
    selectedReport = report;
    onReportSelect?.(report);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getStatusColor(status: string): string {
    switch (status) {
      case 'changed': return 'text-amber-600 dark:text-amber-400';
      case 'unchanged': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getStatusBg(status: string): string {
    switch (status) {
      case 'changed': return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
      case 'unchanged': return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'failed': return 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      default: return 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600';
    }
  }

  function formatDuration(start: string, end: string): string {
    try {
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const durationMs = endTime - startTime;
      if (durationMs < 1000) return `${durationMs}ms`;
      if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
      return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
    } catch {
      return 'Unknown';
    }
  }

  function formatTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  }
</script>

<div class="puppetdb-reports-viewer {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        {nodeId ? 'Node Reports' : 'All Reports'}
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {filteredReports.length} reports
    </span>
  </div>

  <!-- Status Filter -->
  {#if showStatusFilter}
    <div class="flex gap-2 flex-wrap">
      <button
        type="button"
        onclick={() => statusFilter = 'all'}
        class="px-2 py-1 text-xs rounded-full border transition-colors {
          statusFilter === 'all'
            ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
        }"
      >
        All ({statusCounts.all})
      </button>
      {#each ['unchanged', 'changed', 'failed'] as status}
        {#if statusCounts[status]}
          <button
            type="button"
            onclick={() => statusFilter = status}
            class="px-2 py-1 text-xs rounded-full border transition-colors {
              statusFilter === status
                ? `${getStatusBg(status)} ${getStatusColor(status)}`
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
            }"
          >
            {status} ({statusCounts[status]})
          </button>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Reports List -->
  {#if loading}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading reports...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if filteredReports.length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      No reports found
    </div>
  {:else}
    <div class="space-y-2 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each filteredReports as report (report.hash)}
        <button
          type="button"
          onclick={() => selectReport(report)}
          class="w-full p-3 rounded-lg border text-left transition-colors {
            selectedReport?.hash === report.hash
              ? 'border-violet-500 dark:border-violet-400 bg-violet-50 dark:bg-violet-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-gray-800'
          }"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              {#if !nodeId}
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {report.certname}
                </div>
              {/if}
              <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{formatTime(report.start_time)}</span>
                <span>·</span>
                <span>Duration: {formatDuration(report.start_time, report.end_time)}</span>
                {#if report.environment}
                  <span>·</span>
                  <span>{report.environment}</span>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if report.noop}
                <span class="px-1.5 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  noop
                </span>
              {/if}
              <span class="px-1.5 py-0.5 text-xs rounded capitalize {getStatusColor(report.status)} {getStatusBg(report.status)}">
                {report.status}
              </span>
            </div>
          </div>

          {#if !compact && report.metrics?.resources}
            <div class="flex gap-3 mt-2 text-xs">
              {#if report.metrics.resources.changed}
                <span class="text-amber-600 dark:text-amber-400">
                  {report.metrics.resources.changed} changed
                </span>
              {/if}
              {#if report.metrics.resources.failed}
                <span class="text-red-600 dark:text-red-400">
                  {report.metrics.resources.failed} failed
                </span>
              {/if}
              {#if report.metrics.resources.total}
                <span class="text-gray-500 dark:text-gray-400">
                  {report.metrics.resources.total} total
                </span>
              {/if}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Selected Report Details -->
  {#if selectedReport && !compact}
    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Report Details</h4>
      <div class="text-xs space-y-1 text-gray-600 dark:text-gray-400">
        <div><span class="font-medium">Hash:</span> <code class="font-mono">{selectedReport.hash.slice(0, 12)}...</code></div>
        <div><span class="font-medium">Puppet Version:</span> {selectedReport.puppet_version}</div>
        <div><span class="font-medium">Configuration:</span> {selectedReport.configuration_version}</div>
        <div><span class="font-medium">Transaction UUID:</span> <code class="font-mono">{selectedReport.transaction_uuid.slice(0, 8)}...</code></div>
      </div>
    </div>
  {/if}
</div>
