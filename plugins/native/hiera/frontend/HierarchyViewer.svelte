<!--
  Hiera Hierarchy Viewer Widget

  Displays the Hiera hierarchy configuration and resolved paths.

  @module plugins/native/hiera/frontend/HierarchyViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  const { ui, api } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  interface HierarchyLevel {
    name: string;
    path: string;
    datadir?: string;
    lookup_key?: string;
  }

  interface HierarchyConfig {
    version: number;
    defaults?: Record<string, unknown>;
    hierarchy: HierarchyLevel[];
  }

  interface Props {
    certname?: string;
    environment?: string;
    config?: Record<string, unknown>;
  }

  let { certname = '', environment = 'production', config = {} }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let hierarchy = $state<HierarchyConfig | null>(null);

  onMount(() => {
    void loadHierarchy();
  });

  async function loadHierarchy(): Promise<void> {
    loading = true;
    error = null;

    try {
      const params = new URLSearchParams();
      if (certname) params.set('certname', certname);
      if (environment) params.set('environment', environment);

      hierarchy = await api.get<HierarchyConfig>(`/api/hiera/hierarchy?${params}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load hierarchy';
    } finally {
      loading = false;
    }
  }
</script>

<div class="hierarchy-viewer space-y-4">
  <div class="flex items-center gap-2">
    <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
    <h3 class="text-base font-medium text-gray-900 dark:text-white">Hiera Hierarchy</h3>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="md" />
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if hierarchy}
    <div class="space-y-2">
      {#each hierarchy.hierarchy as level, i (level.name)}
        <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium">
            {i + 1}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900 dark:text-white">{level.name}</div>
            <div class="text-sm font-mono text-gray-500 dark:text-gray-400 truncate">{level.path}</div>
            {#if level.datadir}
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">datadir: {level.datadir}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      No hierarchy configuration found
    </div>
  {/if}
</div>
