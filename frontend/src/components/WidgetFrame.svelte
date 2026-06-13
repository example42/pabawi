<script lang="ts">
  import type { WidgetDefinition } from '../lib/widgetRegistry.svelte';

  interface Props {
    widget: WidgetDefinition;
    nodeId: string;
  }

  let { widget, nodeId }: Props = $props();

  let state = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state<string | null>(null);
  let mountKey = $state(0);

  // Column span CSS class mapping
  const spanClass = $derived(
    widget.colSpan === 3 ? 'sm:col-span-2 lg:col-span-3'
    : widget.colSpan === 2 ? 'sm:col-span-2 lg:col-span-2'
    : 'col-span-1'
  );

  function handleReady(): void {
    state = 'ready';
  }

  function handleError(err: Error): void {
    state = 'error';
    error = err.message || 'Widget failed to load';
  }

  function retry(): void {
    state = 'loading';
    error = null;
    mountKey += 1;
  }
</script>

<div class="{spanClass} min-h-[120px]">
  {#if state === 'loading'}
    <div class="h-full animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
      <div class="p-6 space-y-3">
        <div class="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div class="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div class="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
      </div>
    </div>
  {/if}

  {#if state === 'error'}
    <div class="h-full rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-2">
        <span class="text-sm font-medium text-red-800 dark:text-red-300">{widget.integration}</span>
        <span class="text-sm text-red-600 dark:text-red-400">{error}</span>
      </div>
      <button
        type="button"
        class="mt-2 text-sm text-red-700 underline hover:no-underline dark:text-red-400"
        onclick={retry}
      >
        Retry
      </button>
    </div>
  {/if}

  {#if state === 'loading' || state === 'ready'}
    <div class:hidden={state === 'loading'}>
      {#key mountKey}
        <widget.component
          {nodeId}
          onReady={handleReady}
          onError={handleError}
        />
      {/key}
    </div>
  {/if}
</div>
