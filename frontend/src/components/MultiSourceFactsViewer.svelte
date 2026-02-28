<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import FactsViewer from './FactsViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

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
  }

  let {
    boltFacts = null,
    boltLoading = false,
    boltError = null,
    onGatherBoltFacts,
    puppetdbFacts = null,
    puppetdbLoading = false,
    puppetdbError = null,
  }: Props = $props();

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Check if any facts are available
  const hasAnyFacts = $derived(
    (boltFacts && Object.keys(boltFacts.facts).length > 0) ||
    (puppetdbFacts && Object.keys(puppetdbFacts.facts).length > 0)
  );

  // Check if any source is loading
  const anyLoading = $derived(boltLoading || puppetdbLoading);

  // Get merged facts for default display
  const mergedFacts = $derived(() => {
    const merged: Record<string, unknown> = {};
    if (puppetdbFacts) Object.assign(merged, puppetdbFacts.facts);
    if (boltFacts) Object.assign(merged, boltFacts.facts);
    return merged;
  });

  // View mode: 'categorized' or 'yaml'
  let viewMode = $state<'categorized' | 'yaml'>('categorized');

  // Get YAML representation of merged facts
  const yamlOutput = $derived(() => {
    return convertToYAML(mergedFacts());
  });

  // YAML export functionality
  function exportToYAML(): void {
    const yaml = yamlOutput();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facts-${new Date().toISOString().split('T')[0]}.yaml`;
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
  <!-- Error Messages with Graceful Degradation -->
  {#if (boltError || puppetdbError) && hasAnyFacts}
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
              <p>• SSH: {boltError}</p>
            {/if}
            {#if puppetdbError}
              <p>• Puppet: {puppetdbError}</p>
            {/if}
          </div>
          <p class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            Displaying facts from available sources. The system continues to operate normally.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- View Mode Toggle and Actions -->
  {#if hasAnyFacts}
    <div class="flex items-center justify-end gap-4">
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
    <!-- SSH Facts Card -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <IntegrationBadge integration="bolt" variant="dot" size="sm" />
          <span class="text-sm font-medium text-gray-900 dark:text-white">SSH</span>
        </div>
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

    <!-- Puppet Facts Card -->
    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <IntegrationBadge integration="puppetdb" variant="dot" size="sm" />
          <span class="text-sm font-medium text-gray-900 dark:text-white">Puppet</span>
        </div>
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
  {:else if viewMode === 'yaml'}
    <!-- YAML View -->
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">
            YAML Output
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {Object.keys(mergedFacts()).length} facts
          </span>
        </div>
      </div>
      <div class="p-4">
        <pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{yamlOutput()}</code></pre>
      </div>
    </div>
  {:else}
    <!-- Enhanced Facts Display with Source and Category Selectors -->
    <FactsViewer
      facts={mergedFacts()}
      puppetFacts={puppetdbFacts?.facts}
      boltFacts={boltFacts?.facts}
      ansibleFacts={null}
      sshFacts={null}
      showSourceSelector={true}
      showCategorySelector={true}
    />
  {/if}
</div>
