<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import FactsViewer from './FactsViewer.svelte';
  import { getUserFriendlyErrorMessage, isNotConfiguredError } from '../lib/multiSourceFetch';

  interface Props {
    boltFacts?: {
      facts: Record<string, unknown>;
      gatheredAt: string;
      command?: string;
    } | null;
    boltLoading?: boolean;
    boltError?: string | null;
    onGatherBoltFacts?: () => Promise<void>;

    puppetdbFacts?: {
      facts: Record<string, unknown>;
      timestamp: string;
    } | null;
    puppetdbLoading?: boolean;
    puppetdbError?: string | null;

    puppetserverFacts?: {
      facts: Record<string, unknown>;
      timestamp: string;
    } | null;
    puppetserverLoading?: boolean;
    puppetserverError?: string | null;
  }

  let {
    boltFacts = null,
    boltLoading = false,
    boltError = null,
    onGatherBoltFacts,
    puppetdbFacts = null,
    puppetdbLoading = false,
    puppetdbError = null,
    puppetserverFacts = null,
    puppetserverLoading = false,
    puppetserverError = null,
  }: Props = $props();

  type FactCategory = 'system' | 'network' | 'hardware' | 'custom';
  type SourceType = 'bolt' | 'puppetdb' | 'puppetserver';

  interface CategorizedFacts {
    system: Record<string, unknown>;
    network: Record<string, unknown>;
    hardware: Record<string, unknown>;
    custom: Record<string, unknown>;
  }

  // Active source selection
  let activeSource = $state<SourceType | 'all'>('all');

  // Categorize facts based on common patterns
  function categorizeFacts(facts: Record<string, unknown>): CategorizedFacts {
    const categorized: CategorizedFacts = {
      system: {},
      network: {},
      hardware: {},
      custom: {},
    };

    const systemKeys = [
      'os', 'osfamily', 'operatingsystem', 'operatingsystemrelease',
      'kernel', 'kernelversion', 'kernelrelease', 'kernelmajversion',
      'architecture', 'hardwaremodel', 'processor', 'processorcount',
      'uptime', 'timezone', 'virtual', 'is_virtual', 'hostname',
      'fqdn', 'domain', 'path', 'rubyversion', 'puppetversion',
    ];

    const networkKeys = [
      'ipaddress', 'ipaddress6', 'macaddress', 'netmask', 'network',
      'interfaces', 'networking', 'defaultgateway', 'nameservers',
    ];

    const hardwareKeys = [
      'memorysize', 'memoryfree', 'swapsize', 'swapfree',
      'physicalprocessorcount', 'processorcount', 'processors',
      'blockdevices', 'disks', 'partitions', 'manufacturer',
      'productname', 'serialnumber', 'uuid', 'bios', 'dmi',
    ];

    for (const [key, value] of Object.entries(facts)) {
      const lowerKey = key.toLowerCase();

      if (systemKeys.some(k => lowerKey.includes(k))) {
        categorized.system[key] = value;
      } else if (networkKeys.some(k => lowerKey.includes(k))) {
        categorized.network[key] = value;
      } else if (hardwareKeys.some(k => lowerKey.includes(k))) {
        categorized.hardware[key] = value;
      } else {
        categorized.custom[key] = value;
      }
    }

    return categorized;
  }

  // Get categorized facts for active source
  const categorizedFacts = $derived(() => {
    if (activeSource === 'bolt' && boltFacts) {
      return categorizeFacts(boltFacts.facts);
    } else if (activeSource === 'puppetdb' && puppetdbFacts) {
      return categorizeFacts(puppetdbFacts.facts);
    } else if (activeSource === 'puppetserver' && puppetserverFacts) {
      return categorizeFacts(puppetserverFacts.facts);
    } else if (activeSource === 'all') {
      // Merge all sources
      const merged: Record<string, unknown> = {};
      if (boltFacts) Object.assign(merged, boltFacts.facts);
      if (puppetdbFacts) Object.assign(merged, puppetdbFacts.facts);
      if (puppetserverFacts) Object.assign(merged, puppetserverFacts.facts);
      return categorizeFacts(merged);
    }
    return { system: {}, network: {}, hardware: {}, custom: {} };
  });

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Get source badge class
  function getSourceBadgeClass(source: SourceType): string {
    switch (source) {
      case 'bolt':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'puppetdb':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'puppetserver':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Get source label
  function getSourceLabel(source: SourceType): string {
    switch (source) {
      case 'bolt':
        return 'Bolt';
      case 'puppetdb':
        return 'PuppetDB';
      case 'puppetserver':
        return 'Puppetserver';
      default:
        return 'Unknown';
    }
  }

  // Check if any facts are available
  const hasAnyFacts = $derived(
    (boltFacts && Object.keys(boltFacts.facts).length > 0) ||
    (puppetdbFacts && Object.keys(puppetdbFacts.facts).length > 0) ||
    (puppetserverFacts && Object.keys(puppetserverFacts.facts).length > 0)
  );

  // Check if any source is loading
  const anyLoading = $derived(boltLoading || puppetdbLoading || puppetserverLoading);

  // Count available sources
  const availableSources = $derived(() => {
    const sources: SourceType[] = [];
    if (boltFacts && Object.keys(boltFacts.facts).length > 0) sources.push('bolt');
    if (puppetdbFacts && Object.keys(puppetdbFacts.facts).length > 0) sources.push('puppetdb');
    if (puppetserverFacts && Object.keys(puppetserverFacts.facts).length > 0) sources.push('puppetserver');
    return sources;
  });

  // Category display names
  const categoryNames: Record<FactCategory, string> = {
    system: 'System',
    network: 'Network',
    hardware: 'Hardware',
    custom: 'Custom',
  };

  // Active category for accordion
  let expandedCategories = $state<Set<FactCategory>>(new Set(['system']));

  function toggleCategory(category: FactCategory): void {
    if (expandedCategories.has(category)) {
      expandedCategories.delete(category);
    } else {
      expandedCategories.add(category);
    }
    expandedCategories = new Set(expandedCategories);
  }
</script>

<div class="space-y-4">
  <!-- Source Selection Tabs -->
  {#if availableSources().length > 1}
    <div class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeSource === 'all' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
        onclick={() => activeSource = 'all'}
      >
        All Sources
      </button>
      {#each availableSources() as source}
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeSource === source ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => activeSource = source}
        >
          {getSourceLabel(source)}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Error Messages with Graceful Degradation -->
  {#if (boltError || puppetdbError || puppetserverError) && hasAnyFacts}
    <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Some sources are unavailable
          </h3>
          <div class="mt-2 space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
            {#if boltError}
              <p>• Bolt: {boltError}</p>
            {/if}
            {#if puppetdbError}
              <p>• PuppetDB: {puppetdbError}</p>
            {/if}
            {#if puppetserverError}
              <p>• Puppetserver: {puppetserverError}</p>
            {/if}
          </div>
          <p class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            Displaying facts from available sources. The system continues to operate normally.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Source Information Cards -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
    <!-- Bolt Facts Card -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('bolt')}">
          {getSourceLabel('bolt')}
        </span>
        {#if onGatherBoltFacts}
          <button
            type="button"
            class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
            onclick={onGatherBoltFacts}
            disabled={boltLoading}
          >
            {boltLoading ? 'Gathering...' : 'Refresh'}
          </button>
        {/if}
      </div>
      {#if boltLoading}
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Loading...</span>
        </div>
      {:else if boltError}
        <div class="space-y-1">
          <p class="text-xs text-red-600 dark:text-red-400">Error</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{boltError}</p>
        </div>
      {:else if boltFacts}
        <div class="space-y-1">
          <p class="text-sm text-gray-900 dark:text-white">
            {Object.keys(boltFacts.facts).length} facts
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {formatTimestamp(boltFacts.gatheredAt)}
          </p>
        </div>
      {:else}
        <p class="text-xs text-gray-500 dark:text-gray-400">No facts available</p>
      {/if}
    </div>

    <!-- PuppetDB Facts Card -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('puppetdb')}">
          {getSourceLabel('puppetdb')}
        </span>
      </div>
      {#if puppetdbLoading}
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Loading...</span>
        </div>
      {:else if puppetdbError}
        <div class="space-y-1">
          <p class="text-xs text-red-600 dark:text-red-400">Error</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{puppetdbError}</p>
        </div>
      {:else if puppetdbFacts}
        <div class="space-y-1">
          <p class="text-sm text-gray-900 dark:text-white">
            {Object.keys(puppetdbFacts.facts).length} facts
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {formatTimestamp(puppetdbFacts.timestamp)}
          </p>
        </div>
      {:else}
        <p class="text-xs text-gray-500 dark:text-gray-400">No facts available</p>
      {/if}
    </div>

    <!-- Puppetserver Facts Card -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('puppetserver')}">
          {getSourceLabel('puppetserver')}
        </span>
      </div>
      {#if puppetserverLoading}
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Loading...</span>
        </div>
      {:else if puppetserverError}
        <div class="space-y-1">
          <p class="text-xs text-red-600 dark:text-red-400">Error</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{puppetserverError}</p>
        </div>
      {:else if puppetserverFacts}
        <div class="space-y-1">
          <p class="text-sm text-gray-900 dark:text-white">
            {Object.keys(puppetserverFacts.facts).length} facts
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {formatTimestamp(puppetserverFacts.timestamp)}
          </p>
        </div>
      {:else}
        <p class="text-xs text-gray-500 dark:text-gray-400">No facts available</p>
      {/if}
    </div>
  </div>

  <!-- Facts Display -->
  {#if anyLoading && !hasAnyFacts}
    <div class="flex justify-center py-8">
      <LoadingSpinner message="Loading facts..." />
    </div>
  {:else if !hasAnyFacts}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
      <p class="text-gray-500 dark:text-gray-400">
        No facts available from any source.
      </p>
      {#if onGatherBoltFacts}
        <button
          type="button"
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onclick={onGatherBoltFacts}
        >
          Gather Facts
        </button>
      {/if}
    </div>
  {:else}
    <!-- Categorized Facts Display -->
    <div class="space-y-2">
      {#each Object.entries(categoryNames) as [category, name]}
        {@const categoryFacts = categorizedFacts()[category as FactCategory]}
        {@const factCount = Object.keys(categoryFacts).length}

        {#if factCount > 0}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onclick={() => toggleCategory(category as FactCategory)}
            >
              <div class="flex items-center gap-2">
                <svg
                  class="h-5 w-5 transition-transform {expandedCategories.has(category as FactCategory) ? 'rotate-90' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="font-medium text-gray-900 dark:text-white">{name}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">({factCount})</span>
              </div>
            </button>

            {#if expandedCategories.has(category as FactCategory)}
              <div class="border-t border-gray-200 p-4 dark:border-gray-700">
                <FactsViewer facts={categoryFacts} />
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
