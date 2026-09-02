<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import {
    get,
  } from '../lib/api';
  import { testAWSConnection } from '../lib/awsApi';
  import { testProxmoxConnection } from '../lib/proxmoxApi';
  import { showSuccess, showError } from '../lib/toast.svelte';

  /**
   * Integration status as returned by GET /api/integrations/status
   * Validates Requirements: 2.1, 2.2
   */
  interface IntegrationStatus {
    name: string;
    type: string;
    status: 'connected' | 'degraded' | 'error' | 'not_configured';
    healthy: boolean;
    message?: string;
    lastCheck?: string;
  }

  interface IntegrationStatusResponse {
    integrations: IntegrationStatus[];
  }

  /** Icon paths for known integration types */
  const INTEGRATION_ICONS: Record<string, string> = {
    proxmox: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
    aws: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
    azure: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
    puppetdb: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
    puppetserver: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    ansible: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    hiera: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    ssh: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
    checkmk: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  /** Integrations that support "Test Connection" */
  const TESTABLE_INTEGRATIONS = ['proxmox', 'aws'];

  /** All integrations that have setup guide pages */
  const ALL_SETUP_GUIDES: { type: string; label: string }[] = [
    { type: 'bolt', label: 'Puppet Bolt' },
    { type: 'puppetdb', label: 'PuppetDB' },
    { type: 'puppetserver', label: 'Puppet Server' },
    { type: 'hiera', label: 'Hiera' },
    { type: 'ansible', label: 'Ansible' },
    { type: 'ssh', label: 'SSH' },
    { type: 'proxmox', label: 'Proxmox' },
    { type: 'aws', label: 'AWS' },
    { type: 'azure', label: 'Azure' },
    { type: 'checkmk', label: 'Checkmk' },
  ];

  // State
  let integrations = $state<IntegrationStatus[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let testingConnection = $state<Record<string, boolean>>({});
  let testResults = $state<Record<string, { success: boolean; message: string }>>({});

  /** Fetch integration status from the backend */
  async function loadStatus(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await get<IntegrationStatusResponse>('/api/integrations/status', {
        maxRetries: 2,
        retryDelay: 1000,
      });
      integrations = response.integrations;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load integration status';
    } finally {
      loading = false;
    }
  }

  /** Get the icon path for an integration, falling back to a generic icon */
  function getIcon(integration: IntegrationStatus): string {
    return INTEGRATION_ICONS[integration.type] ?? INTEGRATION_ICONS[integration.name.toLowerCase()]
      ?? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }

  /** Get status indicator color classes */
  function getStatusColor(status: IntegrationStatus['status']): string {
    switch (status) {
      case 'connected':
        return 'bg-green-400';
      case 'degraded':
        return 'bg-yellow-400';
      case 'error':
        return 'bg-red-400';
      case 'not_configured':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  }

  /** Get status badge classes */
  function getStatusBadgeClasses(status: IntegrationStatus['status']): string {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'not_configured':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  /** Get human-readable status label */
  function getStatusLabel(status: IntegrationStatus['status']): string {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'degraded':
        return 'Degraded';
      case 'error':
        return 'Error';
      case 'not_configured':
        return 'Not Configured';
      default:
        return 'Unknown';
    }
  }

  /** Check if an integration supports test connection */
  function isTestable(integration: IntegrationStatus): boolean {
    const type = integration.type || integration.name.toLowerCase();
    return TESTABLE_INTEGRATIONS.includes(type) && integration.status !== 'not_configured';
  }

  /** Get setup guide URL for an integration type */
  function getSetupUrl(type: string): string {
    return `/integrations/${type}/setup`;
  }

  /** Check if an integration has a setup guide */
  function hasSetupGuide(integration: IntegrationStatus): boolean {
    const type = integration.type || integration.name.toLowerCase();
    return ALL_SETUP_GUIDES.some(g => g.type === type);
  }

  /** Test connection for an integration */
  async function handleTestConnection(integration: IntegrationStatus): Promise<void> {
    const key = integration.name;
    const type = integration.type || integration.name.toLowerCase();
    testingConnection = { ...testingConnection, [key]: true };
    // Clear previous result
    const { [key]: _, ...rest } = testResults;
    testResults = rest;

    try {
      let result: { success: boolean; message: string };
      if (type === 'proxmox') {
        result = await testProxmoxConnection();
      } else if (type === 'aws') {
        result = await testAWSConnection();
      } else {
        return;
      }
      testResults = { ...testResults, [key]: result };
      if (result.success) {
        showSuccess('Connection successful', result.message);
      } else {
        showError('Connection failed', result.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      testResults = { ...testResults, [key]: { success: false, message } };
      showError('Connection test failed', message);
    } finally {
      testingConnection = { ...testingConnection, [key]: false };
    }
  }

  function goBack(): void {
    router.navigate('/');
  }

  onMount(() => {
    void loadStatus();
  });
</script>

<svelte:head>
  <title>Pabawi - Integration Status</title>
</svelte:head>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="mb-8">
    <button
      type="button"
      onclick={goBack}
      class="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Home
    </button>

    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Integration Status</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      View the status of all registered integrations. Configuration is managed via <code class="text-sm bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">backend/.env</code>.
    </p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      <span class="ml-3 text-gray-600 dark:text-gray-400">Loading integration status...</span>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
      <p class="text-sm text-red-700 dark:text-red-300">{error}</p>
      <button
        type="button"
        onclick={() => void loadStatus()}
        class="mt-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 underline"
      >
        Retry
      </button>
    </div>
  {:else if integrations.length === 0}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="mt-4 text-gray-600 dark:text-gray-400">No integrations registered.</p>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-500">
        Configure integrations in <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">backend/.env</code> and restart the application.
      </p>
    </div>
  {:else}
    <!-- Integration cards -->
    <div class="space-y-3">
      {#each integrations as integration (integration.name)}
        {@const testKey = integration.name}
        {@const isTesting = testingConnection[testKey] ?? false}
        {@const testResult = testResults[testKey]}

        <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div class="flex items-center justify-between p-4">
            <div class="flex items-center gap-3">
              <!-- Status indicator dot -->
              <span class="relative flex h-3 w-3 shrink-0">
                {#if integration.status === 'connected'}
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                {/if}
                <span class="relative inline-flex h-3 w-3 rounded-full {getStatusColor(integration.status)}"></span>
              </span>
              <!-- Icon -->
              <svg class="h-6 w-6 text-gray-500 dark:text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(integration)} />
              </svg>
              <!-- Name and message -->
              <div class="min-w-0">
                <span class="font-medium text-gray-900 dark:text-white">{integration.name}</span>
                {#if integration.message}
                  <p class="text-sm text-gray-500 dark:text-gray-400 truncate">{integration.message}</p>
                {/if}
              </div>
            </div>

            <div class="flex items-center gap-3 shrink-0">
              <!-- Setup Guide link -->
              {#if hasSetupGuide(integration)}
                <a
                  href={getSetupUrl(integration.type || integration.name.toLowerCase())}
                  onclick={(e) => { e.preventDefault(); router.navigate(getSetupUrl(integration.type || integration.name.toLowerCase())); }}
                  class="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Setup Guide
                </a>
              {/if}

              <!-- Test Connection button -->
              {#if isTestable(integration)}
                <button
                  type="button"
                  onclick={() => void handleTestConnection(integration)}
                  disabled={isTesting}
                  class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  {#if isTesting}
                    <div class="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-600 dark:border-gray-300"></div>
                    Testing...
                  {:else}
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Test Connection
                  {/if}
                </button>
              {/if}

              <!-- Status badge -->
              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusBadgeClasses(integration.status)}">
                {getStatusLabel(integration.status)}
              </span>
            </div>
          </div>

          <!-- Test result message -->
          {#if testResult}
            <div class="border-t border-gray-200 dark:border-gray-700 px-4 py-3 {testResult.success
              ? 'bg-green-50 dark:bg-green-900/10'
              : 'bg-red-50 dark:bg-red-900/10'}">
              <div class="flex items-start gap-2">
                {#if testResult.success}
                  <svg class="h-5 w-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-sm text-green-700 dark:text-green-300">{testResult.message}</p>
                {:else}
                  <svg class="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-sm text-red-700 dark:text-red-300">{testResult.message}</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- All Setup Guides section -->
    <div class="mt-8">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Integrations Setup guides</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Click to view setup instructions for any integration.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each ALL_SETUP_GUIDES as guide (guide.type)}
          <a
            href={getSetupUrl(guide.type)}
            onclick={(e) => { e.preventDefault(); router.navigate(getSetupUrl(guide.type)); }}
            class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-600 dark:hover:bg-primary-900/10 transition-colors"
          >
            <svg class="h-5 w-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={INTEGRATION_ICONS[guide.type] ?? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
            </svg>
            <div class="min-w-0">
              <span class="font-medium text-gray-900 dark:text-white">{guide.label}</span>
              <p class="text-xs text-gray-500 dark:text-gray-400">View setup instructions</p>
            </div>
            <svg class="h-4 w-4 text-gray-400 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</div>
