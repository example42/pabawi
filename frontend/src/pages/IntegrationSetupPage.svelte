<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import DebugPanel from '../components/DebugPanel.svelte';
  import { debugMode } from '../lib/debug';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import type { Component } from 'svelte';

  interface Props {
    params?: { integration: string };
  }

  let { params }: Props = $props();

  const integration = $derived(params?.integration || '');

  // Dynamic page title based on integration name
  const pageTitle = $derived(
    integration
      ? `Pabawi - ${integration.charAt(0).toUpperCase() + integration.slice(1)} Setup`
      : 'Pabawi - Integration Setup'
  );

  // Debug info state for expert mode
  let debugInfo = $state<DebugInfo | null>(null);

  // Dynamic component loading
  let setupComponent = $state<Component | null>(null);
  let setupComponentLoading = $state(false);
  let setupComponentError = $state<string | null>(null);

  // Component mapping for dynamic imports
  const setupComponents: Record<string, () => Promise<{ default: Component }>> = {
    'puppetserver': () => import('../../../plugins/native/puppetserver/frontend/SetupGuide.svelte'),
    'puppetdb': () => import('../../../plugins/native/puppetdb/frontend/SetupGuide.svelte'),
    'bolt': () => import('../../../plugins/native/bolt/frontend/SetupGuide.svelte'),
    'hiera': () => import('../../../plugins/native/hiera/frontend/SetupGuide.svelte'),
    'ansible': () => import('../../../plugins/native/ansible/frontend/SetupGuide.svelte'),
    'ssh': () => import('../../../plugins/native/ssh/frontend/SetupGuide.svelte'),
  };

  async function loadSetupComponent(integrationName: string): Promise<void> {
    setupComponentLoading = true;
    setupComponentError = null;
    setupComponent = null;

    const loader = setupComponents[integrationName];
    if (!loader) {
      setupComponentError = `No setup guide available for ${integrationName}`;
      setupComponentLoading = false;
      return;
    }

    try {
      const module = await loader();
      setupComponent = module.default;
    } catch (err) {
      setupComponentError = err instanceof Error ? err.message : 'Failed to load setup guide';
      console.error(`Failed to load setup guide for ${integrationName}:`, err);
    } finally {
      setupComponentLoading = false;
    }
  }

  function goBack(): void {
    router.navigate('/');
  }

  async function fetchIntegrationStatus(): Promise<void> {
    // Only fetch if expert mode is enabled
    if (!debugMode.enabled) {
      return;
    }

    try {
      const data = await get<{ plugins: unknown[]; _debug?: DebugInfo }>('/api/v1/plugins');

      // Store debug info if present
      if (data._debug) {
        debugInfo = data._debug;
      }
    } catch (err) {
      console.error('[IntegrationSetupPage] Error fetching integration status:', err);
      // Don't show error to user - this is just for debug info
    }
  }

  onMount(() => {
    debugInfo = null; // Clear debug info on mount
    void fetchIntegrationStatus(); // Fetch integration status for debug info

    // Load setup component for the current integration
    if (integration) {
      void loadSetupComponent(integration);
    }
  });

  // Re-fetch when expert mode is toggled
  $effect(() => {
    if (debugMode.enabled) {
      void fetchIntegrationStatus();
    } else {
      debugInfo = null;
    }
  });

  // Load setup component when integration changes
  $effect(() => {
    if (integration) {
      void loadSetupComponent(integration);
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
  <button
    type="button"
    onclick={goBack}
    class="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
    Back to Home
  </button>

  {#if setupComponentLoading}
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Loading setup guide...</p>
      </div>
    </div>
  {:else if setupComponentError}
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        {integration.charAt(0).toUpperCase() + integration.slice(1)} Integration Setup
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        {setupComponentError}
      </p>
      <p class="mt-4 text-gray-600 dark:text-gray-400">
        No setup instructions available for this integration. Please check the documentation or contact support.
      </p>
    </div>
  {:else if setupComponent}
    {@const Component = setupComponent}
    <Component />
  {:else}
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        Integration Setup
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        No integration specified.
      </p>
    </div>
  {/if}

  <!-- Expert Mode Debug Panel -->
  {#if debugMode.enabled && debugInfo}
    <div class="mt-8">
      <DebugPanel {debugInfo} compact={true} />
    </div>
  {/if}
</div>
