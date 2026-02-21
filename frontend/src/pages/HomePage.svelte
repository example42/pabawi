<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationStatus from '../components/IntegrationStatus.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import PuppetReportsSummary from '../components/PuppetReportsSummary.svelte';
  import PuppetRunChart from '../components/PuppetRunChart.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import ExecutionList from '../components/ExecutionList.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { DebugInfo, LabeledDebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Dashboard';

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

  // Puppet reports list for home page (only reports with changes)
  interface PuppetReport {
    certname: string;
    hash: string;
    environment: string;
    status: 'unchanged' | 'changed' | 'failed';
    noop: boolean;
    start_time: string;
    end_time: string;
    metrics: {
      resources: {
        total: number;
        skipped: number;
        failed: number;
        failed_to_restart: number;
        changed: number;
        corrective_change: number;
        out_of_sync: number;
      };
      time: Record<string, number>;
      events?: {
        success: number;
        failure: number;
        noop?: number;
        total: number;
      };
    };
  }

  let puppetReportsList = $state<PuppetReport[]>([]);
  let puppetReportsListLoading = $state(false);
  let puppetReportsListError = $state<string | null>(null);

  // UI configuration state
  let showHomePageRunChart = $state(true); // Default to true

  // Aggregated run history state
  interface RunHistoryData {
    date: string;
    success: number;
    failed: number;
    changed: number;
    unchanged: number;
  }

  let aggregatedRunHistory = $state<RunHistoryData[]>([]);
  let runHistoryLoading = $state(false);
  let runHistoryError = $state<string | null>(null);
  let runHistoryLastUpdate = $state<Date | null>(null);

  // Debug info state for expert mode - support multiple debug blocks
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Home page inventory list state
  let homeSearchQuery = $state('');
  let homeTransportFilter = $state<string>('all');
  let homeSourceFilter = $state<string>('all');
  let homeSortBy = $state<string>('name');
  let homeSortOrder = $state<'asc' | 'desc'>('asc');

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA; // Newest first
    });
  });

  // Computed filtered nodes for home page inventory list
  const homeFilteredNodes = $derived.by(() => {
    let result = nodes;

    // Filter by search query
    if (homeSearchQuery.trim()) {
      const query = homeSearchQuery.toLowerCase();
      result = result.filter(node =>
        node.name.toLowerCase().includes(query) ||
        node.uri.toLowerCase().includes(query)
      );
    }

    // Filter by transport type
    if (homeTransportFilter !== 'all') {
      result = result.filter(node => node.transport === homeTransportFilter);
    }

    // Filter by source
    if (homeSourceFilter !== 'all') {
      result = result.filter(node => (node.source || 'bolt') === homeSourceFilter);
    }

    // Sort nodes
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (homeSortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'transport':
          comparison = a.transport.localeCompare(b.transport);
          break;
        case 'source':
          comparison = (a.source || 'bolt').localeCompare(b.source || 'bolt');
          break;
        default:
          comparison = 0;
      }

      return homeSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  });

  // Computed node counts by source for home page
  const homeNodeCountsBySource = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const source = node.source || 'bolt';
      counts[source] = (counts[source] || 0) + 1;
    }
    return counts;
  });

  // Callback to receive debug info from API calls
  function handleDebugInfo(label: string, info: DebugInfo | null): void {
    if (info) {
      // Add or update debug info for this label
      const existingIndex = debugInfoBlocks.findIndex(block => block.label === label);
      if (existingIndex >= 0) {
        // Update existing block
        debugInfoBlocks[existingIndex] = { label, debugInfo: info };
      } else {
        // Add new block
        debugInfoBlocks = [...debugInfoBlocks, { label, debugInfo: info }];
      }
    } else {
      // Remove debug info for this label
      debugInfoBlocks = debugInfoBlocks.filter(block => block.label !== label);
    }
  }

  async function fetchUIConfig(): Promise<void> {
    try {
      const data = await get<{ ui: { showHomePageRunChart: boolean } }>('/api/config/ui');
      showHomePageRunChart = data.ui.showHomePageRunChart;
    } catch (err) {
      console.error('[HomePage] Error fetching UI config:', err);
      // Keep default value on error
      showHomePageRunChart = true;
    }
  }

  async function fetchInventory(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ nodes: Node[]; _debug?: DebugInfo }>('/api/inventory');
      nodes = data.nodes || [];

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Inventory', data._debug);
      }
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
      const data = await get<IntegrationStatusResponse & { _debug?: DebugInfo }>(url);
      integrations = data.integrations || [];

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Integration Status', data._debug);
      }

      // Check if PuppetDB is active
      const puppetDB = integrations.find(i => i.name === 'puppetdb');
      isPuppetDBActive = puppetDB?.status === 'connected';

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
      const data = await get<{ summary: PuppetReportsSummaryData; _debug?: DebugInfo }>(`/api/integrations/puppetdb/reports/summary${timeParam}`);
      puppetReports = data.summary;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Puppet Reports Summary', data._debug);
      }

      // Also fetch the list of reports with changes for the home page
      void fetchPuppetReportsList();
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

  async function fetchPuppetReportsList(): Promise<void> {
    puppetReportsListLoading = true;
    puppetReportsListError = null;

    try {
      // Fetch only reports with changes (changed or failed status), limit to 20
      const data = await get<{ reports: PuppetReport[]; _debug?: DebugInfo }>('/api/integrations/puppetdb/reports?status=changed,failed&limit=20&offset=0');
      puppetReportsList = data.reports || [];

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Puppet Reports List (Home)', data._debug);
      }
    } catch (err) {
      puppetReportsListError = err instanceof Error ? err.message : 'Failed to load Puppet reports list';
      console.error('[HomePage] Error fetching Puppet reports list:', err);
      puppetReportsList = [];
    } finally {
      puppetReportsListLoading = false;
    }
  }

  function handleTimeRangeChange(hours: number): void {
    puppetReportsTimeRange = hours;
    void fetchPuppetReports(hours);
  }

  async function fetchAggregatedRunHistory(days = 7): Promise<void> {
    runHistoryLoading = true;
    runHistoryError = null;

    try {
      const data = await get<RunHistoryData[] | { history: RunHistoryData[]; _debug?: DebugInfo }>(`/api/puppet/history?days=${days}`);

      // Handle both array response (normal mode) and object response (expert mode)
      if (Array.isArray(data)) {
        aggregatedRunHistory = data;
      } else {
        aggregatedRunHistory = data.history;

        // Store debug info if present
        if (data._debug) {
          handleDebugInfo('Aggregated Run History', data._debug);
        }
      }

      runHistoryLastUpdate = new Date();
    } catch (err) {
      runHistoryError = err instanceof Error ? err.message : 'Failed to load run history';
      console.error('[HomePage] Error fetching aggregated run history:', err);
      // Set empty array on error
      aggregatedRunHistory = [];
    } finally {
      runHistoryLoading = false;
    }
  }

  async function fetchRecentExecutions(): Promise<void> {
    executionsLoading = true;
    executionsError = null;

    try {
      const data = await get<ExecutionsResponse & { _debug?: DebugInfo }>('/api/executions?pageSize=10&page=1');
      executions = data.executions || [];
      executionsSummary = data.summary;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Recent Executions', data._debug);
      }
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

  // Get transport badge color
  function getTransportColor(transport: string): string {
    switch (transport) {
      case 'ssh':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'winrm':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'docker':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
      case 'local':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  // Get source display name
  function getSourceDisplayName(source: string): string {
    switch (source) {
      case 'bolt':
        return 'Bolt';
      case 'puppetdb':
        return 'PuppetDB';
      case 'puppetserver':
        return 'Puppetserver';
      case 'hiera':
        return 'Hiera';
      case 'ansible':
        return 'Ansible';
      default:
        return source.charAt(0).toUpperCase() + source.slice(1);
    }
  }

  onMount(() => {
    debugInfoBlocks = []; // Clear debug info blocks on mount
    // Fetch UI configuration first
    void fetchUIConfig();
    // Fetch inventory, integration status, and recent executions
    void fetchInventory();
    void fetchIntegrationStatus();
    void fetchRecentExecutions();

    // Fetch aggregated run history if PuppetDB is active and chart is enabled
    // This will be called after integration status is fetched
    void (async () => {
      // Wait for integration status to be fetched
      await fetchIntegrationStatus();
      if (isPuppetDBActive && showHomePageRunChart) {
        await fetchAggregatedRunHistory();
      }
    })();

    // Set up polling for run history updates (every 5 minutes)
    const runHistoryPollInterval = setInterval(() => {
      if (isPuppetDBActive && showHomePageRunChart && !runHistoryLoading) {
        void fetchAggregatedRunHistory();
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Cleanup on unmount
    return () => {
      clearInterval(runHistoryPollInterval);
    };
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

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
      Welcome to Pabawi Zero
    </h1>
    <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
      Puppet Ansible Bolt Awesome Web Interface
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

  <!-- Inventory List Section -->
  <div class="mb-12">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Inventory Nodes
        </h2>
        <IntegrationBadge integration="bolt" variant="badge" size="sm" />
        <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
      </div>
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
      <!-- Filters and Search -->
      <div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <!-- Search -->
        <div class="flex-1 max-w-md">
          <label for="home-search" class="sr-only">Search nodes</label>
          <div class="relative">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              id="home-search"
              type="text"
              bind:value={homeSearchQuery}
              placeholder="Search by name or URI..."
              class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
        </div>

        <!-- Filters -->
        <div class="flex items-center gap-4 flex-wrap">
          <!-- Source Filter -->
          <div class="flex items-center gap-2">
            <label for="home-source-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Source:
            </label>
            <select
              id="home-source-filter"
              bind:value={homeSourceFilter}
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All ({nodes.length})</option>
              {#each Object.keys(homeNodeCountsBySource).sort() as source}
                <option value={source}>
                  {getSourceDisplayName(source)} ({homeNodeCountsBySource[source]})
                </option>
              {/each}
            </select>
          </div>

          <!-- Transport Filter -->
          <div class="flex items-center gap-2">
            <label for="home-transport-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Transport:
            </label>
            <select
              id="home-transport-filter"
              bind:value={homeTransportFilter}
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All</option>
              <option value="ssh">SSH</option>
              <option value="winrm">WinRM</option>
              <option value="docker">Docker</option>
              <option value="local">Local</option>
            </select>
          </div>

          <!-- Sort By -->
          <div class="flex items-center gap-2">
            <label for="home-sort-by" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Sort:
            </label>
            <select
              id="home-sort-by"
              bind:value={homeSortBy}
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="name">Name</option>
              <option value="source">Source</option>
              <option value="transport">Transport</option>
            </select>
            <button
              type="button"
              onclick={() => homeSortOrder = homeSortOrder === 'asc' ? 'desc' : 'asc'}
              class="rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Toggle sort order"
            >
              {#if homeSortOrder === 'asc'}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              {:else}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              {/if}
            </button>
          </div>
        </div>
      </div>

      <!-- Results Count -->
      <div class="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Showing {homeFilteredNodes.length > 30 ? 30 : homeFilteredNodes.length} of {homeFilteredNodes.length} nodes
      </div>

      <!-- Compact Node List (30 lines max) -->
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Name
              </th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Source
              </th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Transport
              </th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                URI
              </th>
              <th scope="col" class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                User
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {#each homeFilteredNodes.slice(0, 30) as node (node.id)}
              <tr
                class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                onclick={() => router.navigate(`/nodes/${node.id}`)}
              >
                <td class="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                  {node.name}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  {#if node.sources && node.sources.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each node.sources as source}
                        <IntegrationBadge integration={source} variant="badge" size="sm" />
                      {/each}
                    </div>
                  {:else}
                    <IntegrationBadge integration={node.source || 'bolt'} variant="badge" size="sm" />
                  {/if}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm">
                  <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                    {node.transport}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                  {node.uri}
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                  {node.config.user || '-'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if homeFilteredNodes.length > 30}
        <div class="mt-4 text-center">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Showing 30 of {homeFilteredNodes.length} nodes.
            <button
              type="button"
              onclick={() => router.navigate('/inventory')}
              class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              View all nodes
            </button>
          </p>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Recent Executions -->
  <div class="mb-12">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Recent Executions
        </h2>
        <IntegrationBadge integration="bolt" variant="badge" size="sm" />
      </div>
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
      <ExecutionList
        {executions}
        onExecutionClick={(execution) => router.navigate(`/executions?id=${execution.id}`)}
        showTargets={true}
      />
    {/if}
  </div>

  <!-- Puppet Reports (only show if PuppetDB is active, list mode with changes only) -->
  {#if isPuppetDBActive}
    <div class="mb-12">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Puppet Reports
        </h2>
        <button
          type="button"
          class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          onclick={() => router.navigate('/puppet')}
        >
          View All
          <svg class="ml-2 -mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {#if puppetReportsListLoading}
        <div class="flex justify-center py-12">
          <LoadingSpinner size="lg" message="Loading Puppet reports..." />
        </div>
      {:else if puppetReportsListError}
        <ErrorAlert
          message="Failed to load Puppet reports"
          details={puppetReportsListError}
          onRetry={fetchPuppetReportsList}
        />
      {:else if puppetReportsList.length === 0}
        <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No reports with changes</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All recent Puppet runs completed without changes
          </p>
        </div>
      {:else}
        <div class="rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white">Recent Reports with Changes</h3>
                <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {puppetReportsList.length} report{puppetReportsList.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Start Time
                  </th>
                  <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Hostname
                  </th>
                  <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Environment
                  </th>
                  <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Changed
                  </th>
                  <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Failed
                  </th>
                  <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {#each puppetReportsList as report}
                  <tr
                    class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onclick={() => router.navigate(`/nodes/${report.certname}?tab=puppet-reports`)}
                  >
                    <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                      {new Date(report.start_time).toLocaleString()}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                      {report.certname}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                      {report.environment}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-blue-700 dark:text-blue-400">
                      {report.metrics.resources.changed}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-red-700 dark:text-red-400">
                      {report.metrics.resources.failed}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 text-sm">
                      <StatusBadge status={report.status === 'failed' ? 'failed' : 'changed'} size="sm" />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Expert Mode Debug Panel -->
  {#if expertMode.enabled && sortedDebugInfoBlocks.length > 0}
    <div class="mt-8 space-y-4">
      {#each sortedDebugInfoBlocks as block (block.label)}
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{block.label}</h3>
          <ExpertModeDebugPanel debugInfo={block.debugInfo} />
        </div>
      {/each}
    </div>
  {/if}
</div>
