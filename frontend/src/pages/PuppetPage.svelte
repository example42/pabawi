<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import EnvironmentSelector from '../components/EnvironmentSelector.svelte';
  import PuppetReportsListView from '../components/PuppetReportsListView.svelte';
  import PuppetserverStatus from '../components/PuppetserverStatus.svelte';
  import PuppetDBAdmin from '../components/PuppetDBAdmin.svelte';
  import GlobalHieraTab from '../components/GlobalHieraTab.svelte';
  import CodeAnalysisTab from '../components/CodeAnalysisTab.svelte';
  import GlobalFactsTab from '../components/GlobalFactsTab.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import PuppetRunChart from '../components/PuppetRunChart.svelte';
  import { integrationColors } from '../lib/integrationColors.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { DebugInfo, LabeledDebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Puppet';

  // Tab types
  type TabId = 'reports' | 'environments' | 'facts' | 'status' | 'admin' | 'hiera' | 'analysis';

  // State
  let activeTab = $state<TabId>('reports');
  let loadedTabs = $state<Set<TabId>>(new Set(['reports']));

  // Cache for loaded data
  let dataCache = $state<Record<TabId, any>>({});

  // Debug info state for expert mode
  let debugInfo = $state<DebugInfo | null>(null);

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

  // Callback to receive debug info from child components
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA; // Newest first
    });
  });

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

  // Integration status
  let isPuppetDBActive = $state(false);
  let isPuppetserverActive = $state(false);
  let isHieraActive = $state(false);

  // Check integration status
  async function checkIntegrationStatus(): Promise<void> {
    try {
      const data = await get<{ integrations: Array<{ name: string; status: string }> }>(
        '/api/integrations/status',
        { maxRetries: 2 }
      );

      const puppetDB = data.integrations.find(i => i.name === 'puppetdb');
      const puppetserver = data.integrations.find(i => i.name === 'puppetserver');
      const hiera = data.integrations.find(i => i.name === 'hiera');

      isPuppetDBActive = puppetDB?.status === 'connected';
      isPuppetserverActive = puppetserver?.status === 'connected';
      isHieraActive = hiera?.status === 'connected';

      // Fetch run history if PuppetDB is active and we're on the reports tab
      if (isPuppetDBActive && activeTab === 'reports') {
        void fetchAggregatedRunHistory();
      }
    } catch (err) {
      console.error('Error checking integration status:', err);
    }
  }

  // Fetch aggregated run history
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
          handleDebugInfo('Puppet Run History', data._debug);
        }
      }
    } catch (err) {
      runHistoryError = err instanceof Error ? err.message : 'Failed to load run history';
      console.error('Error fetching aggregated run history:', err);
      aggregatedRunHistory = [];
    } finally {
      runHistoryLoading = false;
    }
  }

  // Handle report click - navigate to node detail page
  function handleReportClick(report: { certname: string }): void {
    router.navigate(`/nodes/${report.certname}?tab=puppet-reports`);
  }

  // Switch tab and update URL
  function switchTab(tabId: TabId): void {
    activeTab = tabId;
    debugInfoBlocks = []; // Clear debug info when switching tabs

    // Update URL with tab parameter
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.pushState({}, '', url.toString());

    // Lazy load data for the tab if not already loaded
    if (!loadedTabs.has(tabId)) {
      loadedTabs.add(tabId);
      loadTabData(tabId);
    }

    // Fetch run history when switching to reports tab
    if (tabId === 'reports' && isPuppetDBActive) {
      void fetchAggregatedRunHistory();
    }
  }

  // Load data for a specific tab
  async function loadTabData(tabId: TabId): Promise<void> {
    switch (tabId) {
      // 'reports' tab now loads its own data via PuppetReportsListView component
      // 'environments' loads its own data
      // Other tabs load their own data
      default:
        break;
    }
  }

  // Read tab from URL on mount
  function readTabFromURL(): void {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab') as TabId | null;

    if (tabParam && ['reports', 'environments', 'facts', 'status', 'admin', 'hiera', 'analysis'].includes(tabParam)) {
      activeTab = tabParam;

      // Load data for the tab if not already loaded
      if (!loadedTabs.has(tabParam)) {
        loadedTabs.add(tabParam);
        loadTabData(tabParam);
      }
    }
  }

  // Handle browser back/forward buttons
  function handlePopState(): void {
    readTabFromURL();
  }

  // On mount
  onMount(() => {
    debugInfoBlocks = []; // Clear debug info on mount
    // Load integration colors
    void integrationColors.loadColors();

    // Check integration status first
    void checkIntegrationStatus();

    readTabFromURL();

    // Listen for browser back/forward
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
      Puppet
    </h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      Manage Puppet environments and reports
    </p>
  </div>

  <!-- Tabs -->
  <div class="mb-6 border-b border-gray-200 dark:border-gray-700">
    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
      <button
        type="button"
        onclick={() => switchTab('reports')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'reports'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('puppetdb').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Reports
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('environments')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'environments'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('puppetserver').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Environments
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('facts')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'facts'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('puppetdb').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Facts
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('status')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'status'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('puppetserver').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Status
        </div>
      </button>

      {#if isPuppetDBActive}
        <button
          type="button"
          onclick={() => switchTab('admin')}
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'admin'
            ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
        >
          <div class="flex items-center gap-2">
            <svg
              class="h-5 w-5"
              style="color: {integrationColors.getColor('puppetdb').primary}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin
          </div>
        </button>
      {/if}

      <button
        type="button"
        onclick={() => switchTab('hiera')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'hiera'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('hiera').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          Hiera
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('analysis')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'analysis'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg
            class="h-5 w-5"
            style="color: {integrationColors.getColor('hiera').primary}"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Code Analysis
        </div>
      </button>
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    <!-- Reports Tab -->
    {#if activeTab === 'reports'}
      <div class="space-y-6">
        <!-- Run History Chart -->
        {#if isPuppetDBActive}
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center gap-3">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Run History</h2>
              <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
            </div>
            {#if runHistoryLoading}
              <div class="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            {:else if runHistoryError}
              <ErrorAlert message={runHistoryError} />
            {:else}
              <PuppetRunChart data={aggregatedRunHistory} title="" />
            {/if}
          </div>
        {/if}

        <!-- Reports List -->
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Reports</h2>
            <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
          </div>
          <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
            View and filter recent Puppet run reports from all nodes. Click on a report to view details.
          </p>

          <PuppetReportsListView onReportClick={handleReportClick} showFilters={true} onDebugInfo={(info) => handleDebugInfo('Puppet Reports', info)} />
        </div>
      </div>
    {/if}

    <!-- Environments Tab -->
    {#if activeTab === 'environments'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Environments</h2>
          <IntegrationBadge integration="puppetserver" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View and manage Puppet environments available on your Puppetserver.
        </p>
        <EnvironmentSelector showFlushButton={true} onDebugInfo={(info) => handleDebugInfo('Puppet Environments', info)} />
      </div>
    {/if}

    <!-- Facts Tab -->
    {#if activeTab === 'facts'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Node Facts</h2>
          <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Search for fact names and view their values across all nodes in your infrastructure.
        </p>
        <GlobalFactsTab onDebugInfo={(info) => handleDebugInfo('Node Facts', info)} />
      </div>
    {/if}



    <!-- Status Tab -->
    {#if activeTab === 'status'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppetserver Status</h2>
          <IntegrationBadge integration="puppetserver" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View detailed status information, services, and metrics from your Puppetserver.
        </p>
        <PuppetserverStatus onDebugInfo={(info) => handleDebugInfo('Puppetserver Status', info)} />
      </div>
    {/if}

    <!-- Admin Tab (PuppetDB only) -->
    {#if activeTab === 'admin' && isPuppetDBActive}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">PuppetDB Statistics</h2>
          <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View PuppetDB administrative information including archive status and database statistics.
        </p>
        <PuppetDBAdmin onDebugInfo={(info) => handleDebugInfo('PuppetDB Statistics', info)} />
      </div>
    {/if}

    <!-- Hiera Tab -->
    {#if activeTab === 'hiera'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Hiera Data</h2>
          <IntegrationBadge integration="hiera" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Search for Hiera keys and see their resolved values across all nodes in your infrastructure.
        </p>
        <GlobalHieraTab onDebugInfo={(info) => handleDebugInfo('Hiera Data', info)} />
      </div>
    {/if}

    <!-- Code Analysis Tab -->
    {#if activeTab === 'analysis'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Code Analysis</h2>
          <IntegrationBadge integration="hiera" variant="badge" size="sm" />
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Analyze your Puppet codebase for unused code, lint issues, and module updates.
        </p>
        <CodeAnalysisTab onDebugInfo={(info) => handleDebugInfo('Code Analysis', info)} />
      </div>
    {/if}
  </div>

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
