<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface IntegrationStatus {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured' | 'degraded';
    lastCheck: string;
    message?: string;
    details?: unknown;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
    // Expert mode fields
    endpoint?: string;
    lastError?: string;
    connectionAttempts?: number;
    responseTime?: number;
  }

  interface Props {
    integrations: IntegrationStatus[];
    loading?: boolean;
    onRefresh?: () => void;
  }

  let { integrations, loading = false, onRefresh }: Props = $props();

  // Map integration status to badge status
  function getStatusBadgeType(status: string): 'success' | 'failed' | 'running' | 'pending' {
    switch (status) {
      case 'connected':
        return 'success';
      case 'degraded':
        return 'running'; // Use warning/running badge for degraded
      case 'error':
      case 'disconnected':
        return 'failed';
      case 'not_configured':
        return 'pending';
      default:
        return 'running';
    }
  }

  // Get setup URL for integration
  function getSetupUrl(name: string): string {
    return `/integrations/${name}/setup`;
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
                  : integration.status === 'degraded'
                    ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : integration.status === 'not_configured'
                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
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

            {#if integration.status === 'degraded' && (integration.workingCapabilities || integration.failingCapabilities)}
              <div class="mt-3 space-y-2">
                {#if integration.workingCapabilities && integration.workingCapabilities.length > 0}
                  <div>
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Working:</p>
                    <div class="flex flex-wrap gap-1">
                      {#each integration.workingCapabilities as capability}
                        <span class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                          {capability}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if integration.failingCapabilities && integration.failingCapabilities.length > 0}
                  <div>
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Failing:</p>
                    <div class="flex flex-wrap gap-1">
                      {#each integration.failingCapabilities as capability}
                        <span class="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-900/20 dark:text-red-400">
                          {capability}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            {#if integration.message}
              <div class="mt-2">
                <p
                  class="text-xs {integration.status === 'connected'
                    ? 'text-gray-600 dark:text-gray-400'
                    : integration.status === 'degraded'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : integration.status === 'not_configured'
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-red-600 dark:text-red-400'}"
                >
                  {integration.message}
                </p>
              </div>
            {/if}

            {#if integration.status === 'not_configured'}
              <div class="mt-3">
                <a
                  href={getSetupUrl(integration.name)}
                  class="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Setup Instructions
                </a>
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

            <!-- Expert Mode Information -->
            {#if expertMode.enabled}
              <div class="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div class="flex items-center gap-2">
                  <svg class="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h5 class="text-xs font-semibold text-amber-900 dark:text-amber-200">Expert Mode Details</h5>
                </div>

                {#if integration.endpoint}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Endpoint:</span>
                    <code class="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{integration.endpoint}</code>
                  </div>
                {/if}

                {#if integration.responseTime !== undefined}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Response Time:</span>
                    <span class="ml-1 text-amber-700 dark:text-amber-300">{integration.responseTime}ms</span>
                  </div>
                {/if}

                {#if integration.connectionAttempts !== undefined}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Connection Attempts:</span>
                    <span class="ml-1 text-amber-700 dark:text-amber-300">{integration.connectionAttempts}</span>
                  </div>
                {/if}

                {#if integration.lastError}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Last Error:</span>
                    <pre class="mt-1 overflow-x-auto rounded bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{integration.lastError}</pre>
                  </div>
                {/if}

                <div class="pt-2 text-xs text-amber-700 dark:text-amber-300">
                  <p class="font-medium">🔧 Troubleshooting:</p>
                  <ul class="mt-1 list-inside list-disc space-y-1 pl-2">
                    {#if integration.status === 'not_configured'}
                      <li>Configure the integration using environment variables or config file</li>
                      <li>Check the setup instructions for required parameters</li>
                    {:else if integration.status === 'error' || integration.status === 'disconnected'}
                      <li>Verify if you have the command available</li>
                      <li>Verify the service is running and accessible</li>
                      <li>Check network connectivity and firewall rules</li>
                      <li>Verify authentication credentials are correct</li>
                      <li>Review service logs for detailed error information</li>
                    {:else if integration.status === 'degraded'}
                      <li>Some capabilities are failing - check logs for details</li>
                      <li>Working capabilities can still be used normally</li>
                      <li>Try refreshing to see if issues resolve</li>
                    {/if}
                  </ul>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
