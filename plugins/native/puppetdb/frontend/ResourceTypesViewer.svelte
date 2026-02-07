<!--
  PuppetDB Resource Types Viewer Widget

  Displays all resource types available in PuppetDB with counts and details.
  Allows browsing resources by type.

  Features:
  - List all resource types with counts
  - Search/filter resource types
  - View resources by type
  - Resource details view

  @module plugins/native/puppetdb/frontend/ResourceTypesViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context (injected by PluginContextProvider)
  const { ui, api, router } = getPluginContext();
  const { LoadingSpinner, ErrorAlert } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface ResourceType {
    name: string;
    count: number;
    description?: string;
  }

  interface Resource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Widget configuration */
    config?: {
      showCounts?: boolean;
      showSearch?: boolean;
    };
  }

  let {
    config = {
      showCounts: true,
      showSearch: true,
    },
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let resourceTypes = $state<ResourceType[]>([]);
  let selectedType = $state<string | null>(null);
  let resources = $state<Resource[]>([]);
  let selectedResource = $state<Resource | null>(null);
  let searchQuery = $state('');
  let loading = $state(true);
  let loadingResources = $state(false);
  let error = $state<string | null>(null);
  let resourcesError = $state<string | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredTypes = $derived.by(() => {
    if (!searchQuery) return resourceTypes;
    const query = searchQuery.toLowerCase();
    return resourceTypes.filter(type =>
      type.name.toLowerCase().includes(query) ||
      type.description?.toLowerCase().includes(query)
    );
  });

  let totalResources = $derived.by(() => {
    return resourceTypes.reduce((sum, type) => sum + type.count, 0);
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchResourceTypes();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchResourceTypes(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await api.executeCapability<ResourceType[]>('resources.types', {});
      resourceTypes = response.sort((a, b) => b.count - a.count);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load resource types';
    } finally {
      loading = false;
    }
  }

  async function fetchResourcesByType(type: string): Promise<void> {
    loadingResources = true;
    resourcesError = null;
    try {
      const response = await api.executeCapability<Resource[]>('resources.list', {
        resourceType: type,
        limit: 100,
      });
      resources = response;
      selectedType = type;
      selectedResource = null;
    } catch (err) {
      resourcesError = err instanceof Error ? err.message : 'Failed to load resources';
    } finally {
      loadingResources = false;
    }
  }

  async function fetchResourceDetails(type: string, title: string): Promise<void> {
    try {
      const response = await api.executeCapability<Resource>('resources.get', {
        resourceType: type,
        resourceTitle: title,
      });
      selectedResource = response;
    } catch (err) {
      resourcesError = err instanceof Error ? err.message : 'Failed to load resource details';
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function selectType(type: ResourceType): void {
    void fetchResourcesByType(type.name);
  }

  function selectResource(resource: Resource): void {
    void fetchResourceDetails(resource.type, resource.title);
  }

  function backToTypes(): void {
    selectedType = null;
    resources = [];
    selectedResource = null;
  }

  function backToResources(): void {
    selectedResource = null;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function formatCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  }

  function getTypeIcon(typeName: string): string {
    const lower = typeName.toLowerCase();
    if (lower.includes('file')) return '📄';
    if (lower.includes('package')) return '📦';
    if (lower.includes('service')) return '⚙️';
    if (lower.includes('user')) return '👤';
    if (lower.includes('group')) return '👥';
    if (lower.includes('exec')) return '▶️';
    if (lower.includes('cron')) return '⏰';
    if (lower.includes('mount')) return '💾';
    return '🔧';
  }
</script>

<div class="puppetdb-resource-types-viewer h-full flex flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-3">
      {#if selectedType}
        <button
          type="button"
          onclick={selectedResource ? backToResources : backToTypes}
          class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          title="Back"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      {/if}
      <svg class="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {#if selectedResource}
            Resource Details
          {:else if selectedType}
            {selectedType} Resources
          {:else}
            Resource Types
          {/if}
        </h2>
        {#if !selectedResource && config.showCounts}
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {#if selectedType}
              {resources.length} resources
            {:else}
              {resourceTypes.length} types, {formatCount(totalResources)} total resources
            {/if}
          </p>
        {/if}
      </div>
    </div>

    {#if !selectedType && !selectedResource && config.showSearch}
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search types..."
          class="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else if error}
      <ErrorAlert message={error} />
    {:else if selectedResource}
      <!-- Resource Details View -->
      <div class="space-y-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-start justify-between mb-4">
            <div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Type</div>
              <div class="text-lg font-mono font-semibold text-gray-900 dark:text-white">
                {selectedResource.type}
              </div>
            </div>
            {#if selectedResource.exported}
              <span class="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                Exported
              </span>
            {/if}
          </div>

          <div class="mb-4">
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Title</div>
            <div class="text-base font-mono text-gray-900 dark:text-white">
              {selectedResource.title}
            </div>
          </div>

          {#if selectedResource.file}
            <div class="mb-4">
              <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Source</div>
              <div class="text-sm font-mono text-gray-700 dark:text-gray-300">
                {selectedResource.file}{selectedResource.line ? `:${selectedResource.line}` : ''}
              </div>
            </div>
          {/if}

          {#if selectedResource.tags.length > 0}
            <div class="mb-4">
              <div class="text-sm text-gray-500 dark:text-gray-400 mb-2">Tags</div>
              <div class="flex flex-wrap gap-2">
                {#each selectedResource.tags as tag}
                  <span class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                    {tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Parameters -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Parameters</h3>
          {#if Object.keys(selectedResource.parameters).length > 0}
            <div class="space-y-2">
              {#each Object.entries(selectedResource.parameters) as [key, value]}
                <div class="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 min-w-[120px]">
                    {key}
                  </div>
                  <div class="text-sm font-mono text-gray-900 dark:text-white flex-1 break-all">
                    {JSON.stringify(value)}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-gray-500 dark:text-gray-400">No parameters</p>
          {/if}
        </div>
      </div>
    {:else if selectedType}
      <!-- Resources List View -->
      {#if loadingResources}
        <div class="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      {:else if resourcesError}
        <ErrorAlert message={resourcesError} />
      {:else if resources.length === 0}
        <div class="text-center py-12">
          <p class="text-gray-500 dark:text-gray-400">No resources found</p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each resources as resource}
            <button
              type="button"
              onclick={() => selectResource(resource)}
              class="text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="font-mono text-sm font-medium text-gray-900 dark:text-white mb-1">
                    {resource.title}
                  </div>
                  {#if resource.file}
                    <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {resource.file}{resource.line ? `:${resource.line}` : ''}
                    </div>
                  {/if}
                  {#if resource.tags.length > 0}
                    <div class="flex flex-wrap gap-1 mt-2">
                      {#each resource.tags.slice(0, 3) as tag}
                        <span class="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                          {tag}
                        </span>
                      {/each}
                      {#if resource.tags.length > 3}
                        <span class="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                          +{resource.tags.length - 3}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>
                {#if resource.exported}
                  <span class="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                    Exported
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Resource Types List View -->
      {#if filteredTypes.length === 0}
        <div class="text-center py-12">
          <p class="text-gray-500 dark:text-gray-400">
            {searchQuery ? 'No matching resource types found' : 'No resource types available'}
          </p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each filteredTypes as type}
            <button
              type="button"
              onclick={() => selectType(type)}
              class="text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3 flex-1">
                  <span class="text-2xl">{getTypeIcon(type.name)}</span>
                  <div class="flex-1">
                    <div class="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {type.name}
                    </div>
                    {#if type.description}
                      <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {type.description}
                      </div>
                    {/if}
                  </div>
                </div>
                {#if config.showCounts}
                  <div class="flex items-center gap-2">
                    <span class="px-3 py-1 text-sm font-semibold bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 rounded-full">
                      {formatCount(type.count)}
                    </span>
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
