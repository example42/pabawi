<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { getBatchStatus, type BatchStatusResponse, type ExecutionDetail, type BatchExecution } from '../lib/api';

  interface Props {
    batchId: string;
  }

  let { batchId }: Props = $props();

  // State for batch status
  let batchStatus = $state<BatchStatusResponse | null>(null);
  let loading = $state<boolean>(true);
  let error = $state<string | null>(null);

  // Expand/collapse state
  let expandedExecutionIds = $state<Set<string>>(new Set());

  // Sort state
  let sortBy = $state<'nodeName' | 'status' | 'duration'>('nodeName');
  let sortOrder = $state<'asc' | 'desc'>('asc');

  // Filter state
  let filterStatus = $state<'all' | 'success' | 'failed'>('all');

  // Export state
  let showExportMenu = $state<boolean>(false);

  // Fetch batch status from API
  async function fetchBatchStatus(): Promise<void> {
    try {
      loading = true;
      error = null;

      const data = await getBatchStatus(batchId);
      batchStatus = data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to fetch batch status';
      console.error('[AggregatedResultsView] Error fetching batch status:', err);
    } finally {
      loading = false;
    }
  }

  // Fetch data on mount
  $effect(() => {
    fetchBatchStatus();
  });

  // Toggle expanded state for an execution
  function toggleExpanded(executionId: string): void {
    const newSet = new Set(expandedExecutionIds);
    if (newSet.has(executionId)) {
      newSet.delete(executionId);
    } else {
      newSet.add(executionId);
    }
    expandedExecutionIds = newSet;
  }

  // Handle keyboard navigation for expand/collapse
  function handleKeyDown(event: KeyboardEvent, executionId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded(executionId);
    }
  }

  // Format duration in human-readable format
  function formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  // Get status color classes
  function getStatusColor(status: ExecutionDetail['status']): string {
    switch (status) {
      case 'success':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'running':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      case 'queued':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  }

  // Get status icon
  function getStatusIcon(status: ExecutionDetail['status']): string {
    switch (status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '▶️';
      case 'queued':
        return '⏳';
      default:
        return '•';
    }
  }

  // Sort executions
  function getSortedExecutions(executions: ExecutionDetail[]): ExecutionDetail[] {
    const sorted = [...executions].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'nodeName':
          comparison = a.nodeName.localeCompare(b.nodeName);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'duration':
          comparison = (a.duration ?? 0) - (b.duration ?? 0);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  // Filter executions by status
  function getFilteredExecutions(executions: ExecutionDetail[]): ExecutionDetail[] {
    if (filterStatus === 'all') {
      return executions;
    }

    return executions.filter(exec => exec.status === filterStatus);
  }

  // Get sorted and filtered executions
  function getDisplayedExecutions(): ExecutionDetail[] {
    if (!batchStatus) return [];

    const filtered = getFilteredExecutions(batchStatus.executions);
    return getSortedExecutions(filtered);
  }

  // Toggle sort order
  function toggleSortOrder(): void {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  }

  // Export to JSON
  function exportToJSON(): void {
    if (!batchStatus) return;

    const data = {
      batch: batchStatus.batch,
      executions: batchStatus.executions,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `batch-${batchId}-results.json`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showExportMenu = false;
  }

  // Export to CSV
  function exportToCSV(): void {
    if (!batchStatus) return;

    // CSV header
    const headers = ['Node Name', 'Status', 'Duration', 'Exit Code', 'Started At', 'Completed At'];
    const rows = [headers.join(',')];

    // CSV rows
    for (const execution of batchStatus.executions) {
      const row = [
        `"${execution.nodeName}"`,
        execution.status,
        execution.duration ? formatDuration(execution.duration) : '',
        execution.result?.exitCode?.toString() ?? '',
        execution.startedAt ? new Date(execution.startedAt).toISOString() : '',
        execution.completedAt ? new Date(execution.completedAt).toISOString() : '',
      ];
      rows.push(row.join(','));
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `batch-${batchId}-results.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showExportMenu = false;
  }

  // Check if all executions succeeded
  function isAllSuccess(): boolean {
    return batchStatus?.batch.status === 'success';
  }

  // Check if any executions failed
  function hasFailures(): boolean {
    return batchStatus ? batchStatus.batch.stats.failed > 0 : false;
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
      Batch Execution Results
    </h2>
    {#if batchStatus}
      <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
        <p>Batch ID: <span class="font-mono">{batchId}</span></p>
        <p>Action: <span class="font-medium">{batchStatus.batch.type}</span> - {batchStatus.batch.action}</p>
      </div>
    {/if}
  </div>

  <!-- Loading State -->
  {#if loading && !batchStatus}
    <div
      class="flex items-center justify-center py-12"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <span class="ml-3 text-gray-500 dark:text-gray-400">Loading results...</span>
    </div>
  {/if}

  <!-- Error State -->
  {#if error && !batchStatus}
    <div
      class="rounded-md bg-red-50 dark:bg-red-900/20 p-4"
      role="alert"
    >
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-red-800 dark:text-red-200">{error}</p>
          <button
            type="button"
            onclick={() => { error = null; fetchBatchStatus(); }}
            class="mt-2 text-sm font-medium text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Results Display -->
  {#if batchStatus}
    <!-- Success/Failure Message -->
    <div
      class="mb-6 rounded-md p-4 {isAllSuccess() ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}"
      role="status"
      aria-live="polite"
    >
      <div class="flex">
        <div class="flex-shrink-0">
          {#if isAllSuccess()}
            <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
          {:else}
            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          {/if}
        </div>
        <div class="ml-3">
          <p class="text-sm font-medium {isAllSuccess() ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'}">
            {#if isAllSuccess()}
              All executions completed successfully
            {:else if hasFailures()}
              {batchStatus.batch.stats.failed} {batchStatus.batch.stats.failed === 1 ? 'execution' : 'executions'} failed
            {:else}
              Batch execution completed
            {/if}
          </p>
        </div>
      </div>
    </div>

    <!-- Summary Statistics -->
    <div class="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {batchStatus.batch.stats.total}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Total</div>
      </div>
      <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">
          {batchStatus.batch.stats.success}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Success</div>
      </div>
      <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
        <div class="text-2xl font-bold text-red-600 dark:text-red-400">
          {batchStatus.batch.stats.failed}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Failed</div>
      </div>
      <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {batchStatus.batch.stats.running + batchStatus.batch.stats.queued}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
      </div>
    </div>

    <!-- Controls: Sort, Filter, Export -->
    <div class="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div class="flex items-center gap-3 flex-wrap">
        <!-- Sort Controls -->
        <div class="flex items-center gap-2">
          <label for="sort-by" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Sort by:
          </label>
          <select
            id="sort-by"
            bind:value={sortBy}
            class="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Sort by"
          >
            <option value="nodeName">Node Name</option>
            <option value="status">Status</option>
            <option value="duration">Duration</option>
          </select>
          <button
            type="button"
            onclick={toggleSortOrder}
            class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
            aria-label="Sort order: {sortOrder === 'asc' ? 'ascending' : 'descending'}"
            title="Toggle sort order"
          >
            {#if sortOrder === 'asc'}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            {/if}
          </button>
        </div>

        <!-- Filter Controls -->
        <div class="flex items-center gap-2">
          <label for="filter-status" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Filter:
          </label>
          <select
            id="filter-status"
            bind:value={filterStatus}
            class="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <!-- Export Button -->
      <div class="relative">
        <button
          type="button"
          onclick={() => { showExportMenu = !showExportMenu; }}
          class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Export results"
          aria-haspopup="true"
          aria-expanded={showExportMenu}
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>

        {#if showExportMenu}
          <div
            class="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-700 ring-1 ring-black ring-opacity-5 z-10"
            role="menu"
            aria-orientation="vertical"
          >
            <div class="py-1">
              <button
                type="button"
                onclick={exportToJSON}
                class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-600"
                role="menuitem"
              >
                Export as JSON
              </button>
              <button
                type="button"
                onclick={exportToCSV}
                class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-600"
                role="menuitem"
              >
                Export as CSV
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Results Count -->
    <div class="mb-3 text-sm text-gray-500 dark:text-gray-400" role="status">
      Showing {getDisplayedExecutions().length} of {batchStatus.executions.length} {batchStatus.executions.length === 1 ? 'execution' : 'executions'}
    </div>

    <!-- Execution Results List -->
    {#if getDisplayedExecutions().length === 0}
      <div class="text-center py-12 text-gray-500 dark:text-gray-400" role="status">
        {#if batchStatus.executions.length === 0}
          No executions found
        {:else}
          No {filterStatus} executions
        {/if}
      </div>
    {:else}
      <div class="space-y-2">
        {#each getDisplayedExecutions() as execution}
          <div
            class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden {execution.status === 'failed' ? 'border-red-300 dark:border-red-700' : ''}"
          >
            <!-- Execution Summary (Clickable) -->
            <div
              role="button"
              tabindex="0"
              onclick={() => toggleExpanded(execution.id)}
              onkeydown={(e) => handleKeyDown(e, execution.id)}
              class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              aria-expanded={expandedExecutionIds.has(execution.id)}
              aria-controls={`execution-details-${execution.id}`}
            >
              <div class="flex items-center justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3">
                    <span
                      class="text-xl flex-shrink-0"
                      role="img"
                      aria-label={`Status: ${execution.status}`}
                    >
                      {getStatusIcon(execution.status)}
                    </span>
                    <div class="flex-1 min-w-0">
                      <h3 class="text-base font-medium text-gray-900 dark:text-white truncate">
                        {execution.nodeName}
                      </h3>
                      <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {#if execution.duration}
                          Duration: {formatDuration(execution.duration)}
                        {:else if execution.startedAt}
                          Started at {new Date(execution.startedAt).toLocaleTimeString()}
                        {:else}
                          Queued
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                  <span
                    class="px-3 py-1 rounded-full text-sm font-medium {getStatusColor(execution.status)}"
                    role="status"
                  >
                    {execution.status}
                  </span>
                  <svg
                    class="w-5 h-5 text-gray-400 transition-transform {expandedExecutionIds.has(execution.id) ? 'rotate-180' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Execution Details (Expandable) -->
            {#if expandedExecutionIds.has(execution.id)}
              <div
                id={`execution-details-${execution.id}`}
                class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4"
              >
                <div class="space-y-4">
                  <!-- Exit Code -->
                  {#if execution.result?.exitCode !== undefined}
                    <div>
                      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Exit Code
                      </h4>
                      <div class="text-sm text-gray-900 dark:text-white font-mono">
                        {execution.result.exitCode}
                      </div>
                    </div>
                  {/if}

                  <!-- Stdout -->
                  {#if execution.result?.stdout}
                    <div>
                      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Standard Output (stdout)
                      </h4>
                      <pre class="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto text-gray-900 dark:text-white whitespace-pre-wrap break-words">{execution.result.stdout}</pre>
                    </div>
                  {/if}

                  <!-- Stderr -->
                  {#if execution.result?.stderr}
                    <div>
                      <h4 class="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                        Standard Error (stderr)
                      </h4>
                      <pre class="text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-3 overflow-x-auto text-red-900 dark:text-red-200 whitespace-pre-wrap break-words">{execution.result.stderr}</pre>
                    </div>
                  {/if}

                  <!-- Timestamps -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {#if execution.startedAt}
                      <div>
                        <span class="font-medium text-gray-700 dark:text-gray-300">Started:</span>
                        <span class="text-gray-600 dark:text-gray-400 ml-2">
                          {new Date(execution.startedAt).toLocaleString()}
                        </span>
                      </div>
                    {/if}
                    {#if execution.completedAt}
                      <div>
                        <span class="font-medium text-gray-700 dark:text-gray-300">Completed:</span>
                        <span class="text-gray-600 dark:text-gray-400 ml-2">
                          {new Date(execution.completedAt).toLocaleString()}
                        </span>
                      </div>
                    {/if}
                  </div>

                  <!-- No output message -->
                  {#if !execution.result?.stdout && !execution.result?.stderr && execution.result?.exitCode === undefined}
                    <div class="text-sm text-gray-500 dark:text-gray-400 italic">
                      No output available
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Click outside to close export menu -->
{#if showExportMenu}
  <div
    class="fixed inset-0 z-0"
    onclick={() => { showExportMenu = false; }}
    aria-hidden="true"
  ></div>
{/if}
