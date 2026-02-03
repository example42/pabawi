<!--
  PuppetDB Home Widget

  A summary tile displayed on the home page showing PuppetDB integration status.
  Uses PuppetDB's violet color (#9063CD) for theming.

  Features:
  - Total node count from PuppetDB
  - Recent reports summary
  - Failed runs count
  - Quick link to PuppetDB integration page

  @module plugins/native/puppetdb/frontend/HomeWidget
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { router } from '../../../../frontend/src/lib/router.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface HealthStatus {
    healthy: boolean;
    message?: string;
    lastCheck: string;
    details?: {
      nodeCount?: number;
      capabilities?: string[];
    };
    degraded?: boolean;
  }

  interface ReportsSummary {
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  }

  interface NodesResponse {
    nodes?: Array<{ certname: string }>;
    length?: number;
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
  let reportsSummary = $state<ReportsSummary | null>(null);
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

  let failedCount = $derived(reportsSummary?.failed ?? 0);
  let totalReports = $derived(reportsSummary?.total ?? 0);

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
      const healthResponse = await get<HealthStatus>('/api/integrations/puppetdb/health');
      healthStatus = healthResponse;

      // Load node count
      try {
        const nodesResponse = await get<NodesResponse>('/api/puppetdb/nodes');
        if (Array.isArray(nodesResponse)) {
          nodeCount = nodesResponse.length;
        } else if (nodesResponse.nodes) {
          nodeCount = nodesResponse.nodes.length;
        } else {
          nodeCount = healthStatus?.details?.nodeCount ?? 0;
        }
      } catch {
        // Use health status node count as fallback
        nodeCount = healthStatus?.details?.nodeCount ?? 0;
      }

      // Load reports summary
      try {
        const summaryResponse = await get<ReportsSummary>('/api/puppetdb/reports/summary');
        reportsSummary = summaryResponse;
      } catch {
        // Non-critical, continue without reports data
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load PuppetDB status';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function navigateToPuppetDB(): void {
    router.navigate('/integrations/puppetdb');
  }
</script>

<button
  type="button"
  onclick={navigateToPuppetDB}
  class="w-full h-full p-4 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 hover:border-violet-400 dark:hover:border-violet-600 transition-all duration-200 text-left group"
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
        <div class="p-2 rounded-lg bg-violet-500/20">
          <svg class="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <span class="font-semibold text-gray-900 dark:text-white">PuppetDB</span>
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
        <span class="text-sm text-gray-600 dark:text-gray-400">Total Nodes</span>
        <span class="text-lg font-bold text-violet-600 dark:text-violet-400">{nodeCount}</span>
      </div>

      <!-- Recent Reports -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Recent Reports</span>
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">{totalReports}</span>
      </div>

      <!-- Failed Runs -->
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Failed Runs</span>
        <span class="text-lg font-bold {failedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">
          {failedCount}
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-3 pt-3 border-t border-violet-200/50 dark:border-violet-800/50 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">Infrastructure Data</span>
      <svg class="w-4 h-4 text-violet-500 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</button>
