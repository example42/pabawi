<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { router } from '../lib/router.svelte';

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

  // Fetch nodes for target filter
  async function fetchNodes(): Promise<void> {
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) {
        throw new Error('Failed to fetch nodes');
      }
      const data = await response.json();
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

      const response = await fetch(`/api/executions?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Failed to fetch executions: ${response.statusText}`);
      }

      const data = await response.json();
      executions = data.executions || [];
      pagination = data.pagination || pagination;
      summary = data.summary || summary;
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching executions:', err);
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
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTypeColor(execution.type)}">
                      {execution.type}
                    </span>
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
                          onclick={() => navigateToNode(nodeId)}
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
