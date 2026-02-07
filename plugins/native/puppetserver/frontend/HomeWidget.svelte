<!--
  Puppetserver Home Widget

  A summary tile displayed on the home page showing Puppetserver integration status.
  Uses Puppetserver's blue color (#2E3A87) for theming.

  Features:
  - Environment count
  - Catalog compilation status
  - Server health
  - Quick link to Puppetserver integration page

  @module plugins/native/puppetserver/frontend/HomeWidget
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, router } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PluginSummary {
    pluginName: string;
    displayName: string;
    metrics: {
      environmentCount: number;
      serverStatus: string;
      catalogCompilation: string;
    };
    healthy: boolean;
    lastUpdate: string;
    error?: string;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let { config = {} }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let summary = $state<PluginSummary | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let isHealthy = $derived(summary?.healthy ?? false);
  let environmentCount = $derived(summary?.metrics.environmentCount ?? 0);
  let serverStatus = $derived(summary?.metrics.serverStatus ?? 'unknown');
  let catalogCompilation = $derived(summary?.metrics.catalogCompilation ?? 'unknown');

  let statusColor = $derived.by(() => {
    if (!summary) return 'bg-gray-400';
    if (summary.healthy) return 'bg-green-500';
    return 'bg-red-500';
  });

  let statusText = $derived.by(() => {
    if (!summary) return 'Unknown';
    if (summary.healthy) return 'Healthy';
    return 'Unhealthy';
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void loadData();
  });

  // ==========================================================================
  // Data Loading
  // ==========================================================================

  async function loadData(): Promise<void> {
    loading = true;
    error = null;

    try {
      // Fetch lightweight summary from new endpoint
      // This endpoint is designed to return in under 500ms with minimal data
      const summaryResponse = await api.get<PluginSummary>('/api/plugins/puppetserver/summary');
      summary = summaryResponse;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Puppetserver summary';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToPuppetserver(): void {
    router.navigate('/integrations/puppetserver');
  }
</script>

<button
  type="button"
  onclick={navigateToPuppetserver}
  class="w-full h-full p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 text-left group"
>
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <LoadingSpinner size="sm" />
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center h-full text-center">
      <svg class="w-8 h-8 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span class="text-xs text-red-600 dark:text-red-400">{error}</span>
    </div>
  {:else}
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-lg bg-blue-500/20">
          <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">Puppetserver</span>
      </div>

      <!-- Health Indicator -->
      <div class="flex items-center gap-1.5" title={statusText}>
        <span class="w-2 h-2 rounded-full {statusColor}"></span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{statusText}</span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="space-y-2">
      <!-- Environment Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Environments</span>
        <span class="text-lg font-bold text-blue-600 dark:text-blue-400">{environmentCount}</span>
      </div>

      <!-- Server Status -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Server Status</span>
        <span class="text-sm font-medium {serverStatus === 'running' ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}">
          {serverStatus}
        </span>
      </div>

      <!-- Catalog Compilation -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Catalog Compilation</span>
        <span class="text-sm font-medium {catalogCompilation === 'available' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}">
          {catalogCompilation === 'available' ? 'Available' : 'Limited'}
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-800/50 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Configuration Management</span>
      <svg class="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
