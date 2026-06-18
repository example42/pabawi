<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (err: Error) => void;
  }

  let { nodeId, onReady, onError }: Props = $props();

  onMount(() => {
    onReady();
  });
</script>

<div data-testid="mock-widget-content">Widget loaded for {nodeId}</div>
