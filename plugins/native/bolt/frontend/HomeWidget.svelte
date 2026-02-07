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
    pagination: {
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
    summary: {
      success: number;
      failed: number;
      running: number;
      partial: number;
      cancelled: number;
      total: number;
    };
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
  let executionSummary = $state<ExecutionsResponse['summary'] | null>(null);
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

  let totalExecutions = $derived(executionSummary?.total ?? 0);
  let successRate = $derived.by(() => {
    if (!executionSummary || executionSummary.total === 0) return 0;
    const successCount = executionSummary.success + (executionSummary.partial ?? 0);
    return Math.round((successCount / executionSummary.total) * 100);
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
        const executionsResponse = await api.get<ExecutionsResponse>('/api/executions?limit=100');
        executionSummary = executionsResponse.summary;

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

  function executeCommand(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/bolt?tab=execute');
  }

  function viewInventory(event: MouseEvent): void {
    event.stopPropagation();
    router.navigate('/integrations/bolt?tab=inventory');
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

  function getSuccessRateColor(rate: number): string {
    if (rate >= 90) return 'text-green-600 dark:text-green-400';
    if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
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

      <!-- Total Executions -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Executions</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{totalExecutions}</span>
      </div>

      <!-- Success Rate -->
      {#if totalExecutions > 0}
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
          <span class="text-lg font-bold {getSuccessRateColor(successRate)}">
            {successRate}%
          </span>
        </div>
      {/if}
    </div>

    <!-- Quick Actions -->
    <div class="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50">
      <div class="flex gap-2">
        <button
          type="button"
          onclick={executeCommand}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded transition-colors"
          title="Execute Command"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          type="button"
          onclick={viewInventory}
          class="flex-1 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded transition-colors"
          title="View Inventory"
        >
          <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-2 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Remote Execution</span>
      <svg class="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
