<script lang="ts">
  import { onMount } from 'svelte';
  import IntegrationStatus from '../components/IntegrationStatus.svelte';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import { get } from '../lib/api';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { DebugInfo, LabeledDebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Dashboard';

  interface IntegrationStatusData {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured';
    lastCheck: string;
    message?: string;
    details?: unknown;
  }

  interface IntegrationStatusResponse {
    integrations: IntegrationStatusData[];
    timestamp: string;
    cached: boolean;
  }

  let integrations = $state<IntegrationStatusData[]>([]);
  let integrationsLoading = $state(true);
  let integrationsError = $state<string | null>(null);

  // Debug info state for expert mode
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });
  });

  // Callback to receive debug info from API calls
  function handleDebugInfo(label: string, info: DebugInfo | null): void {
    if (info) {
      const existingIndex = debugInfoBlocks.findIndex(block => block.label === label);
      if (existingIndex >= 0) {
        debugInfoBlocks[existingIndex] = { label, debugInfo: info };
      } else {
        debugInfoBlocks = [...debugInfoBlocks, { label, debugInfo: info }];
      }
    } else {
      debugInfoBlocks = debugInfoBlocks.filter(block => block.label !== label);
    }
  }

  async function fetchIntegrationStatus(refresh = false): Promise<void> {
    integrationsLoading = true;
    integrationsError = null;

    try {
      const url = refresh ? '/api/integrations/status?refresh=true' : '/api/integrations/status';
      const data = await get<IntegrationStatusResponse & { _debug?: DebugInfo }>(url);
      integrations = data.integrations || [];

      if (data._debug) {
        handleDebugInfo('Integration Status', data._debug);
      }
    } catch (err) {
      integrationsError = err instanceof Error ? err.message : 'Failed to load integration status';
      console.error('[HomePage] Error fetching integration status:', err);
      integrations = [];
    } finally {
      integrationsLoading = false;
    }
  }

  function handleRefreshIntegrations(): void {
    void fetchIntegrationStatus(true);
  }

  onMount(() => {
    document.title = pageTitle;
    void fetchIntegrationStatus();
  });
</script>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Welcome to Pabawi - Infrastructure Management Interface
      </p>
    </div>
  </div>

  <!-- Integration Status Section -->
  <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Integration Status</h2>
        <button
          onclick={handleRefreshIntegrations}
          disabled={integrationsLoading}
          class="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if integrationsLoading}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Refreshing...
          {:else}
            <svg class="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          {/if}
        </button>
      </div>

      {#if integrationsError}
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-red-700 dark:text-red-200">{integrationsError}</p>
            </div>
          </div>
        </div>
      {/if}

      <IntegrationStatus {integrations} loading={integrationsLoading} />
    </div>
  </div>

  <!-- Placeholder for Widget Slots -->
  <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Dashboard Widgets</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Plugin widgets will be loaded here based on your permissions.
        </p>
        <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
          v1.0.0 - Widget Slot: dashboard
        </p>
      </div>
    </div>
  </div>

  <!-- Expert Mode Debug Panel -->
  {#if expertMode.enabled && sortedDebugInfoBlocks.length > 0}
    <ExpertModeDebugPanel debugInfoBlocks={sortedDebugInfoBlocks} />
  {/if}
</div>
