<script lang="ts">
  import { expertMode } from '../lib/expertMode.svelte';

  interface Props {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    boltCommand?: string;
  }

  let { stdout, stderr, exitCode, boltCommand }: Props = $props();

  const hasOutput = $derived(stdout || stderr || exitCode !== undefined);

  // Copy command to clipboard
  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }
</script>

{#if hasOutput}
  <div class="command-output space-y-3">
    {#if expertMode.enabled && boltCommand}
      <div>
        <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Bolt Command:</h4>
        <div class="relative rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <pre class="overflow-x-auto pr-10 font-mono text-sm text-blue-900 dark:text-blue-100">{boltCommand}</pre>
          <button
            type="button"
            class="absolute right-2 top-2 rounded p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-800"
            onclick={() => copyToClipboard(boltCommand)}
            title="Copy to clipboard"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
    {/if}

    {#if exitCode !== undefined}
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Exit Code:</span>
        <span
          class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {exitCode === 0
            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'}"
        >
          {exitCode}
        </span>
      </div>
    {/if}

    {#if stdout}
      <div>
        <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Standard Output:</h4>
        <pre
          class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >{stdout}</pre>
      </div>
    {/if}

    {#if stderr}
      <div>
        <h4 class="mb-2 text-sm font-medium text-red-700 dark:text-red-400">Standard Error:</h4>
        <pre
          class="overflow-x-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100"
        >{stderr}</pre>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-sm text-gray-500 dark:text-gray-400">No output</p>
{/if}
