<script lang="ts">
  import FactsViewer from './FactsViewer.svelte';

  interface Props {
    facts: Record<string, unknown>;
  }

  let { facts }: Props = $props();

  interface CollapsibleState {
    [key: string]: boolean;
  }

  let collapsed = $state<CollapsibleState>({});

  function toggleCollapse(key: string): void {
    collapsed[key] = !collapsed[key];
  }

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }
</script>

<div class="facts-viewer rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
  <div class="space-y-2">
    {#each Object.entries(facts) as [key, value]}
      <div class="fact-item">
        {#if isObject(value) || isArray(value)}
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onclick={() => toggleCollapse(key)}
          >
            <svg
              class="h-4 w-4 transition-transform {collapsed[key] ? '' : 'rotate-90'}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="font-medium text-gray-700 dark:text-gray-300">{key}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
            </span>
          </button>
          {#if !collapsed[key]}
            <div class="ml-6 mt-1">
              <FactsViewer facts={value as Record<string, unknown>} />
            </div>
          {/if}
        {:else}
          <div class="flex items-start gap-2 px-2 py-1">
            <span class="font-medium text-gray-700 dark:text-gray-300">{key}:</span>
            <span class="text-gray-600 dark:text-gray-400">{formatValue(value)}</span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
