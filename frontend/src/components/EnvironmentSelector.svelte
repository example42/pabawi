<script lang="ts">
  import { post } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { debugMode } from '../lib/debug';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface EnvironmentSettings {
    modulepath?: string[];
    manifest?: string[];
    environment_timeout?: number | string;
    config_version?: string;
  }

  interface Environment {
    name: string;
    last_deployed?: string;
    status?: 'deployed' | 'deploying' | 'failed';
    settings?: EnvironmentSettings;
  }

  interface EnvironmentSelectorProps {
    selectedEnvironment?: string;
    onSelect?: (environment: string) => void;
    showFlushButton?: boolean;
    onDebugInfo?: (info: DebugInfo | null) => void;
  }

  let {
    selectedEnvironment = $bindable(),
    onSelect,
    showFlushButton = false,
    onDebugInfo
  }: EnvironmentSelectorProps = $props();

  // State
  let environments = $state<Environment[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let flushingEnvironment = $state<string | null>(null);
  let confirmDialog = $state<{ show: boolean; environment?: string }>({
    show: false
  });
  let expandedEnvironments = $state<Set<string>>(new Set());

  // Load environments
  async function loadEnvironments(): Promise<void> {
    if (debugMode.enabled) {
      console.log('[EnvironmentSelector] Loading environments');
      console.log('[EnvironmentSelector] API endpoint: POST /api/v1/capabilities/puppetserver.environments/execute');
    }

    try {
      loading = true;
      error = null;
      const startTime = performance.now();
      const data = await post<{ environments: Environment[]; source: string; count: number; _debug?: DebugInfo }>('/api/v1/capabilities/puppetserver.environments/execute', {});
      const endTime = performance.now();

      environments = data.environments;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }

      if (debugMode.enabled) {
        console.log('[EnvironmentSelector] Loaded', environments.length, 'environments');
        console.log('[EnvironmentSelector] Response time:', Math.round(endTime - startTime), 'ms');
        console.log('[EnvironmentSelector] Data:', data);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load environments';
      showError('Failed to load environments', error);
    } finally {
      loading = false;
    }
  }

  // Handle environment selection
  function handleSelect(environmentName: string): void {
    selectedEnvironment = environmentName;
    if (onSelect) {
      onSelect(environmentName);
    }
  }

  // Toggle environment details
  function toggleEnvironmentDetails(environmentName: string): void {
    const newExpanded = new Set(expandedEnvironments);
    if (newExpanded.has(environmentName)) {
      newExpanded.delete(environmentName);
    } else {
      newExpanded.add(environmentName);
    }
    expandedEnvironments = newExpanded;
  }

  // Flush environment cache
  async function flushEnvironmentCache(environmentName: string): Promise<void> {
    if (debugMode.enabled) {
      console.log('[EnvironmentSelector] Flushing cache for environment:', environmentName);
      console.log('[EnvironmentSelector] API endpoint: POST /api/v1/capabilities/puppetserver.environment.cache.flush/execute');
    }

    try {
      flushingEnvironment = environmentName;
      const startTime = performance.now();
      await post(`/api/v1/capabilities/puppetserver.environment.cache.flush/execute`, { name: environmentName });
      const endTime = performance.now();

      if (debugMode.enabled) {
        console.log('[EnvironmentSelector] Environment cache flushed successfully');
        console.log('[EnvironmentSelector] Response time:', Math.round(endTime - startTime), 'ms');
      }

      showSuccess('Cache flushed', `Successfully flushed cache for environment: ${environmentName}`);
      await loadEnvironments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to flush environment cache';

      if (debugMode.enabled) {
        console.error('[EnvironmentSelector] Flush failed:', err);
      }

      showError('Failed to flush environment cache', message);
    } finally {
      flushingEnvironment = null;
    }
  }

  // Show confirmation dialog
  function showConfirmDialog(environmentName: string): void {
    confirmDialog = { show: true, environment: environmentName };
  }

  // Close confirmation dialog
  function closeConfirmDialog(): void {
    confirmDialog = { show: false };
  }

  // Handle confirmation
  async function handleConfirm(): Promise<void> {
    if (confirmDialog.environment) {
      await flushEnvironmentCache(confirmDialog.environment);
    }
    closeConfirmDialog();
  }

  // Format date
  function formatDate(dateString?: string): string {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  }

  // Format timeout value
  function formatTimeout(timeout?: number | string): string {
    if (timeout === undefined || timeout === null) return 'Not set';
    if (timeout === 'unlimited' || timeout === 0) return 'Unlimited';
    if (typeof timeout === 'number') return `${timeout}s`;
    return String(timeout);
  }

  // Get status badge color
  function getStatusColor(status?: 'deployed' | 'deploying' | 'failed'): string {
    switch (status) {
      case 'deployed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'deploying':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Load environments on mount
  $effect(() => {
    loadEnvironments();
  });
</script>

<div class="environment-selector">
  <!-- Header -->
  <div class="mb-4 flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Puppet Environments</h3>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Select an environment to view or manage
      </p>
    </div>
    <button
      type="button"
      onclick={loadEnvironments}
      disabled={loading}
      class="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
    >
      <svg class="h-4 w-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  </div>

  <!-- Loading State -->
  {#if loading && environments.length === 0}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner />
    </div>
  {:else if error && environments.length === 0}
    <!-- Error State -->
    <div class="rounded-md bg-red-50 p-4 dark:bg-red-900/10">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800 dark:text-red-400">Error loading environments</h3>
          <p class="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    </div>
  {:else if environments.length === 0}
    <!-- Empty State -->
    <div class="rounded-md bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No environments found</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        No Puppet environments are available
      </p>
    </div>
  {:else}
    <!-- Environment List -->
    <div class="space-y-2">
      {#each environments as env (env.name)}
        <div
          class="rounded-lg border p-4 transition-colors {selectedEnvironment === env.name ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/10' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'}"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <button
                type="button"
                onclick={() => handleSelect(env.name)}
                class="text-left w-full"
              >
                <div class="flex items-center gap-2">
                  <h4 class="text-base font-semibold text-gray-900 dark:text-white">
                    {env.name}
                  </h4>
                  {#if env.status}
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(env.status)}">
                      {env.status}
                    </span>
                  {/if}
                  {#if selectedEnvironment === env.name}
                    <svg class="h-5 w-5 text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </div>
              </button>

              <!-- Environment Details Toggle -->
              {#if env.settings}
                <button
                  type="button"
                  onclick={() => toggleEnvironmentDetails(env.name)}
                  class="mt-2 flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <svg
                    class="h-4 w-4 transition-transform {expandedEnvironments.has(env.name) ? 'rotate-90' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  {expandedEnvironments.has(env.name) ? 'Hide' : 'Show'} details
                </button>
              {/if}

              <!-- Expanded Environment Details -->
              {#if expandedEnvironments.has(env.name) && env.settings}
                <div class="mt-3 space-y-2 rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900/50">
                  {#if env.settings.environment_timeout !== undefined}
                    <div class="flex justify-between">
                      <span class="font-medium text-gray-700 dark:text-gray-300">Timeout:</span>
                      <span class="text-gray-600 dark:text-gray-400">{formatTimeout(env.settings.environment_timeout)}</span>
                    </div>
                  {/if}

                  {#if env.settings.modulepath && env.settings.modulepath.length > 0}
                    <div>
                      <span class="font-medium text-gray-700 dark:text-gray-300">Module Path:</span>
                      <ul class="mt-1 space-y-1 text-gray-600 dark:text-gray-400">
                        {#each env.settings.modulepath as path}
                          <li class="truncate font-mono text-xs">{path}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}

                  {#if env.settings.manifest && env.settings.manifest.length > 0}
                    <div>
                      <span class="font-medium text-gray-700 dark:text-gray-300">Manifest:</span>
                      <ul class="mt-1 space-y-1 text-gray-600 dark:text-gray-400">
                        {#each env.settings.manifest as path}
                          <li class="truncate font-mono text-xs">{path}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}

                  {#if env.settings.config_version}
                    <div class="flex justify-between">
                      <span class="font-medium text-gray-700 dark:text-gray-300">Config Version:</span>
                      <span class="truncate font-mono text-xs text-gray-600 dark:text-gray-400">{env.settings.config_version}</span>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            {#if showFlushButton}
              <button
                type="button"
                onclick={() => showConfirmDialog(env.name)}
                disabled={flushingEnvironment === env.name}
                class="ml-4 inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Flush environment cache to reload code changes"
              >
                {#if flushingEnvironment === env.name}
                  <svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Flushing...
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Flush Cache
                {/if}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Results Count -->
    <div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
      {environments.length} environment{environments.length !== 1 ? 's' : ''} available
    </div>
  {/if}

  <!-- Confirmation Dialog -->
  {#if confirmDialog.show}
    <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <button
          type="button"
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onclick={closeConfirmDialog}
          aria-label="Close dialog"
        ></button>

        <!-- Center modal -->
        <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        <div class="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div class="bg-white px-4 pb-4 pt-5 dark:bg-gray-800 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20 sm:mx-0 sm:h-10 sm:w-10">
                <svg class="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">
                  Flush Environment Cache
                </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Are you sure you want to flush the cache for the <strong>{confirmDialog.environment}</strong> environment?
                  </p>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    This will force Puppet Server to reload all code and data for this environment on the next request.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 dark:bg-gray-900 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              onclick={handleConfirm}
              class="inline-flex w-full justify-center rounded-md bg-orange-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Flush Cache
            </button>
            <button
              type="button"
              onclick={closeConfirmDialog}
              class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:ml-0 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
