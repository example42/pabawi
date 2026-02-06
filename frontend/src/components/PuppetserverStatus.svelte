<script lang="ts">
  import { onMount } from 'svelte';
  import { post } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { debugMode } from '../lib/debug';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface Props {
    onDebugInfo?: (info: DebugInfo | null) => void;
  }

  let { onDebugInfo }: Props = $props();

  // State
  let servicesStatus = $state<any>(null);
  let simpleStatus = $state<any>(null);
  let metrics = $state<any>(null);

  let servicesLoading = $state(false);
  let simpleLoading = $state(false);
  let metricsLoading = $state(false);

  let servicesError = $state<string | null>(null);
  let simpleError = $state<string | null>(null);
  let metricsError = $state<string | null>(null);

  let showMetricsWarning = $state(true);

  // Fetch services status
  async function fetchServicesStatus(): Promise<void> {
    servicesLoading = true;
    servicesError = null;

    if (debugMode.enabled) {
      console.log('[PuppetserverStatus] Fetching services status');
      console.log('[PuppetserverStatus] API endpoint: POST /api/v1/capabilities/puppetserver.status.services/execute');
    }

    try {
      const startTime = performance.now();
      const data = await post<{ services: any; _debug?: DebugInfo }>('/api/v1/capabilities/puppetserver.status.services/execute', {});
      const endTime = performance.now();

      servicesStatus = data.services;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }

      if (debugMode.enabled) {
        console.log('[PuppetserverStatus] Services status loaded successfully');
        console.log('[PuppetserverStatus] Response time:', Math.round(endTime - startTime), 'ms');
        console.log('[PuppetserverStatus] Data:', data);
      }
    } catch (err) {
      servicesError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching services status:', err);
      showError('Failed to load services status', servicesError);
    } finally {
      servicesLoading = false;
    }
  }

  // Fetch simple status
  async function fetchSimpleStatus(): Promise<void> {
    simpleLoading = true;
    simpleError = null;

    if (debugMode.enabled) {
      console.log('[PuppetserverStatus] Fetching simple status');
      console.log('[PuppetserverStatus] API endpoint: POST /api/v1/capabilities/puppetserver.status/execute');
    }

    try {
      const startTime = performance.now();
      const data = await post<{ status: any; _debug?: DebugInfo }>('/api/v1/capabilities/puppetserver.status/execute', {});
      const endTime = performance.now();

      simpleStatus = data.status;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }

      if (debugMode.enabled) {
        console.log('[PuppetserverStatus] Simple status loaded successfully');
        console.log('[PuppetserverStatus] Response time:', Math.round(endTime - startTime), 'ms');
        console.log('[PuppetserverStatus] Data:', data);
      }
    } catch (err) {
      simpleError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching simple status:', err);
      showError('Failed to load simple status', simpleError);
    } finally {
      simpleLoading = false;
    }
  }



  // Fetch metrics (with warning)
  async function fetchMetrics(): Promise<void> {
    metricsLoading = true;
    metricsError = null;

    if (debugMode.enabled) {
      console.log('[PuppetserverStatus] Fetching metrics');
      console.log('[PuppetserverStatus] API endpoint: POST /api/v1/capabilities/puppetserver.metrics/execute');
      console.log('[PuppetserverStatus] WARNING: This endpoint can be resource-intensive');
    }

    try {
      const startTime = performance.now();
      const data = await post<{ metrics: any; _debug?: DebugInfo }>('/api/v1/capabilities/puppetserver.metrics/execute', {});
      const endTime = performance.now();

      metrics = data.metrics;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }

      if (debugMode.enabled) {
        console.log('[PuppetserverStatus] Metrics loaded successfully');
        console.log('[PuppetserverStatus] Response time:', Math.round(endTime - startTime), 'ms');
        console.log('[PuppetserverStatus] Data:', data);
      }
    } catch (err) {
      metricsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching metrics:', err);
      showError('Failed to load metrics', metricsError);
    } finally {
      metricsLoading = false;
    }
  }

  // Load metrics with user confirmation
  function loadMetrics(): void {
    if (showMetricsWarning) {
      showMetricsWarning = false;
      fetchMetrics();
    } else {
      fetchMetrics();
    }
  }

  // On mount, fetch all status information except metrics
  onMount(() => {
    fetchServicesStatus();
    fetchSimpleStatus();
  });
</script>

