<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface IntegrationStatus {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error';
    lastCheck: string;
    message?: string;
    details?: unknown;
  }

  interface Props {
    integrations: IntegrationStatus[];
    loading?: boolean;
    onRefresh?: () => void;
  }

  let { integrations, loading = false, onRefresh }: Props = $props();

  // Map integration status to badge status
  function getStatusBadgeType(status: string): 'success' | 'failed' | 'running' {
    switch (status) {
      case 'connected':
        return 'success';
      case 'error':
      case 'disconnected':
        return 'failed';
      default:
        return 'running';
    }
  }

  // Format last check time
  function formatLastCheck(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  }

  // Get icon for integration type
  function getTypeIcon(type: string): string {
    switch (type) {
      case 'execution':
        return 'M13 10V3L4 14h7v7l9-11h-7z'; // Lightning bolt
      case 'information':
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; // Info circle
      case 'both':
        return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'; // Shield check
      default:
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // Check circle
    }
  }

  // Get display name for integration
  function getDisplayName(name: string): string {
    // Capitalize first letter and replace hyphens with spaces
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
</script>

<div class="space-y-4">
  <!-- Header with refresh button -->
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
      Integration Status
    </h3>
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

  <!-- Loading state -->
  {#if loading && integrations.length === 0}
    <div class="flex justify-center py-8">
      <LoadingSpinner size="md" message="Loading integration status..." />
    </div>
  {:else if integrations.length === 0}
    <!-- Empty state -->
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
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        No integrations configured
      </h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Configure integrations to see their status here
      </p>
    </div>
  {:else}
    <!-- Integration cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each integrations as integration (integration.name)}
        <div
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <!-- Header with icon and name -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg {integration.status === 'connected'
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d={getTypeIcon(integration.type)}
                  />
                </svg>
              </div>
              <div>
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                  {getDisplayName(integration.name)}
                </h4>
                <p class="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {integration.type}
                </p>
              </div>
            </div>
            <StatusBadge status={getStatusBadgeType(integration.status)} size="sm" />
          </div>

          <!-- Status details -->
          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-gray-400">Last checked:</span>
              <span class="font-medium text-gray-700 dark:text-gray-300">
                {formatLastCheck(integration.lastCheck)}
              </span>
            </div>

            {#if integration.message}
              <div class="mt-2">
                <p
                  class="text-xs {integration.status === 'connected'
                    ? 'text-gray-600 dark:text-gray-400'
                    : 'text-red-600 dark:text-red-400'}"
                >
                  {integration.message}
                </p>
              </div>
            {/if}

            {#if integration.details && integration.status === 'error'}
              <details class="mt-2">
                <summary
                  class="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Show error details
                </summary>
                <pre
                  class="mt-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                >{JSON.stringify(integration.details, null, 2)}</pre>
              </details>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
