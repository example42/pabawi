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
  import { onMount, onDestroy } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { auth } from '../lib/auth.svelte';
  import WidgetSlot from '../lib/plugins/WidgetSlot.svelte';

  // Health check polling interval (30 seconds)
  const HEALTH_CHECK_INTERVAL = 30000;

  // Types
  interface Props {
    params?: Record<string, string>;
  }

  interface PluginInfo {
    metadata: {
      name: string;
      version: string;
      author: string;
      description: string;
      integrationType: string;
      integrationTypes?: string[];
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

  interface HealthStatus {
    plugin: string;
    healthy: boolean;
    message: string;
    lastCheck: string;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
  }

  interface CategoryTab {
    id: string;
    label: string;
    count: number;
  }

  // Receive params as component prop (passed by Router)
  let { params }: Props = $props();

  // Get plugin name from route params
  const pluginName = $derived(params?.integrationName || '');

  // Get user capabilities for widget filtering
  const userCapabilities = $derived(auth.permissions?.allowed ?? []);

  // Plugin info (loaded on-demand)
  let pluginInfo = $state<PluginInfo | null>(null);
  let healthStatus = $state<HealthStatus | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeTab = $state<string>('overview');
  let categoryTabs = $state<CategoryTab[]>([]);
  let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Group capabilities by category and create tabs
   */
  function buildCategoryTabs(info: PluginInfo): CategoryTab[] {
    const categories = new Map<string, number>();

    // Count capabilities per category
    for (const cap of info.capabilities) {
      const count = categories.get(cap.category) || 0;
      categories.set(cap.category, count + 1);
    }

    // Create tabs for categories with capabilities
    const tabs: CategoryTab[] = [
      { id: 'overview', label: 'Overview', count: 0 }
    ];

    const categoryOrder = ['inventory', 'command', 'task', 'info', 'events', 'reports', 'package'];
    const categoryLabels: Record<string, string> = {
      inventory: 'Inventory',
      command: 'Commands',
      task: 'Tasks',
      info: 'Information',
      events: 'Events',
      reports: 'Reports',
      package: 'Packages',
    };

    for (const category of categoryOrder) {
      const count = categories.get(category);
      if (count && count > 0) {
        tabs.push({
          id: category,
          label: categoryLabels[category] || category,
          count,
        });
      }
    }

    return tabs;
  }

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
      categoryTabs = buildCategoryTabs(data);

      // Also fetch health status separately for more detailed information
      await loadHealthStatus();
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
   * Load health status for the plugin
   */
  async function loadHealthStatus() {
    try {
      const health = await get<HealthStatus>(`/api/v1/plugins/${pluginName}/health`);
      healthStatus = health;

      // Update pluginInfo.healthy to match health status
      if (pluginInfo) {
        pluginInfo.healthy = health.healthy;
      }
    } catch (err) {
      console.error('Failed to load health status:', err);
      // Don't show error toast for health check failures - just log it
      // The UI will show the basic healthy status from pluginInfo
    }
  }

  /**
   * Start polling for health status updates
   */
  function startHealthPolling() {
    // Clear any existing interval
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }

    // Poll health status every 30 seconds
    healthCheckInterval = setInterval(() => {
      void loadHealthStatus();
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop polling for health status updates
   */
  function stopHealthPolling() {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  }

  /**
   * Retry loading plugin info
   */
  function retryLoad() {
    void loadPluginInfo();
  }



  // Load plugin info on mount
  onMount(() => {
    void loadPluginInfo();
    // Start polling for health status updates
    startHealthPolling();
  });

  // Cleanup on unmount
  onDestroy(() => {
    stopHealthPolling();
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
              <div class="mt-2 flex items-center gap-3 flex-wrap">
                {#if pluginInfo.metadata.integrationTypes}
                  {#each pluginInfo.metadata.integrationTypes as integrationType}
                    <IntegrationBadge integration={integrationType} variant="badge" size="sm" />
                  {/each}
                {:else}
                  <IntegrationBadge integration={pluginInfo.metadata.integrationType} variant="badge" size="sm" />
                {/if}
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  by {pluginInfo.metadata.author}
                </span>
              </div>
            </div>
          </div>

          <!-- Health Status Badge -->
          <div class="flex items-center gap-2">
            {#if pluginInfo.healthy}
              <div class="flex flex-col items-end gap-1">
                <span class="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <span class="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400"></span>
                  Healthy
                </span>
                {#if healthStatus?.lastCheck}
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    Last checked: {new Date(healthStatus.lastCheck).toLocaleTimeString()}
                  </span>
                {/if}
              </div>
            {:else}
              <div class="flex flex-col items-end gap-1">
                <span class="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  <span class="h-2 w-2 rounded-full bg-red-600 dark:bg-red-400"></span>
                  Offline
                </span>
                {#if healthStatus?.message}
                  <span class="text-xs text-red-600 dark:text-red-400 max-w-xs text-right">
                    {healthStatus.message}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Plugin Content -->
      <div class="space-y-6">
        <!-- Health Status Details (shown when offline or has failing capabilities) -->
        {#if healthStatus && (!pluginInfo.healthy || (healthStatus.failingCapabilities && healthStatus.failingCapabilities.length > 0))}
          <div class="rounded-lg bg-red-50 p-6 shadow dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <div class="flex items-start gap-3">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-200">
                  Plugin Health Issues
                </h3>
                <p class="mt-1 text-sm text-red-800 dark:text-red-300">
                  {healthStatus.message}
                </p>

                {#if healthStatus.failingCapabilities && healthStatus.failingCapabilities.length > 0}
                  <div class="mt-4">
                    <h4 class="text-sm font-medium text-red-900 dark:text-red-200">
                      Failing Capabilities:
                    </h4>
                    <ul class="mt-2 space-y-1">
                      {#each healthStatus.failingCapabilities as capability}
                        <li class="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400"></span>
                          {capability}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if healthStatus.workingCapabilities && healthStatus.workingCapabilities.length > 0}
                  <div class="mt-4">
                    <h4 class="text-sm font-medium text-green-900 dark:text-green-200">
                      Working Capabilities:
                    </h4>
                    <ul class="mt-2 space-y-1">
                      {#each healthStatus.workingCapabilities as capability}
                        <li class="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400"></span>
                          {capability}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                <div class="mt-4">
                  <p class="text-sm text-red-800 dark:text-red-300">
                    Check the plugin configuration and ensure all required services are running.
                    {#if pluginInfo.metadata.homepage}
                      Visit the <a href={pluginInfo.metadata.homepage} target="_blank" rel="noopener noreferrer" class="underline hover:text-red-900 dark:hover:text-red-200">plugin homepage</a> for setup instructions.
                    {/if}
                  </p>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Category Tabs -->
        {#if categoryTabs.length > 1}
          <div class="rounded-lg bg-white shadow dark:bg-gray-800">
            <div class="border-b border-gray-200 dark:border-gray-700">
              <nav class="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                {#each categoryTabs as tab}
                  <button
                    onclick={() => activeTab = tab.id}
                    class="whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                      {activeTab === tab.id
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                  >
                    {tab.label}
                    {#if tab.count > 0}
                      <span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">
                        {tab.count}
                      </span>
                    {/if}
                  </button>
                {/each}
              </nav>
            </div>
          </div>
        {/if}

        {#if pluginInfo.metadata.homepage}
          <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
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

        <!-- Tab Content -->
        {#if activeTab === 'overview'}
          <!-- Overview Tab - Show dashboard and standalone-page widgets -->
          <div class="space-y-6">
            <!-- Dashboard widgets (detailed tools) -->
            <WidgetSlot
              slot="dashboard"
              layout="grid"
              context={{ pluginName, pluginInfo }}
              {userCapabilities}
              showEmptyState={false}
              showLoadingStates={true}
            />

            <!-- Standalone page widgets (full-page content) -->
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
        {:else}
          <!-- Category Tab - Show filtered dashboard and standalone-page widgets -->
          <div class="space-y-6">
            <!-- Dashboard widgets filtered by category -->
            <WidgetSlot
              slot="dashboard"
              layout="grid"
              context={{ pluginName, pluginInfo, category: activeTab }}
              {userCapabilities}
              filterByCategory={activeTab}
              showEmptyState={false}
              showLoadingStates={true}
            />

            <!-- Standalone page widgets filtered by category -->
            <WidgetSlot
              slot="standalone-page"
              layout="stack"
              context={{ pluginName, pluginInfo, category: activeTab }}
              {userCapabilities}
              filterByCategory={activeTab}
              showEmptyState={true}
              emptyMessage="No widgets available for this category."
              showLoadingStates={true}
            />
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
