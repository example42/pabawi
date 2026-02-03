<!--
  Puppetserver Status Dashboard Widget

  Displays Puppetserver status and health information.
  Can be rendered in dashboard or sidebar slots.

  Features:
  - Server status indicator
  - Service health overview
  - Key metrics display
  - Quick actions

  @module plugins/native/puppetserver/frontend/StatusDashboard
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface ServiceStatus {
    service_name?: string;
    service_version?: string;
    service_status_version?: number;
    detail_level?: string;
    state?: string;
    status?: {
      experimental?: {
        http_metrics?: Record<string, unknown>;
        jruby_metrics?: Record<string, unknown>;
      };
    };
  }

  interface ServerStatus {
    status: 'running' | 'stopped' | 'error' | 'unknown';
    version?: string;
    services?: Record<string, ServiceStatus>;
    uptime?: number;
    jruby?: {
      pool_size?: number;
      free?: number;
      borrowed?: number;
    };
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Auto-refresh interval in ms (0 to disable) */
    refreshInterval?: number;
    /** Show detailed metrics */
    showMetrics?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let {
    refreshInterval = 30000,
    showMetrics = true,
    compact = false,
    config = {},
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let status = $state<ServerStatus | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchStatus();

    if (refreshInterval > 0) {
      refreshTimer = setInterval(() => void fetchStatus(), refreshInterval);
    }

    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchStatus(): Promise<void> {
    if (!status) loading = true;
    error = null;
    try {
      const response = await api.get<ServerStatus>('/api/puppetserver/status');
      status = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load status';
      status = { status: 'error' };
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getStatusColor(state: string): string {
    switch (state) {
      case 'running': return 'text-green-600 dark:text-green-400';
      case 'stopped': return 'text-gray-600 dark:text-gray-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-amber-600 dark:text-amber-400';
    }
  }

  function getStatusBg(state: string): string {
    switch (state) {
      case 'running': return 'bg-green-100 dark:bg-green-900/30';
      case 'stopped': return 'bg-gray-100 dark:bg-gray-700';
      case 'error': return 'bg-red-100 dark:bg-red-900/30';
      default: return 'bg-amber-100 dark:bg-amber-900/30';
    }
  }

  function formatUptime(seconds: number | undefined): string {
    if (!seconds) return 'Unknown';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
</script>

<div class="puppetserver-status-dashboard {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Puppetserver Status
      </h3>
    </div>
    <button
      type="button"
      onclick={() => void fetchStatus()}
      disabled={loading}
      class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
      title="Refresh"
    >
      <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Content -->
  {#if loading && !status}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Checking status...</span>
    </div>
  {:else if error && !status}
    <ErrorAlert message={error} />
  {:else if status}
    <!-- Status Badge -->
    <div class="flex items-center justify-between p-3 rounded-lg {getStatusBg(status.status)}">
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="w-3 h-3 rounded-full {status.status === 'running' ? 'bg-green-500' : status.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}"></div>
          {#if status.status === 'running'}
            <div class="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-50"></div>
          {/if}
        </div>
        <div>
          <div class="font-medium {getStatusColor(status.status)} capitalize">{status.status}</div>
          {#if status.version && !compact}
            <div class="text-xs text-gray-500 dark:text-gray-400">Version {status.version}</div>
          {/if}
        </div>
      </div>
      {#if status.uptime}
        <div class="text-right">
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">{formatUptime(status.uptime)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">Uptime</div>
        </div>
      {/if}
    </div>

    <!-- JRuby Pool (if available) -->
    {#if status.jruby && showMetrics && !compact}
      <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
        <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">JRuby Pool</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <div class="text-lg font-bold text-gray-900 dark:text-white">{status.jruby.pool_size ?? '-'}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Size</div>
          </div>
          <div>
            <div class="text-lg font-bold text-green-600 dark:text-green-400">{status.jruby.free ?? '-'}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Free</div>
          </div>
          <div>
            <div class="text-lg font-bold text-amber-600 dark:text-amber-400">{status.jruby.borrowed ?? '-'}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">In Use</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Services List -->
    {#if status.services && Object.keys(status.services).length > 0 && !compact}
      <div class="space-y-2">
        <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Services</div>
        <div class="space-y-1">
          {#each Object.entries(status.services) as [name, service] (name)}
            <div class="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded text-sm">
              <span class="text-gray-700 dark:text-gray-300">{name}</span>
              <span class="text-xs {service.state === 'running' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}">
                {service.state || 'unknown'}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      Unable to get server status
    </div>
  {/if}
</div>
