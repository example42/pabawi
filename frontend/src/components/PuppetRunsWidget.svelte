<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { router } from '../lib/router.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import type { DebugInfo } from '../lib/api';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  interface ReportMetrics {
    resources: {
      total: number;
      changed: number;
      corrective_change?: number;
      out_of_sync: number;
      failed: number;
      skipped: number;
    };
    events?: {
      noop?: number;
    };
    time?: {
      config_retrieval?: number;
    };
  }

  interface PuppetReport {
    hash: string;
    start_time: string;
    end_time: string;
    environment: string;
    noop: boolean;
    status: string;
    metrics: ReportMetrics;
  }

  let { nodeId, onReady, onError }: Props = $props();

  let reports = $state<PuppetReport[] | null>(null);
  let loading = $state(false);

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

  function getUnchanged(metrics: ReportMetrics): number {
    return metrics.resources.total - metrics.resources.out_of_sync;
  }

  function getIntentionalChanges(metrics: ReportMetrics): number {
    const intentional = metrics.resources.changed - (metrics.resources.corrective_change || 0);
    return Math.max(0, intentional);
  }

  function navigateToReports(): void {
    router.navigate(`/nodes/${nodeId}?tab=puppet&subtab=puppet-reports`);
  }

  async function fetchReports(): Promise<void> {
    loading = true;
    try {
      const data = await get<{ reports: PuppetReport[]; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/reports?limit=5`,
        { maxRetries: 2 }
      );
      reports = data.reports || [];
      onReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Puppet reports';
      onError(new Error(message));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void fetchReports();
  });
</script>

<div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
  <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
    <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Latest Puppet Runs</h3>
    <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
  </div>

  <div class="p-4">
    {#if !reports && loading}
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Loading Puppet runs...
        <button
          type="button"
          class="text-blue-600 hover:text-blue-700 dark:text-blue-400"
          onclick={() => { void fetchReports(); }}
        >
          Load now
        </button>
      </p>
    {:else if reports && reports.length === 0}
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No Puppet runs found for this node.
      </p>
    {:else if reports}
      <div class="overflow-x-auto">
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
            {#each reports as report (report.hash)}
              <tr
                class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                onclick={() => navigateToReports()}
              >
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                  {formatTimestamp(report.start_time)}
                </td>
                <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-600 dark:text-gray-400">
                  {getDuration(report.start_time, report.end_time)}
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

      {#if reports.length >= 5}
        <button
          type="button"
          class="mt-3 w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          onclick={() => navigateToReports()}
        >
          View all runs →
        </button>
      {/if}
    {/if}
  </div>
</div>
