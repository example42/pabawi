<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import ProxmoxProvisionForm from '../components/ProxmoxProvisionForm.svelte';
  import { getProvisioningIntegrations } from '../lib/api';
  import type { ProvisioningIntegration } from '../lib/types/provisioning';

  const pageTitle = 'Provision - Pabawi';

  // State management using Svelte 5 runes (Validates Requirements: 1.4, 2.1, 2.2, 2.3, 2.4)
  let integrations = $state<ProvisioningIntegration[]>([]);
  let selectedIntegration = $state<string>('proxmox');
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filtered integrations - only show those with at least one capability (Validates Requirement: 2.3)
  const displayableIntegrations = $derived.by(() => {
    return integrations.filter(integration => integration.capabilities.length > 0);
  });

  // Integrations to display in cards - show only selected when multiple available
  const cardsToDisplay = $derived.by(() => {
    if (displayableIntegrations.length > 1) {
      return displayableIntegrations.filter(i => i.name === selectedIntegration);
    }
    return displayableIntegrations;
  });

  /**
   * Fetch available provisioning integrations from the backend
   * Validates Requirements: 2.1, 2.2
   */
  async function fetchIntegrations(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await getProvisioningIntegrations();
      integrations = response.integrations || [];

      // Auto-select first available integration if current selection is not available
      if (displayableIntegrations.length > 0) {
        const hasSelected = displayableIntegrations.some(i => i.name === selectedIntegration);
        if (!hasSelected) {
          selectedIntegration = displayableIntegrations[0].name;
        }
      }
    } catch (err) {
      // Validates Requirement: 2.4 - Display error message and log failure
      error = err instanceof Error ? err.message : 'Failed to load provisioning integrations';
      console.error('[ProvisionPage] Error fetching integrations:', err);
      integrations = [];
    } finally {
      loading = false;
    }
  }

  /**
   * Get status badge color based on integration status
   */
  function getStatusColor(status: string): string {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'not_configured':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    }
  }

  /**
   * Get integration type icon
   */
  function getTypeIcon(type: string): string {
    switch (type) {
      case 'virtualization':
        return 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01';
      case 'cloud':
        return 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z';
      case 'container':
        return 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4';
      default:
        return 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z';
    }
  }

  onMount(() => {
    void fetchIntegrations();
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
      Provision Resources
    </h1>
    <p class="text-gray-600 dark:text-gray-400">
      Create and manage virtual machines and containers using available integrations
    </p>
  </div>

  <!-- Loading State (Validates Requirement: 1.4) -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading provisioning integrations..." />
    </div>

  <!-- Error State (Validates Requirement: 2.4) -->
  {:else if error}
    <ErrorAlert
      message="Failed to load provisioning integrations"
      details={error}
      onRetry={fetchIntegrations}
    />

  <!-- Empty State - No integrations available (Validates Requirement: 2.3) -->
  {:else if displayableIntegrations.length === 0}
    <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        No provisioning integrations available
      </h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Configure a provisioning integration (like Proxmox) to get started
      </p>
      <div class="mt-6">
        <a
          href="/setup"
          class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg class="mr-2 -ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configure Integrations
        </a>
      </div>
    </div>

  <!-- Integration List (Validates Requirements: 1.4, 2.2, 2.3) -->
  {:else}
    <div class="space-y-6">
      <!-- Integration Selector - Only show when multiple integrations available (Validates Requirements: 1.4, 2.2) -->
      {#if displayableIntegrations.length > 1}
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav class="-mb-px flex space-x-8" aria-label="Integration selector">
            {#each displayableIntegrations as integration (integration.name)}
              <button
                type="button"
                class="whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors {selectedIntegration === integration.name
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => selectedIntegration = integration.name}
                aria-current={selectedIntegration === integration.name ? 'page' : undefined}
              >
                <div class="flex items-center gap-2">
                  <svg
                    class="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d={getTypeIcon(integration.type)}
                    />
                  </svg>
                  <span>{integration.displayName}</span>
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusColor(integration.status)}"
                  >
                    {integration.status === 'connected' ? '●' : integration.status === 'degraded' ? '◐' : '○'}
                  </span>
                </div>
              </button>
            {/each}
          </nav>
        </div>
      {/if}

      <!-- Integration Cards - Show all when single integration, show selected when multiple -->
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="integration-cards-grid">
        {#each cardsToDisplay as integration (integration.name)}
          <div
            class="rounded-lg border bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 dark:border-gray-700 {selectedIntegration === integration.name ? 'ring-2 ring-blue-500' : 'border-gray-200'}"
          >
            <!-- Integration Header -->
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
                  <svg
                    class="h-6 w-6 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d={getTypeIcon(integration.type)}
                    />
                  </svg>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {integration.displayName}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                    <IntegrationBadge integration={integration.name} variant="badge" size="sm" />
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusColor(integration.status)}"
                    >
                      {integration.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Integration Details -->
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span class="capitalize">{integration.type}</span>
              </div>

              <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{integration.capabilities.length} {integration.capabilities.length === 1 ? 'capability' : 'capabilities'}</span>
              </div>

              <!-- Capabilities List -->
              {#if integration.capabilities.length > 0}
                <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Available Operations:
                  </p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each integration.capabilities as capability}
                      <span
                        class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        title={capability.description}
                      >
                        {capability.name}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Action Button -->
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              {#if integration.status === 'connected'}
                <button
                  type="button"
                  class="w-full inline-flex justify-center items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onclick={() => selectedIntegration = integration.name}
                >
                  <svg class="mr-2 -ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Resource
                </button>
              {:else if integration.status === 'not_configured'}
                <a
                  href="/setup/{integration.name}"
                  class="w-full inline-flex justify-center items-center rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  <svg class="mr-2 -ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Configure
                </a>
              {:else}
                <button
                  type="button"
                  class="w-full inline-flex justify-center items-center rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                  disabled
                >
                  <svg class="mr-2 -ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Degraded
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Provisioning Form (Validates Requirements: 3.1, 4.1) -->
      {#if selectedIntegration === 'proxmox'}
        <ProxmoxProvisionForm />
      {/if}
    </div>
  {/if}
</div>
