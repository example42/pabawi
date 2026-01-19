<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { PuppetserverSetupGuide, PuppetdbSetupGuide, BoltSetupGuide, HieraSetupGuide } from '../components';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';

  interface Props {
    params?: { integration: string };
  }

  let { params }: Props = $props();

  const integration = $derived(params?.integration || '');

  // Debug info state for expert mode
  let debugInfo = $state<DebugInfo | null>(null);

  function goBack(): void {
    router.navigate('/');
  }

  async function fetchIntegrationStatus(): Promise<void> {
    // Only fetch if expert mode is enabled
    if (!expertMode.enabled) {
      return;
    }

    try {
      const data = await get<{ integrations: unknown[]; _debug?: DebugInfo }>('/api/integrations/status');

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
  });

  // Re-fetch when expert mode is toggled
  $effect(() => {
    if (expertMode.enabled) {
      void fetchIntegrationStatus();
    } else {
      debugInfo = null;
    }
  });
</script>

{#if integration === 'puppetserver'}
  <!-- Use the dedicated Puppetserver setup guide component -->
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
    <PuppetserverSetupGuide />

    <!-- Expert Mode Debug Panel -->
    {#if expertMode.enabled && debugInfo}
      <div class="mt-8">
        <ExpertModeDebugPanel {debugInfo} compact={true} />
      </div>
    {/if}
  </div>
{:else if integration === 'puppetdb'}
  <!-- Use the dedicated PuppetDB setup guide component -->
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
    <PuppetdbSetupGuide />

    <!-- Expert Mode Debug Panel -->
    {#if expertMode.enabled && debugInfo}
      <div class="mt-8">
        <ExpertModeDebugPanel {debugInfo} compact={true} />
      </div>
    {/if}
  </div>
{:else if integration === 'bolt'}
  <!-- Use the dedicated Bolt setup guide component -->
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
    <BoltSetupGuide />

    <!-- Expert Mode Debug Panel -->
    {#if expertMode.enabled && debugInfo}
      <div class="mt-8">
        <ExpertModeDebugPanel {debugInfo} compact={true} />
      </div>
    {/if}
  </div>
{:else if integration === 'hiera'}
  <!-- Use the dedicated Hiera setup guide component -->
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
    <HieraSetupGuide />

    <!-- Expert Mode Debug Panel -->
    {#if expertMode.enabled && debugInfo}
      <div class="mt-8">
        <ExpertModeDebugPanel {debugInfo} compact={true} />
      </div>
    {/if}
  </div>
{:else}
  <!-- Generic setup guide for other integrations -->
  <div class="mx-auto max-w-4xl px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
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

      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        {integration.charAt(0).toUpperCase() + integration.slice(1)} Integration Setup
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Setup guide not available for this integration.
      </p>
    </div>

    <!-- Setup Steps -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
        Setup Instructions
      </h2>

      <p class="text-gray-600 dark:text-gray-400">
        No setup instructions available for this integration. Please check the documentation or contact support.
      </p>
    </div>

    <!-- Additional Resources -->
    <div class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
      <div class="flex gap-3">
        <svg
          class="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h3 class="text-sm font-medium text-blue-900 dark:text-blue-200">
            Need Help?
          </h3>
          <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
            Check the backend/.env.example file for more configuration options and examples.
          </p>
        </div>
      </div>
    </div>

    <!-- Expert Mode Debug Panel -->
    {#if expertMode.enabled && debugInfo}
      <div class="mt-8">
        <ExpertModeDebugPanel {debugInfo} compact={true} />
      </div>
    {/if}
  </div>
{/if}
