<script lang="ts">
  import { onMount } from 'svelte';
  import { getNodeServices } from '../lib/checkmkApi';
  import type { ServiceStatus } from '../lib/checkmkApi';
  import { STATE_NAMES, STATE_COLORS } from '../lib/monitorTabUtils';
  import { router } from '../lib/router.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  let { nodeId, onReady, onError }: Props = $props();

  let services = $state<ServiceStatus[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const summary = $derived.by(() => {
    const total = services.length;
    const ok = services.filter(s => s.state === 0).length;
    const warn = services.filter(s => s.state === 1).length;
    const crit = services.filter(s => s.state === 2).length;
    const unknown = services.filter(s => s.state === 3).length;
    return { total, ok, warn, crit, unknown };
  });

  const critWarnServices = $derived(
    services
      .filter(s => s.state === 1 || s.state === 2)
      .sort((a, b) => b.state - a.state),
  );

  async function fetchServices(): Promise<void> {
    loading = true;
    error = null;

    try {
      services = await getNodeServices(nodeId);
      onReady();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load monitoring data';
      error = msg;
      onError(new Error(msg));
    } finally {
      loading = false;
    }
  }

  function navigateToMonitorTab(): void {
    router.navigate(`/nodes/${nodeId}?tab=monitor`);
  }

  onMount(() => {
    fetchServices();
  });
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Monitoring Summary</h2>
    <IntegrationBadge integration="checkmk" variant="badge" size="sm" />
  </div>

  {#if loading}
    <div class="flex justify-center py-4">
      <LoadingSpinner message="Loading monitoring data..." />
    </div>
  {:else if error}
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Unable to load monitoring data.
      <button type="button" class="text-blue-600 hover:text-blue-700 dark:text-blue-400" onclick={fetchServices}>Retry</button>
    </p>
  {:else if services.length === 0}
    <p class="text-sm text-gray-500 dark:text-gray-400">
      No monitored services found for this node.
    </p>
  {:else}
    <!-- Summary counts -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 mb-4">
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
        <div class="text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Total</div>
      </div>
      <div class="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-900/20">
        <div class="text-2xl font-bold text-green-700 dark:text-green-400">{summary.ok}</div>
        <div class="text-xs text-green-600 dark:text-green-400">OK</div>
      </div>
      {#if summary.warn > 0}
      <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-800 dark:bg-amber-900/20">
        <div class="text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.warn}</div>
        <div class="text-xs text-amber-600 dark:text-amber-400">Warning</div>
      </div>
      {/if}
      {#if summary.crit > 0}
      <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-900/20">
        <div class="text-2xl font-bold text-red-700 dark:text-red-400">{summary.crit}</div>
        <div class="text-xs text-red-600 dark:text-red-400">Critical</div>
      </div>
      {/if}
      {#if summary.unknown > 0}
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-600 dark:bg-gray-900/50">
        <div class="text-2xl font-bold text-gray-700 dark:text-gray-400">{summary.unknown}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Unknown</div>
      </div>
      {/if}
    </div>

    <!-- Critical and Warning service details -->
    {#if critWarnServices.length > 0}
      <div class="mt-4 space-y-2">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Issues requiring attention</h3>
        <div class="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700/50 dark:border-gray-700">
          {#each critWarnServices.slice(0, 10) as service (service.description)}
            <div class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {STATE_COLORS[service.state]}">
                  {STATE_NAMES[service.state]}
                </span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{service.description}</span>
              </div>
              {#if service.pluginOutput}
                <p class="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{service.pluginOutput}</p>
              {/if}
            </div>
          {/each}
        </div>
        {#if critWarnServices.length > 10}
          <button
            type="button"
            class="w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onclick={navigateToMonitorTab}
          >
            View all {critWarnServices.length} issues →
          </button>
        {/if}
      </div>
    {/if}

    {#if critWarnServices.length === 0}
      <p class="text-sm text-green-700 dark:text-green-400">All monitored services are healthy.</p>
    {/if}
  {/if}
</div>
