<script lang="ts">
  interface Props {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }

  let { stdout, stderr, exitCode }: Props = $props();

  const hasOutput = $derived(stdout || stderr || exitCode !== undefined);
</script>

{#if hasOutput}
  <div class="command-output space-y-3">
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
