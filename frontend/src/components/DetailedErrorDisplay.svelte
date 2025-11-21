<script lang="ts">
  import type { ApiError } from '../lib/api';
  import { expertMode } from '../lib/expertMode.svelte';

  interface Props {
    error: ApiError;
  }

  let { error }: Props = $props();
  let showStackTrace = $state(false);
  let showRawResponse = $state(false);
  let showContext = $state(false);

  function copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Failed to copy to clipboard:', err);
    });
  }

  function formatJson(data: unknown): string {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
</script>

<div class="space-y-3">
  <!-- Basic Error Message (always shown) -->
  <div class="text-sm text-red-800 dark:text-red-200">
    <p class="font-medium">{error.message}</p>
    {#if error.code}
      <p class="mt-1 text-xs text-red-600 dark:text-red-400">Error Code: {error.code}</p>
    {/if}
  </div>

  <!-- Expert Mode Details -->
  {#if expertMode.enabled}
    <div class="space-y-2">
      <!-- Bolt Command (if available) -->
      {#if error.boltCommand}
        <div class="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <div class="flex items-center justify-between p-3">
            <div class="flex items-center gap-2">
              <svg class="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span class="text-sm font-medium text-amber-800 dark:text-amber-200">Bolt Command</span>
            </div>
            <button
              type="button"
              class="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
              onclick={() => copyToClipboard(error.boltCommand ?? '')}
            >
              Copy
            </button>
          </div>
          <pre class="overflow-x-auto border-t border-amber-200 bg-amber-100/50 p-3 text-xs font-mono text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">{error.boltCommand}</pre>
        </div>
      {/if}

      <!-- Request ID and Timestamp -->
      {#if error.requestId || error.timestamp}
        <div class="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
          {#if error.requestId}
            <div>
              <span class="font-medium">Request ID:</span>
              <code class="ml-1 rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">{error.requestId}</code>
            </div>
          {/if}
          {#if error.timestamp}
            <div>
              <span class="font-medium">Timestamp:</span>
              <code class="ml-1 rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">{error.timestamp}</code>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Stack Trace -->
      {#if error.stackTrace}
        <div class="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <button
            type="button"
            class="flex w-full items-center justify-between p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
            onclick={() => showStackTrace = !showStackTrace}
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Stack Trace</span>
            <svg
              class="h-5 w-5 text-gray-500 transition-transform {showStackTrace ? 'rotate-180' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if showStackTrace}
            <div class="border-t border-gray-200 dark:border-gray-700">
              <div class="flex justify-end p-2">
                <button
                  type="button"
                  class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  onclick={() => copyToClipboard(error.stackTrace ?? '')}
                >
                  Copy
                </button>
              </div>
              <pre class="overflow-x-auto p-3 text-xs font-mono text-gray-800 dark:text-gray-200">{error.stackTrace}</pre>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Raw Response -->
      {#if error.rawResponse}
        <div class="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <button
            type="button"
            class="flex w-full items-center justify-between p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
            onclick={() => showRawResponse = !showRawResponse}
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Raw Response</span>
            <svg
              class="h-5 w-5 text-gray-500 transition-transform {showRawResponse ? 'rotate-180' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if showRawResponse}
            <div class="border-t border-gray-200 dark:border-gray-700">
              <div class="flex justify-end p-2">
                <button
                  type="button"
                  class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  onclick={() => copyToClipboard(formatJson(error.rawResponse))}
                >
                  Copy
                </button>
              </div>
              <pre class="overflow-x-auto p-3 text-xs font-mono text-gray-800 dark:text-gray-200">{formatJson(error.rawResponse)}</pre>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Execution Context -->
      {#if error.executionContext}
        <div class="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <button
            type="button"
            class="flex w-full items-center justify-between p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
            onclick={() => showContext = !showContext}
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Execution Context</span>
            <svg
              class="h-5 w-5 text-gray-500 transition-transform {showContext ? 'rotate-180' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if showContext}
            <div class="border-t border-gray-200 dark:border-gray-700">
              <div class="flex justify-end p-2">
                <button
                  type="button"
                  class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  onclick={() => copyToClipboard(formatJson(error.executionContext))}
                >
                  Copy
                </button>
              </div>
              <pre class="overflow-x-auto p-3 text-xs font-mono text-gray-800 dark:text-gray-200">{formatJson(error.executionContext)}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
