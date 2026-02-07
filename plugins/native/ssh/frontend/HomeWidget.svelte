<!--
  SSH Home Widget

  A summary tile displayed on the home page showing SSH integration status.
  Uses SSH's blue color (#4A90E2) for theming.

  Features:
  - Total connection count from SSH config
  - Group count
  - Active sessions (placeholder for future implementation)
  - Quick link to SSH integration page

  @module plugins/native/ssh/frontend/HomeWidget
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
      connectionCount: number;
      groupCount: number;
      activeSessions: number;
      sshConfigPath: string;
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
  let connectionCount = $derived(summary?.metrics.connectionCount ?? 0);
  let groupCount = $derived(summary?.metrics.groupCount ?? 0);
  let activeSessions = $derived(summary?.metrics.activeSessions ?? 0);

  let statusColor = $derived.by(() => {
    if (!summary) return 'bg-gray-400';
    if (summary.healthy) return 'bg-green-500';
    return 'bg-red-500';
  });

  let statusText = $derived.by(() => {
    if (!summary) return 'Unknown';
    if (summary.healthy) return 'Ready';
    return 'Offline';
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
      // Fetch lightweight summary from the new endpoint
      // This endpoint calls the plugin's getSummary() method
      summary = await api.get<PluginSummary>('/api/v1/plugins/ssh/summary');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load SSH summary';
      summary = null;
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToSSH(): void {
    router.navigate('/integrations/ssh');
  }

  function viewConnections(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/ssh?tab=connections');
  }

  function viewGroups(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/ssh?tab=groups');
  }
</script>

<button
  type="button"
  onclick={navigateToSSH}
  class="w-full h-full p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 text-left group"
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">SSH</span>
      </div>

      <!-- Health Indicator -->
      <div class="flex items-center gap-1.5" title={statusText}>
        <span class="w-2 h-2 rounded-full {statusColor}"></span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{statusText}</span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="space-y-2">
      <!-- Connection Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Connections</span>
        <span class="text-lg font-bold text-blue-600 dark:text-blue-400">{connectionCount}</span>
      </div>

      <!-- Group Count -->
      {#if groupCount > 0}
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Groups</span>
          <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{groupCount}</span>
        </div>
      {/if}

      <!-- Active Sessions (placeholder) -->
      {#if activeSessions > 0}
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Active Sessions</span>
          <span class="text-lg font-bold text-green-600 dark:text-green-400">{activeSessions}</span>
        </div>
      {/if}
    </div>

    <!-- Quick Actions -->
    <div class="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-800/50">
      <div class="flex gap-2">
        <button
          type="button"
          onclick={viewConnections}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded transition-colors"
          title="View Connections"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </button>
        {#if groupCount > 0}
          <button
            type="button"
            onclick={viewGroups}
            class="flex-1 px-2 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded transition-colors"
            title="View Groups"
          >
            <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-2 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Remote Execution</span>
      <svg class="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
