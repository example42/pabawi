<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import {
    getWidgets,
    filterWidgetsByStatus,
    stableSortByPriority,
    type IntegrationStatusEntry,
  } from '../lib/widgetRegistry.svelte';
  import ActionRow from './ActionRow.svelte';
  import WidgetFrame from './WidgetFrame.svelte';

  interface Props {
    nodeId: string;
  }

  let { nodeId }: Props = $props();

  let integrationStatus = $state<IntegrationStatusEntry[]>([]);
  let statusError = $state<string | null>(null);
  let statusLoaded = $state(false);

  // All registered widgets, filtered to enabled integrations
  const visibleWidgets = $derived(
    filterWidgetsByStatus(getWidgets(), integrationStatus)
  );

  // Action widgets sorted by priority (for ActionRow)
  const actionWidgets = $derived(
    stableSortByPriority(visibleWidgets.filter(w => w.type === 'action'))
  );

  // Grid widgets (non-action) sorted by priority
  const gridWidgets = $derived(
    stableSortByPriority(visibleWidgets.filter(w => w.type !== 'action'))
  );

  onMount(async () => {
    try {
      const data = await get<{ integrations: IntegrationStatusEntry[] }>(
        '/api/integrations/status',
        { maxRetries: 1 },
      );
      integrationStatus = data.integrations;
    } catch (err) {
      statusError = err instanceof Error ? err.message : 'Failed to load integration status';
    } finally {
      statusLoaded = true;
    }
  });
</script>

{#if statusError}
  <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
    <p class="text-sm text-red-700 dark:text-red-400">
      Unable to load integration status: {statusError}
    </p>
  </div>
{:else}
  {#if actionWidgets.length > 0}
    <ActionRow widgets={actionWidgets} {nodeId} />
  {/if}

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each gridWidgets as widget (widget.id)}
      <WidgetFrame {widget} {nodeId} />
    {/each}
  </div>
{/if}
