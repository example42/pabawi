<script lang="ts">
  import { post } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import EnvironmentSelector from './EnvironmentSelector.svelte';

  interface Resource {
    type: string;
    title: string;
    tags: string[];
    exported: boolean;
    file?: string;
    line?: number;
    parameters: Record<string, unknown>;
  }

  interface ParameterDiff {
    parameter: string;
    oldValue: unknown;
    newValue: unknown;
  }

  interface ResourceDiff {
    type: string;
    title: string;
    parameterChanges: ParameterDiff[];
  }

  interface CatalogDiff {
    environment1: string;
    environment2: string;
    added: Resource[];
    removed: Resource[];
    modified: ResourceDiff[];
    unchanged: Resource[];
  }

  interface Props {
    certname: string;
  }

  let { certname }: Props = $props();

  // State
  let environment1 = $state<string | undefined>(undefined);
  let environment2 = $state<string | undefined>(undefined);
  let catalogDiff = $state<CatalogDiff | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedSections = $state<Record<string, boolean>>({
    added: true,
    removed: true,
    modified: true
  });
  let expandedResources = $state<Record<string, boolean>>({});

  // Derived state
  const canCompare = $derived(environment1 && environment2 && environment1 !== environment2);
  const hasResults = $derived(catalogDiff !== null);

  // Filter resources based on search query
  const filteredDiff = $derived(() => {
    if (!catalogDiff || !searchQuery.trim()) {
      return catalogDiff;
    }

    const query = searchQuery.toLowerCase();
    const matchesQuery = (resource: Resource | ResourceDiff) => {
      return resource.type.toLowerCase().includes(query) ||
        resource.title.toLowerCase().includes(query);
    };

    return {
      ...catalogDiff,
      added: catalogDiff.added.filter(matchesQuery),
      removed: catalogDiff.removed.filter(matchesQuery),
      modified: catalogDiff.modified.filter(matchesQuery)
    };
  });

  // Compare catalogs
  async function compareCatalogs(): Promise<void> {
    if (!environment1 || !environment2) return;

    try {
      loading = true;
      error = null;
      catalogDiff = null;

      const result = await post<CatalogDiff>(
        '/api/integrations/puppetserver/catalog/compare',
        {
          certname,
          environment1,
          environment2
        }
      );

      catalogDiff = result;
      showSuccess('Catalogs compared', `Successfully compared ${environment1} and ${environment2}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compare catalogs';
      error = message;
      showError('Failed to compare catalogs', getErrorGuidance(message));
    } finally {
      loading = false;
    }
  }

  // Toggle section expansion
  function toggleSection(section: string): void {
    expandedSections[section] = !expandedSections[section];
  }

  // Toggle resource expansion
  function toggleResource(resourceKey: string): void {
    expandedResources[resourceKey] = !expandedResources[resourceKey];
  }

  // Format value for display
  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return JSON.stringify(value, null, 2);
  }

  // Check if value is complex
  function isComplexValue(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }

  // Get error guidance
  function getErrorGuidance(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('compilation') || lowerError.includes('compile')) {
      return '🔧 Troubleshooting:\n' +
        '• Check Puppet code syntax in the environment\n' +
        '• Review compilation errors in Puppetserver logs\n' +
        '• Verify all required modules are available\n' +
        '• Ensure node facts are up to date';
    }

    if (lowerError.includes('environment') || lowerError.includes('not found')) {
      return '🔧 Troubleshooting:\n' +
        '• Verify the environment exists on Puppetserver\n' +
        '• Check environment deployment status\n' +
        '• Ensure environment code is properly deployed\n' +
        '• Review Puppetserver environment configuration';
    }

    if (lowerError.includes('timeout')) {
      return '🔧 Troubleshooting:\n' +
        '• Catalog compilation may be taking too long\n' +
        '• Check Puppetserver performance and load\n' +
        '• Review catalog complexity and optimization\n' +
        '• Consider increasing timeout settings';
    }

    return '🔧 Troubleshooting:\n' +
      '• Check Puppetserver logs for detailed error information\n' +
      '• Verify Puppetserver is running and accessible\n' +
      '• Ensure both environments are properly configured\n' +
      '• Try comparing again after a few moments';
  }

  // Get resource key for tracking
  function getResourceKey(resource: Resource | ResourceDiff): string {
    return `${resource.type}::${resource.title}`;
  }
</script>

<div class="catalog-comparison">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Catalog Comparison</h2>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
      Compare catalogs between two environments for {certname}
    </p>
  </div>

  <!-- Environment Selection -->
  <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <!-- Environment 1 -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Environment 1</h3>
      <EnvironmentSelector
        bind:selectedEnvironment={environment1}
        showDeployButton={false}
      />
    </div>

    <!-- Environment 2 -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Environment 2</h3>
      <EnvironmentSelector
        bind:selectedEnvironment={environment2}
        showDeployButton={false}
      />
    </div>
  </div>

  <!-- Compare Button -->
  <div class="mb-6 flex items-center justify-center">
    <button
      type="button"
      onclick={compareCatalogs}
      disabled={!canCompare || loading}
      class="inline-flex items-center gap-2 rounded-md bg-primary-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if loading}
        <svg class="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Comparing...
      {:else}
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Compare Catalogs
      {/if}
    </button>
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner />
      <span class="ml-3 text-gray-600 dark:text-gray-400">Compiling and comparing catalogs...</span>
    </div>
  {/if}

  <!-- Error State -->
  {#if error && !loading}
    <div class="rounded-md bg-red-50 p-4 dark:bg-red-900/10">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800 dark:text-red-400">Comparison failed</h3>
          <div class="mt-2 text-sm text-red-700 dark:text-red-300">
            <p>{error}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Results -->
  {#if hasResults && !loading && filteredDiff()}
    {@const diff = filteredDiff()}

    <!-- Summary -->
    <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Comparison Summary</h3>
      <div class="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
        <div class="rounded-lg bg-green-50 p-3 dark:bg-green-900/10">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">{diff.added.length}</div>
          <div class="text-gray-600 dark:text-gray-400">Added</div>
        </div>
        <div class="rounded-lg bg-red-50 p-3 dark:bg-red-900/10">
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">{diff.removed.length}</div>
          <div class="text-gray-600 dark:text-gray-400">Removed</div>
        </div>
        <div class="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/10">
          <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{diff.modified.length}</div>
          <div class="text-gray-600 dark:text-gray-400">Modified</div>
        </div>
        <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/10">
          <div class="text-2xl font-bold text-gray-600 dark:text-gray-400">{diff.unchanged.length}</div>
          <div class="text-gray-600 dark:text-gray-400">Unchanged</div>
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="mb-4">
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
          placeholder="Search resources by type or title..."
          class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
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
    </div>

    <!-- Added Resources -->
    {#if diff.added.length > 0}
      <div class="mb-4 rounded-lg border border-green-200 bg-white dark:border-green-900/30 dark:bg-gray-800">
        <button
          type="button"
          class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onclick={() => toggleSection('added')}
          aria-expanded={expandedSections.added}
        >
          <div class="flex items-center gap-3">
            <svg
              class="h-5 w-5 transition-transform {expandedSections.added ? 'rotate-90' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <h3 class="text-lg font-semibold text-green-700 dark:text-green-400">
              Added Resources
            </h3>
            <span class="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/20 dark:text-green-400">
              {diff.added.length}
            </span>
          </div>
        </button>

        {#if expandedSections.added}
          <div class="border-t border-green-200 dark:border-green-900/30">
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each diff.added as resource}
                {@const resourceKey = getResourceKey(resource)}
                <div class="p-4">
                  <button
                    type="button"
                    class="w-full text-left"
                    onclick={() => toggleResource(resourceKey)}
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <svg
                          class="h-4 w-4 transition-transform {expandedResources[resourceKey] ? 'rotate-90' : ''}"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <span class="font-medium text-gray-900 dark:text-white">{resource.type}</span>
                        <span class="text-gray-600 dark:text-gray-400">[{resource.title}]</span>
                      </div>
                      <svg class="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </button>

                  {#if expandedResources[resourceKey]}
                    <div class="mt-3 ml-6 space-y-2">
                      {#if Object.keys(resource.parameters).length > 0}
                        <div class="text-sm">
                          <div class="font-medium text-gray-700 dark:text-gray-300 mb-2">Parameters:</div>
                          {#each Object.entries(resource.parameters) as [key, value]}
                            <div class="ml-4 rounded bg-green-50 p-2 dark:bg-green-900/10">
                              <span class="font-mono text-green-700 dark:text-green-400">{key}:</span>
                              {#if isComplexValue(value)}
                                <pre class="mt-1 overflow-x-auto rounded bg-green-100 p-2 font-mono text-xs dark:bg-green-950">{formatValue(value)}</pre>
                              {:else}
                                <span class="ml-2 font-mono text-gray-900 dark:text-gray-100">{formatValue(value)}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Removed Resources -->
    {#if diff.removed.length > 0}
      <div class="mb-4 rounded-lg border border-red-200 bg-white dark:border-red-900/30 dark:bg-gray-800">
        <button
          type="button"
          class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onclick={() => toggleSection('removed')}
          aria-expanded={expandedSections.removed}
        >
          <div class="flex items-center gap-3">
            <svg
              class="h-5 w-5 transition-transform {expandedSections.removed ? 'rotate-90' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <h3 class="text-lg font-semibold text-red-700 dark:text-red-400">
              Removed Resources
            </h3>
            <span class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/20 dark:text-red-400">
              {diff.removed.length}
            </span>
          </div>
        </button>

        {#if expandedSections.removed}
          <div class="border-t border-red-200 dark:border-red-900/30">
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each diff.removed as resource}
                {@const resourceKey = getResourceKey(resource)}
                <div class="p-4">
                  <button
                    type="button"
                    class="w-full text-left"
                    onclick={() => toggleResource(resourceKey)}
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <svg
                          class="h-4 w-4 transition-transform {expandedResources[resourceKey] ? 'rotate-90' : ''}"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <span class="font-medium text-gray-900 dark:text-white">{resource.type}</span>
                        <span class="text-gray-600 dark:text-gray-400">[{resource.title}]</span>
                      </div>
                      <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                      </svg>
                    </div>
                  </button>

                  {#if expandedResources[resourceKey]}
                    <div class="mt-3 ml-6 space-y-2">
                      {#if Object.keys(resource.parameters).length > 0}
                        <div class="text-sm">
                          <div class="font-medium text-gray-700 dark:text-gray-300 mb-2">Parameters:</div>
                          {#each Object.entries(resource.parameters) as [key, value]}
                            <div class="ml-4 rounded bg-red-50 p-2 dark:bg-red-900/10">
                              <span class="font-mono text-red-700 dark:text-red-400">{key}:</span>
                              {#if isComplexValue(value)}
                                <pre class="mt-1 overflow-x-auto rounded bg-red-100 p-2 font-mono text-xs dark:bg-red-950">{formatValue(value)}</pre>
                              {:else}
                                <span class="ml-2 font-mono text-gray-900 dark:text-gray-100">{formatValue(value)}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Modified Resources -->
    {#if diff.modified.length > 0}
      <div class="mb-4 rounded-lg border border-yellow-200 bg-white dark:border-yellow-900/30 dark:bg-gray-800">
        <button
          type="button"
          class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
          onclick={() => toggleSection('modified')}
          aria-expanded={expandedSections.modified}
        >
          <div class="flex items-center gap-3">
            <svg
              class="h-5 w-5 transition-transform {expandedSections.modified ? 'rotate-90' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <h3 class="text-lg font-semibold text-yellow-700 dark:text-yellow-400">
              Modified Resources
            </h3>
            <span class="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
              {diff.modified.length}
            </span>
          </div>
        </button>

        {#if expandedSections.modified}
          <div class="border-t border-yellow-200 dark:border-yellow-900/30">
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each diff.modified as resource}
                {@const resourceKey = getResourceKey(resource)}
                <div class="p-4">
                  <button
                    type="button"
                    class="w-full text-left"
                    onclick={() => toggleResource(resourceKey)}
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <svg
                          class="h-4 w-4 transition-transform {expandedResources[resourceKey] ? 'rotate-90' : ''}"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <span class="font-medium text-gray-900 dark:text-white">{resource.type}</span>
                        <span class="text-gray-600 dark:text-gray-400">[{resource.title}]</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {resource.parameterChanges.length} change{resource.parameterChanges.length !== 1 ? 's' : ''}
                        </span>
                        <svg class="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {#if expandedResources[resourceKey]}
                    <div class="mt-3 ml-6 space-y-3">
                      <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Parameter Changes:</div>
                      {#each resource.parameterChanges as change}
                        <div class="ml-4 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/30 dark:bg-yellow-900/10">
                          <div class="font-mono text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-2">
                            {change.parameter}
                          </div>
                          <div class="space-y-2">
                            <!-- Old Value -->
                            <div class="rounded bg-red-50 p-2 dark:bg-red-900/10">
                              <div class="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                                - {environment1}
                              </div>
                              {#if isComplexValue(change.oldValue)}
                                <pre class="overflow-x-auto rounded bg-red-100 p-2 font-mono text-xs text-red-900 dark:bg-red-950 dark:text-red-100">{formatValue(change.oldValue)}</pre>
                              {:else}
                                <div class="font-mono text-sm text-red-900 dark:text-red-100">{formatValue(change.oldValue)}</div>
                              {/if}
                            </div>
                            <!-- New Value -->
                            <div class="rounded bg-green-50 p-2 dark:bg-green-900/10">
                              <div class="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                                + {environment2}
                              </div>
                              {#if isComplexValue(change.newValue)}
                                <pre class="overflow-x-auto rounded bg-green-100 p-2 font-mono text-xs text-green-900 dark:bg-green-950 dark:text-green-100">{formatValue(change.newValue)}</pre>
                              {:else}
                                <div class="font-mono text-sm text-green-900 dark:text-green-100">{formatValue(change.newValue)}</div>
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- No Changes Message -->
    {#if diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No differences found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The catalogs for {environment1} and {environment2} are identical
        </p>
      </div>
    {/if}
  {/if}
</div>
