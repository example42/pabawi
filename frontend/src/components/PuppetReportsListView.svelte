<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import ReportFilterPanel from './ReportFilterPanel.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import PaginationControls from './PaginationControls.svelte';
  import { reportFilters } from '../lib/reportFilters.svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { loadPageSize, savePageSize } from '../lib/sessionStorage';

  interface ReportMetrics {
    resources: {
      total: number;
      skipped: number;
      failed: number;
      failed_to_restart: number;
      changed: number;
      corrective_change: number;
      out_of_sync: number;
    };
    time: Record<string, number>;
    events?: {
      success: number;
      failure: number;
      noop?: number;
      total: number;
    };
  }

  interface Report {
    certname: string;
    hash: string;
    environment: string;
    status: 'unchanged' | 'changed' | 'failed';
    noop: boolean;
    start_time: string;
    end_time: string;
    metrics: ReportMetrics;
  }

  interface Props {
    reports?: Report[]; // Optional: if provided, use these reports (for node-specific view)
    onReportClick?: (report: Report) => void;
    showFilters?: boolean; // Show filter panel (only for all-reports view)
    certname?: string; // Optional: fetch reports for specific node
    onDebugInfo?: (info: DebugInfo | null) => void;
    enablePagination?: boolean; // Enable pagination controls (default: true when fetching internally)
  }

  let { reports: externalReports, onReportClick, showFilters = false, certname, onDebugInfo, enablePagination }: Props = $props();

  // Pagination state
  let currentPage = $state(1);
  let pageSize = $state(loadPageSize());
  let totalCount = $state(0);
  let hasMore = $state(false);

  // State for reports (only used when fetching internally)
  let internalReports = $state<Report[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let debugInfo = $state<DebugInfo | null>(null);

  // Use external reports if provided, otherwise use internal reports
  const reports = $derived(externalReports ?? internalReports);

  // Only fetch if no external reports provided and (showFilters is true OR certname is provided)
  const shouldFetch = $derived(!externalReports && (showFilters || !!certname));

  // Show pagination if enabled explicitly or if fetching internally with pagination
  const showPagination = $derived(
    enablePagination !== undefined
      ? enablePagination
      : (shouldFetch && totalCount > pageSize)
  );

  // Fetch reports with filters and pagination
  async function fetchReports(): Promise<void> {
    if (!shouldFetch) return;

    loading = true;
    error = null;
    debugInfo = null;

    try {
      // Build query string from filters
      const filters = reportFilters.getFilters();
      const queryParams = new URLSearchParams();

      // Pagination parameters
      queryParams.set('limit', pageSize.toString());
      queryParams.set('offset', ((currentPage - 1) * pageSize).toString());

      // Filter parameters
      if (filters.status && filters.status.length > 0) {
        queryParams.set('status', filters.status.join(','));
      }
      if (filters.minDuration !== undefined && filters.minDuration > 0) {
        queryParams.set('minDuration', filters.minDuration.toString());
      }
      if (filters.minCompileTime !== undefined && filters.minCompileTime > 0) {
        queryParams.set('minCompileTime', filters.minCompileTime.toString());
      }
      if (filters.minTotalResources !== undefined && filters.minTotalResources > 0) {
        queryParams.set('minTotalResources', filters.minTotalResources.toString());
      }

      const queryString = queryParams.toString();
      const url = certname
        ? `/api/integrations/puppetdb/nodes/${certname}/reports${queryString ? `?${queryString}` : ''}`
        : `/api/integrations/puppetdb/reports${queryString ? `?${queryString}` : ''}`;

      const data = await get<{
        reports: Report[];
        count: number;
        totalCount: number;
        hasMore: boolean;
        _debug?: DebugInfo
      }>(url, { maxRetries: 2 });

      internalReports = data.reports || [];
      totalCount = data.totalCount || 0;
      hasMore = data.hasMore || false;

      // If we're on a page that no longer exists (e.g., after filters reduce results), reset to page 1
      if (internalReports.length === 0 && currentPage > 1 && totalCount > 0) {
        currentPage = 1;
        // Re-fetch with page 1
        await fetchReports();
        return;
      }

      if (data._debug) {
        debugInfo = data._debug;
        // Pass debug info to parent
        if (onDebugInfo) {
          onDebugInfo(data._debug);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load reports';
      console.error('Error fetching reports:', err);
    } finally {
      loading = false;
    }
  }

  // Handle pagination changes
  function handlePageChange(page: number): void {
    currentPage = page;
    fetchReports();
  }

  function handlePageSizeChange(size: number): void {
    pageSize = size;
    currentPage = 1; // Reset to page 1 when changing page size
    savePageSize(size); // Persist to session storage
    fetchReports();
  }

  function resetPagination(): void {
    currentPage = 1;
    fetchReports();
  }

  // Handle filter changes
  function handleFilterChange(): void {
    resetPagination();
  }

  // Initial fetch (only if shouldFetch is true)
  // Use untrack to prevent re-running when state changes
  let initialized = $state(false);
  $effect(() => {
    if (shouldFetch && !initialized) {
      initialized = true;
      fetchReports();
    }
  });

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  function getDuration(startTime: string, endTime: string): string {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const seconds = Math.round((end - start) / 1000);
    return seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }

  function getStatusBadgeStatus(status: string, configRetrievalTime?: number): 'success' | 'failed' | 'changed' {
    if (configRetrievalTime === 0) return 'failed';

    if (status === 'failed') return 'failed';
    if (status === 'changed') return 'changed';
    return 'success';
  }

  function formatCompilationTime(configRetrievalTime?: number): string {
    if (configRetrievalTime === undefined || configRetrievalTime === null) {
      return 'N/A';
    }

    if (configRetrievalTime === 0) {
      return 'Catalog Failure';
    }

    return `${configRetrievalTime.toFixed(2)}s`;
  }

  // Calculate successful resources
  // In Puppet, successful = total - (failed + changed + skipped)
  // Or we can use: total - out_of_sync - failed - skipped
  function getSuccessful(metrics: ReportMetrics): number {
    const total = metrics.resources.total;
    const changed = metrics.resources.changed;
    const failed = metrics.resources.failed;
    const skipped = metrics.resources.skipped;
    return total - changed - failed - skipped;
  }

  // Get unchanged resources count
  function getUnchanged(metrics: ReportMetrics): number {
    return metrics.resources.total - metrics.resources.out_of_sync;
  }

  // Get intentional changes - should be 0 if calculation would be negative
  function getIntentionalChanges(metrics: ReportMetrics): number {
    const intentional = metrics.resources.changed - (metrics.resources.corrective_change || 0);
    return Math.max(0, intentional);
  }
</script>

<div class="space-y-4">
  <!-- Filter Panel (only shown when showFilters is true) -->
  {#if showFilters}
    <ReportFilterPanel onFilterChange={handleFilterChange} />
  {/if}

  <!-- Reports Table -->
  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
    <!-- Header with Integration Badge and Count -->
    <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">Puppet Reports</h3>
          <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
        </div>
        {#if !loading && totalCount > 0}
          <div class="text-sm text-gray-600 dark:text-gray-400">
            {#if showPagination}
              Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount} report{totalCount !== 1 ? 's' : ''}
            {:else}
              Showing {reports.length} report{reports.length !== 1 ? 's' : ''}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Loading State (only when fetching internally) -->
    {#if loading && shouldFetch}
      <div class="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>

    <!-- Error State (only when fetching internally) -->
    {:else if error && shouldFetch}
      <div class="px-4 py-8 text-center">
        <div class="text-red-600 dark:text-red-400 mb-2">
          <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p class="text-sm text-gray-900 dark:text-white font-medium mb-1">Failed to load reports</p>
        <p class="text-sm text-gray-600 dark:text-gray-400">{error}</p>
      </div>

    <!-- Empty State -->
    {:else if reports.length === 0}
      <div class="px-4 py-12 text-center">
        <div class="text-gray-400 dark:text-gray-500 mb-3">
          <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-sm text-gray-900 dark:text-white font-medium mb-1">No reports found</p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {#if showFilters && (reportFilters.getFilters().status || reportFilters.getFilters().minDuration || reportFilters.getFilters().minCompileTime || reportFilters.getFilters().minTotalResources)}
            Try adjusting your filters to see more results
          {:else}
            No Puppet reports are available
          {/if}
        </p>
      </div>

    <!-- Reports Table -->
    {:else}
      <div class="relative overflow-x-auto">
        <!-- Loading overlay during page transitions -->
        {#if loading}
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-white/75 dark:bg-gray-800/75">
            <LoadingSpinner size="md" />
          </div>
        {/if}

        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Start Time
              </th>
              <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Duration
              </th>
              <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Hostname
              </th>
              <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Environment
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Corrective
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Intentional
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Unchanged
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Failed
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Skipped
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Noop
              </th>
              <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Compile Time
              </th>
              <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {#each reports as report}
              <tr
                class="hover:bg-gray-50 dark:hover:bg-gray-700 {onReportClick ? 'cursor-pointer' : ''}"
                onclick={() => onReportClick?.(report)}
              >
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                  {formatTimestamp(report.start_time)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-600 dark:text-gray-400">
                  {getDuration(report.start_time, report.end_time)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                  {report.certname}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                  <div class="flex items-center gap-2">
                    {report.environment}
                    {#if report.noop}
                      <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                        No-op
                      </span>
                    {/if}
                  </div>
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-900 dark:text-white">
                  {report.metrics.resources.total}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-yellow-700 dark:text-yellow-400">
                  {report.metrics.resources.corrective_change || 0}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-blue-700 dark:text-blue-400">
                  {getIntentionalChanges(report.metrics)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-600 dark:text-gray-400">
                  {getUnchanged(report.metrics)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-red-700 dark:text-red-400">
                  {report.metrics.resources.failed}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-600 dark:text-gray-400">
                  {report.metrics.resources.skipped}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-purple-700 dark:text-purple-400">
                  {report.metrics.events?.noop || 0}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-900 dark:text-white">
                  {formatCompilationTime(report.metrics.time?.config_retrieval)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-sm">
                  <StatusBadge status={getStatusBadgeStatus(report.status, report.metrics.time?.config_retrieval)} size="sm" />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <!-- Pagination Controls -->
    {#if showPagination && !loading && !error}
      <PaginationControls
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={totalCount}
        hasMore={hasMore}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    {/if}
  </div>
</div>
