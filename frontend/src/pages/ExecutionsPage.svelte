<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import CommandOutput from '../components/CommandOutput.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { ansiToHtml } from '../lib/ansiToHtml';

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
    expertMode?: boolean;
  }

  interface NodeResult {
    nodeId: string;
    status: 'success' | 'failed';
    output?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    value?: unknown;
    error?: string;
    duration: number;
  }

  interface StatusCounts {
    total: number;
    running: number;
    success: number;
    failed: number;
    partial: number;
  }

  interface PaginationInfo {
    page: number;
    pageSize: number;
    hasMore: boolean;
  }

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: string;
    config: Record<string, unknown>;
  }

  interface Filters {
    status: string;
    targetNode: string;
    startDate: string;
    endDate: string;
  }

  // State
  let executions = $state<ExecutionResult[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pagination = $state<PaginationInfo>({
    page: 1,
    pageSize: 50,
    hasMore: false,
  });
  let summary = $state<StatusCounts>({
    total: 0,
    running: 0,
    success: 0,
    failed: 0,
    partial: 0,
  });
  let filters = $state<Filters>({
    status: 'all',
    targetNode: '',
    startDate: '',
    endDate: '',
  });
  let nodes = $state<Node[]>([]);
  let showFilters = $state(false);
  let selectedExecution = $state<ExecutionResult | null>(null);
  let loadingDetail = $state(false);
  let detailError = $state<string | null>(null);

  // Fetch nodes for target filter
  async function fetchNodes(): Promise<void> {
    try {
      const data = await get<{ nodes: Node[] }>('/api/inventory', {
        maxRetries: 2,
      });
      nodes = data.nodes || [];
    } catch (err) {
      console.error('Error fetching nodes:', err);
    }
  }

  // Fetch executions from API
  async function fetchExecutions(): Promise<void> {
    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });

      // Add filters to query params
      if (filters.status !== 'all') {
        params.append('status', filters.status);
      }
      if (filters.targetNode) {
        params.append('targetNode', filters.targetNode);
      }
      if (filters.startDate) {
        params.append('startDate', new Date(filters.startDate).toISOString());
      }
      if (filters.endDate) {
        // Set end date to end of day
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        params.append('endDate', endDate.toISOString());
      }

      const data = await get<{
        executions: ExecutionResult[];
        pagination: PaginationInfo;
        summary: StatusCounts;
      }>(`/api/executions?${params}`, {
        maxRetries: 2,
      });

      executions = data.executions || [];
      pagination = data.pagination || pagination;
      summary = data.summary || summary;
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching executions:', err);
      showError('Failed to load executions', error);
    } finally {
      loading = false;
    }
  }

  // Apply filters
  function applyFilters(): void {
    pagination.page = 1; // Reset to first page when filters change
    fetchExecutions();
  }

  // Clear filters
  function clearFilters(): void {
    filters.status = 'all';
    filters.targetNode = '';
    filters.startDate = '';
    filters.endDate = '';
    applyFilters();
  }

  // Check if any filters are active
  function hasActiveFilters(): boolean {
    return filters.status !== 'all' ||
           filters.targetNode !== '' ||
           filters.startDate !== '' ||
           filters.endDate !== '';
  }

  // Retry fetching executions
  function retryFetch(): void {
    fetchExecutions();
  }

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Format duration
  function formatDuration(startedAt: string, completedAt?: string): string {
    if (!completedAt) {
      return 'In progress';
    }

    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(1)}s`;
    } else {
      return `${(durationMs / 60000).toFixed(1)}m`;
    }
  }

  // Get type badge color
  function getTypeColor(type: string): string {
    switch (type) {
      case 'command':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'task':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'facts':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Navigate to node detail
  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  // Fetch execution details
  async function fetchExecutionDetail(executionId: string): Promise<void> {
    loadingDetail = true;
    detailError = null;

    try {
      const data = await get<{ execution: ExecutionResult }>(
        `/api/executions/${executionId}`,
        { maxRetries: 2 }
      );

      selectedExecution = data.execution || data;
    } catch (err) {
      detailError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching execution details:', err);
      showError('Failed to load execution details', detailError);
    } finally {
      loadingDetail = false;
    }
  }

  // Open execution detail modal
  function openExecutionDetail(execution: ExecutionResult): void {
    fetchExecutionDetail(execution.id);
  }

  // Close execution detail modal
  function closeExecutionDetail(): void {
    selectedExecution = null;
    detailError = null;
  }

  // Calculate execution summary
  function getExecutionSummary(execution: ExecutionResult): { successCount: number; failureCount: number; duration: string } {
    const successCount = execution.results.filter(r => r.status === 'success').length;
    const failureCount = execution.results.filter(r => r.status === 'failed').length;
    const duration = formatDuration(execution.startedAt, execution.completedAt);

    return { successCount, failureCount, duration };
  }

  // Fetch executions and nodes on mount
  onMount(() => {
    fetchExecutions();
    fetchNodes();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Executions
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          View and monitor execution history
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        onclick={() => showFilters = !showFilters}
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {showFilters ? 'Hide Filters' : 'Show Filters'}
        {#if hasActiveFilters()}
          <span class="inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Filters Panel -->
  {#if showFilters}
    <div class="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <!-- Status Filter -->
        <div>
          <label for="status-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
          </label>
          <select
            id="status-filter"
            bind:value={filters.status}
            class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
          </select>
        </div>

        <!-- Target Node Filter -->
        <div>
          <label for="node-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Target Node
          </label>
          <select
            id="node-filter"
            bind:value={filters.targetNode}
            class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Nodes</option>
            {#each nodes as node}
              <option value={node.id}>{node.name}</option>
            {/each}
          </select>
        </div>

        <!-- Start Date Filter -->
        <div>
          <label for="start-date-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Start Date
          </label>
          <input
            id="start-date-filter"
            type="date"
            bind:value={filters.startDate}
            class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- End Date Filter -->
        <div>
          <label for="end-date-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            End Date
          </label>
          <input
            id="end-date-filter"
            type="date"
            bind:value={filters.endDate}
            class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      <!-- Filter Actions -->
      <div class="mt-4 flex items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onclick={applyFilters}
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Apply Filters
        </button>
        {#if hasActiveFilters()}
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            onclick={clearFilters}
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear Filters
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading executions..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert
      message="Failed to load executions"
      details={error}
      onRetry={retryFetch}
    />
  {:else}
    <!-- Summary Cards -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="text-sm font-medium text-gray-500 dark:text-gray-400">Total</div>
        <div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{summary.total}</div>
      </div>
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
        <div class="text-sm font-medium text-blue-600 dark:text-blue-400">Running</div>
        <div class="mt-1 text-2xl font-semibold text-blue-900 dark:text-blue-100">{summary.running}</div>
      </div>
      <div class="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm dark:border-green-800 dark:bg-green-900/20">
        <div class="text-sm font-medium text-green-600 dark:text-green-400">Success</div>
        <div class="mt-1 text-2xl font-semibold text-green-900 dark:text-green-100">{summary.success}</div>
      </div>
      <div class="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-900/20">
        <div class="text-sm font-medium text-red-600 dark:text-red-400">Failed</div>
        <div class="mt-1 text-2xl font-semibold text-red-900 dark:text-red-100">{summary.failed}</div>
      </div>
      <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 shadow-sm dark:border-yellow-800 dark:bg-yellow-900/20">
        <div class="text-sm font-medium text-yellow-600 dark:text-yellow-400">Partial</div>
        <div class="mt-1 text-2xl font-semibold text-yellow-900 dark:text-yellow-100">{summary.partial}</div>
      </div>
    </div>

    <!-- Empty State -->
    {#if executions.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No executions found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Execute commands or tasks to see them here
        </p>
      </div>
    {:else}
      <!-- Executions Table -->
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Action
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Targets
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Started
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each executions as execution (execution.id)}
                <tr
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  onclick={() => openExecutionDetail(execution)}
                >
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTypeColor(execution.type)}">
                        {execution.type}
                      </span>
                      {#if execution.expertMode}
                        <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-400" title="Expert mode was enabled">
                          <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Expert
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    <div class="max-w-xs truncate" title={execution.action}>
                      {execution.action}
                    </div>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    <div class="flex flex-wrap gap-1">
                      {#each execution.targetNodes.slice(0, 2) as nodeId}
                        <button
                          type="button"
                          class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                          onclick={(e) => {
                            e.stopPropagation();
                            navigateToNode(nodeId);
                          }}
                        >
                          {nodeId}
                        </button>
                      {/each}
                      {#if execution.targetNodes.length > 2}
                        <span class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          +{execution.targetNodes.length - 2} more
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <StatusBadge status={execution.status} size="sm" />
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatTimestamp(execution.startedAt)}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {formatDuration(execution.startedAt, execution.completedAt)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination Info -->
      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Showing page {pagination.page} ({executions.length} executions)
        </div>
        {#if pagination.hasMore}
          <div class="text-sm text-gray-500 dark:text-gray-500">
            More results available
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Execution Detail Modal -->
{#if selectedExecution !== null || loadingDetail}
  <div
    class="fixed inset-0 z-50 overflow-y-auto"
    aria-labelledby="modal-title"
    role="dialog"
    aria-modal="true"
  >
    <!-- Background overlay -->
    <button
      type="button"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
      onclick={closeExecutionDetail}
      aria-label="Close modal"
    ></button>

    <!-- Modal panel -->
    <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
      <div
        class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:w-full sm:max-w-4xl"
        role="document"
      >
        {#if loadingDetail}
          <!-- Loading State -->
          <div class="px-4 py-12 sm:px-6">
            <LoadingSpinner size="lg" message="Loading execution details..." />
          </div>
        {:else if detailError}
          <!-- Error State -->
          <div class="px-4 py-6 sm:px-6">
            <ErrorAlert
              message="Failed to load execution details"
              details={detailError}
              onRetry={() => selectedExecution && fetchExecutionDetail(selectedExecution.id)}
            />
            <div class="mt-4 flex justify-end">
              <button
                type="button"
                class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onclick={closeExecutionDetail}
              >
                Close
              </button>
            </div>
          </div>
        {:else if selectedExecution}
          <!-- Header -->
          <div class="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900 sm:px-6">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white" id="modal-title">
                  Execution Details
                </h3>
                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTypeColor(selectedExecution.type)}">
                    {selectedExecution.type}
                  </span>
                  <StatusBadge status={selectedExecution.status} size="sm" />
                  {#if selectedExecution.expertMode}
                    <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-400" title="Expert mode was enabled">
                      <svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Expert
                    </span>
                  {/if}
                  <span class="text-sm text-gray-600 dark:text-gray-400">
                    ID: {selectedExecution.id}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:text-gray-300"
                onclick={closeExecutionDetail}
              >
                <span class="sr-only">Close</span>
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="max-h-[calc(100vh-12rem)] overflow-y-auto px-4 py-6 sm:px-6">
            <!-- Execution Summary -->
            <div class="mb-6">
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Summary</h4>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400">Duration</div>
                  <div class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {getExecutionSummary(selectedExecution).duration}
                  </div>
                </div>
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400">Total Targets</div>
                  <div class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedExecution.targetNodes.length}
                  </div>
                </div>
                <div class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                  <div class="text-xs font-medium text-green-600 dark:text-green-400">Successful</div>
                  <div class="mt-1 text-lg font-semibold text-green-900 dark:text-green-100">
                    {getExecutionSummary(selectedExecution).successCount}
                  </div>
                </div>
                <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                  <div class="text-xs font-medium text-red-600 dark:text-red-400">Failed</div>
                  <div class="mt-1 text-lg font-semibold text-red-900 dark:text-red-100">
                    {getExecutionSummary(selectedExecution).failureCount}
                  </div>
                </div>
              </div>
            </div>

            <!-- Execution Info -->
            <div class="mb-6">
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Information</h4>
              {#if selectedExecution.command}
                <div class="mb-4">
                  <CommandOutput boltCommand={selectedExecution.command} />
                </div>
              {/if}
              <dl class="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Action</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{selectedExecution.action}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Started At</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatTimestamp(selectedExecution.startedAt)}</dd>
                </div>
                {#if selectedExecution.completedAt}
                  <div>
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Completed At</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatTimestamp(selectedExecution.completedAt)}</dd>
                  </div>
                {/if}
                {#if selectedExecution.parameters && Object.keys(selectedExecution.parameters).length > 0}
                  <div class="sm:col-span-2">
                    <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Parameters</dt>
                    <dd class="mt-1">
                      <pre class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">{JSON.stringify(selectedExecution.parameters, null, 2)}</pre>
                    </dd>
                  </div>
                {/if}
                {#if selectedExecution.error}
                  <div class="sm:col-span-2">
                    <dt class="text-xs font-medium text-red-600 dark:text-red-400">Error</dt>
                    <dd class="mt-1 text-sm text-red-900 dark:text-red-100">{selectedExecution.error}</dd>
                  </div>
                {/if}
              </dl>
            </div>

            <!-- Per-Node Results -->
            <div>
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                Results by Node ({selectedExecution.results.length})
              </h4>
              <div class="space-y-4">
                {#each selectedExecution.results as result}
                  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <!-- Node Header -->
                    <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                      <div class="flex items-center gap-3">
                        <button
                          type="button"
                          class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          onclick={(e) => {
                            e.stopPropagation();
                            closeExecutionDetail();
                            navigateToNode(result.nodeId);
                          }}
                        >
                          {result.nodeId}
                        </button>
                        <StatusBadge status={result.status} size="sm" />
                      </div>
                      <span class="text-xs text-gray-600 dark:text-gray-400">
                        {result.duration}ms
                      </span>
                    </div>

                    <!-- Node Content -->
                    <div class="px-4 py-3">
                      {#if result.error}
                        <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                          <p class="text-sm font-medium text-red-800 dark:text-red-200">Error:</p>
                          <p class="mt-1 text-sm text-red-700 dark:text-red-300">{result.error}</p>
                        </div>
                      {:else if result.output}
                        <CommandOutput
                          stdout={result.output.stdout}
                          stderr={result.output.stderr}
                          exitCode={result.output.exitCode}
                        />
                      {:else if result.value !== undefined}
                        <div>
                          <div class="mb-2 flex items-center justify-between">
                            <h5 class="text-xs font-medium text-gray-700 dark:text-gray-300">Result Value:</h5>
                            <button
                              type="button"
                              onclick={() => {
                                if (!result.showFullResult) {
                                  result.showFullResult = true;
                                } else {
                                  result.showFullResult = false;
                                }
                              }}
                              class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              {result.showFullResult ? 'Show Output' : 'Show Full Result'}
                            </button>
                          </div>
                          {#if result.showFullResult}
                            <pre class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">{JSON.stringify(result.value, null, 2)}</pre>
                          {:else if result.value._output}
                            <pre class="overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900">{@html ansiToHtml(result.value._output)}</pre>
                          {:else}
                            <pre class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">{JSON.stringify(result.value, null, 2)}</pre>
                          {/if}
                        </div>
                      {:else}
                        <p class="text-sm text-gray-500 dark:text-gray-400">No output</p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-6">
            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onclick={closeExecutionDetail}
              >
                Close
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
