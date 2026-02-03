<!--
  Bolt Home Widget

  A summary tile displayed on the home page showing Bolt integration status.
  Uses Bolt's orange color (#FFAE1A) for theming.

  Features:
  - Node count from inventory
  - Recent execution count
  - Last execution status
  - Quick link to Bolt integration page

  @module plugins/native/bolt/frontend/HomeWidget
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
      nodeCount?: number;
      projectPath?: string;
      capabilities?: string[];
    };
    degraded?: boolean;
  }

  interface InventoryResponse {
    nodes: Array<{ id: string; name: string }>;
  }

  interface ExecutionsResponse {
    executions: Array<{
      id: string;
      status: string;
      type: string;
      startedAt: string;
    }>;
    total: number;
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
  let nodeCount = $state(0);
  let recentExecutionCount = $state(0);
  let lastExecutionStatus = $state<string | null>(null);
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
      const healthResponse = await api.get<HealthStatus>('/api/integrations/bolt/health');
      healthStatus = healthResponse;

      // Load inventory count
      try {
        const inventoryResponse = await api.get<InventoryResponse>('/api/inventory?source=bolt');
        nodeCount = inventoryResponse.nodes?.length ?? 0;
      } catch {
        // Use health status node count as fallback
        nodeCount = healthStatus?.details?.nodeCount ?? 0;
      }

      // Load recent executions
      try {
        const executionsResponse = await api.get<ExecutionsResponse>('/api/executions?type=command,task&limit=10');
        recentExecutionCount = executionsResponse.total ?? 0;

        // Get last execution status
        if (executionsResponse.executions?.length > 0) {
          lastExecutionStatus = executionsResponse.executions[0].status;
        }
      } catch {
        // Non-critical, continue without execution data
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load Bolt status';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToBolt(): void {
    router.navigate('/integrations/bolt');
  }

  function getLastExecutionColor(status: string | null): string {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      case 'running': return 'text-blue-600 dark:text-blue-400';
      case 'partial': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  }
</script>

<button
  type="button"
  onclick={navigateToBolt}
  class="w-full h-full p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 hover:border-amber-400 dark:hover:border-amber-600 transition-all duration-200 text-left group"
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
        <div class="p-2 rounded-lg bg-amber-500/20">
          <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">Bolt</span>
      </div>

      <!-- Health Indicator -->
      <div class="flex items-center gap-1.5" title={statusText}>
        <span class="w-2 h-2 rounded-full {statusColor}"></span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{statusText}</span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="space-y-2">
      <!-- Node Count -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Nodes</span>
        <span class="text-lg font-bold text-amber-600 dark:text-amber-400">{nodeCount}</span>
      </div>

      <!-- Recent Executions -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Executions</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{recentExecutionCount}</span>
      </div>

      <!-- Last Execution Status -->
      {#if lastExecutionStatus}
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Last Run</span>
          <span class="text-sm font-medium {getLastExecutionColor(lastExecutionStatus)} capitalize">
            {lastExecutionStatus}
          </span>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Remote Execution</span>
      <svg class="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
