<!--
  Puppetserver Environment Info Widget

  Displays information about Puppet environments.
  Uses Puppetserver's blue color (#2E3A87) for theming.

  Features:
  - List all available environments
  - Show environment details
  - Deploy/refresh environments

  @module plugins/native/puppetserver/frontend/EnvironmentInfo
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Environment {
    name: string;
    last_deployed?: string;
    status?: 'deployed' | 'deploying' | 'failed';
    settings?: {
      modulepath?: string[];
      manifest?: string[];
    };
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let { config = {} }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let environments = $state<Environment[]>([]);
  let selectedEnvironment = $state<Environment | null>(null);
  let deploying = $state<string | null>(null);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void loadEnvironments();
  });

  // ==========================================================================
  // Data Loading
  // ==========================================================================

  async function loadEnvironments(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await api.get<Environment[]>('/api/puppetserver/environments');
      environments = Array.isArray(response) ? response : [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load environments';
    } finally {
      loading = false;
    }
  }

  async function deployEnvironment(envName: string): Promise<void> {
    deploying = envName;
    try {
      await api.post('/api/puppetserver/environments/deploy', { name: envName });
      // Refresh environments list
      await loadEnvironments();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to deploy environment';
    } finally {
      deploying = null;
    }
  }

  function selectEnvironment(env: Environment): void {
    selectedEnvironment = selectedEnvironment?.name === env.name ? null : env;
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-2">
      <div class="p-2 rounded-lg bg-blue-500/20">
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Environments</h3>
    </div>
    <button
      type="button"
      onclick={loadEnvironments}
      disabled={loading}
      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      title="Refresh"
    >
      <svg class="w-5 h-5 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="md" />
    </div>
  {:else if error}
    <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
      <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  {:else if environments.length === 0}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      <p>No environments found.</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each environments as env}
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div
            role="button"
            tabindex="0"
            onclick={() => selectEnvironment(env)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEnvironment(env); } }}
            class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left cursor-pointer"
          >
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full {env.status === 'deployed' ? 'bg-green-500' : env.status === 'deploying' ? 'bg-yellow-500' : 'bg-gray-400'}"></span>
              <span class="font-medium text-gray-900 dark:text-white">{env.name}</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); deployEnvironment(env.name); }}
                disabled={deploying === env.name}
                class="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
              >
                {#if deploying === env.name}
                  <LoadingSpinner size="xs" />
                {:else}
                  Deploy
                {/if}
              </button>
              <svg class="w-4 h-4 text-gray-400 transition-transform {selectedEnvironment?.name === env.name ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {#if selectedEnvironment?.name === env.name}
            <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
              <dl class="space-y-2 text-sm">
                {#if env.last_deployed}
                  <div>
                    <dt class="text-gray-500 dark:text-gray-400">Last Deployed</dt>
                    <dd class="text-gray-900 dark:text-white">{new Date(env.last_deployed).toLocaleString()}</dd>
                  </div>
                {/if}
                {#if env.settings?.modulepath}
                  <div>
                    <dt class="text-gray-500 dark:text-gray-400">Module Path</dt>
                    <dd class="text-gray-900 dark:text-white font-mono text-xs">{env.settings.modulepath.join(':')}</dd>
                  </div>
                {/if}
                {#if env.settings?.manifest}
                  <div>
                    <dt class="text-gray-500 dark:text-gray-400">Manifest</dt>
                    <dd class="text-gray-900 dark:text-white font-mono text-xs">{env.settings.manifest.join(', ')}</dd>
                  </div>
                {/if}
              </dl>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
