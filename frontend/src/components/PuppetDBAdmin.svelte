<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { debugMode } from '../lib/debug';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface Props {
    onDebugInfo?: (info: DebugInfo | null) => void;
  }

  let { onDebugInfo }: Props = $props();

  // Summary stats state
  let summaryStats = $state<any>(null);
  let summaryStatsLoading = $state(false);
  let summaryStatsError = $state<string | null>(null);

  // Collapsible sections state
  let expandedSections = $state<Record<string, boolean>>({});

  // Fetch summary stats
  async function fetchSummaryStats(): Promise<void> {
    summaryStatsLoading = true;
    summaryStatsError = null;

    if (debugMode.enabled) {
      console.log('[PuppetDBAdmin] Fetching summary stats');
      console.log('[PuppetDBAdmin] API endpoint: GET /api/integrations/puppetdb/admin/summary-stats');
      console.log('[PuppetDBAdmin] WARNING: This endpoint can be resource-intensive');
    }

    try {
      const startTime = performance.now();
      const data = await get<{ stats: any; source: string; warning: string; _debug?: DebugInfo }>(
        '/api/integrations/puppetdb/admin/summary-stats',
        { maxRetries: 2 }
      );
      const endTime = performance.now();

      summaryStats = data.stats;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }

      if (debugMode.enabled) {
        console.log('[PuppetDBAdmin] Summary stats loaded successfully');
        console.log('[PuppetDBAdmin] Response time:', Math.round(endTime - startTime), 'ms');
        console.log('[PuppetDBAdmin] Data:', data);
        if (data.warning) {
          console.warn('[PuppetDBAdmin] Warning:', data.warning);
        }
      }
    } catch (err) {
      summaryStatsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching summary stats:', err);
      showError('Failed to load PuppetDB summary stats', summaryStatsError);
    } finally {
      summaryStatsLoading = false;
    }
  }

  // Format large numbers with commas
  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Format bytes to human-readable size
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Toggle section expansion
  function toggleSection(key: string): void {
    expandedSections[key] = !expandedSections[key];
  }

  // Check if content is too long (more than 500 characters)
  function isContentLong(value: any): boolean {
    const stringified = JSON.stringify(value, null, 2);
    return stringified.length > 500;
  }

  // Get preview of content (first 200 characters)
  function getPreview(value: any): string {
    const stringified = JSON.stringify(value, null, 2);
    if (stringified.length <= 200) return stringified;
    return stringified.substring(0, 200) + '...';
  }

  // On mount, fetch data
  onMount(() => {
    fetchSummaryStats();
  });
</script>

<div class="space-y-6">
  <!-- Summary Stats Section -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Summary Statistics</h3>
        <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
      </div>
      <button
        type="button"
        onclick={fetchSummaryStats}
        disabled={summaryStatsLoading}
        class="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
      >
        <svg class="h-4 w-4 {summaryStatsLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>

    <!-- Performance Warning -->
    <div class="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-300">Performance Warning</h4>
          <p class="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
            This endpoint can be resource-intensive on large PuppetDB instances. Use with caution in production environments.
          </p>
          <div class="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
            <p class="font-medium">Technical Details:</p>
            <ul class="ml-4 mt-1 list-disc space-y-1">
              <li>Queries aggregate statistics across entire database</li>
              <li>Response times can be 30+ seconds on large instances</li>
              <li>May cause temporary performance impact on PuppetDB</li>
              <li>Consider using dedicated monitoring tools for production</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
      Database statistics including node counts, resource counts, and storage information.
    </p>

    {#if summaryStatsLoading}
      <div class="flex justify-center py-8">
        <LoadingSpinner size="md" message="Loading summary stats (this may take a while)..." />
      </div>
    {:else if summaryStatsError}
      <ErrorAlert
        message="Failed to load summary statistics"
        details={summaryStatsError}
        onRetry={fetchSummaryStats}
      />
    {:else if summaryStats}
      <div class="space-y-4">
        <!-- Display stats in a structured way if possible -->
        {#if typeof summaryStats === 'object' && summaryStats !== null}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each Object.entries(summaryStats) as [key, value]}
              <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </dt>
                <dd class="mt-1">
                  {#if typeof value === 'number'}
                    <div class="text-lg font-semibold text-gray-900 dark:text-white">
                      {formatNumber(value)}
                    </div>
                  {:else if typeof value === 'object' && value !== null}
                    {#if isContentLong(value)}
                      <!-- Collapsible section for long content -->
                      <div class="mt-2">
                        <button
                          type="button"
                          onclick={() => toggleSection(key)}
                          class="flex w-full items-center justify-between rounded-md bg-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <span>{expandedSections[key] ? 'Hide Details' : 'Show Details'}</span>
                          <svg
                            class="h-4 w-4 transition-transform {expandedSections[key] ? 'rotate-180' : ''}"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {#if expandedSections[key]}
                          <pre class="mt-2 overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{JSON.stringify(value, null, 2)}</pre>
                        {:else}
                          <pre class="mt-2 overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">{getPreview(value)}</pre>
                        {/if}
                      </div>
                    {:else}
                      <!-- Short content, display directly -->
                      <pre class="mt-2 overflow-x-auto text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(value, null, 2)}</pre>
                    {/if}
                  {:else}
                    <div class="text-lg font-semibold text-gray-900 dark:text-white">
                      {String(value)}
                    </div>
                  {/if}
                </dd>
              </div>
            {/each}
          </div>
        {:else}
          <!-- Fallback to raw JSON display -->
          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <pre class="overflow-x-auto text-sm text-gray-700 dark:text-gray-300">{JSON.stringify(summaryStats, null, 2)}</pre>
          </div>
        {/if}
      </div>
    {:else}
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No statistics available</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Summary statistics could not be retrieved.
        </p>
      </div>
    {/if}
  </div>
</div>
