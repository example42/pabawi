<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface NodeStatus {
    certname: string;
    latest_report_hash?: string;
    latest_report_status?: 'unchanged' | 'changed' | 'failed';
    latest_report_noop?: boolean;
    latest_report_noop_pending?: boolean;
    cached_catalog_status?: string;
    catalog_timestamp?: string;
    facts_timestamp?: string;
    report_timestamp?: string;
    catalog_environment?: string;
    report_environment?: string;
  }

  interface Props {
    status: NodeStatus | null;
    loading?: boolean;
    error?: string | null;
    threshold?: number; // Inactivity threshold in seconds (default: 3600 = 1 hour)
    onRefresh?: () => void;
  }

  let {
    status,
    loading = false,
    error = null,
    threshold = 3600,
    onRefresh
  }: Props = $props();

  // Determine node activity status based on last check-in time
  function getActivityStatus(reportTimestamp?: string): 'active' | 'inactive' | 'never' {
    if (!reportTimestamp) {
      return 'never';
    }

    try {
      const lastCheckIn = new Date(reportTimestamp);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastCheckIn.getTime()) / 1000;

      if (diffSeconds > threshold) {
        return 'inactive';
      }

      return 'active';
    } catch {
      return 'never';
    }
  }

  // Format timestamp to human-readable format
  function formatTimestamp(timestamp?: string): string {
    if (!timestamp) {
      return 'Never';
    }

    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return 'Invalid date';
    }
  }

  // Format relative time (e.g., "2 hours ago")
  function formatRelativeTime(timestamp?: string): string {
    if (!timestamp) {
      return 'Never';
    }

    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSeconds < 60) {
        return 'Just now';
      } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      } else {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      }
    } catch {
      return 'Unknown';
    }
  }

  // Get status badge type for report status
  function getReportStatusBadge(reportStatus?: string): 'success' | 'changed' | 'failed' | 'unchanged' {
    switch (reportStatus) {
      case 'unchanged':
        return 'unchanged';
      case 'changed':
        return 'changed';
      case 'failed':
        return 'failed';
      default:
        return 'success';
    }
  }

  // Get activity status badge type
  function getActivityBadge(activityStatus: 'active' | 'inactive' | 'never'): 'success' | 'failed' | 'pending' {
    switch (activityStatus) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'failed';
      case 'never':
        return 'pending';
    }
  }

  // Get activity status label
  function getActivityLabel(activityStatus: 'active' | 'inactive' | 'never'): string {
    switch (activityStatus) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'never':
        return 'Never Checked In';
    }
  }

  // Derived state
  const activityStatus = $derived(getActivityStatus(status?.report_timestamp));
  const isInactive = $derived(activityStatus === 'inactive');
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <!-- Header -->
  <div class="mb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Node Status</h2>
      <IntegrationBadge integration="puppetserver" variant="badge" size="sm" />
    </div>
    {#if onRefresh}
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
        onclick={onRefresh}
        disabled={loading}
      >
        <svg
          class="h-4 w-4 {loading ? 'animate-spin' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Refresh
      </button>
    {/if}
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-8">
      <LoadingSpinner size="md" message="Loading node status..." />
    </div>
  {:else if error}
    <!-- Error State with Graceful Degradation Message (Requirement 5.4, 5.5) -->
    <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Node Status Unavailable
          </h3>
          <p class="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
            {error}
          </p>

          <!-- Troubleshooting guidance (Requirement 5.5) -->
          <div class="mt-3 rounded-md bg-yellow-100 dark:bg-yellow-900/30 p-3">
            <h4 class="text-xs font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
              Common Causes:
            </h4>
            <ul class="text-xs text-yellow-800 dark:text-yellow-300 space-y-1 list-disc list-inside">
              <li>Node has not run Puppet agent yet - run <code class="px-1 py-0.5 bg-yellow-200 dark:bg-yellow-800 rounded font-mono">puppet agent -t</code> on the node</li>
              <li>Node certificate is not signed in Puppetserver - check the Certificate Status tab</li>
              <li>Puppetserver is not reachable - verify network connectivity and Puppetserver configuration</li>
              <li>Node certname doesn't match - ensure the node's certname matches this node ID</li>
            </ul>
          </div>

          <p class="mt-3 text-sm text-yellow-700 dark:text-yellow-300">
            The system continues to operate normally. Other node information is still available.
          </p>
          {#if onRefresh}
            <button
              type="button"
              class="mt-3 inline-flex items-center gap-2 rounded-md bg-yellow-600 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
              onclick={onRefresh}
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          {/if}
        </div>
      </div>
    </div>
  {:else if !status}
    <!-- No Data State (Requirement 5.4) -->
    <div class="space-y-4">
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <svg
          class="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          No status information available
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This node has not reported to Puppetserver yet.
        </p>
      </div>

      <!-- Help information (Requirement 5.5) -->
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-start gap-3">
          <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">How to get node status</h4>
            <ol class="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>Ensure the Puppet agent is installed on the node</li>
              <li>Configure the agent to point to your Puppetserver</li>
              <li>Ensure the node's certificate is signed (check the Certificate Status tab)</li>
              <li>Run <code class="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded font-mono text-xs">puppet agent -t</code> on the node to generate a report</li>
              <li>Refresh this page to see the updated status</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Status Content -->
    <div class="space-y-6">
      <!-- Activity Status - Highlighted if inactive -->
      <div class="rounded-lg {isInactive ? 'bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700'} p-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium {isInactive ? 'text-red-900 dark:text-red-300' : 'text-gray-900 dark:text-white'}">
              Activity Status
            </h3>
            <p class="mt-1 text-sm {isInactive ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}">
              {#if activityStatus === 'never'}
                This node has never checked in with Puppetserver
              {:else if activityStatus === 'inactive'}
                This node has not checked in for over {Math.floor(threshold / 3600)} hour{Math.floor(threshold / 3600) !== 1 ? 's' : ''}
              {:else}
                This node is actively reporting to Puppetserver
              {/if}
            </p>
          </div>
          <StatusBadge status={getActivityBadge(activityStatus)} size="md" />
        </div>
      </div>

      <!-- Last Run Information -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Run</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">
            {formatRelativeTime(status.report_timestamp)}
          </dd>
          {#if status.report_timestamp}
            <dd class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(status.report_timestamp)}
            </dd>
          {/if}
        </div>

        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Run Status</dt>
          <dd class="mt-1">
            {#if status.latest_report_status}
              <StatusBadge status={getReportStatusBadge(status.latest_report_status)} size="sm" />
              {#if status.latest_report_noop}
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">(noop mode)</span>
              {/if}
            {:else}
              <span class="text-sm text-gray-500 dark:text-gray-400">Unknown</span>
            {/if}
          </dd>
        </div>

        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Catalog Version</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">
            {#if status.catalog_timestamp}
              {formatRelativeTime(status.catalog_timestamp)}
            {:else}
              <span class="text-gray-500 dark:text-gray-400">Not available</span>
            {/if}
          </dd>
          {#if status.catalog_timestamp}
            <dd class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(status.catalog_timestamp)}
            </dd>
          {/if}
        </div>

        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Facts Updated</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">
            {#if status.facts_timestamp}
              {formatRelativeTime(status.facts_timestamp)}
            {:else}
              <span class="text-gray-500 dark:text-gray-400">Not available</span>
            {/if}
          </dd>
          {#if status.facts_timestamp}
            <dd class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(status.facts_timestamp)}
            </dd>
          {/if}
        </div>
      </div>

      <!-- Environment Information -->
      {#if status.catalog_environment || status.report_environment}
        <div class="border-t border-gray-200 pt-4 dark:border-gray-700">
          <h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-white">Environment</h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {#if status.catalog_environment}
              <div>
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Catalog Environment</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                  <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    {status.catalog_environment}
                  </span>
                </dd>
              </div>
            {/if}
            {#if status.report_environment}
              <div>
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Report Environment</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                  <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    {status.report_environment}
                  </span>
                </dd>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Additional Details -->
      {#if status.latest_report_hash || status.cached_catalog_status || status.latest_report_noop_pending}
        <details class="border-t border-gray-200 pt-4 dark:border-gray-700">
          <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
            Additional Details
          </summary>
          <div class="mt-3 space-y-2">
            {#if status.latest_report_hash}
              <div>
                <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Report Hash</dt>
                <dd class="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">
                  {status.latest_report_hash}
                </dd>
              </div>
            {/if}
            {#if status.cached_catalog_status}
              <div>
                <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Cached Catalog Status</dt>
                <dd class="mt-1 text-xs text-gray-900 dark:text-white">
                  {status.cached_catalog_status}
                </dd>
              </div>
            {/if}
            {#if status.latest_report_noop_pending}
              <div>
                <dt class="text-xs font-medium text-gray-500 dark:text-gray-400">Noop Pending</dt>
                <dd class="mt-1 text-xs text-gray-900 dark:text-white">
                  Yes
                </dd>
              </div>
            {/if}
          </div>
        </details>
      {/if}
    </div>
  {/if}
</div>
