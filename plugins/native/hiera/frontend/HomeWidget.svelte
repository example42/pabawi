<!--
  Hiera Home Widget

  A summary tile displayed on the home page showing Hiera integration status.
  Uses Hiera's red color (#C1272D) for theming.

  Features:
  - Total keys indexed
  - Hierarchy levels count
  - Last scan timestamp
  - Quick link to Hiera integration page

  @module plugins/native/hiera/frontend/HomeWidget
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

  interface HealthStatus {
    healthy: boolean;
    message?: string;
    lastCheck: string;
    details?: {
      keyCount?: number;
      fileCount?: number;
      lastScan?: string;
      hieraConfigValid?: boolean;
    };
    degraded?: boolean;
  }

  interface KeysResponse {
    totalKeys: number;
    totalFiles: number;
    lastScan: string;
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
  let keyCount = $state(0);
  let fileCount = $state(0);
  let lastScan = $state<string | null>(null);
  let healthStatus = $state<HealthStatus | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let isHealthy = $derived(healthStatus?.healthy ?? false);
  let isDegraded = $derived(healthStatus?.degraded ?? false);

  let statusColor = $derived.by(() => {
    if (!healthStatus) return 'bg-gray-400';
    if (healthStatus.healthy) return 'bg-green-500';
    if (healthStatus.degraded) return 'bg-yellow-500';
    return 'bg-red-500';
  });

  let statusText = $derived.by(() => {
    if (!healthStatus) return 'Unknown';
    if (healthStatus.healthy) return 'Healthy';
    if (healthStatus.degraded) return 'Degraded';
    return 'Unhealthy';
  });

  let formattedLastScan = $derived.by(() => {
    if (!lastScan) return 'Never';
    try {
      const date = new Date(lastScan);
      return date.toLocaleString();
    } catch {
      return lastScan;
    }
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
      // Load health status
      const healthResponse = await api.get<HealthStatus>('/api/integrations/hiera/health');
      healthStatus = healthResponse;

      // Use health status details if available
      if (healthStatus?.details) {
        keyCount = healthStatus.details.keyCount ?? 0;
        fileCount = healthStatus.details.fileCount ?? 0;
        lastScan = healthStatus.details.lastScan ?? null;
      }

      // Try to get more detailed key info
      try {
        const keysResponse = await api.get<KeysResponse>('/api/integrations/hiera/keys');
        keyCount = keysResponse.totalKeys ?? keyCount;
        fileCount = keysResponse.totalFiles ?? fileCount;
        lastScan = keysResponse.lastScan ?? lastScan;
      } catch {
        // Non-critical, continue with health status data
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Hiera status';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToHiera(): void {
    router.navigate('/integrations/hiera');
  }
</script>

<button
  type="button"
  onclick={navigateToHiera}
  class="w-full h-full p-4 rounded-xl border-2 border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 hover:border-red-400 dark:hover:border-red-600 transition-all duration-200 text-left group"
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
        <div class="p-2 rounded-lg bg-red-500/20">
          <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">Hiera</span>
      </div>

      <!-- Health Indicator -->
      <div class="flex items-center gap-1.5" title={statusText}>
        <span class="w-2 h-2 rounded-full {statusColor}"></span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{statusText}</span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="space-y-2">
      <!-- Key Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Keys Indexed</span>
        <span class="text-lg font-bold text-red-600 dark:text-red-400">{keyCount}</span>
      </div>

      <!-- File Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Data Files</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{fileCount}</span>
      </div>

      <!-- Last Scan -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Last Scan</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]" title={formattedLastScan}>
          {formattedLastScan}
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-3 pt-3 border-t border-red-200/50 dark:border-red-800/50 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Configuration Data</span>
      <svg class="w-4 h-4 text-red-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
