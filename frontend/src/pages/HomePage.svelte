<script lang="ts">
  /**
   * Dashboard Page (HomePage)
   *
   * Part of Progressive Loading Architecture (home-page-loading-fixes)
   *
   * Main landing page with:
   * - Home summary tiles (progressive loading via home-summary widget slot)
   * - Dashboard widget slots
   * - Expert mode debug panel
   *
   * Page renders immediately with no blocking data fetching.
   * Tiles load independently and progressively.
   *
   * @module pages/HomePage
   */
  import { onMount } from 'svelte';
  import DebugPanel from '../components/DebugPanel.svelte';
  import IntegrationStatus from '../components/IntegrationStatus.svelte';
  import { WidgetSlot } from '../lib/plugins';
  import { auth } from '../lib/auth.svelte';
  import { debugMode } from '../lib/debug';
  import type { LabeledDebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Dashboard';

  // Get user capabilities for widget filtering
  let userCapabilities = $derived(auth.permissions?.allowed ?? []);

  // Debug info state for expert mode
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });
  });

  // Integration status state
  let integrations = $state<IntegrationStatusData[]>([]);
  let integrationsLoading = $state(true);
  let integrationsError = $state<string | null>(null);

  interface IntegrationStatusData {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured' | 'degraded';
    lastCheck: string;
    message?: string;
    details?: unknown;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
  }

  /**
   * Fetch integration status from backend
   */
  async function fetchIntegrationStatus(refresh = false): Promise<void> {
    integrationsLoading = true;
    integrationsError = null;

    try {
      const { get } = await import('../lib/api');

      interface PluginsResponse {
        plugins: Array<{
          name: string;
          displayName: string;
          description: string;
          integrationType: string;
          enabled: boolean;
          healthy: boolean;
          capabilities: Array<{
            name: string;
            category: string;
          }>;
        }>;
      }

      const data = await get<PluginsResponse>('/api/v1/plugins');

      // Convert plugin data to integration status format
      integrations = data.plugins.map(plugin => ({
        name: plugin.name,
        type: 'both' as const, // Default to both for now
        status: plugin.healthy ? 'connected' as const : 'disconnected' as const,
        lastCheck: new Date().toISOString(),
        message: plugin.healthy ? 'Connected' : 'Disconnected',
      }));
    } catch (err) {
      integrationsError = err instanceof Error ? err.message : 'Failed to load integration status';
      console.error('Failed to fetch integration status:', err);
    } finally {
      integrationsLoading = false;
    }
  }

  onMount(() => {
    document.title = pageTitle;
    // Fetch integration status on mount
    void fetchIntegrationStatus();
  });
</script>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Welcome to Pabawi - Infrastructure Management Interface
      </p>
    </div>
  </div>

  <!-- Integration Status Panels -->
  <section class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <IntegrationStatus
        {integrations}
        loading={integrationsLoading}
        onRefresh={() => fetchIntegrationStatus(true)}
      />
    </div>
  </section>

  <!-- Home Summary Tiles (Progressive Loading) -->
  <section class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Quick Overview</h2>

      <!-- Widget slot for home-summary tiles -->
      <!-- Each tile loads independently, no blocking -->
      <WidgetSlot
        slot="home-summary"
        layout="grid"
        columns={3}
        gap="4"
        {userCapabilities}
        showEmptyState={true}
        emptyMessage="No summary widgets available."
        debug={debugMode.enabled}
      />
    </div>
  </section>

  <!-- Dashboard Widget Slot (v1.0.0 Plugin System) -->
  <section class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Dashboard Widgets</h2>
        <span class="text-xs text-gray-400 dark:text-gray-500">Widgets from enabled plugins</span>
      </div>
      <WidgetSlot
        slot="dashboard"
        layout="grid"
        columns={2}
        gap="4"
        {userCapabilities}
        showEmptyState={true}
        emptyMessage="No dashboard widgets available. Enable plugins to add widgets here."
        debug={debugMode.enabled}
      />
    </div>
  </section>

  <!-- Sidebar Widget Slot (v1.0.0 Plugin System) -->
  <section class="bg-white dark:bg-gray-800 shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-white">Quick Actions</h2>
      </div>
      <WidgetSlot
        slot="sidebar"
        layout="stack"
        {userCapabilities}
        showEmptyState={false}
        debug={debugMode.enabled}
      />
    </div>
  </section>

  <!-- Expert Mode Debug Panel -->
  {#if debugMode.enabled && sortedDebugInfoBlocks.length > 0}
    <div class="mt-8 space-y-4">
      {#each sortedDebugInfoBlocks as block (block.label)}
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{block.label}</h3>
          <DebugPanel debugInfo={block.debugInfo} />
        </div>
      {/each}
    </div>
  {/if}
</div>
