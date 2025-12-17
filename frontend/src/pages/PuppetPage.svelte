<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import EnvironmentSelector from '../components/EnvironmentSelector.svelte';
  import PuppetReportsListView from '../components/PuppetReportsListView.svelte';
  import CertificateManagement from '../components/CertificateManagement.svelte';
  import PuppetserverStatus from '../components/PuppetserverStatus.svelte';
  import PuppetDBAdmin from '../components/PuppetDBAdmin.svelte';

  // Tab types
  type TabId = 'environments' | 'reports' | 'certificates' | 'status' | 'admin';

  // State
  let activeTab = $state<TabId>('environments');
  let loadedTabs = $state<Set<TabId>>(new Set(['environments']));

  // Reports state
  interface ReportMetrics {
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
  }

  interface Report {
    certname: string;
    hash: string;
    environment: string;
    status: 'unchanged' | 'changed' | 'failed';
    noop: boolean;
    start_time: string;
    end_time: string;
    metrics: ReportMetrics;
  }

  let reports = $state<Report[]>([]);
  let reportsLoading = $state(false);
  let reportsError = $state<string | null>(null);

  // Cache for loaded data
  let dataCache = $state<Record<TabId, any>>({});

  // Integration status
  let isPuppetDBActive = $state(false);
  let isPuppetserverActive = $state(false);

  // Check integration status
  async function checkIntegrationStatus(): Promise<void> {
    try {
      const data = await get<{ integrations: Array<{ name: string; status: string }> }>(
        '/api/integrations/status',
        { maxRetries: 2 }
      );

      const puppetDB = data.integrations.find(i => i.name === 'puppetdb');
      const puppetserver = data.integrations.find(i => i.name === 'puppetserver');

      isPuppetDBActive = puppetDB?.status === 'connected';
      isPuppetserverActive = puppetserver?.status === 'connected';
    } catch (err) {
      console.error('Error checking integration status:', err);
    }
  }

  // Fetch all reports from PuppetDB
  async function fetchAllReports(): Promise<void> {
    // Check cache first
    if (dataCache['reports']) {
      reports = dataCache['reports'];
      return;
    }

    reportsLoading = true;
    reportsError = null;

    try {
      const data = await get<{ reports: Report[] }>(
        '/api/integrations/puppetdb/reports?limit=100',
        { maxRetries: 2 }
      );

      reports = data.reports || [];
      dataCache['reports'] = reports;
    } catch (err) {
      reportsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching reports:', err);
      showError('Failed to load Puppet reports', reportsError);
    } finally {
      reportsLoading = false;
    }
  }

  // Handle report click - navigate to node detail page
  function handleReportClick(report: Report): void {
    router.navigate(`/nodes/${report.certname}?tab=puppet-reports`);
  }

  // Switch tab and update URL
  function switchTab(tabId: TabId): void {
    activeTab = tabId;

    // Update URL with tab parameter
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.pushState({}, '', url.toString());

    // Lazy load data for the tab if not already loaded
    if (!loadedTabs.has(tabId)) {
      loadedTabs.add(tabId);
      loadTabData(tabId);
    }
  }

  // Load data for a specific tab
  async function loadTabData(tabId: TabId): Promise<void> {
    switch (tabId) {
      case 'reports':
        await fetchAllReports();
        break;
      // 'environments' and 'certificates' load their own data
    }
  }

  // Read tab from URL on mount
  function readTabFromURL(): void {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab') as TabId | null;

    if (tabParam && ['environments', 'reports', 'certificates', 'status', 'admin'].includes(tabParam)) {
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

<div class="container mx-auto px-4 py-8">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
      Puppet
    </h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      Manage Puppet environments, reports, and certificates
    </p>
  </div>

  <!-- Tabs -->
  <div class="mb-6 border-b border-gray-200 dark:border-gray-700">
    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
      <button
        type="button"
        onclick={() => switchTab('environments')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'environments'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Environments
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('reports')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'reports'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Reports
        </div>
      </button>

      <button
        type="button"
        onclick={() => switchTab('certificates')}
        class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'certificates'
          ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}"
      >
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Certificates
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
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin
          </div>
        </button>
      {/if}
    </nav>
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    <!-- Environments Tab -->
    {#if activeTab === 'environments'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Environments</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            Puppetserver
          </span>
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View and manage Puppet environments available on your Puppetserver.
        </p>
        <EnvironmentSelector showDeployButton={true} />
      </div>
    {/if}

    <!-- Reports Tab -->
    {#if activeTab === 'reports'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Reports</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
            PuppetDB
          </span>
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View recent Puppet run reports from all nodes. Click on a report to view details.
        </p>

        {#if reportsLoading}
          <div class="flex justify-center py-12">
            <LoadingSpinner size="lg" message="Loading reports..." />
          </div>
        {:else if reportsError}
          <ErrorAlert
            message="Failed to load Puppet reports"
            details={reportsError}
            onRetry={fetchAllReports}
          />
        {:else if reports.length === 0}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No reports found</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No Puppet run reports are available in PuppetDB.
            </p>
          </div>
        {:else}
          <PuppetReportsListView reports={reports} onReportClick={handleReportClick} />
          <div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Showing {reports.length} most recent report{reports.length !== 1 ? 's' : ''}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Certificates Tab -->
    {#if activeTab === 'certificates'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Certificate Management</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            Puppetserver
          </span>
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Manage Puppet certificates for all nodes in your infrastructure.
        </p>
        <CertificateManagement />
      </div>
    {/if}

    <!-- Status Tab -->
    {#if activeTab === 'status'}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppetserver Status</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            Puppetserver
          </span>
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View detailed status information, services, and metrics from your Puppetserver.
        </p>
        <PuppetserverStatus />
      </div>
    {/if}

    <!-- Admin Tab (PuppetDB only) -->
    {#if activeTab === 'admin' && isPuppetDBActive}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">PuppetDB Administration</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
            PuppetDB
          </span>
        </div>
        <p class="mb-6 text-sm text-gray-600 dark:text-gray-400">
          View PuppetDB administrative information including archive status and database statistics.
        </p>
        <PuppetDBAdmin />
      </div>
    {/if}
  </div>
</div>
