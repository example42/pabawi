<!--
  PuppetDB Catalog Viewer Widget

  Displays compiled catalogs for nodes with resource filtering and relationship visualization.
  Shows catalog resources, their parameters, and dependencies.

  Features:
  - Resource list with type filtering
  - Resource parameter display
  - Resource relationships (requires/before/notify/subscribe)
  - Catalog metadata (version, environment, producer)
  - Search and filtering

  @module plugins/native/puppetdb/frontend/CatalogViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { formatTimestamp } from '../../../../frontend/src/lib/utils';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface CatalogResource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    parameters: Record<string, unknown>;
    file?: string;
    line?: number;
  }

  interface CatalogEdge {
    source: {
      type: string;
      title: string;
    };
    target: {
      type: string;
      title: string;
    };
    relationship: 'contains' | 'before' | 'required-by' | 'notifies' | 'subscription-of';
  }

  interface Catalog {
    certname: string;
    version: string;
    environment: string;
    producer_timestamp: string;
    transaction_uuid: string;
    catalog_uuid: string;
    code_id: string | null;
    resources: CatalogResource[];
    edges: CatalogEdge[];
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Integration name (for API calls) */
    integration?: string;
    /** Node certname (required) */
    certname?: string;
    /** Show resource relationships */
    showRelationships?: boolean;
    /** Show parameters */
    showParameters?: boolean;
  }

  let {
    integration = 'puppetdb',
    certname = undefined,
    showRelationships = true,
    showParameters = true,
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let catalog = $state<Catalog | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Filters
  let resourceTypeFilter = $state<string>('all');
  let searchTerm = $state('');
  let selectedResource = $state<CatalogResource | null>(null);

  // Derived state
  let resourceTypes = $derived.by(() => {
    if (!catalog) return [];
    const types = new Set<string>();
    catalog.resources.forEach(resource => types.add(resource.type));
    return Array.from(types).sort();
  });

  let filteredResources = $derived.by(() => {
    if (!catalog) return [];

    return catalog.resources.filter(resource => {
      // Resource type filter
      if (resourceTypeFilter !== 'all' && resource.type !== resourceTypeFilter) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          resource.type.toLowerCase().includes(search) ||
          resource.title.toLowerCase().includes(search) ||
          resource.tags.some(tag => tag.toLowerCase().includes(search))
        );
      }

      return true;
    });
  });

  let resourceRelationships = $derived.by(() => {
    if (!catalog || !selectedResource) return [];

    const resourceKey = `${selectedResource.type}[${selectedResource.title}]`;
    return catalog.edges.filter(edge => {
      const sourceKey = `${edge.source.type}[${edge.source.title}]`;
      const targetKey = `${edge.target.type}[${edge.target.title}]`;
      return sourceKey === resourceKey || targetKey === resourceKey;
    });
  });

  // ==========================================================================
  // Functions
  // ==========================================================================

  async function loadCatalog() {
    if (!certname) {
      error = 'No certname provided';
      return;
    }

    loading = true;
    error = null;
    selectedResource = null;

    try {
      const response = await get<Catalog>(`/api/puppetdb/catalog/${certname}`);
      catalog = response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load catalog';
      error = message;
      catalog = null;
      console.error('Failed to load catalog:', err);
    } finally {
      loading = false;
    }
  }

  function selectResource(resource: CatalogResource) {
    selectedResource = resource === selectedResource ? null : resource;
  }

  function getRelationshipColor(relationship: string): string {
    switch (relationship) {
      case 'contains':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
      case 'before':
        return 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400';
      case 'required-by':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
      case 'notifies':
        return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'subscription-of':
        return 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    if (certname) {
      void loadCatalog();
    }
  });
</script>

