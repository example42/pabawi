<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationStatus from '../components/IntegrationStatus.svelte';
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
    status: 'connected' | 'disconnected' | 'error';
    lastCheck: string;
    message?: string;
    details?: unknown;
  }

  interface IntegrationStatusResponse {
    integrations: IntegrationStatusData[];
    timestamp: string;
    cached: boolean;
  }

  let nodes = $state<Node[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let integrations = $state<IntegrationStatusData[]>([]);
  let integrationsLoading = $state(true);
  let integrationsError = $state<string | null>(null);

  async function fetchInventory(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ nodes: Node[] }>('/api/inventory');
      nodes = data.nodes || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load inventory';
      console.error('Error fetching inventory:', err);
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
      const data = await get<IntegrationStatusResponse>(url);
      integrations = data.integrations || [];
    } catch (err) {
      integrationsError = err instanceof Error ? err.message : 'Failed to load integration status';
      console.error('Error fetching integration status:', err);
      // Set empty array on error so the page still renders
      integrations = [];
    } finally {
      integrationsLoading = false;
    }
  }

  function handleRefreshIntegrations(): void {
    void fetchIntegrationStatus(true);
  }

  onMount(() => {
    // Fetch inventory and integration status but don't block rendering
    void fetchInventory();
    void fetchIntegrationStatus();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Welcome Section -->
  <div class="mb-12 text-center">
    <h1 class="text-5xl font-bold text-gray-900 dark:text-white mb-4">
      Welcome to Pabawi
    </h1>
    <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
      A powerful web interface for managing and executing Puppet Bolt tasks across your infrastructure
    </p>
  </div>

  <!-- Quick Stats -->
  <div class="grid gap-6 mb-12 md:grid-cols-3">
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Quick Actions</p>
          <p class="text-2xl font-semibold text-gray-900 dark:text-white">Available</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Integration Status Section -->
  <div class="mb-12">
    {#if integrationsError}
      <ErrorAlert
        message="Failed to load integration status"
        details={integrationsError}
        onRetry={() => fetchIntegrationStatus(true)}
      />
    {:else}
      <IntegrationStatus
        {integrations}
        loading={integrationsLoading}
        onRefresh={handleRefreshIntegrations}
      />
    {/if}
  </div>

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

  <!-- Features -->
  <div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center mb-4">
        <svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 class="ml-3 text-lg font-medium text-gray-900 dark:text-white">Inventory Management</h3>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        View and manage all your infrastructure nodes in one place
      </p>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center mb-4">
        <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 class="ml-3 text-lg font-medium text-gray-900 dark:text-white">Execute Commands</h3>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Run ad-hoc commands across your infrastructure with ease
      </p>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center mb-4">
        <svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 class="ml-3 text-lg font-medium text-gray-900 dark:text-white">Task Execution</h3>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Execute Bolt tasks and track their progress in real-time
      </p>
    </div>
  </div>
</div>
