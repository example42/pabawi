<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import ConsoleViewer from './ConsoleViewer.svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  interface ConsoleAvailabilityEntry {
    provider: string;
    transport: 'websocket-vnc' | 'websocket-terminal';
    displayName: string;
  }

  let { nodeId, onReady, onError }: Props = $props();

  let capabilities = $state<ConsoleAvailabilityEntry[]>([]);
  let loaded = $state(false);

  async function fetchConsoleAvailability(): Promise<void> {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const data = await get<{ availability: ConsoleAvailabilityEntry[] }>(
          `/api/console/availability/${encodeURIComponent(nodeId)}`,
          { maxRetries: 0, showRetryNotifications: false },
        );
        capabilities = data.availability ?? [];
        loaded = true;
        onReady();
        return;
      } catch {
        if (attempt === MAX_ATTEMPTS) {
          onError(new Error('Console availability check failed after 3 attempts'));
          return;
        }
      }
    }
  }

  onMount(() => {
    void fetchConsoleAvailability();
  });
</script>

{#if loaded && capabilities.length > 0}
  <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="p-6 pb-0">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Console</h2>
    </div>
    <div class="px-6 pb-6">
      <ConsoleViewer {nodeId} {capabilities} />
    </div>
  </div>
{/if}
