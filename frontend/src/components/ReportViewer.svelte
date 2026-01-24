<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';

  interface ResourceEvent {
    resource_type: string;
    resource_title: string;
    property: string;
    timestamp: string;
    status: 'success' | 'failure' | 'noop' | 'skipped';
    old_value?: unknown;
    new_value?: unknown;
    message?: string;
    file?: string;
    line?: number;
    containment_path: string[];
  }

  interface ReportMetrics {
    resources: {
      total: number;
      skipped: number;
      failed: number;
      failed_to_restart: number;
      restarted: number;
      changed: number;
      corrective_change: number;
      out_of_sync: number;
      scheduled: number;
    };
    time: Record<string, number>;
    changes: {
      total: number;
    };
    events: {
      success: number;
      failure: number;
      noop: number;
      total: number;
    };
  }

  interface Report {
    certname: string;
    hash: string;
    environment: string;
    status: 'unchanged' | 'changed' | 'failed';
    noop: boolean;
    puppet_version: string;
    report_format: number;
    configuration_version: string;
    start_time: string;
    end_time: string;
    producer_timestamp: string;
    receive_time: string;
    transaction_uuid: string;
    metrics: ReportMetrics;
    logs: Array<{
      level: string;
      message: string;
      source: string;
      tags: string[];
      time: string;
      file?: string;
      line?: number;
    }>;
    resource_events: ResourceEvent[];
  }

  interface Props {
    report: Report;
    onResourceClick?: (resource: ResourceEvent) => void;
  }

  let { report, onResourceClick }: Props = $props();

  // State for collapsible sections
  let showMetrics = $state(true);
  let showEvents = $state(true);
  let showLogs = $state(false);

  // Filter state for events
  let eventFilter = $state<'all' | 'success' | 'failure' | 'noop' | 'skipped'>('all');

  // Computed values
  const statusBadgeStatus = $derived<'success' | 'failed' | 'changed'>(
    report.status === 'failed' ? 'failed' :
    report.status === 'changed' ? 'changed' :
    'success'
  );

  const duration = $derived(() => {
    const start = new Date(report.start_time).getTime();
    const end = new Date(report.end_time).getTime();
    const seconds = Math.round((end - start) / 1000);
    return seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  });

  const filteredEvents = $derived(
    eventFilter === 'all'
      ? report.resource_events
      : report.resource_events.filter(e => e.status === eventFilter)
  );

  const failedEvents = $derived(
    report.resource_events.filter(e => e.status === 'failure')
  );

  // Calculate additional metrics
  const unchangedResources = $derived(
    report.metrics.resources.total - report.metrics.resources.out_of_sync
  );

  const correctiveChanges = $derived(
    report.metrics.resources.corrective_change || 0
  );

  const intentionalChanges = $derived(
    report.metrics.resources.changed - correctiveChanges
  );

  // Get top resource types by time
  const topResourceTypes = $derived(() => {
    const timeMetrics = report.metrics.time;
    const resourceTypes: Array<{name: string, time: number}> = [];

    // Extract resource type times from time metrics
    Object.entries(timeMetrics).forEach(([key, value]) => {
      if (key !== 'total' && key !== 'config_retrieval' && key !== 'fact_generation' &&
          key !== 'transaction_evaluation' && key !== 'convert_catalog' &&
          key !== 'node_retrieval' && key !== 'plugin_sync' && key !== 'catalog_application') {
        resourceTypes.push({ name: key, time: value });
      }
    });

    return resourceTypes
      .sort((a, b) => b.time - a.time)
      .slice(0, 10); // Top 10
  });

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }

  function toggleSection(section: 'metrics' | 'events' | 'logs'): void {
    if (section === 'metrics') showMetrics = !showMetrics;
    if (section === 'events') showEvents = !showEvents;
    if (section === 'logs') showLogs = !showLogs;
  }
</script>

