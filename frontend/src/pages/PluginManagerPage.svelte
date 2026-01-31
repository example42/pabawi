<!--
  Plugin Manager Page

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 22)

  Provides plugin management UI with:
  - List of all available plugins
  - Plugin details view (metadata, capabilities, widgets)
  - Plugin enable/disable controls
  - Health status monitoring
  - Capability browser

  @module pages/PluginManagerPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import DebugPanel from '../components/DebugPanel.svelte';
  import { AdminOnly } from '../components';
  import { getPluginLoader, type LoadedPlugin, type PluginInfo } from '../lib/plugins';
  import { auth } from '../lib/auth.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { debugMode } from '../lib/debug';
  import type { DebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Plugin Manager';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PluginStats {
    total: number;
    enabled: number;
    healthy: number;
    withWidgets: number;
    capabilities: number;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  const loader = getPluginLoader();

  let plugins = $state<LoadedPlugin[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedPlugin = $state<LoadedPlugin | null>(null);
  let activeTab = $state<'overview' | 'capabilities' | 'widgets'>('overview');
  let filterEnabled = $state<'all' | 'enabled' | 'disabled'>('all');
  let searchQuery = $state('');
  let debugInfo = $state<DebugInfo | null>(null);

  // ==========================================================================
  // Derived State
  // ==========================================================================

  let stats = $derived.by(() => {
    const result: PluginStats = {
      total: plugins.length,
      enabled: plugins.filter(p => p.info.enabled).length,
      healthy: plugins.filter(p => p.info.healthy).length,
      withWidgets: plugins.filter(p => p.widgets.length > 0).length,
      capabilities: plugins.reduce((sum, p) => sum + p.info.capabilities.length, 0),
    };
    return result;
  });

  let filteredPlugins = $derived.by(() => {
    let result = plugins;

    // Filter by enabled state
    if (filterEnabled === 'enabled') {
      result = result.filter(p => p.info.enabled);
    } else if (filterEnabled === 'disabled') {
      result = result.filter(p => !p.info.enabled);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.info.metadata.name.toLowerCase().includes(query) ||
        p.info.metadata.description.toLowerCase().includes(query) ||
        p.info.metadata.integrationType.toLowerCase().includes(query)
      );
    }

    // Sort by name
    result = [...result].sort((a, b) =>
      a.info.metadata.name.localeCompare(b.info.metadata.name)
    );

    return result;
  });

  // ==========================================================================
  // Functions
  // ==========================================================================

  async function fetchPlugins(): Promise<void> {
    loading = true;
    error = null;

    try {
      const loadedPlugins = await loader.loadAll();
      plugins = loadedPlugins;

      // Get debug info from API if expert mode
      if (debugMode.enabled) {
        const response = await get<{ plugins: PluginInfo[]; _debug?: DebugInfo }>('/api/plugins');
        if (response._debug) {
          debugInfo = response._debug;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load plugins';
      console.error('[PluginManagerPage] Error fetching plugins:', err);
      showError('Failed to load plugins', error);
    } finally {
      loading = false;
    }
  }

  async function reloadPlugin(pluginName: string): Promise<void> {
    try {
      const reloaded = await loader.reloadPlugin(pluginName);
      if (reloaded) {
        showSuccess(`Plugin ${pluginName} reloaded successfully`);
        // Update the plugins list
        plugins = [...loader.getAllPlugins().values()];
        // Update selected plugin if it was reloaded
        if (selectedPlugin?.info.metadata.name === pluginName) {
          selectedPlugin = reloaded;
        }
      } else {
        showError('Plugin reload failed', `Could not reload ${pluginName}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showError('Plugin reload failed', message);
    }
  }

  function selectPlugin(plugin: LoadedPlugin): void {
    selectedPlugin = plugin;
    activeTab = 'overview';
  }

  function closeDetails(): void {
    selectedPlugin = null;
  }

  function getStatusColor(plugin: LoadedPlugin): string {
    if (!plugin.info.enabled) {
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
    if (!plugin.info.healthy) {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }

  function getStatusText(plugin: LoadedPlugin): string {
    if (!plugin.info.enabled) return 'Disabled';
    if (!plugin.info.healthy) return 'Unhealthy';
    return 'Healthy';
  }

  function getRiskLevelColor(level: string): string {
    switch (level) {
      case 'read':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'write':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'execute':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'admin':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;
    void fetchPlugins();
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<AdminOnly>
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Plugin Manager
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Manage and monitor Pabawi plugins
          </p>
        </div>
        <button
          type="button"
          onclick={() => fetchPlugins()}
          disabled={loading}
          class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {#if loading}
            <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Refreshing...
          {:else}
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          {/if}
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
      <div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div class="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Total Plugins</div>
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.enabled}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Enabled</div>
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.healthy}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Healthy</div>
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.withWidgets}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">With Widgets</div>
      </div>
      <div class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.capabilities}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Capabilities</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex gap-2">
        <button
          type="button"
          onclick={() => filterEnabled = 'all'}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {filterEnabled === 'all' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}"
        >
          All
        </button>
        <button
          type="button"
          onclick={() => filterEnabled = 'enabled'}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {filterEnabled === 'enabled' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}"
        >
          Enabled
        </button>
        <button
          type="button"
          onclick={() => filterEnabled = 'disabled'}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {filterEnabled === 'disabled' ? 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}"
        >
          Disabled
        </button>
      </div>
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search plugins..."
          class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white sm:w-64"
        />
        <svg class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    {#if loading && plugins.length === 0}
      <LoadingSpinner message="Loading plugins..." />
    {:else if error}
      <ErrorAlert
        title="Failed to load plugins"
        message={error}
        onRetry={fetchPlugins}
      />
    {:else}
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Plugin List -->
        <div class="lg:col-span-2">
          {#if filteredPlugins.length === 0}
            <div class="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-600 dark:bg-gray-800">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 class="mt-4 text-sm font-medium text-gray-900 dark:text-white">No plugins found</h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search query.' : 'No plugins are currently installed.'}
              </p>
            </div>
          {:else}
            <div class="space-y-4">
              {#each filteredPlugins as plugin (plugin.info.metadata.name)}
                <button
                  type="button"
                  onclick={() => selectPlugin(plugin)}
                  class="w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 {selectedPlugin?.info.metadata.name === plugin.info.metadata.name ? 'ring-2 ring-blue-500' : ''}"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex items-start gap-3">
                      <!-- Plugin Icon -->
                      <div class="flex h-10 w-10 items-center justify-center rounded-lg" style="background-color: {plugin.info.metadata.color || '#6B7280'}20;">
                        {#if plugin.info.metadata.icon}
                          <span class="text-lg">{plugin.info.metadata.icon}</span>
                        {:else}
                          <svg class="h-5 w-5" style="color: {plugin.info.metadata.color || '#6B7280'};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                          </svg>
                        {/if}
                      </div>
                      <div>
                        <div class="flex items-center gap-2">
                          <h3 class="font-medium text-gray-900 dark:text-white">
                            {plugin.info.metadata.name}
                          </h3>
                          <span class="text-xs text-gray-500 dark:text-gray-400">
                            v{plugin.info.metadata.version}
                          </span>
                        </div>
                        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {plugin.info.metadata.description}
                        </p>
                        <div class="mt-2 flex items-center gap-2">
                          <IntegrationBadge integration={plugin.info.metadata.integrationType} variant="badge" size="sm" />
                          <span class="text-xs text-gray-500 dark:text-gray-400">
                            {plugin.info.capabilities.length} capabilities • {plugin.widgets.length} widgets
                          </span>
                        </div>
                      </div>
                    </div>
                    <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(plugin)}">
                      {getStatusText(plugin)}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Plugin Details Panel -->
        <div class="lg:col-span-1">
          {#if selectedPlugin}
            <div class="sticky top-4 rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <!-- Header -->
              <div class="border-b border-gray-200 p-4 dark:border-gray-700">
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 items-center justify-center rounded-lg" style="background-color: {selectedPlugin.info.metadata.color || '#6B7280'}20;">
                      {#if selectedPlugin.info.metadata.icon}
                        <span class="text-xl">{selectedPlugin.info.metadata.icon}</span>
                      {:else}
                        <svg class="h-6 w-6" style="color: {selectedPlugin.info.metadata.color || '#6B7280'};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                        </svg>
                      {/if}
                    </div>
                    <div>
                      <h3 class="font-semibold text-gray-900 dark:text-white">
                        {selectedPlugin.info.metadata.name}
                      </h3>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        v{selectedPlugin.info.metadata.version}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onclick={closeDetails}
                    class="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Tabs -->
              <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="flex -mb-px">
                  <button
                    type="button"
                    onclick={() => activeTab = 'overview'}
                    class="flex-1 border-b-2 py-2.5 text-center text-sm font-medium transition-colors {activeTab === 'overview' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onclick={() => activeTab = 'capabilities'}
                    class="flex-1 border-b-2 py-2.5 text-center text-sm font-medium transition-colors {activeTab === 'capabilities' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                  >
                    Capabilities
                  </button>
                  <button
                    type="button"
                    onclick={() => activeTab = 'widgets'}
                    class="flex-1 border-b-2 py-2.5 text-center text-sm font-medium transition-colors {activeTab === 'widgets' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                  >
                    Widgets
                  </button>
                </nav>
              </div>

              <!-- Tab Content -->
              <div class="p-4">
                {#if activeTab === 'overview'}
                  <div class="space-y-4">
                    <div>
                      <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Description</h4>
                      <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {selectedPlugin.info.metadata.description}
                      </p>
                    </div>
                    <div>
                      <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Author</h4>
                      <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {selectedPlugin.info.metadata.author}
                      </p>
                    </div>
                    <div>
                      <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Integration Type</h4>
                      <p class="mt-1">
                        <IntegrationBadge integration={selectedPlugin.info.metadata.integrationType} variant="badge" size="sm" />
                      </p>
                    </div>
                    <div>
                      <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</h4>
                      <div class="mt-1 flex items-center gap-2">
                        <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(selectedPlugin)}">
                          {getStatusText(selectedPlugin)}
                        </span>
                        <span class="text-sm text-gray-500 dark:text-gray-400">
                          Priority: {selectedPlugin.info.priority}
                        </span>
                      </div>
                    </div>
                    {#if selectedPlugin.info.metadata.homepage}
                      <div>
                        <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Homepage</h4>
                        <a
                          href={selectedPlugin.info.metadata.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="mt-1 block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {selectedPlugin.info.metadata.homepage} ↗
                        </a>
                      </div>
                    {/if}
                    {#if selectedPlugin.info.metadata.dependencies && selectedPlugin.info.metadata.dependencies.length > 0}
                      <div>
                        <h4 class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Dependencies</h4>
                        <div class="mt-1 flex flex-wrap gap-1">
                          {#each selectedPlugin.info.metadata.dependencies as dep}
                            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {dep}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    <div class="pt-2">
                      <button
                        type="button"
                        onclick={() => reloadPlugin(selectedPlugin!.info.metadata.name)}
                        class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        Reload Plugin
                      </button>
                    </div>
                  </div>
                {:else if activeTab === 'capabilities'}
                  <div class="space-y-3">
                    {#if selectedPlugin.info.capabilities.length === 0}
                      <p class="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                        No capabilities registered.
                      </p>
                    {:else}
                      {#each selectedPlugin.info.capabilities as capability}
                        <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                          <div class="flex items-start justify-between">
                            <div>
                              <h5 class="font-medium text-gray-900 dark:text-white text-sm">
                                {capability.name}
                              </h5>
                              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {capability.description}
                              </p>
                            </div>
                            <span class="rounded-full px-2 py-0.5 text-xs font-medium {getRiskLevelColor(capability.riskLevel)}">
                              {capability.riskLevel}
                            </span>
                          </div>
                          <div class="mt-2 flex items-center gap-2">
                            <span class="text-xs text-gray-400 dark:text-gray-500">Category:</span>
                            <span class="text-xs text-gray-600 dark:text-gray-300">{capability.category}</span>
                          </div>
                        </div>
                      {/each}
                    {/if}
                  </div>
                {:else if activeTab === 'widgets'}
                  <div class="space-y-3">
                    {#if selectedPlugin.widgets.length === 0}
                      <p class="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                        No widgets registered.
                      </p>
                    {:else}
                      {#each selectedPlugin.widgets as widget}
                        <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                          <div class="flex items-start justify-between">
                            <div>
                              <h5 class="font-medium text-gray-900 dark:text-white text-sm">
                                {widget.name}
                              </h5>
                              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                ID: {widget.id}
                              </p>
                            </div>
                            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {widget.size}
                            </span>
                          </div>
                          <div class="mt-2">
                            <span class="text-xs text-gray-400 dark:text-gray-500">Slots:</span>
                            <div class="mt-1 flex flex-wrap gap-1">
                              {#each widget.slots as slot}
                                <span class="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  {slot}
                                </span>
                              {/each}
                            </div>
                          </div>
                          {#if widget.requiredCapabilities.length > 0}
                            <div class="mt-2">
                              <span class="text-xs text-gray-400 dark:text-gray-500">Required:</span>
                              <div class="mt-1 flex flex-wrap gap-1">
                                {#each widget.requiredCapabilities as cap}
                                  <span class="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                    {cap}
                                  </span>
                                {/each}
                              </div>
                            </div>
                          {/if}
                          <div class="mt-2 flex items-center gap-2">
                            <span class="text-xs {widget.loadState === 'loaded' ? 'text-green-600 dark:text-green-400' : widget.loadState === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}">
                              {widget.loadState}
                            </span>
                            {#if widget.error}
                              <span class="text-xs text-red-500 dark:text-red-400" title={widget.error}>
                                ⚠️
                              </span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-600 dark:bg-gray-800">
              <svg class="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Select a plugin to view details
              </p>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Expert Mode Debug Panel -->
    {#if debugMode.enabled && debugInfo}
      <div class="mt-8">
        <DebugPanel {debugInfo} />
      </div>
    {/if}
  </div>

  {#snippet fallback()}
    <div class="container mx-auto px-4 py-8">
      <div class="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-12 text-center dark:border-amber-600 dark:bg-amber-900/20">
        <svg class="mx-auto h-12 w-12 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 class="mt-4 text-xl font-semibold text-amber-700 dark:text-amber-400">
          Administrator Access Required
        </h2>
        <p class="mt-2 text-sm text-amber-600 dark:text-amber-500">
          You need administrator privileges to access the Plugin Manager.
        </p>
      </div>
    </div>
  {/snippet}
</AdminOnly>
