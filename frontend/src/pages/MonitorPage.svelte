<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';

  const pageTitle = 'Pabawi - Monitor';

  interface CheckmkHostSummary {
    hostname: string;
    total: number;
    ok: number;
    warn: number;
    crit: number;
    unknown: number;
  }

  interface CheckmkServiceProblem {
    hostname: string;
    serviceDescription: string;
    state: 0 | 1 | 2 | 3;
    lastState: 0 | 1 | 2 | 3;
    lastStateChange: number;
    output: string;
    acknowledged: boolean;
  }

  interface IntegrationStatusData {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured';
    lastCheck: string;
    message?: string;
  }

  let isCheckmkActive = $state(false);
  let checkmkHostSummary = $state<CheckmkHostSummary[]>([]);
  let checkmkProblems = $state<CheckmkServiceProblem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let checkmkProblemsHours = $state<number | null>(null);
  let checkmkProblemSort = $state<'severity' | 'freshness'>('severity');

  const sortedCheckmkProblems = $derived.by(() => {
    let filtered = checkmkProblems;

    if (checkmkProblemsHours !== null) {
      const cutoff = (Date.now() - checkmkProblemsHours * 3600_000) / 1000;
      filtered = filtered.filter(p => p.lastStateChange >= cutoff);
    }

    return [...filtered].sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) {
        return a.acknowledged ? 1 : -1;
      }
      if (checkmkProblemSort === 'severity') {
        if (a.state !== b.state) return b.state - a.state;
        return b.lastStateChange - a.lastStateChange;
      }
      return b.lastStateChange - a.lastStateChange;
    });
  });

  onMount(() => {
    void fetchData();
  });

  async function fetchData(): Promise<void> {
    loading = true;
    error = null;

    try {
      const statusData = await get<{ integrations: IntegrationStatusData[] }>('/api/integrations/status');
      const checkmk = statusData.integrations.find(i => i.name === 'checkmk');
      isCheckmkActive = checkmk?.status === 'connected';

      if (isCheckmkActive) {
        await fetchCheckmkData();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load monitoring data';
    } finally {
      loading = false;
    }
  }

  async function fetchCheckmkData(): Promise<void> {
    try {
      const data = await get<{
        serviceProblems: CheckmkServiceProblem[];
        hostSummary: CheckmkHostSummary[];
      }>('/api/monitoring/overview?hours=24&limit=500');
      checkmkProblems = data.serviceProblems || [];
      checkmkHostSummary = data.hostSummary || [];
    } catch (err) {
      if (err instanceof Error && err.message.includes('503')) {
        isCheckmkActive = false;
        return;
      }
      error = err instanceof Error ? err.message : 'Failed to load CheckMK data';
    }
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Monitor</h1>
    <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Infrastructure monitoring overview</p>
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading monitoring data..." />
    </div>
  {:else if error}
    <ErrorAlert
      message="Failed to load monitoring data"
      details={error}
      onRetry={() => fetchData()}
    />
  {:else if !isCheckmkActive}
    <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No monitoring integrations active</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Configure a monitoring integration like Checkmk to see data here.
      </p>
    </div>
  {:else}
    <!-- Checkmk Section -->
    <div class="space-y-8">
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Checkmk</h2>
        <IntegrationBadge integration="checkmk" variant="badge" size="sm" />
      </div>

      <!-- Service Problems -->
      <div class="rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white">Service Problems</h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {sortedCheckmkProblems.filter(p => !p.acknowledged).length} unhandled
                {#if sortedCheckmkProblems.filter(p => p.acknowledged).length > 0}
                  <span class="text-gray-400">/ {sortedCheckmkProblems.filter(p => p.acknowledged).length} ack</span>
                {/if}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                {#each [1, 4, 24] as hours}
                  <button
                    type="button"
                    onclick={() => checkmkProblemsHours = checkmkProblemsHours === hours ? null : hours}
                    class="rounded px-2 py-0.5 text-xs font-medium transition-colors {checkmkProblemsHours === hours ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                    title="Show problems from last {hours}h{checkmkProblemsHours === hours ? ' (click to clear)' : ''}"
                  >
                    {hours}h
                  </button>
                {/each}
              </div>
              <span class="w-px h-4 bg-gray-300 dark:bg-gray-600"></span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onclick={() => checkmkProblemSort = 'severity'}
                  class="rounded px-2 py-0.5 text-xs font-medium transition-colors {checkmkProblemSort === 'severity' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                  title="Sort by severity (CRIT first)"
                >
                  Severity
                </button>
                <button
                  type="button"
                  onclick={() => checkmkProblemSort = 'freshness'}
                  class="rounded px-2 py-0.5 text-xs font-medium transition-colors {checkmkProblemSort === 'freshness' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                  title="Sort by freshness (newest first)"
                >
                  Freshness
                </button>
              </div>
            </div>
          </div>
        </div>
        {#if sortedCheckmkProblems.length === 0}
          <div class="p-6 text-center">
            <svg class="mx-auto h-10 w-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {checkmkProblemsHours !== null ? `No problems in the last ${checkmkProblemsHours}h` : 'No service problems'}
            </p>
          </div>
        {:else}
          <div class="max-h-[32rem] overflow-y-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">State</th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Host</th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Service</th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Output</th>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Since</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {#each sortedCheckmkProblems as problem}
                  <tr
                    class="cursor-pointer transition-colors {problem.acknowledged ? 'opacity-50 hover:opacity-70' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}"
                    onclick={() => router.navigate(`/nodes/${problem.hostname}`)}
                    title={problem.acknowledged ? `[ACK] ${problem.output}` : problem.output}
                  >
                    <td class="whitespace-nowrap px-3 py-2 text-xs">
                      <span class="inline-flex items-center gap-1">
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {problem.state === 2 ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : problem.state === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}">
                          {problem.state === 2 ? 'CRIT' : problem.state === 1 ? 'WARN' : 'UNKN'}
                        </span>
                        {#if problem.acknowledged}
                          <span class="text-gray-400 dark:text-gray-500" title="Acknowledged">✓</span>
                        {/if}
                      </span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-sm {problem.acknowledged ? 'text-gray-500 dark:text-gray-500' : 'text-gray-900 dark:text-white'}">
                      {problem.hostname}
                    </td>
                    <td class="px-3 py-2 text-sm {problem.acknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'} max-w-[200px] truncate" title={problem.serviceDescription}>
                      {problem.serviceDescription}
                    </td>
                    <td class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[250px] truncate" title={problem.output}>
                      {problem.output}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {#if problem.lastStateChange > 0}
                        {(() => {
                          const ago = Date.now() - problem.lastStateChange * 1000;
                          if (ago < 3600000) return `${Math.round(ago / 60000)}m ago`;
                          if (ago < 86400000) return `${Math.round(ago / 3600000)}h ago`;
                          return `${Math.round(ago / 86400000)}d ago`;
                        })()}
                      {:else}
                        —
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- Host Overview -->
      <div class="rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-900 dark:text-white">Host Service Summary</h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {checkmkHostSummary.length} hosts
            </span>
          </div>
        </div>
        {#if checkmkHostSummary.length === 0}
          <div class="p-6 text-center">
            <svg class="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">No host data available</p>
          </div>
        {:else}
          <div class="max-h-[32rem] overflow-y-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Host</th>
                  <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Total</th>
                  <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-green-600 dark:text-green-400">OK</th>
                  <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-yellow-600 dark:text-yellow-400">WARN</th>
                  <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">CRIT</th>
                  <th scope="col" class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">UNKN</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {#each checkmkHostSummary as host}
                  <tr
                    class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    onclick={() => router.navigate(`/nodes/${host.hostname}`)}
                  >
                    <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">
                      {host.hostname}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                      {host.total}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-center text-xs {host.ok > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'}">
                      {host.ok}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-center text-xs {host.warn > 0 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-gray-300 dark:text-gray-600'}">
                      {host.warn || '—'}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-center text-xs {host.crit > 0 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-300 dark:text-gray-600'}">
                      {host.crit || '—'}
                    </td>
                    <td class="whitespace-nowrap px-3 py-2 text-center text-xs {host.unknown > 0 ? 'text-gray-600 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}">
                      {host.unknown || '—'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
