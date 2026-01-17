<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationStatus from '../components/IntegrationStatus.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import PuppetReportsSummary from '../components/PuppetReportsSummary.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
  }

  interface IntegrationStatusData {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured';
    lastCheck: string;
    message?: string;
    details?: unknown;
  }

  interface IntegrationStatusResponse {
    integrations: IntegrationStatusData[];
    timestamp: string;
    cached: boolean;
  }

  interface ExecutionRecord {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
  }

  interface ExecutionsResponse {
    executions: ExecutionRecord[];
    pagination: {
      page: number;
      pageSize: number;
      hasMore: boolean;
    };
    summary: {
      total: number;
      running: number;
      success: number;
      failed: number;
      partial: number;
    };
  }

  interface PuppetReportsSummaryData {
    total: number;
    failed: number;
    changed: number;
    unchanged: number;
    noop: number;
  }

  let nodes = $state<Node[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let integrations = $state<IntegrationStatusData[]>([]);
  let integrationsLoading = $state(true);
  let integrationsError = $state<string | null>(null);

  let executions = $state<ExecutionRecord[]>([]);
  let executionsLoading = $state(true);
  let executionsError = $state<string | null>(null);
  let executionsSummary = $state<ExecutionsResponse['summary'] | null>(null);

  let puppetReports = $state<PuppetReportsSummaryData>({
    total: 0,
    failed: 0,
    changed: 0,
    unchanged: 0,
    noop: 0
  });
  let puppetReportsLoading = $state(true);
  let puppetReportsError = $state<string | null>(null);
  let puppetReportsTimeRange = $state(1); // Default to 1 hour
  let isPuppetDBActive = $state(false);

  async function fetchInventory(): Promise<void> {
    loading = true;
    error = null;

    try {
      console.log('[HomePage] Fetching inventory...');
      const data = await get<{ nodes: Node[] }>('/api/inventory');
      console.log('[HomePage] Inventory loaded:', data.nodes?.length, 'nodes');
      nodes = data.nodes || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load inventory';
      console.error('[HomePage] Error fetching inventory:', err);
      // Set empty array on error so the page still renders
      nodes = [];
    } finally {
      loading = false;
    }
  }

  async function fetchIntegrationStatus(refresh = false): Promise<void> {
    integrationsLoading = true;
    integrationsError = null;

    try {
      const url = refresh ? '/api/integrations/status?refresh=true' : '/api/integrations/status';
      console.log('[HomePage] Fetching integration status...');
      const data = await get<IntegrationStatusResponse>(url);
      console.log('[HomePage] Integration status loaded:', data.integrations?.length, 'integrations');
      integrations = data.integrations || [];

      // Check if PuppetDB is active
      const puppetDB = integrations.find(i => i.name === 'puppetdb');
      isPuppetDBActive = puppetDB?.status === 'connected';
      console.log('[HomePage] PuppetDB active:', isPuppetDBActive);

      // Fetch Puppet reports if PuppetDB is active
      if (isPuppetDBActive) {
        void fetchPuppetReports(puppetReportsTimeRange);
      }
    } catch (err) {
      integrationsError = err instanceof Error ? err.message : 'Failed to load integration status';
      console.error('[HomePage] Error fetching integration status:', err);
      // Set empty array on error so the page still renders
      integrations = [];
      isPuppetDBActive = false;
    } finally {
      integrationsLoading = false;
    }
  }

  async function fetchPuppetReports(hours?: number): Promise<void> {
    puppetReportsLoading = true;
    puppetReportsError = null;

    try {
      const timeParam = hours ? `?hours=${hours}` : '';
      console.log('[HomePage] Fetching Puppet reports summary...', hours ? `(last ${hours}h)` : '');
      const data = await get<{ summary: PuppetReportsSummaryData }>(`/api/integrations/puppetdb/reports/summary${timeParam}`);
      console.log('[HomePage] Puppet reports summary loaded:', data.summary);
      puppetReports = data.summary;
    } catch (err) {
      puppetReportsError = err instanceof Error ? err.message : 'Failed to load Puppet reports';
      console.error('[HomePage] Error fetching Puppet reports:', err);
      // Set default values on error
      puppetReports = {
        total: 0,
        failed: 0,
        changed: 0,
        unchanged: 0,
        noop: 0
      };
    } finally {
      puppetReportsLoading = false;
    }
  }

  function handleTimeRangeChange(hours: number): void {
    puppetReportsTimeRange = hours;
    void fetchPuppetReports(hours);
  }

  async function fetchRecentExecutions(): Promise<void> {
    executionsLoading = true;
    executionsError = null;

    try {
      console.log('[HomePage] Fetching recent executions...');
      const data = await get<ExecutionsResponse>('/api/executions?pageSize=10&page=1');
      console.log('[HomePage] Executions loaded:', data.executions?.length, 'executions, summary:', data.summary);
      executions = data.executions || [];
      executionsSummary = data.summary;
    } catch (err) {
      executionsError = err instanceof Error ? err.message : 'Failed to load recent executions';
      console.error('[HomePage] Error fetching recent executions:', err);
      executions = [];
    } finally {
      executionsLoading = false;
    }
  }

  function handleRefreshIntegrations(): void {
    void fetchIntegrationStatus(true);
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getExecutionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      command: 'Command',
      task: 'Task',
      facts: 'Facts',
      puppet: 'Puppet Run',
      package: 'Package Install'
    };
    return labels[type] || type;
  }

  onMount(() => {
    // Fetch inventory, integration status, and recent executions
    void fetchInventory();
    void fetchIntegrationStatus();
    void fetchRecentExecutions();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Welcome Section -->
  <div class="mb-12 text-center">
    <div class="flex justify-center mb-6">
      <img 
        src="/favicon/web-app-manifest-512x512.png" 
        alt="Pabawi Logo" 
        class="h-24 w-24"
      />
    </div>
    <h1 class="text-5xl font-bold text-gray-900 dark:text-white mb-4">
      Welcome to Pabawi
    </h1>
    <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
      Puppet And Bolt Awesome Web Interface
    </p>
  </div>

  <!-- Quick Stats -->
  <div class="grid gap-6 mb-12 md:grid-cols-4">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Nodes</p>
          <p class="text-2xl font-semibold text-gray-900 dark:text-white">
            {loading ? '...' : nodes.length}
          </p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Integrations</p>
          <p class="text-2xl font-semibold text-gray-900 dark:text-white">
            {integrationsLoading ? '...' : integrations.filter(i => i.status === 'connected').length} / {integrations.length}
          </p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Executions</p>
          <p class="text-2xl font-semibold text-gray-900 dark:text-white">
            {executionsLoading ? '...' : executionsSummary?.total ?? 0}
          </p>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
          <p class="text-2xl font-semibold text-gray-900 dark:text-white">
            {#if executionsLoading}
              ...
            {:else if executionsSummary && executionsSummary.total > 0}
              {Math.round((executionsSummary.success / executionsSummary.total) * 100)}%
            {:else}
              N/A
            {/if}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Integration Status Section -->
  <div class="mb-12">
    <IntegrationStatus
      {integrations}
      loading={integrationsLoading}
      onRefresh={handleRefreshIntegrations}
    />
    {#if integrationsError}
      <div class="mt-4">
        <ErrorAlert
          message="Failed to load integration status"
          details={integrationsError}
          onRetry={() => fetchIntegrationStatus(true)}
        />
      </div>
    {/if}
  </div>

  <!-- Puppet Reports Summary (only show if PuppetDB is active) -->
  {#if isPuppetDBActive}
    <div class="mb-12">
      <PuppetReportsSummary
        reports={puppetReports}
        loading={puppetReportsLoading}
        error={puppetReportsError}
        timeRange={puppetReportsTimeRange}
        onRetry={() => fetchPuppetReports(puppetReportsTimeRange)}
        onTimeRangeChange={handleTimeRangeChange}
      />
    </div>
  {/if}

  <!-- Inventory Preview -->
  <div class="mb-8">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Inventory Nodes
      </h2>
      <button
        type="button"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        onclick={() => router.navigate('/inventory')}
      >
        View All
        <svg class="ml-2 -mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    {#if loading}
      <div class="flex justify-center py-12">
        <LoadingSpinner size="lg" message="Loading inventory..." />
      </div>
    {:else if error}
      <ErrorAlert
        message="Failed to load inventory"
        details={error}
        onRetry={fetchInventory}
      />
    {:else if nodes.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No nodes found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure your Bolt inventory to get started
        </p>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each nodes.slice(0, 8) as node (node.id)}
          <button
            type="button"
            class="group relative rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
            onclick={() => router.navigate(`/nodes/${node.id}`)}
          >
            <div class="mb-2">
              <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                {node.name}
              </h3>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
              {node.uri}
            </p>
            <span class="mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              {node.transport}
            </span>
          </button>
        {/each}
      </div>

      {#if nodes.length > 8}
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Showing 8 of {nodes.length} nodes
          </p>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Recent Executions -->
  <div class="mb-12">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Recent Executions
      </h2>
      <button
        type="button"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        onclick={() => router.navigate('/executions')}
      >
        View All
        <svg class="ml-2 -mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    {#if executionsLoading}
      <div class="flex justify-center py-12">
        <LoadingSpinner size="lg" message="Loading recent executions..." />
      </div>
    {:else if executionsError}
      <ErrorAlert
        message="Failed to load recent executions"
        details={executionsError}
        onRetry={fetchRecentExecutions}
      />
    {:else if executions.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No executions yet</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Start by running a command or task on your nodes
        </p>
      </div>
    {:else}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Targets
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Time
                </th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {#each executions as execution (execution.id)}
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {getExecutionTypeLabel(execution.type)}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    <div class="max-w-xs truncate" title={execution.action}>
                      {execution.action}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {execution.targetNodes.length} {execution.targetNodes.length === 1 ? 'node' : 'nodes'}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={execution.status} />
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatTimestamp(execution.startedAt)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      type="button"
                      class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      onclick={() => router.navigate(`/executions?id=${execution.id}`)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
