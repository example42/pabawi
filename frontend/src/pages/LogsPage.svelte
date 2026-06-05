<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { get, del } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';

  const pageTitle = 'Pabawi - Logs';

  interface LogEntry {
    timestamp: string;
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    component?: string;
    integration?: string;
    operation?: string;
    metadata?: Record<string, unknown>;
  }

  interface LogsResponse {
    entries: LogEntry[];
    total: number;
    bufferSize: number;
  }

  let entries = $state<LogEntry[]>([]);
  let bufferSize = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filters
  let levelFilter = $state<string>('');
  let componentFilter = $state('');
  let integrationFilter = $state('');
  let limitFilter = $state(200);

  // Auto-refresh
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Expanded row
  let expandedIndex = $state<number | null>(null);

  onMount(() => {
    document.title = pageTitle;
    void fetchLogs();

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  function toggleAutoRefresh(): void {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refreshInterval = setInterval(() => { void fetchLogs(); }, 3000);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }
  }

  async function fetchLogs(): Promise<void> {
    if (!autoRefresh) loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (levelFilter) params.set('level', levelFilter);
      if (componentFilter) params.set('component', componentFilter);
      if (integrationFilter) params.set('integration', integrationFilter);
      params.set('limit', String(limitFilter));

      const qs = params.toString();
      const url = `/api/logs${qs ? `?${qs}` : ''}`;
      const data = await get<LogsResponse>(url);
      entries = data.entries;
      bufferSize = data.bufferSize;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load logs';
    } finally {
      loading = false;
    }
  }

  async function clearLogs(): Promise<void> {
    try {
      await del('/api/logs');
      entries = [];
      bufferSize = 0;
      showSuccess('Logs cleared');
    } catch (e) {
      showError('Failed to clear logs', e instanceof Error ? e.message : 'Unknown error');
    }
  }

  function levelColor(level: string): string {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'warn': return 'text-yellow-600 dark:text-yellow-400';
      case 'info': return 'text-blue-600 dark:text-blue-400';
      case 'debug': return 'text-gray-500 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-300';
    }
  }

  function levelBg(level: string): string {
    switch (level) {
      case 'error': return 'bg-red-50 dark:bg-red-900/20';
      case 'warn': return 'bg-yellow-50 dark:bg-yellow-900/20';
      default: return '';
    }
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function toggleExpand(index: number): void {
    expandedIndex = expandedIndex === index ? null : index;
  }
</script>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Application Logs</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        In-memory log buffer &middot; {bufferSize} entries stored
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={toggleAutoRefresh}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors {autoRefresh ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {autoRefresh ? 'Live' : 'Auto'}
      </button>
      <button
        type="button"
        onclick={() => { void fetchLogs(); }}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Refresh
      </button>
      <button
        type="button"
        onclick={() => { void clearLogs(); }}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
      >
        Clear
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="mb-4 flex flex-wrap gap-3 items-end">
    <div>
      <label for="level-filter" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Level</label>
      <select
        id="level-filter"
        bind:value={levelFilter}
        onchange={() => { void fetchLogs(); }}
        class="block w-28 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
      >
        <option value="">All</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
    </div>
    <div>
      <label for="component-filter" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Component</label>
      <input
        id="component-filter"
        type="text"
        bind:value={componentFilter}
        onchange={() => { void fetchLogs(); }}
        placeholder="e.g. Server"
        class="block w-36 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
      />
    </div>
    <div>
      <label for="integration-filter" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Integration</label>
      <input
        id="integration-filter"
        type="text"
        bind:value={integrationFilter}
        onchange={() => { void fetchLogs(); }}
        placeholder="e.g. bolt"
        class="block w-36 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
      />
    </div>
    <div>
      <label for="limit-filter" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Limit</label>
      <select
        id="limit-filter"
        bind:value={limitFilter}
        onchange={() => { void fetchLogs(); }}
        class="block w-24 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
      >
        <option value={50}>50</option>
        <option value={200}>200</option>
        <option value={500}>500</option>
        <option value={1000}>1000</option>
      </select>
    </div>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <ErrorAlert message={error} />
  {:else if entries.length === 0}
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No log entries</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        No log entries match the current filters.
      </p>
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
      <div class="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm font-mono">
          <thead class="bg-gray-50 dark:bg-gray-750 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Level</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Component</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Message</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
            {#each entries as entry, i}
              <tr
                class="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors {levelBg(entry.level)}"
                onclick={() => toggleExpand(i)}
              >
                <td class="px-3 py-1.5 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                  <span class="hidden sm:inline">{formatDate(entry.timestamp)} </span>{formatTime(entry.timestamp)}
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap">
                  <span class="font-semibold uppercase text-xs {levelColor(entry.level)}">{entry.level}</span>
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-gray-300 text-xs">
                  {entry.component ?? '—'}
                  {#if entry.integration}
                    <span class="text-gray-400 dark:text-gray-500">/{entry.integration}</span>
                  {/if}
                </td>
                <td class="px-3 py-1.5 text-gray-800 dark:text-gray-200 max-w-[500px] truncate">
                  {entry.message}
                </td>
              </tr>
              {#if expandedIndex === i}
                <tr class="bg-gray-50 dark:bg-gray-900">
                  <td colspan="4" class="px-4 py-3">
                    <div class="space-y-1 text-xs">
                      <div><span class="text-gray-500 dark:text-gray-400 font-medium">Timestamp:</span> {entry.timestamp}</div>
                      {#if entry.operation}
                        <div><span class="text-gray-500 dark:text-gray-400 font-medium">Operation:</span> {entry.operation}</div>
                      {/if}
                      <div><span class="text-gray-500 dark:text-gray-400 font-medium">Message:</span> <span class="whitespace-pre-wrap">{entry.message}</span></div>
                      {#if entry.metadata && Object.keys(entry.metadata).length > 0}
                        <div>
                          <span class="text-gray-500 dark:text-gray-400 font-medium">Metadata:</span>
                          <pre class="mt-1 bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto text-xs">{JSON.stringify(entry.metadata, null, 2)}</pre>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
