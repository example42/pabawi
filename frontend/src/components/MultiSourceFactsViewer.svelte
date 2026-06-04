<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import FactsViewer from './FactsViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import type { IntegrationType } from '../lib/integrationColors.svelte';

  interface SourceFacts {
    facts: Record<string, unknown>;
    timestamp: string;
  }

  interface Props {
    /** Map of source name -> facts data, populated only after the user clicks Load. */
    sources?: Record<string, SourceFacts>;
    /** Map of source name -> error message from the most recent load attempt. */
    sourceErrors?: Record<string, string>;
    /**
     * Names of every information source the user can request facts from.
     * Drives card rendering. Sources not yet loaded show an idle "Load facts"
     * button; loaded sources expose a "Refresh" affordance.
     */
    availableSources?: string[];
    /** Map of source name -> true while a load is in flight for that source. */
    loadingStates?: Record<string, boolean>;
    /** Triggered when the user clicks Load or Refresh for a single source. */
    onLoadSource?: (name: string) => void | Promise<void>;
    /** Triggered when the user clicks the "Load all" bulk button. */
    onLoadAll?: () => void | Promise<void>;
    /** True while a bulk load-all is in progress. */
    loadingAll?: boolean;
  }

  let {
    sources = {},
    sourceErrors = {},
    availableSources = [],
    loadingStates = {},
    onLoadSource,
    onLoadAll,
    loadingAll = false,
  }: Props = $props();

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  const sourceLabels: Record<string, string> = {
    bolt: 'Bolt (SSH)',
    ssh: 'SSH',
    ansible: 'Ansible',
    puppetdb: 'PuppetDB',
    puppetserver: 'Puppetserver',
    hiera: 'Hiera',
    proxmox: 'Proxmox',
    aws: 'AWS',
    azure: 'Azure',
  };

  // Map a fact-source name to the IntegrationBadge integration type. Sources
  // not in the colors map fall back to a known badge type so the dot still
  // renders without a type error. The fallback (`bolt`) just controls colour;
  // the displayed label comes from sourceLabels.
  const sourceIntegrationMap: Record<string, IntegrationType> = {
    bolt: 'bolt',
    ssh: 'ssh',
    ansible: 'ansible',
    puppetdb: 'puppetdb',
    puppetserver: 'puppetserver',
    hiera: 'hiera',
    proxmox: 'proxmox',
    aws: 'aws',
    // No dedicated azure colour in IntegrationColors; reuse aws palette so
    // the dot renders. Update IntegrationColors when an azure palette is added.
    azure: 'aws',
  };

  function getSourceLabel(name: string): string {
    return sourceLabels[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  }

  function getSourceIntegration(name: string): IntegrationType {
    return sourceIntegrationMap[name] ?? 'bolt';
  }

  // Sources that have actual facts data loaded.
  const loadedSourceNames = $derived(Object.keys(sources).filter(
    (name) => sources[name] && Object.keys(sources[name].facts).length > 0
  ));

  // Union of available + loaded + errored, preserving availableSources order
  // and appending any unexpected ones afterwards (defensive — should be empty).
  const allSourceNames = $derived.by(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const n of availableSources) {
      if (!seen.has(n)) {
        seen.add(n);
        ordered.push(n);
      }
    }
    for (const n of [...Object.keys(sources), ...Object.keys(sourceErrors)]) {
      if (!seen.has(n)) {
        seen.add(n);
        ordered.push(n);
      }
    }
    return ordered;
  });

  const hasAnyFacts = $derived(loadedSourceNames.length > 0);

  // Active source for viewing. Auto-selected to the first loaded source.
  let activeSource = $state<string | null>(null);

  // Track previously loaded source set so we can detect newly arrived sources
  // and auto-focus them. Plain (non-reactive) variable — mutated inside the
  // effect only after deciding what to do.
  let prevLoadedSet = new Set<string>();

  $effect(() => {
    const currentSet = new Set(loadedSourceNames);

    // Find sources loaded since the last effect run.
    const newlyAdded: string[] = [];
    for (const name of loadedSourceNames) {
      if (!prevLoadedSet.has(name)) newlyAdded.push(name);
    }

    if (newlyAdded.length === 1 && !loadingAll) {
      // Single source arrived from a per-source Load/Refresh click — focus it
      // so the user immediately sees what they requested.
      sourceView = 'single';
      activeSource = newlyAdded[0];
    } else if (loadedSourceNames.length > 0 && (!activeSource || !currentSet.has(activeSource))) {
      // Fallback: no active source yet, or the previously active source has
      // been removed from the loaded set.
      activeSource = loadedSourceNames[0];
    } else if (loadedSourceNames.length === 0) {
      activeSource = null;
    }

    prevLoadedSet = currentSet;
  });

  function setActiveSource(name: string): void {
    sourceView = 'single';
    activeSource = name;
  }

  function handleCardKeyDown(e: KeyboardEvent, name: string, hasFacts: boolean): void {
    if (!hasFacts) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveSource(name);
    }
  }

  // Get facts for the active source
  const currentFacts = $derived(() => {
    if (activeSource && sources[activeSource]) {
      return sources[activeSource].facts;
    }
    return {};
  });

  // Get merged facts from all loaded sources
  const mergedFacts = $derived(() => {
    const merged: Record<string, unknown> = {};
    for (const name of loadedSourceNames) {
      Object.assign(merged, sources[name].facts);
    }
    return merged;
  });

  /**
   * Stable JSON stringification with sorted object keys so that values that
   * differ only in property order compare equal. Arrays are intentionally
   * NOT sorted: order is semantically meaningful for fact arrays
   * (e.g. interface lists, mountpoints).
   */
  function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }

  /**
   * For the All view, produce a per-key list of {value, sources} groups.
   * Sources that report the same value for a given key are collapsed into
   * one group whose badges enumerate the contributing sources. Sources that
   * report different values for the same key produce separate groups.
   */
  interface FactGroup {
    value: unknown;
    sources: string[];
  }

  const allFactsByKey = $derived.by((): { key: string; groups: FactGroup[] }[] => {
    if (loadedSourceNames.length === 0) return [];

    // Collect every top-level key reported by any loaded source.
    const keys = new Set<string>();
    for (const name of loadedSourceNames) {
      for (const k of Object.keys(sources[name].facts)) {
        keys.add(k);
      }
    }

    const sortedKeys = Array.from(keys).sort();
    const out: { key: string; groups: FactGroup[] }[] = [];

    for (const key of sortedKeys) {
      const groupsByHash = new Map<string, FactGroup>();
      for (const sourceName of loadedSourceNames) {
        const factsObj = sources[sourceName].facts;
        if (!(key in factsObj)) continue;
        const value = factsObj[key];
        const hash = stableStringify(value);
        const existing = groupsByHash.get(hash);
        if (existing) {
          existing.sources.push(sourceName);
        } else {
          groupsByHash.set(hash, { value, sources: [sourceName] });
        }
      }
      out.push({ key, groups: Array.from(groupsByHash.values()) });
    }

    return out;
  });

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  function formatScalar(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  // View mode
  let viewMode = $state<'categorized' | 'yaml'>('categorized');

  // Source view: 'single' shows one source at a time, 'merged' shows all
  // merged with last-write-wins, 'all' shows every key with a per-value
  // grouping and source badges so duplicates and divergences are visible.
  let sourceView = $state<'single' | 'merged' | 'all'>('single');

  // Get YAML representation
  const yamlOutput = $derived(() => {
    // 'all' mode shares the merged YAML — per-source badges aren't expressible
    // in YAML and emitting one block per source-group per key would be noisy.
    const factsToShow =
      sourceView === 'merged' || sourceView === 'all'
        ? mergedFacts()
        : currentFacts();
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

  function handleLoadSource(name: string): void {
    if (loadingStates[name]) return;
    onLoadSource?.(name);
  }

  function handleLoadAll(): void {
    if (loadingAll) return;
    onLoadAll?.();
  }

  function sourceState(name: string): 'idle' | 'loading' | 'loaded' | 'error' {
    if (loadingStates[name]) return 'loading';
    const hasFacts = sources[name] && Object.keys(sources[name].facts).length > 0;
    if (hasFacts) return 'loaded';
    if (sourceErrors[name]) return 'error';
    return 'idle';
  }
</script>

<div class="space-y-4">
  <!-- Bulk Load All -->
  {#if onLoadAll && allSourceNames.length > 0}
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Facts are loaded on demand. Click Load on any integration to fetch its facts.
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        onclick={handleLoadAll}
        disabled={loadingAll}
        title="Request facts from every available integration"
      >
        {#if loadingAll}
          <LoadingSpinner size="sm" />
          Loading all…
        {:else}
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Load all
        {/if}
      </button>
    </div>
  {/if}

  <!-- Source Cards -->
  {#if allSourceNames.length > 0}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each allSourceNames as name}
        {@const sourceFacts = sources[name]}
        {@const sourceError = sourceErrors[name]}
        {@const state = sourceState(name)}
        {@const isActive = sourceView === 'single' && activeSource === name}
        {@const isLoading = state === 'loading'}
        {@const hasFacts = state === 'loaded'}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          role={hasFacts ? 'button' : 'presentation'}
          tabindex={hasFacts ? 0 : -1}
          aria-pressed={hasFacts ? isActive : undefined}
          onclick={() => { if (hasFacts) setActiveSource(name); }}
          onkeydown={(e) => handleCardKeyDown(e, name, hasFacts)}
          class="rounded-lg border p-4 transition-all {hasFacts ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500' : ''} {isActive
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20'
            : hasFacts
              ? 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              : state === 'error'
                ? 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10'
                : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'}"
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

          {#if isLoading}
            <div class="flex items-center gap-2 py-2 text-xs text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              Loading facts…
            </div>
          {:else if hasFacts}
            <div class="space-y-1">
              <p class="text-sm text-gray-900 dark:text-white">
                {Object.keys(sourceFacts.facts).length} facts
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(sourceFacts.timestamp)}
              </p>
              {#if onLoadSource}
                <button
                  type="button"
                  class="mt-2 inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  onclick={(e) => { e.stopPropagation(); handleLoadSource(name); }}
                  title="Re-fetch facts from {getSourceLabel(name)}"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              {/if}
            </div>
          {:else if state === 'error'}
            <div class="space-y-1">
              <p class="text-xs font-medium text-red-600 dark:text-red-400">Failed to load</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 break-words">{sourceError}</p>
              {#if onLoadSource}
                <button
                  type="button"
                  class="mt-2 inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-700 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-900/30"
                  onclick={(e) => { e.stopPropagation(); handleLoadSource(name); }}
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry
                </button>
              {/if}
            </div>
          {:else}
            <p class="text-xs text-gray-500 dark:text-gray-400">Not loaded</p>
            {#if onLoadSource}
              <button
                type="button"
                class="mt-2 inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onclick={(e) => { e.stopPropagation(); handleLoadSource(name); }}
                title="Request facts from {getSourceLabel(name)}"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Load facts
              </button>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- View Mode and Display -->
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
          class="border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium transition-colors {sourceView === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
          onclick={() => sourceView = 'all'}
          title="Show every fact with a badge for each contributing source; identical values are collapsed"
        >
          All
        </button>
        <button
          type="button"
          class="border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors {sourceView === 'merged' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
          onclick={() => sourceView = 'merged'}
          title="View merged facts from all loaded sources (last source wins on conflicts)"
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

  <!-- Facts Display -->
  {#if !hasAnyFacts}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
      <p class="text-gray-500 dark:text-gray-400">
        No facts loaded yet. Use the buttons above to request facts from any integration.
      </p>
    </div>
  {:else if viewMode === 'yaml'}
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">
            YAML Output {sourceView === 'single' && activeSource
              ? `(${getSourceLabel(activeSource)})`
              : sourceView === 'all'
                ? '(All — merged for YAML)'
                : '(Merged)'}
          </h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {Object.keys(sourceView === 'single' ? currentFacts() : mergedFacts()).length} facts
          </span>
        </div>
      </div>
      <div class="p-4">
        <pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{yamlOutput()}</code></pre>
      </div>
    </div>
  {:else if sourceView === 'all'}
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">All facts (per source)</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {allFactsByKey.length} facts across {loadedSourceNames.length} {loadedSourceNames.length === 1 ? 'source' : 'sources'}
          </span>
        </div>
      </div>
      <div class="p-2">
        {#if allFactsByKey.length === 0}
          <p class="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
            No facts available
          </p>
        {:else}
          <div class="space-y-2">
            {#each allFactsByKey as { key, groups }}
              <div class="rounded border border-gray-100 dark:border-gray-700/60 px-2 py-1.5">
                <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{key}</div>
                <div class="space-y-1.5 ml-2">
                  {#each groups as group}
                    <div class="flex items-start gap-2">
                      <div class="flex flex-wrap gap-1 pt-0.5 shrink-0">
                        {#each group.sources as src}
                          <IntegrationBadge integration={getSourceIntegration(src)} variant="badge" size="sm" />
                        {/each}
                      </div>
                      <div class="min-w-0 flex-1">
                        {#if isObject(group.value) || isArray(group.value)}
                          <FactsViewer
                            facts={isArray(group.value)
                              ? Object.fromEntries((group.value as unknown[]).map((v, i) => [String(i), v]))
                              : (group.value as Record<string, unknown>)}
                            showToggle={false}
                          />
                        {:else}
                          <span class="text-sm text-gray-700 dark:text-gray-300 break-all">{formatScalar(group.value)}</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
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
