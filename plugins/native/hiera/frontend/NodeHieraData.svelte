<!--
  Node Hiera Data Widget

  Displays all Hiera data resolved for a specific node.

  @module plugins/native/hiera/frontend/NodeHieraData
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  const { ui, api } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  interface NodeData {
    node: string;
    keys: Record<string, unknown>;
    usedKeys: string[];
    unusedKeys: string[];
    hierarchyFiles: Array<{ path: string; exists: boolean; level: string }>;
  }

  interface Props {
    certname: string;
    environment?: string;
    config?: Record<string, unknown>;
  }

  let { certname, environment = 'production', config = {} }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let nodeData = $state<NodeData | null>(null);
  let searchQuery = $state('');
  let showUnused = $state(false);

  let filteredKeys = $derived.by(() => {
    if (!nodeData) return [];
    const keys = Object.entries(nodeData.keys);
    if (!searchQuery) return keys;
    const query = searchQuery.toLowerCase();
    return keys.filter(([key]) => key.toLowerCase().includes(query));
  });

  onMount(() => {
    void loadNodeData();
  });

  async function loadNodeData(): Promise<void> {
    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({ certname });
      if (environment) params.set('environment', environment);

      nodeData = await api.get<NodeData>(`/api/hiera/node?${params}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load node data';
    } finally {
      loading = false;
    }
  }

  function formatValue(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
</script>

<div class="node-hiera-data space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="text-base font-medium text-gray-900 dark:text-white">Node Hiera Data</h3>
    </div>
    {#if nodeData}
      <span class="text-sm text-gray-500 dark:text-gray-400">{Object.keys(nodeData.keys).length} keys</span>
    {/if}
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="md" />
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if nodeData}
    <div class="space-y-3">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search keys..."
        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
      />

      <div class="space-y-2 max-h-96 overflow-y-auto">
        {#each filteredKeys as [key, value] (key)}
          <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="font-mono text-sm text-gray-700 dark:text-gray-300 mb-1">{key}</div>
            <pre class="text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 overflow-x-auto max-h-24 overflow-y-auto text-gray-600 dark:text-gray-400">{formatValue(value)}</pre>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      No Hiera data found for this node
    </div>
  {/if}
</div>
