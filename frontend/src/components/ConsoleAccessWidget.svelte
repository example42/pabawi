<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import ConsoleViewer from './ConsoleViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

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
  let consoleOpen = $state(false);

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
        if (capabilities.length > 0) {
          onReady();
        } else {
          onError(new Error('No console capabilities available'));
        }
        return;
      } catch {
        if (attempt === MAX_ATTEMPTS) {
          onError(new Error('Console availability check failed after 3 attempts'));
          return;
        }
      }
    }
  }

  function openConsole(): void {
    consoleOpen = true;
  }

  onMount(() => {
    void fetchConsoleAvailability();
  });
</script>

{#if loaded && capabilities.length > 0}
  {#if !consoleOpen}
    <!-- Compact: just a Connect button inside an integration-labeled container -->
    <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Console</span>
        <IntegrationBadge integration={capabilities[0].provider} variant="badge" size="sm" />
      </div>
      <div class="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onclick={openConsole}
          class="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Connect
        </button>
      </div>
    </div>
  {:else}
    <!-- Expanded: full console viewer -->
    <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Console</span>
        <IntegrationBadge integration={capabilities[0].provider} variant="badge" size="sm" />
      </div>
      <div class="p-4">
        <ConsoleViewer {nodeId} {capabilities} />
      </div>
    </div>
  {/if}
{/if}
