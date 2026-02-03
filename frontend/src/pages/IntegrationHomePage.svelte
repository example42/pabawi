<!--
  Integration Home Page

  Dynamic page for displaying integration capabilities with tab navigation.
  Auto-generates tabs from plugin capabilities and embeds appropriate widgets.

  Route: /integrations/:integrationName
  Deep linking: /integrations/bolt?tab=commands

  @component
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';
  import { auth } from '../lib/auth.svelte';
  import type { Component } from 'svelte';

  // Types
  interface IntegrationTab {
    id: string;
    label: string;
    capability: string;
    widget?: string;
    icon?: string;
    priority: number;
  }

  interface Integration {
    name: string;
    displayName: string;
    description: string;
    color?: string;
    icon?: string;
    enabled: boolean;
    healthy: boolean;
    path: string;
    tabs: IntegrationTab[];
  }

  interface MenuResponse {
    categories: Array<{
      type: string;
      label: string;
      integrations: Integration[];
    }>;
    legacy: Array<{
      label: string;
      path: string;
      icon?: string;
    }>;
  }

  // Get integration name from route params
  const integrationName = $derived(router.params.integrationName as string);

  // Get active tab from query params
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab');

  // Get user capabilities for widget filtering
  const userCapabilities = $derived(auth.permissions?.allowed ?? []);

  // State
  let integration = $state<Integration | null>(null);
  let currentTab = $state<IntegrationTab | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let widgetComponent = $state<Component | null>(null);
  let widgetLoading = $state(false);
  let widgetError = $state<string | null>(null);

  /**
   * Widget component mapping for dynamic imports
   */
  const widgetComponents: Record<string, () => Promise<{ default: Component }>> = {
    // PuppetDB widgets
    'puppetdb:node-browser': () => import('../widgets/puppetdb/NodeBrowser.svelte'),
    'puppetdb:facts-explorer': () => import('../widgets/puppetdb/FactsExplorer.svelte'),
    'puppetdb:reports-viewer': () => import('../widgets/puppetdb/ReportsViewer.svelte'),
    'puppetdb:reports-summary': () => import('../widgets/puppetdb/ReportsSummary.svelte'),
    'puppetdb:events-viewer': () => import('../widgets/puppetdb/EventsViewer.svelte'),
    'puppetdb:catalog-viewer': () => import('../widgets/puppetdb/CatalogViewer.svelte'),

    // Bolt widgets (examples - add as needed)
    // 'bolt:command-executor': () => import('../components/CommandExecutor.svelte'),
    // 'bolt:task-runner': () => import('../components/TaskRunner.svelte'),
  };

  /**
   * Load integration data from menu API
   */
  async function loadIntegration() {
    loading = true;
    error = null;

    try {
      const menuData = await get<MenuResponse>('/api/integrations/menu');

      // Find this integration in the menu data
      for (const category of menuData.categories) {
        const found = category.integrations.find(i => i.name === integrationName);
        if (found) {
          integration = found;

          // Set current tab (from URL param or first tab)
          if (initialTab) {
            currentTab = found.tabs.find(t => t.id === initialTab) || found.tabs[0] || null;
          } else {
            currentTab = found.tabs[0] || null;
          }

          break;
        }
      }

      if (!integration) {
        error = `Integration "${integrationName}" not found`;
        showError(`Integration "${integrationName}" not found`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load integration';
      error = message;
      showError(message);
      console.error('Failed to load integration:', err);
    } finally {
      loading = false;
    }
  }

  /**
   * Set active tab and update URL
   */
  function setTab(tab: IntegrationTab) {
    currentTab = tab;

    // Update URL with tab query param
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab.id);
    window.history.pushState({}, '', url.toString());

    // Load widget for this tab
    void loadWidgetForTab(tab);
  }

  /**
   * Load widget component for the active tab
   */
  async function loadWidgetForTab(tab: IntegrationTab) {
    if (!tab.widget) {
      widgetComponent = null;
      return;
    }

    const loader = widgetComponents[tab.widget];
    if (!loader) {
      widgetError = `Widget component not found: ${tab.widget}`;
      widgetComponent = null;
      return;
    }

    widgetLoading = true;
    widgetError = null;

    try {
      const module = await loader();
      widgetComponent = module.default;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load widget';
      widgetError = message;
      widgetComponent = null;
      console.error(`Failed to load widget ${tab.widget}:`, err);
    } finally {
      widgetLoading = false;
    }
  }

  /**
   * Get SVG path for icon
   */
  function getIconPath(icon?: string): string {
    if (!icon) return '';

    // Icon mapping for common icons
    const iconPaths: Record<string, string> = {
      terminal: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      play: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      server: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
      database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
      info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      list: 'M4 6h16M4 12h16M4 18h16',
      folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
      'file-text': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'pie-chart': 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z',
    };

    return iconPaths[icon] || iconPaths.info;
  }

  // Load integration on mount
  onMount(() => {
    void loadIntegration();
  });

  // Load widget when currentTab changes
  $effect(() => {
    if (currentTab) {
      void loadWidgetForTab(currentTab);
    }
  });
</script>

{#if loading}
  <div class="p-6">
    <SkeletonLoader height="200px" />
    <div class="mt-4">
      <SkeletonLoader height="400px" />
    </div>
  </div>
{:else if error}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Integration Not Found</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-400">{error}</p>
      <button
        onclick={() => router.navigate('/')}
        class="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
      >
        Go to Home
      </button>
    </div>
  </div>
{:else if integration}
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Integration Header -->
    <header class="border-b bg-white dark:border-gray-700 dark:bg-gray-800" style="border-bottom-color: {integration.color || '#6B7280'}">
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div class="flex items-center gap-4">
          <!-- Icon -->
          {#if integration.icon}
            <div class="flex h-16 w-16 items-center justify-center rounded-lg" style="background-color: {integration.color}20; color: {integration.color}">
              <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIconPath(integration.icon)} />
              </svg>
            </div>
          {/if}

          <!-- Title and Description -->
          <div class="flex-1">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {integration.displayName}
            </h1>
            <p class="mt-1 text-gray-600 dark:text-gray-400">
              {integration.description}
            </p>
          </div>

          <!-- Health Status -->
          <div class="flex items-center gap-2">
            {#if integration.healthy}
              <span class="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <span class="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400"></span>
                Healthy
              </span>
            {:else}
              <span class="flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                <span class="h-2 w-2 rounded-full bg-yellow-600 dark:bg-yellow-400"></span>
                Degraded
              </span>
            {/if}
          </div>
        </div>

        <!-- Tab Navigation -->
        {#if integration.tabs.length > 0}
          <nav class="mt-6 flex gap-1 border-b border-gray-200 dark:border-gray-700" aria-label="Tabs">
            {#each integration.tabs as tab}
              <button
                onclick={() => setTab(tab)}
                class="flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors"
                class:border-primary-600={currentTab?.id === tab.id}
                class:text-primary-600={currentTab?.id === tab.id}
                class:dark:border-primary-400={currentTab?.id === tab.id}
                class:dark:text-primary-400={currentTab?.id === tab.id}
                class:border-transparent={currentTab?.id !== tab.id}
                class:text-gray-600={currentTab?.id !== tab.id}
                class:hover:text-gray-900={currentTab?.id !== tab.id}
                class:dark:text-gray-400={currentTab?.id !== tab.id}
                class:dark:hover:text-gray-300={currentTab?.id !== tab.id}
                aria-current={currentTab?.id === tab.id ? 'page' : undefined}
              >
                {#if tab.icon}
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIconPath(tab.icon)} />
                  </svg>
                {/if}
                <span>{tab.label}</span>
              </button>
            {/each}
          </nav>
        {/if}
      </div>
    </header>

    <!-- Tab Content -->
    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {#if currentTab}
        {#if currentTab.widget}
          <!-- Render widget using dynamic component loading -->
          <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <div class="mb-4 flex items-center gap-2 border-b border-gray-200 pb-4 dark:border-gray-700">
              <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIconPath(currentTab.icon)} />
              </svg>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{currentTab.label}</h2>
            </div>

            <!-- Widget Content -->
            <div class="widget-container">
              {#if widgetLoading}
                <div class="flex items-center justify-center py-12">
                  <div class="text-center">
                    <div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600"></div>
                    <p class="mt-4 text-gray-600 dark:text-gray-400">Loading widget...</p>
                  </div>
                </div>
              {:else if widgetError}
                <div class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <div class="flex">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-red-800 dark:text-red-400">Widget Load Error</h3>
                      <p class="mt-1 text-sm text-red-700 dark:text-red-300">{widgetError}</p>
                    </div>
                  </div>
                </div>
              {:else if widgetComponent}
                <!-- Dynamically render the widget component -->
                {@const Component = widgetComponent}
                <Component integration={integration.name} />
              {:else}
                <div class="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                  <p class="text-yellow-800 dark:text-yellow-400">
                    Widget <code class="rounded bg-yellow-100 px-2 py-1 font-mono text-xs dark:bg-yellow-800">{currentTab.widget}</code> is not available.
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- No widget available - show capability info -->
          <div class="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-800">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Widget Available</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              No widget is configured for {currentTab.label}
            </p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-500">
              Capability: <code class="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-700">{currentTab.capability}</code>
            </p>
          </div>
        {/if}
      {:else}
        <div class="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-800">
          <p class="text-gray-600 dark:text-gray-400">No tabs available for this integration.</p>
        </div>
      {/if}
    </main>
  </div>
{/if}

<style>
  /* Ensure smooth transitions for tab switching */
  .widget-container {
    min-height: 400px;
  }
</style>
