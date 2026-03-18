<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import FactsViewer from './FactsViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface SourceFacts {
    facts: Record<string, unknown>;
    timestamp: string;
  }

  interface Props {
    /** Map of source name -> facts data, loaded from GET /api/nodes/:id/facts */
    sources?: Record<string, SourceFacts>;
    /** Map of source name -> error message */
    sourceErrors?: Record<string, string>;
    /** Whether sources are currently loading */
    loading?: boolean;
    /** Callback to trigger active facts gathering (bolt/ssh/ansible) */
    onGatherFacts?: () => Promise<void>;
    /** Whether gathering is in progress */
    gatheringFacts?: boolean;
  }

  let {
    sources = {},
    sourceErrors = {},
    loading = false,
    onGatherFacts,
    gatheringFacts = false,
  }: Props = $props();

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  const sourceLabels: Record<string, string> = {
    bolt: 'Bolt (SSH)',
    ssh: 'SSH',
    ansible: 'Ansible',
    puppetdb: 'PuppetDB',
    proxmox: 'Proxmox',
    aws: 'AWS',
    puppetserver: 'Puppetserver',
  };

  const sourceIntegrationMap: Record<string, string> = {
    bolt: 'bolt',
    ssh: 'bolt',
    ansible: 'ansible',
    puppetdb: 'puppetdb',
    proxmox: 'proxmox',
    aws: 'aws',
    puppetserver: 'puppet',
  };

  function getSourceLabel(name: string): string {
    return sourceLabels[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  }

  function getSourceIntegration(name: string): string {
    return sourceIntegrationMap[name] ?? name;
  }

  // Available source names (those with actual facts data)
  const availableSourceNames = $derived(Object.keys(sources).filter(
    (name) => sources[name] && Object.keys(sources[name].facts).length > 0
  ));

  // All known source names (available + errored)
  const allSourceNames = $derived([
    ...new Set([...Object.keys(sources), ...Object.keys(sourceErrors)])
  ]);

  const hasAnyFacts = $derived(availableSourceNames.length > 0);

  // Active source for viewing
  let activeSource = $state<string | null>(null);

  // Auto-select first available source when sources change
  $effect(() => {
    if (availableSourceNames.length > 0 && (!activeSource || !availableSourceNames.includes(activeSource))) {
      activeSource = availableSourceNames[0];
    }
  });

  // Get facts for the active source
  const currentFacts = $derived(() => {
    if (activeSource && sources[activeSource]) {
      return sources[activeSource].facts;
    }
    return {};
  });

  // Get merged facts from all sources
  const mergedFacts = $derived(() => {
    const merged: Record<string, unknown> = {};
    for (const name of availableSourceNames) {
      Object.assign(merged, sources[name].facts);
    }
    return merged;
  });

  // View mode
  let viewMode = $state<'categorized' | 'yaml'>('categorized');

  // Source view: 'single' shows one source at a time, 'merged' shows all merged
  let sourceView = $state<'single' | 'merged'>('single');

  // Get YAML representation
  const yamlOutput = $derived(() => {
    const factsToShow = sourceView === 'merged' ? mergedFacts() : currentFacts();
    return convertToYAML(factsToShow);
  });

  function exportToYAML(): void {
    const yaml = yamlOutput();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facts-${activeSource ?? 'merged'}-${new Date().toISOString().split('T')[0]}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyYAMLToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(yamlOutput());
      alert('YAML copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy YAML:', err);
      alert('Failed to copy to clipboard');
    }
  }

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
  {#if Object.keys(sourceErrors).length > 0 && hasAnyFacts}
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
            {#each Object.entries(sourceErrors) as [name, err]}
              <p>• {getSourceLabel(name)}: {err}</p>
            {/each}
          </div>
          <p class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            Displaying facts from available sources.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- View Mode Toggle and Actions -->
  {#if hasAnyFacts}
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <!-- Source View Toggle -->
      <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600">
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-l-lg transition-colors {sourceView === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
          onclick={() => sourceView = 'single'}
          title="View facts from a single source"
        >
          Per Source
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors {sourceView === 'merged' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
          onclick={() => sourceView = 'merged'}
          title="View merged facts from all sources"
        >
          Merged
        </button>
      </div>

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

  <!-- Source Cards -->
  {#if allSourceNames.length > 0}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each allSourceNames as name}
        {@const sourceFacts = sources[name]}
        {@const sourceError = sourceErrors[name]}
        {@const hasFacts = sourceFacts && Object.keys(sourceFacts.facts).length > 0}
        {@const isActive = sourceView === 'single' && activeSource === name}
        <button
          type="button"
          class="rounded-lg border p-4 text-left transition-all {isActive
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20'
            : hasFacts
              ? 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              : 'border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/50'}"
          onclick={() => { if (hasFacts) { sourceView = 'single'; activeSource = name; } }}
          disabled={!hasFacts}
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <IntegrationBadge integration={getSourceIntegration(name)} variant="dot" size="sm" />
              <span class="text-sm font-medium text-gray-900 dark:text-white">{getSourceLabel(name)}</span>
            </div>
            {#if isActive}
              <svg class="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            {/if}
          </div>
          {#if sourceError && !hasFacts}
            <div class="space-y-1">
              <p class="text-xs text-red-600 dark:text-red-400">Error</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{sourceError}</p>
            </div>
          {:else if hasFacts}
            <div class="space-y-1">
              <p class="text-sm text-gray-900 dark:text-white">
                {Object.keys(sourceFacts.facts).length} facts
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(sourceFacts.timestamp)}
              </p>
            </div>
          {:else}
            <p class="text-xs text-gray-500 dark:text-gray-400">No facts available</p>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Gather Facts Button -->
  {#if onGatherFacts}
    <div class="flex justify-end">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={onGatherFacts}
        disabled={gatheringFacts}
      >
        {#if gatheringFacts}
          <LoadingSpinner size="sm" />
          Gathering...
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Gather Facts (SSH/Ansible)
        {/if}
      </button>
    </div>
  {/if}

  <!-- Facts Display -->
  {#if loading && !hasAnyFacts}
    <div class="flex justify-center py-8">
      <LoadingSpinner message="Loading facts from all sources..." />
    </div>
  {:else if !hasAnyFacts && !loading}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
      <p class="text-gray-500 dark:text-gray-400">
        No facts available from any source.
      </p>
      {#if onGatherFacts}
        <button
          type="button"
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onclick={onGatherFacts}
        >
          Gather Facts
        </button>
      {/if}
    </div>
  {:else if viewMode === 'yaml'}
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">
            YAML Output {sourceView === 'single' && activeSource ? `(${getSourceLabel(activeSource)})` : '(Merged)'}
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {Object.keys(sourceView === 'merged' ? mergedFacts() : currentFacts()).length} facts
          </span>
        </div>
      </div>
      <div class="p-4">
        <pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{yamlOutput()}</code></pre>
      </div>
    </div>
  {:else}
    <FactsViewer
      facts={sourceView === 'merged' ? mergedFacts() : currentFacts()}
      showSourceSelector={false}
      showCategorySelector={true}
    />
  {/if}
</div>
