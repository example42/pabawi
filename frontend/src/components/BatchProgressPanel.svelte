<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { get } from '../lib/api';

  interface ExecutionDetail {
    id: string;
    nodeId: string;
    nodeName: string;
    status: 'queued' | 'running' | 'success' | 'failed';
    startedAt?: string;
    completedAt?: string;
    duration?: number;
    result?: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
  }

  interface BatchExecution {
    id: string;
    type: 'command' | 'task' | 'plan';
    action: string;
    parameters?: Record<string, unknown>;
    targetNodes: string[];
    targetGroups: string[];
    status: 'running' | 'success' | 'failed' | 'partial' | 'cancelled';
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    userId: string;
    executionIds: string[];
    stats: {
      total: number;
      queued: number;
      running: number;
      success: number;
      failed: number;
    };
  }

  interface BatchStatusResponse {
    batch: BatchExecution;
    executions: ExecutionDetail[];
    progress: number;
  }

  interface Props {
    batchId: string;
    onComplete?: () => void;
  }

  let { batchId, onComplete }: Props = $props();

  // State for batch status
  let batchStatus = $state<BatchStatusResponse | null>(null);
  let loading = $state<boolean>(true);
  let error = $state<string | null>(null);

  // Polling state
  let polling = $state<boolean>(true);
  let pollingInterval = $state<number>(2000); // Start with 2 seconds
  let pollingTimeoutId = $state<number | null>(null);

  // Filter state
  let filterStatus = $state<'all' | 'running' | 'success' | 'failed'>('all');

  // Cancellation state
  let cancelling = $state<boolean>(false);
  let cancelError = $state<string | null>(null);

  // Fetch batch status from API
  async function fetchBatchStatus(): Promise<void> {
    try {
      const data = await get<BatchStatusResponse>(`/api/executions/batch/${batchId}`);
      batchStatus = data;
      error = null;
      loading = false;

      // Check if all executions are complete
      const allComplete = isAllExecutionsComplete(data.batch);

      if (allComplete) {
        // Stop polling when all executions complete
        stopPolling();

        // Call onComplete callback if provided
        if (onComplete) {
          onComplete();
        }
      } else {
        // Implement exponential backoff: 2s → 4s → 8s (max)
        if (pollingInterval < 8000) {
          pollingInterval = Math.min(pollingInterval * 2, 8000);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to fetch batch status';
      console.error('[BatchProgressPanel] Error fetching batch status:', err);
      loading = false;

      // Continue polling even on error (might be temporary)
      // But use longer interval on error
      pollingInterval = 5000;
    }
  }

  // Check if all executions are complete
  function isAllExecutionsComplete(batch: BatchExecution): boolean {
    const terminalStatuses: Array<BatchExecution['status']> = ['success', 'failed', 'partial', 'cancelled'];
    return terminalStatuses.includes(batch.status);
  }

  // Start polling for batch status
  function startPolling(): void {
    if (!polling) return;

    // Fetch immediately
    fetchBatchStatus();

    // Schedule next poll
    pollingTimeoutId = window.setTimeout(() => {
      if (polling) {
        startPolling();
      }
    }, pollingInterval);
  }

  // Stop polling
  function stopPolling(): void {
    polling = false;
    if (pollingTimeoutId !== null) {
      window.clearTimeout(pollingTimeoutId);
      pollingTimeoutId = null;
    }
  }

  // Start polling when component mounts
  $effect(() => {
    startPolling();

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  });

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

  // Get status badge color classes
  function getStatusColor(status: ExecutionDetail['status']): string {
    switch (status) {
      case 'queued':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      case 'running':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      case 'success':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  }

  // Get status icon
  function getStatusIcon(status: ExecutionDetail['status']): string {
    switch (status) {
      case 'queued':
        return '⏳';
      case 'running':
        return '▶️';
      case 'success':
        return '✓';
      case 'failed':
        return '✗';
      default:
        return '•';
    }
  }

  // Filter executions by status
  function getFilteredExecutions(): ExecutionDetail[] {
    if (!batchStatus) return [];

    if (filterStatus === 'all') {
      return batchStatus.executions;
    }

    return batchStatus.executions.filter(exec => exec.status === filterStatus);
  }

  // Cancel batch execution
  async function handleCancel(): Promise<void> {
    if (!batchStatus || cancelling) return;

    // Confirm cancellation
    if (!confirm('Are you sure you want to cancel all remaining executions in this batch?')) {
      return;
    }

    cancelling = true;
    cancelError = null;

    try {
      const response = await fetch(`/api/executions/batch/${batchId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to cancel batch' }));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[BatchProgressPanel] Batch cancelled:', result);

      // Refresh batch status immediately
      await fetchBatchStatus();

      // Stop polling since batch is cancelled
      stopPolling();
    } catch (err) {
      cancelError = err instanceof Error ? err.message : 'Failed to cancel batch';
      console.error('[BatchProgressPanel] Error cancelling batch:', err);
    } finally {
      cancelling = false;
    }
  }

  // Check if cancel button should be shown
  function canCancelBatch(): boolean {
    if (!batchStatus) return false;

    // Can cancel if there are queued or running executions
    return batchStatus.batch.stats.queued > 0 || batchStatus.batch.stats.running > 0;
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
  <!-- Header -->
  <div class="mb-4">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
      Batch Execution Progress
    </h3>
    {#if batchStatus}
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Batch ID: <span class="font-mono">{batchId}</span>
      </p>
    {/if}
  </div>

  <!-- Loading State -->
  {#if loading && !batchStatus}
    <div
      class="flex items-center justify-center py-8"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="md" />
      <span class="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading batch status...</span>
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
            onclick={() => { error = null; loading = true; fetchBatchStatus(); }}
            class="mt-2 text-sm font-medium text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Batch Status Display -->
  {#if batchStatus}
    <!-- Summary Statistics -->
    <div class="mb-6" role="region" aria-label="Batch execution statistics">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-white" aria-label="Total targets">
            {batchStatus.batch.stats.total}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Total</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-500 dark:text-gray-400" aria-label="Queued executions">
            {batchStatus.batch.stats.queued}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Queued</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400" aria-label="Running executions">
            {batchStatus.batch.stats.running}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Running</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400" aria-label="Successful executions">
            {batchStatus.batch.stats.success}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Success</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-red-600 dark:text-red-400" aria-label="Failed executions">
            {batchStatus.batch.stats.failed}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Failed</div>
        </div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Progress
        </span>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {Math.round(batchStatus.progress)}%
        </span>
      </div>
      <div
        class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5"
        role="progressbar"
        aria-valuenow={Math.round(batchStatus.progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Batch execution progress"
      >
        <div
          class="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
          style="width: {batchStatus.progress}%"
        ></div>
      </div>
    </div>

    <!-- Execution List -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white" id="executions-heading">
          Target Executions ({getFilteredExecutions().length}{filterStatus !== 'all' ? ` of ${batchStatus.executions.length}` : ''})
        </h4>

        <div class="flex items-center gap-2">
          <!-- Status Filter Dropdown -->
          <label for="status-filter" class="sr-only">Filter by status</label>
          <select
            id="status-filter"
            bind:value={filterStatus}
            class="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter executions by status"
          >
            <option value="all">All</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          <!-- Cancel Button -->
          {#if canCancelBatch()}
            <button
              type="button"
              onclick={handleCancel}
              disabled={cancelling}
              class="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
              aria-label="Cancel remaining executions"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Batch'}
            </button>
          {/if}
        </div>
      </div>

      <!-- Cancel Error Message -->
      {#if cancelError}
        <div
          class="mb-3 rounded-md bg-red-50 dark:bg-red-900/20 p-3"
          role="alert"
        >
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-2">
              <p class="text-xs text-red-800 dark:text-red-200">{cancelError}</p>
            </div>
            <button
              type="button"
              onclick={() => { cancelError = null; }}
              class="ml-auto -mx-1.5 -my-1.5 rounded-md p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Dismiss error"
            >
              <span class="sr-only">Dismiss</span>
              <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      {/if}

      <div
        class="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md"
        role="region"
        aria-labelledby="executions-heading"
        aria-live="polite"
        aria-atomic="false"
      >
        {#if getFilteredExecutions().length === 0}
          <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
            {filterStatus === 'all' ? 'No executions found' : `No ${filterStatus} executions`}
          </div>
        {:else}
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each getFilteredExecutions() as execution}
              <li
                class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        class="text-lg"
                        role="img"
                        aria-label={`Status: ${execution.status}`}
                      >
                        {getStatusIcon(execution.status)}
                      </span>
                      <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {execution.nodeName}
                      </span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {#if execution.duration}
                        Duration: {formatDuration(execution.duration)}
                      {:else if execution.startedAt}
                        Started at {new Date(execution.startedAt).toLocaleTimeString()}
                      {:else}
                        Waiting in queue
                      {/if}
                    </div>
                  </div>
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap {getStatusColor(execution.status)}"
                    role="status"
                    aria-label={`Execution status: ${execution.status}`}
                  >
                    {execution.status}
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- Polling Indicator -->
    {#if polling}
      <div
        class="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400"
        role="status"
        aria-live="polite"
      >
        <svg class="animate-spin h-3 w-3 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Updating every {pollingInterval / 1000}s...</span>
      </div>
    {:else}
      <div
        class="text-center text-sm text-gray-500 dark:text-gray-400"
        role="status"
      >
        {#if batchStatus.batch.status === 'success'}
          <span class="text-green-600 dark:text-green-400 font-medium">✓ All executions completed successfully</span>
        {:else if batchStatus.batch.status === 'failed'}
          <span class="text-red-600 dark:text-red-400 font-medium">✗ Batch execution failed</span>
        {:else if batchStatus.batch.status === 'partial'}
          <span class="text-yellow-600 dark:text-yellow-400 font-medium">⚠ Batch completed with some failures</span>
        {:else if batchStatus.batch.status === 'cancelled'}
          <span class="text-gray-600 dark:text-gray-400 font-medium">Batch execution cancelled</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