<div class="puppetdb-catalog-viewer">
  <!-- Header -->
  <header class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Catalog {certname ? `for ${certname}` : ''}
        </h2>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Compiled catalog resources and relationships
        </p>
      </div>

      <button
        onclick={() => loadCatalog()}
        disabled={loading || !certname}
        class="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-600"
      >
        Refresh
      </button>
    </div>

    <!-- Catalog Metadata -->
    {#if catalog && !loading}
      <div class="mt-4 grid grid-cols-4 gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Environment</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{catalog.environment}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Resources</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{catalog.resources.length}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Edges</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{catalog.edges.length}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Producer</p>
          <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatTimestamp(catalog.producer_timestamp)}</p>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="mt-4 flex flex-wrap gap-4">
      <!-- Search -->
      <div class="flex-1 min-w-64">
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Search resources..."
          class="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
        />
      </div>

      {#if resourceTypes.length > 0}
        <!-- Resource Type Filter -->
        <div>
          <label for="catalog-resource-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Resource Type</label>
          <select
            id="catalog-resource-filter"
            bind:value={resourceTypeFilter}
            class="mt-1 rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="all">All Types ({catalog?.resources.length || 0})</option>
            {#each resourceTypes as type}
              <option value={type}>
                {type} ({catalog?.resources.filter(r => r.type === type).length || 0})
              </option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </header>

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner />
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if !certname}
    <div class="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Node Selected</h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Select a node to view its catalog
      </p>
    </div>
  {:else if !catalog}
    <div class="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Catalog Available</h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        No catalog found for this node
      </p>
    </div>
  {:else if filteredResources.length === 0}
    <div class="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Resources Found</h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        No resources match your current filters
      </p>
    </div>
  {:else}
    <!-- Resources Grid -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Resources List -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Resources ({filteredResources.length})
        </h3>

        <div class="max-h-96 overflow-y-auto space-y-2">
          {#each filteredResources as resource}
            <button
              onclick={() => selectResource(resource)}
              class={`w-full text-left rounded-lg border p-3 transition-colors ${
                selectedResource === resource
                  ? 'border-violet-500 bg-violet-50 dark:border-violet-500 dark:bg-violet-900/30'
                  : 'border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-violet-700 dark:hover:bg-violet-900/20'
              }`}
            >
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <p class="truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">
                    {resource.type}[{resource.title}]
                  </p>
                  {#if resource.tags.length > 0}
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each resource.tags.slice(0, 3) as tag}
                        <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          {tag}
                        </span>
                      {/each}
                      {#if resource.tags.length > 3}
                        <span class="text-xs text-gray-500">+{resource.tags.length - 3}</span>
                      {/if}
                    </div>
                  {/if}
                </div>

                {#if resource.exported}
                  <span class="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    Exported
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Resource Details -->
      <div>
        {#if selectedResource}
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Resource Details</h3>

            <!-- Resource Header -->
            <div class="mt-3 rounded-lg bg-violet-50 p-3 dark:bg-violet-900/20">
              <p class="font-mono text-sm font-semibold text-violet-900 dark:text-violet-200">
                {selectedResource.type}[{selectedResource.title}]
              </p>
              {#if selectedResource.file}
                <p class="mt-1 text-xs text-violet-700 dark:text-violet-300">
                  {selectedResource.file}{selectedResource.line ? `:${selectedResource.line}` : ''}
                </p>
              {/if}
            </div>

            <!-- Parameters -->
            {#if showParameters && Object.keys(selectedResource.parameters).length > 0}
              <div class="mt-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Parameters</h4>
                <div class="mt-2 max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <pre class="text-xs">{JSON.stringify(selectedResource.parameters, null, 2)}</pre>
                </div>
              </div>
            {/if}

            <!-- Relationships -->
            {#if showRelationships && resourceRelationships.length > 0}
              <div class="mt-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Relationships</h4>
                <div class="mt-2 space-y-2">
                  {#each resourceRelationships as edge}
                    <div class="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                      <div class="flex items-center gap-2">
                        <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getRelationshipColor(edge.relationship)}`}>
                          {edge.relationship}
                        </span>
                      </div>
                      <div class="mt-1 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p class="font-medium text-gray-500 dark:text-gray-400">Source</p>
                          <p class="font-mono text-gray-900 dark:text-white">
                            {edge.source.type}[{edge.source.title}]
                          </p>
                        </div>
                        <div>
                          <p class="font-medium text-gray-500 dark:text-gray-400">Target</p>
                          <p class="font-mono text-gray-900 dark:text-white">
                            {edge.target.type}[{edge.target.title}]
                          </p>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Tags -->
            {#if selectedResource.tags.length > 0}
              <div class="mt-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</h4>
                <div class="mt-2 flex flex-wrap gap-2">
                  {#each selectedResource.tags as tag}
                    <span class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {tag}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Resource Selected</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Click on a resource to view its details
            </p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .puppetdb-catalog-viewer {
    padding: 0;
  }

  pre {
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  }
</style>
