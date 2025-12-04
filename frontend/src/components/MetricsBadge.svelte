<script lang="ts">
  /**
   * MetricsBadge Component
   * 
   * Displays compact metric badges for CPU, memory, and disk usage
   * with color-coded status (ok, warning, critical).
   */

  export interface NodeMetrics {
    cpu?: number;
    memory?: number;
    disk?: number;
    load?: {
      load1: number;
      load5: number;
      load15: number;
    };
    uptime?: number;
  }

  interface Props {
    metrics: NodeMetrics | null;
    loading?: boolean;
    compact?: boolean;
  }

  let { metrics, loading = false, compact = false }: Props = $props();

  interface Thresholds {
    warning: number;
    critical: number;
  }

  const thresholds: Record<string, Thresholds> = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    disk: { warning: 80, critical: 95 },
  };

  function getStatusClass(value: number | undefined, metric: string): string {
    if (value === undefined) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    
    const threshold = thresholds[metric];
    if (!threshold) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    
    if (value >= threshold.critical) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    }
    if (value >= threshold.warning) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    }
    return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
  }

  function formatValue(value: number | undefined): string {
    if (value === undefined) return 'N/A';
    return `${value.toFixed(1)}%`;
  }

  function formatUptime(seconds: number | undefined): string {
    if (seconds === undefined) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
</script>

{#if loading}
  <div class="flex gap-2">
    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400 dark:bg-gray-700 animate-pulse">
      CPU: ...
    </span>
    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400 dark:bg-gray-700 animate-pulse">
      MEM: ...
    </span>
    {#if !compact}
      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400 dark:bg-gray-700 animate-pulse">
        DISK: ...
      </span>
    {/if}
  </div>
{:else if metrics}
  <div class="flex flex-wrap gap-2">
    <span 
      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(metrics.cpu, 'cpu')}"
      title="CPU Usage"
    >
      CPU: {formatValue(metrics.cpu)}
    </span>
    <span 
      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(metrics.memory, 'memory')}"
      title="Memory Usage"
    >
      MEM: {formatValue(metrics.memory)}
    </span>
    {#if !compact}
      <span 
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusClass(metrics.disk, 'disk')}"
        title="Disk Usage"
      >
        DISK: {formatValue(metrics.disk)}
      </span>
      {#if metrics.load}
        <span 
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
          title="Load Average (1/5/15 min)"
        >
          LOAD: {metrics.load.load1.toFixed(2)}
        </span>
      {/if}
      {#if metrics.uptime !== undefined}
        <span 
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400"
          title="System Uptime"
        >
          UP: {formatUptime(metrics.uptime)}
        </span>
      {/if}
    {/if}
  </div>
{:else}
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
    No metrics
  </span>
{/if}
