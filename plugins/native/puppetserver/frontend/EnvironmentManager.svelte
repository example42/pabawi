<!--
  Puppetserver Environment Manager Widget

  Manages Puppet environments from Puppetserver.
  Can be rendered in dashboard or standalone-page slots.

  Features:
  - Environment list with status
  - Deploy/refresh actions
  - Cache flush functionality
  - Environment details view

  @module plugins/native/puppetserver/frontend/EnvironmentManager
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, toast } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Environment {
    name: string;
    modulepath?: string[];
    modules?: string[];
    settings?: Record<string, unknown>;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Show deploy button */
    showDeployButton?: boolean;
    /** Show cache flush button */
    showCacheFlush?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when environment selected */
    onEnvironmentSelect?: (env: Environment) => void;
  }

  let {
    showDeployButton = true,
    showCacheFlush = true,
    compact = false,
    config = {},
    onEnvironmentSelect,
  }: Props = $props();


  // ==========================================================================
  // State
  // ==========================================================================

  let environments = $state<Environment[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedEnv = $state<Environment | null>(null);
  let actionLoading = $state<string | null>(null);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchEnvironments();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchEnvironments(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await api.get<{ environments: Environment[] }>('/api/puppetserver/environments');
      environments = response.environments || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load environments';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function selectEnvironment(env: Environment): void {
    selectedEnv = env;
    onEnvironmentSelect?.(env);
  }

  async function deployEnvironment(envName: string): Promise<void> {
    actionLoading = `deploy-${envName}`;
    try {
      await api.post(`/api/puppetserver/environments/${encodeURIComponent(envName)}/deploy`, {});
      toast.success(`Environment '${envName}' deployment triggered`);
      void fetchEnvironments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      actionLoading = null;
    }
  }

  async function flushCache(envName: string): Promise<void> {
    actionLoading = `flush-${envName}`;
    try {
      await api.post(`/api/puppetserver/environments/${encodeURIComponent(envName)}/cache/flush`, {});
      toast.success(`Cache flushed for '${envName}'`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cache flush failed');
    } finally {
      actionLoading = null;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getEnvColor(name: string): string {
    if (name === 'production') return 'text-red-600 dark:text-red-400';
    if (name === 'development') return 'text-blue-600 dark:text-blue-400';
    if (name === 'staging') return 'text-amber-600 dark:text-amber-400';
    return 'text-gray-600 dark:text-gray-400';
  }

  function getEnvBg(name: string): string {
    if (name === 'production') return 'bg-red-50 dark:bg-red-900/20';
    if (name === 'development') return 'bg-blue-50 dark:bg-blue-900/20';
    if (name === 'staging') return 'bg-amber-50 dark:bg-amber-900/20';
    return 'bg-gray-50 dark:bg-gray-800';
  }
</script>

<div class="puppetserver-environment-manager {compact ? 'space-y-2' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Environments
      </h3>
    </div>
    <button
      type="button"
      onclick={fetchEnvironments}
      disabled={loading}
      class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
      title="Refresh"
    >
      <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Content -->
  {#if loading && environments.length === 0}
    <div class="flex items-center justify-center py-6">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading environments...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if environments.length === 0}
    <div class="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
      No environments found
    </div>
  {:else}
    <div class="space-y-2 {compact ? 'max-h-48' : 'max-h-80'} overflow-y-auto">
      {#each environments as env (env.name)}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onclick={() => selectEnvironment(env)}
            class="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
          >
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full {getEnvBg(env.name)}"></div>
              <span class="font-medium text-sm {getEnvColor(env.name)}">{env.name}</span>
              {#if env.modules}
                <span class="text-xs text-gray-400">({env.modules.length} modules)</span>
              {/if}
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform {selectedEnv?.name === env.name ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if selectedEnv?.name === env.name}
            <div class="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <!-- Module paths -->
              {#if env.modulepath && env.modulepath.length > 0 && !compact}
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span class="font-medium">Module paths:</span>
                  <ul class="mt-1 space-y-0.5">
                    {#each env.modulepath as path}
                      <li class="font-mono truncate">{path}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Actions -->
              <div class="flex gap-2">
                {#if showDeployButton}
                  <button
                    type="button"
                    onclick={() => deployEnvironment(env.name)}
                    disabled={actionLoading !== null}
                    class="flex-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {#if actionLoading === `deploy-${env.name}`}
                      <LoadingSpinner size="xs" />
                    {:else}
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    {/if}
                    Deploy
                  </button>
                {/if}

                {#if showCacheFlush}
                  <button
                    type="button"
                    onclick={() => flushCache(env.name)}
                    disabled={actionLoading !== null}
                    class="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {#if actionLoading === `flush-${env.name}`}
                      <LoadingSpinner size="xs" />
                    {:else}
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    {/if}
                    Flush Cache
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
