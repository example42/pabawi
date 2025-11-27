<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';

  interface ReportMetrics {
    resources: {
      total: number;
      skipped: number;
      failed: number;
      failed_to_restart: number;
      changed: number;
      out_of_sync: number;
    };
    time: Record<string, number>;
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
    reports: Report[];
    onReportClick?: (report: Report) => void;
  }

  let { reports, onReportClick }: Props = $props();

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  function getDuration(startTime: string, endTime: string): string {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const seconds = Math.round((end - start) / 1000);
    return seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }

  function getStatusBadgeStatus(status: string): 'success' | 'failed' | 'partial' {
    if (status === 'failed') return 'failed';
    if (status === 'changed') return 'partial';
    return 'success';
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
</script>

<div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-900">
        <tr>
          <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Start Time
          </th>
          <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Duration
          </th>
          <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Environment
          </th>
          <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Total
          </th>
          <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Changed
          </th>
          <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Unchanged
          </th>
          <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Failed
          </th>
          <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Skipped
          </th>
          <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
            <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">
              {formatTimestamp(report.start_time)}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
              {getDuration(report.start_time, report.end_time)}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">
              <div class="flex items-center gap-2">
                {report.environment}
                {#if report.noop}
                  <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                    No-op
                  </span>
                {/if}
              </div>
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
              {report.metrics.resources.total}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
              {report.metrics.resources.changed}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-600 dark:text-gray-400">
              {getUnchanged(report.metrics)}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-center text-sm text-red-700 dark:text-red-400">
              {report.metrics.resources.failed}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-600 dark:text-gray-400">
              {report.metrics.resources.skipped}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-sm">
              <StatusBadge status={getStatusBadgeStatus(report.status)} size="sm" />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
