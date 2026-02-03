<!--
  Puppetserver Node Status Widget

  Displays Puppetserver status for a specific node.
  Uses Puppetserver's blue color (#2E3A87) for theming.

  Features:
  - Node catalog environment
  - Last catalog compilation time
  - Server connectivity status

  @module plugins/native/puppetserver/frontend/NodeStatus
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface NodeStatus {
    certname: string;
    catalog_environment?: string;
    report_environment?: string;
    catalog_timestamp?: string;
    facts_timestamp?: string;
    report_timestamp?: string;
  }

  interface HealthStatus {
    healthy: boolean;
    message?: string;
    degraded?: boolean;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname */
    nodeId?: string;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let { nodeId = '', config = {} }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let nodeStatus = $state<NodeStatus | null>(null);
  let serverHealth = $state<HealthStatus | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let isServerHealthy = $derived(serverHealth?.healthy ?? false);
  let isServerDegraded = $derived(serverHealth?.degraded ?? false);

  let serverStatusColor = $derived.by(() => {
    if (!serverHealth) return 'bg-gray-400';
    if (serverHealth.healthy) return 'bg-green-500';
    if (serverHealth.degraded) return 'bg-yellow-500';
    return 'bg-red-500';
  });

  let serverStatusText = $derived.by(() => {
    if (!serverHealth) return 'Unknown';
    if (serverHealth.healthy) return 'Connected';
    if (serverHealth.degraded) return 'Degraded';
    return 'Disconnected';
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
      // Load server health
      const healthResponse = await api.get<HealthStatus>('/api/integrations/puppetserver/health');
      serverHealth = healthResponse;

      // Load node status if we have a nodeId
      if (nodeId) {
        try {
          const statusResponse = await api.get<NodeStatus>(`/api/puppetserver/nodes/${nodeId}/status`);
          nodeStatus = statusResponse;
        } catch {
          // Node status might not be available
          nodeStatus = { certname: nodeId };
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load status';
    } finally {
      loading = false;
    }
  }

  function formatTimestamp(timestamp?: string): string {
    if (!timestamp) return 'Never';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="p-1.5 rounded-lg bg-blue-500/20">
        <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Puppetserver Status</h3>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-4">
      <LoadingSpinner size="sm" />
    </div>
  {:else if error}
    <div class="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
      {error}
    </div>
  {:else}
    <div class="space-y-2">
      <!-- Server Connection -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 dark:text-gray-400">Server</span>
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full {serverStatusColor}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{serverStatusText}</span>
        </div>
      </div>

      <!-- Environment -->
      {#if nodeStatus?.catalog_environment}
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-gray-400">Environment</span>
          <span class="text-xs font-medium text-blue-600 dark:text-blue-400">{nodeStatus.catalog_environment}</span>
        </div>
      {/if}

      <!-- Last Catalog -->
      {#if nodeStatus?.catalog_timestamp}
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-gray-400">Last Catalog</span>
          <span class="text-xs text-gray-700 dark:text-gray-300">{formatTimestamp(nodeStatus.catalog_timestamp)}</span>
        </div>
      {/if}

      <!-- Last Facts -->
      {#if nodeStatus?.facts_timestamp}
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-gray-400">Last Facts</span>
          <span class="text-xs text-gray-700 dark:text-gray-300">{formatTimestamp(nodeStatus.facts_timestamp)}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
