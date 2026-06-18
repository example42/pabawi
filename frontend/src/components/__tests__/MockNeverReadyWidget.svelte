<script lang="ts">
  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (err: Error) => void;
  }

  let { nodeId, onReady, onError }: Props = $props();
  // Never calls onReady or onError — stays in loading state
</script>

<div data-testid="mock-loading-widget">Loading forever...</div>
