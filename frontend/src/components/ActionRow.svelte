<script lang="ts">
  import type { WidgetDefinition } from '../lib/widgetRegistry.svelte';
  import WidgetFrame from './WidgetFrame.svelte';

  interface Props {
    widgets: WidgetDefinition[];
    nodeId: string;
  }

  let { widgets, nodeId }: Props = $props();
</script>

{#if widgets.length > 0}
  <div class="mb-4 flex flex-wrap gap-2">
    {#each widgets as widget (widget.id)}
      <WidgetFrame {widget} {nodeId} />
    {/each}
  </div>
{/if}
