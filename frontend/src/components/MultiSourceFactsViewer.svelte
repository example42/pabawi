<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import FactsViewer from './FactsViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import { getUserFriendlyErrorMessage, isNotConfiguredError } from '../lib/multiSourceFetch';

  interface FactSource {
    name: string;
    facts: Record<string, unknown>;
    timestamp: string;
    command?: string;
  }

  interface Props {
    sources?: FactSource[];
    loading?: boolean;
    error?: string | null;
    onRefresh?: (sourceName: string) => Promise<void>;
  }

  let {
    sources = [],
    loading = false,
    error = null,
    onRefresh,
  }: Props = $props();

  type FactCategory = 'system' | 'network' | 'hardware' | 'custom';

  interface CategorizedFacts {
    system: Record<string, unknown>;
    network: Record<string, unknown>;
    hardware: Record<string, unknown>;
    custom: Record<string, unknown>;
  }

  // Active source selection
  let activeSource = $state<string | 'all'>('all');

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
    if (activeSource === 'all') {
      // Merge all sources
      const merged: Record<string, unknown> = {};
      sources.forEach(source => {
        Object.assign(merged, source.facts);
      });
      return categorizeFacts(merged);
    } else {
      // Find specific source
      const source = sources.find(s => s.name === activeSource);
      if (source) {
        return categorizeFacts(source.facts);
      }
    }
    return { system: {}, network: {}, hardware: {}, custom: {} };
  });

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }



  // Check if any facts are available
  const hasAnyFacts = $derived(
    sources.some(source => Object.keys(source.facts).length > 0)
  );

  // Check if any source is loading
  const anyLoading = $derived(loading);

  // Get available sources
  const availableSources = $derived(() => {
    return sources.filter(source => Object.keys(source.facts).length > 0);
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

  // View mode: 'categorized' or 'yaml'
  let viewMode = $state<'categorized' | 'yaml'>('categorized');

  // Get current facts and source label
  function getCurrentFactsAndSource(): { facts: Record<string, unknown>; sourceLabel: string; displayLabel: string } {
    let factsToExport: Record<string, unknown> = {};
    let sourceLabel = '';
    let displayLabel = '';

    if (activeSource === 'all') {
      // Merge all sources
      sources.forEach(source => {
        Object.assign(factsToExport, source.facts);
      });
      sourceLabel = 'all-sources';
      displayLabel = 'All Sources';
    } else {
      // Find specific source
      const source = sources.find(s => s.name === activeSource);
      if (source) {
        factsToExport = source.facts;
        sourceLabel = source.name;
        displayLabel = source.name.charAt(0).toUpperCase() + source.name.slice(1);
      }
    }

    return { facts: factsToExport, sourceLabel, displayLabel };
  }

  // Get YAML representation of current facts
  const yamlOutput = $derived(() => {
    const { facts } = getCurrentFactsAndSource();
    return convertToYAML(facts);
  });

  // Helper to get source label
  function getSourceLabel(sourceName: string): string {
    return sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
  }

  // YAML export functionality (requirement 4.5)
  function exportToYAML(): void {
    const { facts, sourceLabel } = getCurrentFactsAndSource();
    const yaml = convertToYAML(facts);

    // Create a blob and download
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facts-${sourceLabel}-${new Date().toISOString().split('T')[0]}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Copy YAML to clipboard
  async function copyYAMLToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(yamlOutput());
      // You could add a toast notification here
      alert('YAML copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy YAML:', err);
      alert('Failed to copy to clipboard');
    }
  }

  // Simple YAML converter
  function convertToYAML(obj: Record<string, unknown>, indent = 0): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += convertToYAML(value as Record<string, unknown>, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            yaml += convertToYAML(item as Record<string, unknown>, indent + 2);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'string') {
        // Escape strings that need quotes
        const needsQuotes = value.includes(':') || value.includes('#') || value.includes('\n');
        yaml += `${spaces}${key}: ${needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value}\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
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
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeSource === source.name ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => activeSource = source.name}
        >
          {getSourceLabel(source.name)}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Error Messages with Graceful Degradation -->
  {#if error && hasAnyFacts}
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
            <p>• {error}</p>
          </div>
          <p class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            Displaying facts from available sources. The system continues to operate normally.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- View Mode Toggle and Actions (requirement 4.5) -->
  {#if hasAnyFacts}
    <div class="flex items-center justify-between gap-4">
      <!-- Current Source Indicator -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600 dark:text-gray-400">Viewing facts from:</span>
        {#if activeSource === 'all'}
          <span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
            All Sources
          </span>
        {:else}
          <IntegrationBadge integration={activeSource} variant="badge" size="sm" />
        {/if}
      </div>

      <!-- View Mode and Export Actions -->
      <div class="flex items-center gap-2">
        <!-- View Mode Toggle -->
        <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600">
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium rounded-l-lg transition-colors {viewMode === 'categorized' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
            onclick={() => viewMode = 'categorized'}
            title="View facts in categorized format"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors {viewMode === 'yaml' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
            onclick={() => viewMode = 'yaml'}
            title="View facts in YAML format"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
        </div>

        <!-- Export Actions (only show in YAML mode) -->
        {#if viewMode === 'yaml'}
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            onclick={copyYAMLToClipboard}
            title="Copy YAML to clipboard"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            onclick={exportToYAML}
            title="Download facts as YAML file"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Source Information Cards -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#each sources as source}
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-2 flex items-center justify-between">
          <IntegrationBadge integration={source.name} variant="badge" size="sm" />
          {#if onRefresh}
            <button
              type="button"
              class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
              onclick={() => onRefresh?.(source.name)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          {/if}
        </div>
        {#if loading}
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <LoadingSpinner size="sm" />
            <span>Loading...</span>
          </div>
        {:else if Object.keys(source.facts).length > 0}
          <div class="space-y-1">
            <p class="text-sm text-gray-900 dark:text-white">
              {Object.keys(source.facts).length} facts
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(source.timestamp)}
            </p>
          </div>
        {:else}
          <p class="text-xs text-gray-500 dark:text-gray-400">No facts available</p>
        {/if}
      </div>
    {/each}
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
      {#if onRefresh && sources.length > 0}
        <button
          type="button"
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onclick={() => onRefresh?.(sources[0].name)}
        >
          Gather Facts
        </button>
      {/if}
    </div>
  {:else if viewMode === 'yaml'}
    <!-- YAML View -->
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">
            YAML Output
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {Object.keys(getCurrentFactsAndSource().facts).length} facts from {getCurrentFactsAndSource().displayLabel}
          </span>
        </div>
      </div>
      <div class="p-4">
        <pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{yamlOutput()}</code></pre>
      </div>
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
