<!--
  Integration Home Page

  Generic page for displaying plugin home pages with capabilities, widgets, and data.
  Loads full plugin info only when navigating to this page (not during app init).

  Route: /integrations/:integrationName

  @component
  @version 2.0.0
  @spec home-page-loading-fixes
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { auth } from '../lib/auth.svelte';
  import WidgetSlot from '../lib/plugins/WidgetSlot.svelte';

  // Types
  interface PluginInfo {
    metadata: {
      name: string;
      version: string;
      author: string;
      description: string;
      integrationType: string;
      homepage?: string;
      color?: string;
      icon?: string;
    };
    enabled: boolean;
    healthy: boolean;
    widgets: Array<{
      id: string;
      name: string;
      component: string;
      slots: string[];
      size: string;
      requiredCapabilities: string[];
      priority?: number;
    }>;
    capabilities: Array<{
      name: string;
      category: string;
      description: string;
      riskLevel: string;
      requiredPermissions: string[];
    }>;
    priority: number;
  }

  // Get plugin name from route params
  const pluginName = $derived(router.params.integrationName as string);

  // Get user capabilities for widget filtering
  const userCapabilities = $derived(auth.permissions?.allowed ?? []);

  // Plugin info (loaded on-demand)
  let pluginInfo = $state<PluginInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeTab = $state<'overview' | 'capabilities' | 'widgets'>('overview');

  /**
   * Load plugin info when page mounts
   * This is the ONLY place where full plugin info is loaded
   */
  async function loadPluginInfo() {
    loading = true;
    error = null;

    try {
      // Fetch full plugin info (only when navigating to this page)
      const data = await get<PluginInfo>(`/api/v1/plugins/${pluginName}`);
      pluginInfo = data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plugin info';
      error = message;
      showError(`Failed to load ${pluginName}: ${message}`);
      console.error('Failed to load plugin info:', err);
    } finally {
      loading = false;
    }
  }

  /**
   * Retry loading plugin info
   */
  function retryLoad() {
    void loadPluginInfo();
  }

  /**
   * Get risk level color for capability badges
   */
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

  // Load plugin info on mount
  onMount(() => {
    void loadPluginInfo();
  });
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  {#if loading}
    <!-- Loading State -->
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="space-y-6">
        <!-- Header Skeleton -->
        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <SkeletonLoader height="80px" />
        </div>

        <!-- Content Skeleton -->
        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <SkeletonLoader height="400px" />
        </div>
      </div>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="flex min-h-screen items-center justify-center">
      <div class="rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800 max-w-md">
        <svg class="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Failed to Load Plugin</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">{error}</p>
        <div class="mt-6 flex gap-3 justify-center">
          <button
            onclick={retryLoad}
            class="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
          <button
            onclick={() => router.navigate('/')}
            class="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  {:else if pluginInfo}
    <!-- Success State - Plugin Loaded -->
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <!-- Plugin Header -->
      <div class="mb-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-4">
            <!-- Plugin Icon -->
            <div class="flex h-16 w-16 items-center justify-center rounded-lg" style="background-color: {pluginInfo.metadata.color || '#6B7280'}20;">
              {#if pluginInfo.metadata.icon}
                <span class="text-3xl">{pluginInfo.metadata.icon}</span>
              {:else}
                <svg class="h-8 w-8" style="color: {pluginInfo.metadata.color || '#6B7280'};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              {/if}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-3">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                  {pluginInfo.metadata.name}
                </h1>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  v{pluginInfo.metadata.version}
                </span>
              </div>
              <p class="mt-1 text-gray-600 dark:text-gray-400">
                {pluginInfo.metadata.description}
              </p>
              <div class="mt-2 flex items-center gap-3">
                <IntegrationBadge integration={pluginInfo.metadata.integrationType} variant="badge" size="sm" />
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  by {pluginInfo.metadata.author}
                </span>
              </div>
            </div>
          </div>

          <!-- Health Status Badge -->
          <div class="flex items-center gap-2">
            {#if pluginInfo.healthy}
              <span class="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <span class="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400"></span>
                Healthy
              </span>
            {:else}
              <span class="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                <span class="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                Offline
              </span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-6 rounded-lg bg-white shadow dark:bg-gray-800">
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav class="flex -mb-px">
            <button
              type="button"
              onclick={() => activeTab = 'overview'}
              class="flex-1 border-b-2 py-3 text-center text-sm font-medium transition-colors {activeTab === 'overview' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
            >
              Overview
            </button>
            <button
              type="button"
              onclick={() => activeTab = 'capabilities'}
              class="flex-1 border-b-2 py-3 text-center text-sm font-medium transition-colors {activeTab === 'capabilities' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
            >
              Capabilities ({pluginInfo.capabilities.length})
            </button>
            <button
              type="button"
              onclick={() => activeTab = 'widgets'}
              class="flex-1 border-b-2 py-3 text-center text-sm font-medium transition-colors {activeTab === 'widgets' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
            >
              Widgets ({pluginInfo.widgets.length})
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="p-6">
          {#if activeTab === 'overview'}
            <!-- Overview Tab -->
            <div class="space-y-6">
              <!-- Stats -->
              <div class="grid grid-cols-3 gap-4">
                <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                  <div class="text-2xl font-bold text-gray-900 dark:text-white">{pluginInfo.capabilities.length}</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">Capabilities</div>
                </div>
                <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                  <div class="text-2xl font-bold text-gray-900 dark:text-white">{pluginInfo.widgets.length}</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">Widgets</div>
                </div>
                <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                  <div class="text-2xl font-bold text-gray-900 dark:text-white">{pluginInfo.priority}</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">Priority</div>
                </div>
              </div>

              {#if pluginInfo.metadata.homepage}
                <div>
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">Homepage</h3>
                  <a
                    href={pluginInfo.metadata.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 block text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {pluginInfo.metadata.homepage} ↗
                  </a>
                </div>
              {/if}

              <!-- Plugin-specific widgets (standalone-page slot) -->
              <div>
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase mb-4">Plugin Content</h3>
                <WidgetSlot
                  slot="standalone-page"
                  layout="stack"
                  context={{ pluginName, pluginInfo }}
                  {userCapabilities}
                  showEmptyState={true}
                  emptyMessage="No content widgets available for this plugin."
                  showLoadingStates={true}
                />
              </div>
            </div>
          {:else if activeTab === 'capabilities'}
            <!-- Capabilities Tab -->
            <div class="space-y-4">
              {#if pluginInfo.capabilities.length === 0}
                <p class="text-center text-gray-500 dark:text-gray-400 py-8">
                  No capabilities registered for this plugin.
                </p>
              {:else}
                {#each pluginInfo.capabilities as capability}
                  <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <h4 class="font-medium text-gray-900 dark:text-white">
                          {capability.name}
                        </h4>
                        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {capability.description}
                        </p>
                        <div class="mt-2 flex items-center gap-2">
                          <span class="text-xs text-gray-500 dark:text-gray-400">Category:</span>
                          <span class="text-xs text-gray-700 dark:text-gray-300">{capability.category}</span>
                        </div>
                        {#if capability.requiredPermissions.length > 0}
                          <div class="mt-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Required Permissions:</span>
                            <div class="mt-1 flex flex-wrap gap-1">
                              {#each capability.requiredPermissions as perm}
                                <span class="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                  {perm}
                                </span>
                              {/each}
                            </div>
                          </div>
                        {/if}
                      </div>
                      <span class="ml-4 rounded-full px-2.5 py-0.5 text-xs font-medium {getRiskLevelColor(capability.riskLevel)}">
                        {capability.riskLevel}
                      </span>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {:else if activeTab === 'widgets'}
            <!-- Widgets Tab -->
            <div class="space-y-4">
              {#if pluginInfo.widgets.length === 0}
                <p class="text-center text-gray-500 dark:text-gray-400 py-8">
                  No widgets registered for this plugin.
                </p>
              {:else}
                {#each pluginInfo.widgets as widget}
                  <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <h4 class="font-medium text-gray-900 dark:text-white">
                          {widget.name}
                        </h4>
                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          ID: {widget.id}
                        </p>
                        <div class="mt-2">
                          <span class="text-xs text-gray-500 dark:text-gray-400">Slots:</span>
                          <div class="mt-1 flex flex-wrap gap-1">
                            {#each widget.slots as slot}
                              <span class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {slot}
                              </span>
                            {/each}
                          </div>
                        </div>
                        {#if widget.requiredCapabilities.length > 0}
                          <div class="mt-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400">Required Capabilities:</span>
                            <div class="mt-1 flex flex-wrap gap-1">
                              {#each widget.requiredCapabilities as cap}
                                <span class="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                  {cap}
                                </span>
                              {/each}
                            </div>
                          </div>
                        {/if}
                      </div>
                      <span class="ml-4 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {widget.size}
                      </span>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
