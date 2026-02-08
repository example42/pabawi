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

  // Receive params as component prop (passed by Router)
  let { params }: Props = $props();

  // Get plugin name from route params
  const pluginName = $derived(params?.integrationName || '');

  // Get user capabilities for widget filtering
  const userCapabilities = $derived(auth.permissions?.allowed ?? []);

  // Plugin info (loaded on-demand)
  let pluginInfo = $state<PluginInfo | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

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

      <!-- Plugin Content -->
      <div class="space-y-6">
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

        <!-- Plugin-specific widgets (standalone-page slot) -->
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
  {/if}
</div>
