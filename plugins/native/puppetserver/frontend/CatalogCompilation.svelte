<!--
  Puppetserver Catalog Compilation Widget

  Allows compiling and viewing Puppet catalogs for nodes.
  Uses Puppetserver's blue color (#2E3A87) for theming.

  Features:
  - Compile catalog for a node in a specific environment
  - View catalog resources and edges
  - Compare catalogs between environments

  @module plugins/native/puppetserver/frontend/CatalogCompilation
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

  interface CatalogResource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
  }

  interface Catalog {
    certname: string;
    version: string;
    environment: string;
    resources: CatalogResource[];
    edges?: Array<{
      source: { type: string; title: string };
      target: { type: string; title: string };
      relationship: string;
    }>;
  }

  interface Environment {
    name: string;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node certname */
    nodeId?: string;
    /** Widget configuration */
    config?: Record<string, unknown>;
  }

  let { nodeId = '', config = {} }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(false);
  let error = $state<string | null>(null);
  let catalog = $state<Catalog | null>(null);
  let environments = $state<Environment[]>([]);
  let selectedEnvironment = $state('production');
  let loadingEnvironments = $state(true);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let resourceCount = $derived(catalog?.resources?.length ?? 0);
  let edgeCount = $derived(catalog?.edges?.length ?? 0);

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
    loadingEnvironments = true;
    try {
      const response = await api.get<Environment[]>('/api/puppetserver/environments');
      environments = Array.isArray(response) ? response : [];
      if (environments.length > 0 && !environments.find(e => e.name === selectedEnvironment)) {
        selectedEnvironment = environments[0].name;
      }
    } catch (err) {
      // Default to production if we can't load environments
      environments = [{ name: 'production' }];
    } finally {
      loadingEnvironments = false;
    }
  }

  async function compileCatalog(): Promise<void> {
    if (!nodeId) {
      error = 'Node ID is required';
      return;
    }

    loading = true;
    error = null;
    catalog = null;

    try {
      const response = await api.post<Catalog>('/api/puppetserver/catalog', {
        node: nodeId,
        environment: selectedEnvironment,
      });
      catalog = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to compile catalog';
    } finally {
      loading = false;
    }
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-2">
      <div class="p-2 rounded-lg bg-blue-500/20">
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Catalog Compilation</h3>
    </div>
  </div>

  <!-- Controls -->
  <div class="flex items-center gap-4 mb-4">
    <div class="flex-1">
      <label for="environment" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Environment
      </label>
      <select
        id="environment"
        bind:value={selectedEnvironment}
        disabled={loadingEnvironments}
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {#each environments as env}
          <option value={env.name}>{env.name}</option>
        {/each}
      </select>
    </div>
    <div class="pt-6">
      <button
        type="button"
        onclick={compileCatalog}
        disabled={loading || !nodeId}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
      >
        {#if loading}
          <LoadingSpinner size="sm" />
        {:else}
          Compile Catalog
        {/if}
      </button>
    </div>
  </div>

  <!-- Error -->
  {#if error}
    <div class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
      <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  {/if}

  <!-- Catalog Results -->
  {#if catalog}
    <div class="space-y-4">
      <!-- Summary -->
      <div class="grid grid-cols-3 gap-4">
        <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p class="text-sm text-gray-500 dark:text-gray-400">Resources</p>
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{resourceCount}</p>
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p class="text-sm text-gray-500 dark:text-gray-400">Edges</p>
          <p class="text-2xl font-bold text-gray-700 dark:text-gray-300">{edgeCount}</p>
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p class="text-sm text-gray-500 dark:text-gray-400">Environment</p>
          <p class="text-lg font-semibold text-gray-700 dark:text-gray-300">{catalog.environment}</p>
        </div>
      </div>

      <!-- Resources List -->
      <div>
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Resources</h4>
        <div class="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md">
          {#each catalog.resources.slice(0, 50) as resource}
            <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <div class="flex items-center justify-between">
                <span class="font-mono text-sm text-gray-900 dark:text-white">
                  {resource.type}[{resource.title}]
                </span>
                {#if resource.file}
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {resource.file}:{resource.line}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
          {#if catalog.resources.length > 50}
            <div class="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
              ... and {catalog.resources.length - 50} more resources
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else if !loading && !error}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      <p>Click "Compile Catalog" to generate the catalog for this node.</p>
    </div>
  {/if}
</div>