<div class="space-y-6">
  <!-- Expert Mode Info Banner -->
  {#if debugMode.enabled}
    <div class="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-amber-900 dark:text-amber-200">Expert Mode Active - Puppetserver Status</h4>
          <div class="mt-2 space-y-2 text-xs text-amber-800 dark:text-amber-300">
            <div>
              <p class="font-medium">API Endpoints:</p>
              <ul class="ml-4 mt-1 list-disc space-y-1">
                <li><code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">POST /api/v1/capabilities/puppetserver.status/execute</code> - Basic health check</li>
                <li><code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">POST /api/v1/capabilities/puppetserver.status.services/execute</code> - Detailed service status</li>
                <li><code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">POST /api/v1/capabilities/puppetserver.metrics/execute</code> - JMX metrics via Jolokia (resource-intensive)</li>
              </ul>
            </div>
            <div>
              <p class="font-medium">Setup Requirements:</p>
              <ul class="ml-4 mt-1 list-disc space-y-1">
                <li>Puppetserver must be running and accessible</li>
                <li>Status API endpoints must be enabled in Puppetserver configuration</li>
                <li>Authentication credentials must be configured (token or SSL certificates)</li>
                <li>Network access to Puppetserver port (typically 8140)</li>
              </ul>
            </div>
            <div>
              <p class="font-medium">Troubleshooting:</p>
              <ul class="ml-4 mt-1 list-disc space-y-1">
                <li>Check browser console for detailed API logs and response times</li>
                <li>Verify Puppetserver is running: <code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">systemctl status puppetserver</code></li>
                <li>Test endpoints directly: <code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">curl -k https://puppetserver:8140/status/v1/simple</code></li>
                <li>Review Puppetserver logs: <code class="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/50">/var/log/puppetlabs/puppetserver/puppetserver.log</code></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Simple Status -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Simple Status</h3>
      <button
        type="button"
        onclick={fetchSimpleStatus}
        class="rounded-md px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
        disabled={simpleLoading}
      >
        Refresh
      </button>
    </div>

    {#if debugMode.enabled && !simpleLoading && !simpleError}
      <div class="mb-3 text-xs text-gray-600 dark:text-gray-400">
        <span class="font-medium">Endpoint:</span> <code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">POST /api/v1/capabilities/puppetserver.status/execute</code>
      </div>
    {/if}

    {#if simpleLoading}
      <div class="flex justify-center py-8">
        <LoadingSpinner size="md" message="Loading status..." />
      </div>
    {:else if simpleError}
      <ErrorAlert message="Failed to load simple status" details={simpleError} onRetry={fetchSimpleStatus} />
    {:else if simpleStatus}
      <div class="rounded-md bg-gray-50 p-4 dark:bg-gray-900/50">
        <pre class="text-sm text-gray-900 dark:text-gray-100">{JSON.stringify(simpleStatus, null, 2)}</pre>
      </div>
    {:else}
      <p class="text-sm text-gray-500 dark:text-gray-400">No status data available</p>
    {/if}
  </div>

  <!-- Services Status -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Services Status</h3>
      <button
        type="button"
        onclick={fetchServicesStatus}
        class="rounded-md px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
        disabled={servicesLoading}
      >
        Refresh
      </button>
    </div>

    {#if debugMode.enabled && !servicesLoading && !servicesError}
      <div class="mb-3 text-xs text-gray-600 dark:text-gray-400">
        <span class="font-medium">Endpoint:</span> <code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">POST /api/v1/capabilities/puppetserver.status.services/execute</code>
      </div>
    {/if}

    {#if servicesLoading}
      <div class="flex justify-center py-8">
        <LoadingSpinner size="md" message="Loading services..." />
      </div>
    {:else if servicesError}
      <ErrorAlert message="Failed to load services status" details={servicesError} onRetry={fetchServicesStatus} />
    {:else if servicesStatus}
      <div class="rounded-md bg-gray-50 p-4 dark:bg-gray-900/50">
        <pre class="text-sm text-gray-900 dark:text-gray-100">{JSON.stringify(servicesStatus, null, 2)}</pre>
      </div>
    {:else}
      <p class="text-sm text-gray-500 dark:text-gray-400">No services data available</p>
    {/if}
  </div>



  <!-- Metrics (with warning) -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Metrics (Jolokia)</h3>
      {#if !showMetricsWarning && metrics}
        <button
          type="button"
          onclick={fetchMetrics}
          class="rounded-md px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
          disabled={metricsLoading}
        >
          Refresh
        </button>
      {/if}
    </div>

    {#if debugMode.enabled && !showMetricsWarning && !metricsLoading && !metricsError}
      <div class="mb-3 text-xs text-gray-600 dark:text-gray-400">
        <span class="font-medium">Endpoint:</span> <code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">POST /api/v1/capabilities/puppetserver.metrics/execute</code>
        <span class="ml-2 text-red-600 dark:text-red-400 font-medium">⚠️ Resource-intensive operation</span>
      </div>
    {/if}

    {#if showMetricsWarning}
      <div class="rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3 flex-1">
            <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">Performance Warning</h4>
            <p class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              The metrics endpoint can be resource-intensive on your Puppetserver. Loading metrics may temporarily impact server performance. Use this feature sparingly.
            </p>
            {#if debugMode.enabled}
              <div class="mt-3 text-xs text-yellow-700 dark:text-yellow-300">
                <p class="font-medium">Technical Details:</p>
                <ul class="ml-4 mt-1 list-disc space-y-1">
                  <li>Metrics are retrieved via Jolokia JMX bridge</li>
                  <li>Large metric datasets can consume significant memory</li>
                  <li>Response times may be slow (5-30 seconds typical)</li>
                  <li>Consider using dedicated monitoring tools for production</li>
                </ul>
              </div>
            {/if}
            <div class="mt-4">
              <button
                type="button"
                onclick={loadMetrics}
                class="rounded-md bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200 dark:hover:bg-yellow-900"
              >
                I understand, load metrics
              </button>
            </div>
          </div>
        </div>
      </div>
    {:else if metricsLoading}
      <div class="flex justify-center py-8">
        <LoadingSpinner size="md" message="Loading metrics..." />
      </div>
    {:else if metricsError}
      <ErrorAlert message="Failed to load metrics" details={metricsError} onRetry={fetchMetrics} />
    {:else if metrics}
      <div class="rounded-md bg-gray-50 p-4 dark:bg-gray-900/50">
        <pre class="text-sm text-gray-900 dark:text-gray-100">{JSON.stringify(metrics, null, 2)}</pre>
      </div>
    {:else}
      <p class="text-sm text-gray-500 dark:text-gray-400">Click "I understand, load metrics" to view metrics data</p>
    {/if}
  </div>
</div>
