<script lang="ts">
  /**
   * MetricsTab Component
   * 
   * Displays detailed Prometheus metrics and alerts for a node.
   * Includes CPU, memory, disk usage, load averages, and active alerts.
   */
  import { onMount } from 'svelte';
  import MetricsBadge from './MetricsBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

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

  export interface PrometheusAlert {
    labels: Record<string, string>;
    annotations: Record<string, string>;
    state: 'inactive' | 'pending' | 'firing';
    activeAt: string;
    value: string;
  }

  interface Props {
    nodeName: string;
  }

  let { nodeName }: Props = $props();

  let metrics = $state<NodeMetrics | null>(null);
  let alerts = $state<PrometheusAlert[]>([]);
  let grafanaUrls = $state<{ dashboardUrl?: string; explorerUrl?: string } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function fetchMetrics() {
    loading = true;
    error = null;

    try {
      const [metricsRes, alertsRes, grafanaRes] = await Promise.allSettled([
        fetch(`/api/prometheus/nodes/${encodeURIComponent(nodeName)}/metrics`),
        fetch(`/api/prometheus/nodes/${encodeURIComponent(nodeName)}/alerts`),
        fetch(`/api/prometheus/nodes/${encodeURIComponent(nodeName)}/grafana`),
      ]);

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        metrics = await metricsRes.value.json();
      }

      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        alerts = await alertsRes.value.json();
      }

      if (grafanaRes.status === 'fulfilled' && grafanaRes.value.ok) {
        grafanaUrls = await grafanaRes.value.json();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load metrics';
    } finally {
      loading = false;
    }
  }

  function formatUptime(seconds: number | undefined): string {
    if (seconds === undefined) return 'Unknown';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} days, ${hours} hours, ${minutes} minutes`;
    }
    if (hours > 0) {
      return `${hours} hours, ${minutes} minutes`;
    }
    return `${minutes} minutes`;
  }

  function getSeverityClass(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  onMount(() => {
    fetchMetrics();
  });
</script>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else}
    <!-- Metrics Overview -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          System Metrics
        </h3>
        <button
          onclick={() => fetchMetrics()}
          class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Refresh
        </button>
      </div>

      {#if metrics}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- CPU -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">CPU Usage</div>
            <div class="text-2xl font-bold {metrics.cpu !== undefined && metrics.cpu >= 90 ? 'text-red-600 dark:text-red-400' : metrics.cpu !== undefined && metrics.cpu >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}">
              {metrics.cpu !== undefined ? `${metrics.cpu.toFixed(1)}%` : 'N/A'}
            </div>
            {#if metrics.cpu !== undefined}
              <div class="mt-2 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div 
                  class="h-full rounded-full transition-all duration-300 {metrics.cpu >= 90 ? 'bg-red-500' : metrics.cpu >= 70 ? 'bg-yellow-500' : 'bg-green-500'}"
                  style="width: {Math.min(metrics.cpu, 100)}%"
                ></div>
              </div>
            {/if}
          </div>

          <!-- Memory -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Memory Usage</div>
            <div class="text-2xl font-bold {metrics.memory !== undefined && metrics.memory >= 95 ? 'text-red-600 dark:text-red-400' : metrics.memory !== undefined && metrics.memory >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}">
              {metrics.memory !== undefined ? `${metrics.memory.toFixed(1)}%` : 'N/A'}
            </div>
            {#if metrics.memory !== undefined}
              <div class="mt-2 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div 
                  class="h-full rounded-full transition-all duration-300 {metrics.memory >= 95 ? 'bg-red-500' : metrics.memory >= 80 ? 'bg-yellow-500' : 'bg-green-500'}"
                  style="width: {Math.min(metrics.memory, 100)}%"
                ></div>
              </div>
            {/if}
          </div>

          <!-- Disk -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Disk Usage</div>
            <div class="text-2xl font-bold {metrics.disk !== undefined && metrics.disk >= 95 ? 'text-red-600 dark:text-red-400' : metrics.disk !== undefined && metrics.disk >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}">
              {metrics.disk !== undefined ? `${metrics.disk.toFixed(1)}%` : 'N/A'}
            </div>
            {#if metrics.disk !== undefined}
              <div class="mt-2 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div 
                  class="h-full rounded-full transition-all duration-300 {metrics.disk >= 95 ? 'bg-red-500' : metrics.disk >= 80 ? 'bg-yellow-500' : 'bg-green-500'}"
                  style="width: {Math.min(metrics.disk, 100)}%"
                ></div>
              </div>
            {/if}
          </div>

          <!-- Load Average -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Load Average</div>
            {#if metrics.load}
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.load.load1.toFixed(2)}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {metrics.load.load1.toFixed(2)} / {metrics.load.load5.toFixed(2)} / {metrics.load.load15.toFixed(2)}
              </div>
            {:else}
              <div class="text-2xl font-bold text-gray-400 dark:text-gray-500">N/A</div>
            {/if}
          </div>
        </div>

        <!-- Uptime -->
        {#if metrics.uptime !== undefined}
          <div class="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div class="flex items-center">
              <svg class="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="text-purple-700 dark:text-purple-300 font-medium">Uptime:</span>
              <span class="ml-2 text-purple-600 dark:text-purple-400">{formatUptime(metrics.uptime)}</span>
            </div>
          </div>
        {/if}
      {:else}
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          No metrics available for this node. Make sure Prometheus node_exporter is running.
        </div>
      {/if}
    </div>

    <!-- Active Alerts -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Active Alerts
      </h3>

      {#if alerts.length === 0}
        <div class="flex items-center justify-center py-8 text-green-600 dark:text-green-400">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          No active alerts
        </div>
      {:else}
        <div class="space-y-3">
          {#each alerts as alert}
            <div class="border rounded-lg p-4 {getSeverityClass(alert.labels.severity || 'info')}">
              <div class="flex items-start justify-between">
                <div class="flex items-center">
                  <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                  <span class="font-semibold">{alert.labels.alertname || 'Unknown Alert'}</span>
                </div>
                <span class="text-xs uppercase font-bold px-2 py-1 rounded">
                  {alert.state}
                </span>
              </div>
              {#if alert.annotations.description || alert.annotations.summary}
                <p class="mt-2 text-sm">
                  {alert.annotations.description || alert.annotations.summary}
                </p>
              {/if}
              <div class="mt-2 text-xs opacity-75">
                Active since: {formatDate(alert.activeAt)}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Grafana Links -->
    {#if grafanaUrls}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Grafana Dashboards
        </h3>
        <div class="flex flex-wrap gap-4">
          {#if grafanaUrls.dashboardUrl}
            <a 
              href={grafanaUrls.dashboardUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-flex items-center px-4 py-2 bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/30 transition-colors"
            >
              <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.64 12.37c-.07-.07-.15-.12-.24-.16-.09-.04-.19-.07-.29-.07h-1.94c-.09 0-.17-.03-.24-.09-.07-.06-.12-.14-.14-.22-.11-.45-.26-.88-.47-1.29-.06-.12-.08-.26-.05-.39.03-.13.1-.25.2-.33l1.35-1.35c.07-.07.12-.15.15-.24.03-.09.04-.19.03-.29-.02-.1-.06-.19-.12-.27-.06-.08-.15-.14-.24-.18-.5-.21-1.02-.39-1.55-.51-.1-.02-.2-.02-.3.01-.1.03-.19.08-.26.15l-1.35 1.35c-.08.08-.19.14-.3.16-.11.02-.23.01-.34-.04-.41-.17-.83-.31-1.27-.4-.12-.03-.22-.09-.3-.18-.08-.09-.12-.2-.13-.31l-.21-1.91c0-.1-.03-.19-.08-.28-.05-.08-.12-.15-.2-.2-.08-.05-.18-.08-.28-.1-.1-.01-.2 0-.29.04-.53.18-1.05.4-1.54.68-.09.05-.17.12-.22.21-.05.09-.08.19-.08.29v1.94c0 .11-.03.22-.1.31-.07.09-.16.16-.27.19-.43.11-.84.26-1.24.45-.11.06-.24.08-.36.07-.12-.02-.24-.07-.33-.16l-1.35-1.35c-.07-.07-.16-.12-.26-.15-.1-.03-.2-.03-.3 0-.1.03-.19.08-.26.15-.07.07-.13.16-.16.26-.18.53-.32 1.08-.4 1.64-.02.1-.01.2.03.29.04.09.11.17.19.23l1.35 1.35c.08.08.13.18.16.29.03.11.02.23-.03.34-.18.42-.32.85-.42 1.29-.03.12-.09.22-.18.3-.09.08-.2.13-.31.15l-1.91.21c-.1.01-.19.05-.27.11-.08.06-.14.14-.18.22-.04.08-.06.18-.05.27.01.1.04.19.1.27.22.41.47.81.76 1.18.07.09.15.16.25.2.1.05.2.07.31.06.1-.01.2-.05.29-.11l1.58-1.09c.09-.06.19-.09.3-.09.11 0 .22.03.31.1.37.27.76.5 1.17.7.11.05.2.13.27.23.07.1.11.21.11.33v1.94c0 .1.03.2.08.29.05.09.13.16.22.21.09.05.19.07.29.07.1 0 .2-.02.29-.07.52-.25 1.01-.55 1.47-.88.09-.07.16-.15.2-.25.04-.1.06-.21.04-.31-.02-.1-.06-.2-.13-.28l-1.09-1.58c-.06-.09-.1-.19-.1-.3 0-.11.04-.22.11-.31.28-.38.51-.79.7-1.22.05-.11.14-.2.24-.27.1-.07.22-.1.34-.1h1.94c.1 0 .2-.02.29-.07.09-.05.16-.12.21-.2.05-.09.08-.19.08-.29s-.02-.2-.07-.29c-.24-.51-.52-.99-.84-1.44-.07-.09-.16-.16-.27-.2-.1-.04-.22-.05-.33-.03-.11.02-.21.07-.3.14l-1.58 1.09c-.09.06-.19.1-.3.1-.11 0-.22-.03-.31-.1-.37-.27-.77-.5-1.18-.7-.11-.05-.2-.13-.27-.23-.07-.1-.1-.22-.1-.34V9.79c0-.1-.03-.2-.08-.29-.05-.09-.13-.16-.22-.21-.09-.05-.19-.07-.29-.07-.1 0-.2.02-.29.07-.52.24-1.01.52-1.47.84-.09.07-.16.16-.2.26-.04.1-.05.21-.03.32.02.1.07.2.14.28l1.09 1.58c.06.09.1.19.1.3 0 .11-.04.22-.11.31-.27.37-.5.77-.69 1.18-.05.11-.13.2-.23.27-.1.07-.22.11-.34.11h-1.94c-.1 0-.2.03-.29.08-.09.05-.16.13-.21.22-.05.09-.07.19-.07.29 0 .1.02.2.07.29.24.52.52 1.01.84 1.47.07.09.16.16.27.2.1.04.22.05.33.03.11-.02.21-.07.3-.14l1.58-1.09c.09-.06.19-.1.3-.1.11 0 .22.03.31.1.37.27.77.5 1.18.7.11.05.2.13.27.23.07.1.1.22.1.34v1.94c0 .1.03.2.08.29.05.09.13.16.22.21.09.05.19.07.29.07.1 0 .2-.02.29-.07.52-.24 1.01-.52 1.47-.84.09-.07.16-.16.2-.26.04-.1.05-.21.03-.32-.02-.11-.07-.21-.14-.29l-1.09-1.58c-.06-.09-.1-.19-.1-.3 0-.11.04-.22.11-.31.27-.37.5-.76.7-1.17.05-.11.13-.2.23-.27.1-.07.21-.11.33-.11h1.94c.1 0 .2-.03.29-.08.09-.05.16-.13.21-.22.05-.09.07-.19.07-.29 0-.1-.02-.2-.07-.29z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Node Exporter Dashboard
            </a>
          {/if}
          {#if grafanaUrls.explorerUrl}
            <a 
              href={grafanaUrls.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              Explore Metrics
            </a>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>
