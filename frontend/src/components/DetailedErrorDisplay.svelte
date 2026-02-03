<script lang="ts">
  import type { ApiError } from '../lib/api';
  import { debugMode } from '../lib/debug';

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
  <div class="text-sm text-red-800 dark:text-red-200 space-y-2">
    <p class="font-medium">{error.message}</p>

    <div class="flex items-center gap-2 text-xs">
      {#if error.type}
        <span class="rounded-full bg-red-100 px-2 py-0.5 font-medium dark:bg-red-900/40">
          {error.type.replace('_', ' ').toUpperCase()}
        </span>
      {/if}
      {#if error.code}
        <span class="font-mono text-red-600 dark:text-red-400">{error.code}</span>
      {/if}
    </div>

    {#if error.actionableMessage && error.actionableMessage !== error.message}
      <p class="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded p-2 border-l-4 border-red-400">
        💡 {error.actionableMessage}
      </p>
    {/if}
  </div>

  <!-- Troubleshooting Guidance (always shown if available) -->
  {#if error.troubleshooting}
    <div class="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Troubleshooting Steps
      </h4>
      <ol class="list-decimal list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
        {#each error.troubleshooting.steps as step}
          <li>{step}</li>
        {/each}
      </ol>
      {#if error.troubleshooting.documentation}
        <div class="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
          <a
            href={error.troubleshooting.documentation}
            class="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 underline flex items-center gap-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            View documentation
          </a>
        </div>
      {/if}
      {#if error.troubleshooting.relatedErrors && error.troubleshooting.relatedErrors.length > 0}
        <div class="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
          <p class="text-xs text-blue-600 dark:text-blue-400">
            <span class="font-medium">Related errors:</span> {error.troubleshooting.relatedErrors.join(', ')}
          </p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Expert Mode Details -->
  {#if debugMode.enabled}
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
