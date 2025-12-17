<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface Resource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
  }

  interface Props {
    certname: string;
    resources: Record<string, Resource[]> | null;
    loading: boolean;
    error: string | null;
    onRetry?: () => void;
  }

  let { certname, resources, loading, error, onRetry }: Props = $props();

  // State for expanded resource types
  let expandedTypes = $state<Set<string>>(new Set());

  // State for selected resource to show details
  let selectedResource = $state<Resource | null>(null);

  // Toggle resource type expansion
  function toggleType(type: string): void {
    if (expandedTypes.has(type)) {
      expandedTypes.delete(type);
    } else {
      expandedTypes.add(type);
    }
    expandedTypes = new Set(expandedTypes); // Trigger reactivity
  }

  // Show resource details
  function showResourceDetails(resource: Resource): void {
    selectedResource = resource;
  }

  // Close resource details
  function closeResourceDetails(): void {
    selectedResource = null;
  }

  // Get sorted resource types
  let sortedTypes = $derived(
    resources ? Object.keys(resources).sort() : []
  );

  // Get total resource count
  let totalResources = $derived(
    resources
      ? Object.values(resources).reduce((sum, res) => sum + res.length, 0)
      : 0
  );

  // Format parameter value for display
  function formatParameterValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      return `{${Object.keys(value).length} keys}`;
    }
    return String(value);
  }

  // Format full parameter value for details view
  function formatFullParameterValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
</script>

<div class="managed-resources-viewer">
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading managed resources..." />
    </div>
  {:else if error}
    <ErrorAlert
      message="Failed to load managed resources"
      details={error}
      onRetry={onRetry}
    />
  {:else if !resources || sortedTypes.length === 0}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No managed resources found</h3>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        This node has no resources managed by Puppet, or the catalog has not been compiled yet.
      </p>
    </div>
  {:else}
    <!-- Summary -->
    <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Resource Summary</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {totalResources} resources across {sortedTypes.length} types
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onclick={() => {
              expandedTypes = new Set(sortedTypes);
            }}
          >
            Expand All
          </button>
          <span class="text-gray-300 dark:text-gray-600">|</span>
          <button
            type="button"
            class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onclick={() => {
              expandedTypes = new Set();
            }}
          >
            Collapse All
          </button>
        </div>
      </div>
    </div>

    <!-- Resource Types List -->
    <div class="space-y-2">
      {#each sortedTypes as type}
        {@const typeResources = resources[type]}
        {@const isExpanded = expandedTypes.has(type)}

        <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <!-- Type Header -->
          <button
            type="button"
            class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            onclick={() => toggleType(type)}
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-5 w-5 text-gray-400 transition-transform {isExpanded ? 'rotate-90' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <h4 class="font-mono text-sm font-medium text-gray-900 dark:text-white">{type}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {typeResources.length} {typeResources.length === 1 ? 'resource' : 'resources'}
                </p>
              </div>
            </div>
            <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
              {typeResources.length}
            </span>
          </button>

          <!-- Resources List (when expanded) -->
          {#if isExpanded}
            <div class="border-t border-gray-200 dark:border-gray-700">
              <div class="divide-y divide-gray-200 dark:divide-gray-700">
                {#each typeResources as resource}
                  <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <h5 class="font-mono text-sm font-medium text-gray-900 dark:text-white">
                            {resource.title}
                          </h5>
                          {#if resource.exported}
                            <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                              Exported
                            </span>
                          {/if}
                        </div>

                        {#if resource.file}
                          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {resource.file}{resource.line ? `:${resource.line}` : ''}
                          </p>
                        {/if}

                        {#if resource.tags.length > 0}
                          <div class="mt-2 flex flex-wrap gap-1">
                            {#each resource.tags.slice(0, 5) as tag}
                              <span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {tag}
                              </span>
                            {/each}
                            {#if resource.tags.length > 5}
                              <span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                +{resource.tags.length - 5} more
                              </span>
                            {/if}
                          </div>
                        {/if}

                        {#if Object.keys(resource.parameters).length > 0}
                          <div class="mt-2">
                            <details class="text-xs">
                              <summary class="cursor-pointer text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                                {Object.keys(resource.parameters).length} parameters
                              </summary>
                              <div class="mt-2 space-y-1 rounded-md bg-gray-50 p-2 dark:bg-gray-900/50">
                                {#each Object.entries(resource.parameters).slice(0, 10) as [key, value]}
                                  <div class="flex items-start gap-2">
                                    <span class="font-mono text-gray-700 dark:text-gray-300">{key}:</span>
                                    <span class="flex-1 font-mono text-gray-600 dark:text-gray-400">
                                      {formatParameterValue(value)}
                                    </span>
                                  </div>
                                {/each}
                                {#if Object.keys(resource.parameters).length > 10}
                                  <p class="text-gray-500 dark:text-gray-400">
                                    +{Object.keys(resource.parameters).length - 10} more parameters
                                  </p>
                                {/if}
                              </div>
                            </details>
                          </div>
                        {/if}
                      </div>

                      <button
                        type="button"
                        class="ml-4 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        onclick={() => showResourceDetails(resource)}
                      >
                        Details →
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Resource Details Modal -->
  {#if selectedResource}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      onclick={(e) => e.target === e.currentTarget && closeResourceDetails()}
      onkeydown={(e) => e.key === 'Escape' && closeResourceDetails()}
    >
      <div
        class="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
      >
        <!-- Modal Header -->
        <div class="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <h3 id="modal-title" class="text-lg font-semibold text-gray-900 dark:text-white">Resource Details</h3>
            <p class="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
              {selectedResource.type}[{selectedResource.title}]
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            onclick={closeResourceDetails}
            aria-label="Close resource details modal"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="p-6 space-y-6">
          <!-- Basic Info -->
          <div>
            <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Basic Information</h4>
            <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Type</dt>
                <dd class="mt-1 font-mono text-sm text-gray-900 dark:text-white">{selectedResource.type}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Title</dt>
                <dd class="mt-1 font-mono text-sm text-gray-900 dark:text-white">{selectedResource.title}</dd>
              </div>
              {#if selectedResource.file}
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Source File</dt>
                  <dd class="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                    {selectedResource.file}{selectedResource.line ? `:${selectedResource.line}` : ''}
                  </dd>
                </div>
              {/if}
              <div>
                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Exported</dt>
                <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                  {selectedResource.exported ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>

          <!-- Tags -->
          {#if selectedResource.tags.length > 0}
            <div>
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Tags</h4>
              <div class="flex flex-wrap gap-2">
                {#each selectedResource.tags as tag}
                  <span class="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Parameters -->
          {#if Object.keys(selectedResource.parameters).length > 0}
            <div>
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Parameters</h4>
              <div class="space-y-3">
                {#each Object.entries(selectedResource.parameters) as [key, value]}
                  <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                    <div class="mb-2 font-mono text-sm font-medium text-gray-900 dark:text-white">{key}</div>
                    <pre class="overflow-x-auto text-xs text-gray-600 dark:text-gray-400">{formatFullParameterValue(value)}</pre>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div>
              <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Parameters</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">No parameters defined</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  details summary::-webkit-details-marker {
    display: none;
  }

  details summary::marker {
    display: none;
  }
</style>