<div class="report-viewer space-y-6">
  <!-- Report Summary -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Puppet Run Report
          </h3>
          <StatusBadge status={statusBadgeStatus} />
          {#if report.noop}
            <span class="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-sm font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
              No-op Mode
            </span>
          {/if}
        </div>

        <!-- Puppet Run Timing Information -->
        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div class="text-sm font-medium text-blue-800 dark:text-blue-200">Run began</div>
            <div class="text-lg font-semibold text-blue-900 dark:text-blue-100">{formatTimestamp(report.start_time)}</div>
          </div>
          <div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <div class="text-sm font-medium text-green-800 dark:text-green-200">Catalog submitted</div>
            <div class="text-lg font-semibold text-green-900 dark:text-green-100">{formatTimestamp(report.producer_timestamp)}</div>
          </div>
          <div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <div class="text-sm font-medium text-purple-800 dark:text-purple-200">Run ended</div>
            <div class="text-lg font-semibold text-purple-900 dark:text-purple-100">{formatTimestamp(report.end_time)}</div>
          </div>
          <div class="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
            <div class="text-sm font-medium text-orange-800 dark:text-orange-200">Report received</div>
            <div class="text-lg font-semibold text-orange-900 dark:text-orange-100">{formatTimestamp(report.receive_time)}</div>
          </div>
        </div>

        <!-- Performance Metrics -->
        <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Total runtime (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">{duration()}</div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Config retrieval time (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.config_retrieval?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Fact generation (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.fact_generation?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Transaction evaluation (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.transaction_evaluation?.toFixed(2) || 'N/A'}
            </div>
          </div>
        </div>

        <!-- Additional Performance Metrics -->
        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Convert catalog (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.convert_catalog?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Node retrieval (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.node_retrieval?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Plugin sync (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.plugin_sync?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Time to apply (sec):</span>
            <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {report.metrics.time.catalog_application?.toFixed(2) || 'N/A'}
            </div>
          </div>
        </div>

        <!-- Catalog Information -->
        <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Config version:</span>
            <div class="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
              {report.configuration_version}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Catalog UUID:</span>
            <div class="text-sm font-mono text-gray-900 dark:text-gray-100">
              {report.transaction_uuid}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Cached catalog used:</span>
            <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {report.noop ? 'yes' : 'no'}
            </div>
          </div>
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">Environment:</span>
            <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">{report.environment}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Resources Summary -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Resources</h4>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <span class="text-sm text-gray-500 dark:text-gray-400">Total managed by Puppet:</span>
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {report.metrics.resources.total.toLocaleString()}
        </div>
      </div>
    </div>
  </div>

  <!-- Events Summary -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Events</h4>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-6">
      <div class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
        <div class="text-2xl font-bold text-red-700 dark:text-red-400">{report.metrics.resources.failed}</div>
        <div class="text-sm text-red-600 dark:text-red-500">Failures</div>
      </div>
      <div class="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
        <div class="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{correctiveChanges}</div>
        <div class="text-sm text-yellow-600 dark:text-yellow-500">Corrective changes</div>
      </div>
      <div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div class="text-2xl font-bold text-blue-700 dark:text-blue-400">{intentionalChanges}</div>
        <div class="text-sm text-blue-600 dark:text-blue-500">Intentional changes</div>
      </div>
      <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
        <div class="text-2xl font-bold text-gray-700 dark:text-gray-400">{report.metrics.events.noop || 0}</div>
        <div class="text-sm text-gray-600 dark:text-gray-500">No-ops</div>
      </div>
      <div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
        <div class="text-2xl font-bold text-purple-700 dark:text-purple-400">{report.metrics.resources.skipped}</div>
        <div class="text-sm text-purple-600 dark:text-purple-500">Skips</div>
      </div>
      <div class="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
        <div class="text-2xl font-bold text-orange-700 dark:text-orange-400">{report.metrics.resources.failed_to_restart}</div>
        <div class="text-sm text-orange-600 dark:text-orange-500">Failed restarts</div>
      </div>
    </div>
    <div class="mt-4">
      <div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <div class="text-2xl font-bold text-green-700 dark:text-green-400">{unchangedResources}</div>
        <div class="text-sm text-green-600 dark:text-green-500">Unchanged</div>
      </div>
    </div>
  </div>

  <!-- Top Resource Types by Time -->
  {#if topResourceTypes.length > 0}
    <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Top resource types by time to apply (sec)
      </h4>
      <div class="space-y-3">
        {#each topResourceTypes as resourceType, index}
          <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <div class="flex items-center gap-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800 dark:bg-primary-900/50 dark:text-primary-200">
                {index + 1}
              </span>
              <span class="font-medium text-gray-900 dark:text-gray-100">{resourceType.name}</span>
            </div>
            <span class="font-mono text-sm text-gray-600 dark:text-gray-400">
              {resourceType.time.toFixed(2)}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Metrics Section -->
  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
    <button
      type="button"
      class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
      onclick={() => toggleSection('metrics')}
    >
      <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">Detailed Resource Metrics</h4>
      <svg
        class="h-5 w-5 transition-transform {showMetrics ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {#if showMetrics}
      <div class="border-t border-gray-200 p-4 dark:border-gray-700">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{report.metrics.resources.total}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Total Resources</div>
          </div>
          <div class="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <div class="text-2xl font-bold text-green-700 dark:text-green-400">{report.metrics.events.success}</div>
            <div class="text-sm text-green-600 dark:text-green-500">Successful</div>
          </div>
          <div class="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
            <div class="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{report.metrics.resources.changed}</div>
            <div class="text-sm text-yellow-600 dark:text-yellow-500">Changed</div>
          </div>
          <div class="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
            <div class="text-2xl font-bold text-red-700 dark:text-red-400">{report.metrics.resources.failed}</div>
            <div class="text-sm text-red-600 dark:text-red-500">Failed</div>
          </div>
          <div class="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
            <div class="text-2xl font-bold text-purple-700 dark:text-purple-400">{report.metrics.resources.skipped}</div>
            <div class="text-sm text-purple-600 dark:text-purple-500">Skipped</div>
          </div>
          <div class="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-400">{report.metrics.resources.restarted}</div>
            <div class="text-sm text-blue-600 dark:text-blue-500">Restarted</div>
          </div>
          <div class="rounded-lg bg-orange-50 p-3 dark:bg-orange-900/20">
            <div class="text-2xl font-bold text-orange-700 dark:text-orange-400">{report.metrics.resources.out_of_sync}</div>
            <div class="text-sm text-orange-600 dark:text-orange-500">Out of Sync</div>
          </div>
          <div class="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/20">
            <div class="text-2xl font-bold text-indigo-700 dark:text-indigo-400">{report.metrics.resources.scheduled}</div>
            <div class="text-sm text-indigo-600 dark:text-indigo-500">Scheduled</div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Failed Resources Highlight (Requirement 3.5) -->
  {#if failedEvents.length > 0}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-3">
        <svg
          class="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-red-800 dark:text-red-200">
            {failedEvents.length} Failed Resource{failedEvents.length !== 1 ? 's' : ''}
          </h4>
          <ul class="mt-2 space-y-1">
            {#each failedEvents as event}
              <li class="text-sm text-red-700 dark:text-red-300">
                <button
                  type="button"
                  class="hover:underline"
                  onclick={() => onResourceClick?.(event)}
                >
                  {event.resource_type}[{event.resource_title}]
                </button>
                {#if event.message}
                  <span class="text-red-600 dark:text-red-400">: {event.message}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  {/if}

  <!-- Resource Events Section -->
  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
    <button
      type="button"
      class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
      onclick={() => toggleSection('events')}
    >
      <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        Resource Events ({filteredEvents.length})
      </h4>
      <svg
        class="h-5 w-5 transition-transform {showEvents ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {#if showEvents}
      <div class="border-t border-gray-200 dark:border-gray-700">
        <!-- Event Filter -->
        <div class="border-b border-gray-200 p-4 dark:border-gray-700">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-medium {eventFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => eventFilter = 'all'}
            >
              All ({report.resource_events.length})
            </button>
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-medium {eventFilter === 'success' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => eventFilter = 'success'}
            >
              Success ({report.resource_events.filter(e => e.status === 'success').length})
            </button>
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-medium {eventFilter === 'failure' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => eventFilter = 'failure'}
            >
              Failure ({report.resource_events.filter(e => e.status === 'failure').length})
            </button>
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-medium {eventFilter === 'noop' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => eventFilter = 'noop'}
            >
              No-op ({report.resource_events.filter(e => e.status === 'noop').length})
            </button>
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-medium {eventFilter === 'skipped' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => eventFilter = 'skipped'}
            >
              Skipped ({report.resource_events.filter(e => e.status === 'skipped').length})
            </button>
          </div>
        </div>

        <!-- Events List -->
        <div class="max-h-96 overflow-y-auto p-4">
          {#if filteredEvents.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">No events to display</p>
          {:else}
            <div class="space-y-3">
              {#each filteredEvents as event}
                <div
                  class="rounded-lg border p-3 {event.status === 'failure' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'}"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="font-medium text-gray-900 hover:underline dark:text-gray-100"
                          onclick={() => onResourceClick?.(event)}
                        >
                          {event.resource_type}[{event.resource_title}]
                        </button>
                        <StatusBadge
                          status={event.status === 'failure' ? 'failed' : event.status === 'success' ? 'success' : 'partial'}
                          size="sm"
                        />
                      </div>
                      {#if event.property}
                        <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          Property: <span class="font-mono">{event.property}</span>
                        </div>
                      {/if}
                      {#if event.message}
                        <div class="mt-1 text-sm {event.status === 'failure' ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}">
                          {event.message}
                        </div>
                      {/if}
                      {#if event.old_value !== undefined || event.new_value !== undefined}
                        <div class="mt-2 space-y-1 text-xs">
                          {#if event.old_value !== undefined}
                            <div class="font-mono text-gray-600 dark:text-gray-400">
                              <span class="text-red-600 dark:text-red-400">- </span>{formatValue(event.old_value)}
                            </div>
                          {/if}
                          {#if event.new_value !== undefined}
                            <div class="font-mono text-gray-600 dark:text-gray-400">
                              <span class="text-green-600 dark:text-green-400">+ </span>{formatValue(event.new_value)}
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <div class="ml-4 text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(event.timestamp)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Logs Section -->
  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
    <button
      type="button"
      class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
      onclick={() => toggleSection('logs')}
    >
      <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        Logs ({report.logs.length})
      </h4>
      <svg
        class="h-5 w-5 transition-transform {showLogs ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {#if showLogs}
      <div class="border-t border-gray-200 dark:border-gray-700">
        <div class="max-h-96 overflow-y-auto bg-gray-900 dark:bg-gray-950 p-2 font-mono text-xs leading-relaxed">
          {#if report.logs.length === 0}
            <div class="text-gray-500 dark:text-gray-400 p-2">No logs available</div>
          {:else}
            {#each report.logs as log, index (index)}
              <div class="hover:bg-gray-800 dark:hover:bg-gray-900 px-1 py-0.5 whitespace-nowrap overflow-x-auto">
                <span class="text-gray-500">{log.time ? new Date(log.time).toISOString() : ''}</span>
                {' '}
                <span class="{
                  log.level === 'err' || log.level === 'error' ? 'text-red-400' :
                  log.level === 'warning' || log.level === 'warn' ? 'text-yellow-400' :
                  log.level === 'notice' ? 'text-blue-400' :
                  log.level === 'info' ? 'text-green-400' :
                  log.level === 'debug' ? 'text-purple-400' :
                  'text-gray-400'
                }">{log.level ? log.level.toUpperCase().padEnd(7) : 'UNKNOWN'}</span>
                {' '}
                <span class="text-cyan-400">{log.source || ''}</span>
                {#if log.file}
                  {' '}
                  <span class="text-gray-500">({log.file}{log.line ? `:${log.line}` : ''})</span>
                {/if}
                {': '}
                <span class="text-gray-200">{log.message || ''}</span>
                {#if log.tags && log.tags.length > 0}
                  {' '}
                  <span class="text-gray-600">[{log.tags.join(', ')}]</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
