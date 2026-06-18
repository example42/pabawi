<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (err: Error) => void;
  }

  let { nodeId, onReady, onError }: Props = $props();

  onMount(() => {
    onError(new Error('Connection timeout'));
  });
</script>

<div data-testid="mock-error-widget">This should not be visible</div>
