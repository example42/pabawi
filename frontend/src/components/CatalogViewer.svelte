<script lang="ts">
  interface Resource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
  }

  interface ResourceRef {
    type: string;
    title: string;
  }

  interface Edge {
    source: ResourceRef;
    target: ResourceRef;
    relationship: 'contains' | 'before' | 'require' | 'subscribe' | 'notify';
  }

  interface Catalog {
    certname: string;
    version: string;
    transaction_uuid: string;
    environment: string;
    producer_timestamp: string;
    hash: string;
    resources?: Resource[];
    edges?: Edge[];
  }

  interface Props {
    catalog: Catalog;
    onResourceClick?: (resource: Resource) => void;
    searchable?: boolean;
  }

  let { catalog, onResourceClick, searchable = true }: Props = $props();

  // State
  let searchQuery = $state('');
  let selectedResource = $state<Resource | null>(null);
  let collapsedTypes = $state<Record<string, boolean>>({});

  // Group resources by type
  const resourcesByType = $derived(() => {
    const grouped = new Map<string, Resource[]>();
    const resources = catalog.resources ?? [];

    for (const resource of resources) {
      if (!grouped.has(resource.type)) {
        grouped.set(resource.type, []);
      }
      grouped.get(resource.type)!.push(resource);
    }

    // Sort types alphabetically
    return new Map([...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  });

  // Filter resources based on search query
  const filteredResourcesByType = $derived(() => {
    if (!searchQuery.trim()) {
      return resourcesByType();
    }

    const query = searchQuery.toLowerCase();
    const filtered = new Map<string, Resource[]>();

    for (const [type, resources] of resourcesByType()) {
      const matchingResources = resources.filter(resource =>
        resource.type.toLowerCase().includes(query) ||
        resource.title.toLowerCase().includes(query) ||
        resource.tags.some(tag => tag.toLowerCase().includes(query)) ||
        Object.keys(resource.parameters).some(key => key.toLowerCase().includes(query))
      );

      if (matchingResources.length > 0) {
        filtered.set(type, matchingResources);
      }
    }

    return filtered;
  });

  // Get relationships for a resource
  function getResourceRelationships(resource: Resource): Edge[] {
    const edges = catalog.edges ?? [];
    return edges.filter(edge =>
      (edge.source.type === resource.type && edge.source.title === resource.title) ||
      (edge.target.type === resource.type && edge.target.title === resource.title)
    );
  }

  function toggleType(type: string): void {
    collapsedTypes[type] = !collapsedTypes[type];
  }

  function selectResource(resource: Resource): void {
    selectedResource = resource;
    onResourceClick?.(resource);
  }

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return JSON.stringify(value, null, 2);
  }

  function isComplexValue(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }
</script>

<div class="catalog-viewer space-y-4">
  <!-- Catalog Metadata -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div>
        <span class="text-gray-500 dark:text-gray-400">Environment:</span>
        <span class="ml-2 font-medium text-gray-900 dark:text-gray-100">{catalog.environment}</span>
      </div>
      <div>
        <span class="text-gray-500 dark:text-gray-400">Version:</span>
        <span class="ml-2 font-medium text-gray-900 dark:text-gray-100">{catalog.version}</span>
      </div>
      <div>
        <span class="text-gray-500 dark:text-gray-400">Compiled:</span>
        <span class="ml-2 font-medium text-gray-900 dark:text-gray-100">{formatTimestamp(catalog.producer_timestamp)}</span>
      </div>
      <div>
        <span class="text-gray-500 dark:text-gray-400">Resources:</span>
        <span class="ml-2 font-medium text-gray-900 dark:text-gray-100">{catalog.resources?.length ?? 0}</span>
      </div>
    </div>
  </div>

  <!-- Search Bar -->
  {#if searchable}
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="relative">
        <svg
          class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search resources by type, title, tags, or parameters..."
          class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        {#if searchQuery}
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onclick={() => searchQuery = ''}
            aria-label="Clear search"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
      {#if searchQuery}
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Found {Array.from(filteredResourcesByType().values()).reduce((sum, resources) => sum + resources.length, 0)} resource(s)
        </p>
      {/if}
    </div>
  {/if}

  <!-- Resources by Type -->
  <div class="space-y-2">
    {#if filteredResourcesByType().size === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <p class="text-gray-500 dark:text-gray-400">
          {searchQuery ? 'No resources match your search' : 'No resources in catalog'}
        </p>
      </div>
    {:else}
      {#each Array.from(filteredResourcesByType()) as [type, resources]}
        <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <!-- Type Header -->
          <button
            type="button"
            class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            onclick={() => toggleType(type)}
            aria-expanded={!collapsedTypes[type]}
            aria-label={`Toggle ${type} resources`}
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-5 w-5 transition-transform {collapsedTypes[type] ? '' : 'rotate-90'}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100">{type}</h4>
              <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {resources.length}
              </span>
            </div>
          </button>

          <!-- Resources List -->
          {#if !collapsedTypes[type]}
            <div class="border-t border-gray-200 dark:border-gray-700">
              <div class="divide-y divide-gray-200 dark:divide-gray-700">
                {#each resources as resource}
                  <button
                    type="button"
                    class="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between"
                    onclick={() => selectResource(resource)}
                    aria-label={`View details for ${resource.type} ${resource.title}`}
                  >
                    <span class="font-medium text-gray-900 hover:text-primary-600 dark:text-gray-100 dark:hover:text-primary-400 truncate">
                      {resource.title}
                    </span>
                    {#if resource.exported}
                      <span class="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 flex-shrink-0">
                        Exported
                      </span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Resource Detail Panel -->
  {#if selectedResource}
    <div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div class="flex min-h-screen items-center justify-center p-4">
        <!-- Backdrop -->
        <button
          type="button"
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onclick={() => selectedResource = null}
          aria-label="Close resource details"
        ></button>

        <!-- Panel -->
        <div class="relative z-10 w-full max-w-3xl rounded-lg bg-white shadow-xl dark:bg-gray-800">
          <!-- Header -->
          <div class="flex items-start justify-between border-b border-gray-200 p-6 dark:border-gray-700">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedResource.type}
              </h3>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{selectedResource.title}</p>
            </div>
            <button
              type="button"
              class="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              onclick={() => selectedResource = null}
              aria-label="Close resource details"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="max-h-[60vh] overflow-y-auto p-6">
            <!-- Parameters -->
            <div class="mb-6">
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Parameters</h4>
              {#if Object.keys(selectedResource.parameters).length === 0}
                <p class="text-sm text-gray-500 dark:text-gray-400">No parameters</p>
              {:else}
                <div class="space-y-2">
                  {#each Object.entries(selectedResource.parameters) as [key, value]}
                    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <div class="font-medium text-gray-700 dark:text-gray-300">{key}</div>
                      <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {#if isComplexValue(value)}
                          <pre class="overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs dark:bg-gray-950">{formatValue(value)}</pre>
                        {:else}
                          <span class="font-mono">{formatValue(value)}</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Relationships -->
            {#if getResourceRelationships(selectedResource).length > 0}
              <div class="mb-6">
                <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Relationships</h4>
                <div class="space-y-2">
                  {#each getResourceRelationships(selectedResource) as edge}
                    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <div class="flex items-center gap-2 text-sm">
                        {#if edge.source.type === selectedResource.type && edge.source.title === selectedResource.title}
                          <span class="font-medium text-gray-900 dark:text-gray-100">This resource</span>
                          <span class="text-gray-500 dark:text-gray-400">{edge.relationship}</span>
                          <span class="font-medium text-gray-900 dark:text-gray-100">
                            {edge.target.type}[{edge.target.title}]
                          </span>
                        {:else}
                          <span class="font-medium text-gray-900 dark:text-gray-100">
                            {edge.source.type}[{edge.source.title}]
                          </span>
                          <span class="text-gray-500 dark:text-gray-400">{edge.relationship}</span>
                          <span class="font-medium text-gray-900 dark:text-gray-100">This resource</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Metadata -->
            <div>
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Metadata</h4>
              <div class="space-y-2 text-sm">
                {#if selectedResource.file}
                  <div>
                    <span class="text-gray-500 dark:text-gray-400">Source:</span>
                    <span class="ml-2 font-mono text-gray-900 dark:text-gray-100">
                      {selectedResource.file}{selectedResource.line ? `:${selectedResource.line}` : ''}
                    </span>
                  </div>
                {/if}
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Exported:</span>
                  <span class="ml-2 text-gray-900 dark:text-gray-100">
                    {selectedResource.exported ? 'Yes' : 'No'}
                  </span>
                </div>
                {#if selectedResource.tags.length > 0}
                  <div>
                    <span class="text-gray-500 dark:text-gray-400">Tags:</span>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each selectedResource.tags as tag}
                        <span class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          {tag}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
