<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import PuppetOutputViewer from './PuppetOutputViewer.svelte';
  import { post } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';

  interface Props {
    nodeId: string;
    onExecutionComplete?: () => void;
  }

  interface PuppetRunConfig {
    tags?: string[];
    environment?: string;
    noop?: boolean;
    noNoop?: boolean;
    debug?: boolean;
  }

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
  }

  interface NodeResult {
    nodeId: string;
    status: 'success' | 'failed';
    output?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    value?: unknown;
    error?: string;
    duration: number;
  }

  let { nodeId, onExecutionComplete }: Props = $props();

  // State
  let expanded = $state(false);
  let executing = $state(false);
  let error = $state<string | null>(null);
  let result = $state<ExecutionResult | null>(null);

  // Configuration state
  let tagsInput = $state('');
  let environment = $state('');
  let noop = $state(false);
  let noNoop = $state(false);
  let debug = $state(false);
  let showAdvanced = $state(false);

  // Toggle expanded state
  function toggleExpanded(): void {
    expanded = !expanded;
  }

  // Execute Puppet run
  async function executePuppetRun(event: Event): Promise<void> {
    event.preventDefault();

    executing = true;
    error = null;
    result = null;

    try {
      showInfo('Running Puppet agent...');

      // Build configuration
      const config: PuppetRunConfig = {};

      if (tagsInput.trim()) {
        config.tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }

      if (environment.trim()) {
        config.environment = environment.trim();
      }

      if (noop) {
        config.noop = true;
      }

      if (noNoop) {
        config.noNoop = true;
      }

      if (debug) {
        config.debug = true;
      }

      // Execute Puppet run
      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/puppet-run`,
        config,
        { maxRetries: 0 }
      );

      const executionId = data.executionId;

      // Poll for execution result
      await pollExecutionResult(executionId);

      showSuccess('Puppet run completed');

      // Notify parent component
      if (onExecutionComplete) {
        onExecutionComplete();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error executing Puppet run:', err);
      showError('Puppet run failed', error);
    } finally {
      executing = false;
    }
  }

  // Poll for execution result
  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 120; // 2 minutes max (Puppet runs can take longer)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/executions/${executionId}`);

        if (response.ok) {
          const data = await response.json();
          const execution = data.execution;

          if (execution.status !== 'running') {
            // Execution completed
            result = execution;
            return;
          }
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err) {
        console.error('Error polling execution result:', err);
        break;
      }
    }

    // Timeout
    error = 'Execution timed out';
  }

  // Format duration
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
</script>

<div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <!-- Header -->
  <button
    type="button"
    class="flex w-full items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
    onclick={toggleExpanded}
  >
    <div class="flex items-center gap-3">
      <svg
        class="h-6 w-6 text-purple-600 dark:text-purple-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Run Puppet</h2>
    </div>
    <svg
      class="h-5 w-5 text-gray-500 transition-transform dark:text-gray-400"
      class:rotate-180={expanded}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Content -->
  {#if expanded}
    <div class="border-t border-gray-200 p-6 dark:border-gray-700">
      <form onsubmit={executePuppetRun} class="space-y-4">
        <!-- Tags Input -->
        <div>
          <label for="puppet-tags" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tags (comma-separated)
          </label>
          <input
            id="puppet-tags"
            type="text"
            bind:value={tagsInput}
            placeholder="e.g., webserver, database"
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Optional: Limit Puppet run to specific tags
          </p>
        </div>

        <!-- Environment Input -->
        <div>
          <label for="puppet-environment" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Environment
          </label>
          <input
            id="puppet-environment"
            type="text"
            bind:value={environment}
            placeholder="e.g., production, development"
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Optional: Specify Puppet environment
          </p>
        </div>

        <!-- Mode Toggles -->
        <div class="space-y-3">
          <div class="flex items-center">
            <input
              id="puppet-noop"
              type="checkbox"
              bind:checked={noop}
              class="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
              disabled={executing}
            />
            <label for="puppet-noop" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Noop mode (dry-run)
            </label>
          </div>

          <div class="flex items-center">
            <input
              id="puppet-no-noop"
              type="checkbox"
              bind:checked={noNoop}
              class="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
              disabled={executing}
            />
            <label for="puppet-no-noop" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              No-noop mode (override node noop setting)
            </label>
          </div>

          <div class="flex items-center">
            <input
              id="puppet-debug"
              type="checkbox"
              bind:checked={debug}
              class="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
              disabled={executing}
            />
            <label for="puppet-debug" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Debug mode (verbose output)
            </label>
          </div>
        </div>

        <!-- Advanced Options Toggle -->
        <button
          type="button"
          class="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
          onclick={() => showAdvanced = !showAdvanced}
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {#if showAdvanced}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Additional Puppet options can be added here in future versions.
            </p>
          </div>
        {/if}

        <!-- Execute Button -->
        <button
          type="submit"
          class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={executing}
        >
          {executing ? 'Running...' : 'Run Puppet'}
        </button>
      </form>

      <!-- Executing State -->
      {#if executing}
        <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Running Puppet agent...</span>
        </div>
      {/if}

      <!-- Error State -->
      {#if error}
        <div class="mt-4">
          <ErrorAlert message="Puppet run failed" details={error} />
        </div>
      {/if}

      <!-- Result State -->
      {#if result}
        <div class="mt-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h3>
            <StatusBadge status={result.status} />
          </div>

          {#if result.results.length > 0}
            {#each result.results as nodeResult}
              <!-- Duration -->
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Duration: {formatDuration(nodeResult.duration)}
              </div>

              <!-- Puppet Output -->
              {#if nodeResult.output?.stdout || nodeResult.value}
                <PuppetOutputViewer
                  output={nodeResult.output?.stdout || ''}
                  value={nodeResult.value}
                />
              {/if}

              <!-- Show stderr separately if present -->
              {#if nodeResult.output?.stderr}
                <div class="mt-2">
                  <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Error Output
                  </h4>
                  <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
                    <pre class="whitespace-pre-wrap text-xs text-red-800 dark:text-red-200">{nodeResult.output.stderr}</pre>
                  </div>
                </div>
              {/if}

              <!-- Show Bolt command if available -->
              {#if result.command}
                <div class="mt-2">
                  <CommandOutput boltCommand={result.command} />
                </div>
              {/if}

              {#if nodeResult.error}
                <div class="mt-2">
                  <ErrorAlert message="Execution error" details={nodeResult.error} />
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rotate-180 {
    transform: rotate(180deg);
  }
</style>
