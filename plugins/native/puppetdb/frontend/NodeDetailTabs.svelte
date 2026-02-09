<!--
  PuppetDB Node Detail Tabs

  Node-specific tabs for the PuppetDB plugin showing:
  - Facts: View node facts from PuppetDB
  - Reports: View Puppet run reports for this node
  - Events: View resource events from Puppet runs
  - Catalog: View compiled catalog for this node
  - Resources: View node resources (future enhancement)

  @module plugins/native/puppetdb/frontend/NodeDetailTabs
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';
  import FactsExplorer from './FactsExplorer.svelte';
  import ReportsViewer from './ReportsViewer.svelte';
  import EventsViewer from './EventsViewer.svelte';
  import CatalogViewer from './CatalogViewer.svelte';

  // Get plugin context
  const { ui } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node ID (certname) */
    nodeId: string;
    /** Initial active tab */
    initialTab?: 'facts' | 'reports' | 'events' | 'catalog' | 'resources';
  }

  let { nodeId, initialTab = 'facts' }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let activeTab = $state<'facts' | 'reports' | 'events' | 'catalog'>('facts');
  let loading = $state(false);

  // Sync initialTab prop to activeTab state
  $effect(() => {
    activeTab = initialTab;
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    // Any initialization if needed
  });

  // ==========================================================================
  // Tab Management
  // ==========================================================================

  function switchTab(tab: typeof activeTab): void {
    activeTab = tab;
  }
</script>

<!-- Tab Navigation -->
<div class="border-b border-gray-200 dark:border-gray-700 mb-4">
  <nav class="flex gap-4" aria-label="Node Tabs">
    <button
      type="button"
      onclick={() => switchTab('facts')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'facts'
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Facts
    </button>
    <button
      type="button"
      onclick={() => switchTab('reports')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'reports'
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Reports
    </button>
    <button
      type="button"
      onclick={() => switchTab('events')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'events'
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Events
    </button>
    <button
      type="button"
      onclick={() => switchTab('catalog')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'catalog'
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Catalog
    </button>
    <button
      type="button"
      onclick={() => switchTab('resources')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'resources'
        ? 'border-violet-500 text-violet-600 dark:text-violet-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Resources
    </button>
  </nav>
</div>

<!-- Tab Content -->
<div class="puppetdb-node-detail-tabs-content">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  {:else}
    <!-- Facts Tab -->
    {#if activeTab === 'facts'}
      <div class="space-y-4">
        <FactsExplorer
          nodeId={nodeId}
          showSearch={true}
          showExpandAll={true}
          initiallyExpanded={false}
          compact={false}
        />
      </div>
    {/if}

    <!-- Reports Tab -->
    {#if activeTab === 'reports'}
      <div class="space-y-4">
        <ReportsViewer
          nodeId={nodeId}
          limit={20}
          showStatusFilter={true}
          showTimeline={false}
          compact={false}
        />
      </div>
    {/if}

    <!-- Events Tab -->
    {#if activeTab === 'events'}
      <div class="space-y-4">
        <EventsViewer
          certname={nodeId}
          limit={100}
          showStatusFilter={true}
          showResourceFilter={true}
        />
      </div>
    {/if}

    <!-- Catalog Tab -->
    {#if activeTab === 'catalog'}
      <div class="space-y-4">
        <CatalogViewer
          certname={nodeId}
          showRelationships={true}
          showParameters={true}
        />
      </div>
    {/if}

    <!-- Resources Tab -->
    {#if activeTab === 'resources'}
      <div class="text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Node Resources</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Resource type listing and management will be available in the next update.
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
          This will show all resource types managed by Puppet on this node.
        </p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .puppetdb-node-detail-tabs-content {
    min-height: 400px;
  }
</style>
