<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';
  import PuppetOutputViewer from './PuppetOutputViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import { post, get } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { logger } from '../lib/logger.svelte';
  import { useExecutionStream, type ExecutionStream } from '../lib/executionStream.svelte';

  interface Props {
    nodeId?: string;
    nodeIds?: string[];
    onExecutionComplete?: () => void;
  }

  interface PuppetRunConfig {
    tags?: string[];
    environment?: string;
    noop?: boolean;
    noNoop?: boolean;
    debug?: boolean;
    splay?: boolean;
    splayLimit?: number;
    tool?: 'bolt' | 'ansible' | 'ssh';
  }

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
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

  interface IntegrationStatus {
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
    type: 'execution' | 'information' | 'both';
  }

  let { nodeId, nodeIds, onExecutionComplete }: Props = $props();

  // State
  let expanded = $state(false);
  let executing = $state(false);
  let error = $state<string | null>(null);
  let result = $state<ExecutionResult | null>(null);
  let executionStream = $state<ExecutionStream | null>(null);

  // Available execution tools
  let availableTools = $state<Array<'bolt' | 'ansible' | 'ssh'>>(['bolt']);
  let toolsLoaded = $state(false);

  // Configuration state
  let tagsInput = $state('');
  let environment = $state('');
  let noop = $state(false);
  let noNoop = $state(false);
  let debug = $state(false);
  let splay = $state(false);
  let splayLimit = $state(30);
  let selectedTool = $state<'bolt' | 'ansible' | 'ssh'>('bolt');

  // Determine if this is a multi-node execution
  const isMultiNode = $derived(!nodeId && nodeIds && nodeIds.length > 0);
  const targetCount = $derived(isMultiNode ? (nodeIds?.length ?? 0) : 1);

  // Fetch available execution tools when expanded
  async function fetchExecutionTools(): Promise<void> {
    if (toolsLoaded) return;
    try {
      const data = await get<{ integrations: IntegrationStatus[] }>('/api/integrations/status', {
        maxRetries: 1,
      });

      const executionIntegrations = data.integrations.filter(
        (integration) => (integration.type === 'execution' || integration.type === 'both')
          && (integration.status === 'connected' || integration.status === 'degraded')
          && (integration.name === 'bolt' || integration.name === 'ansible' || integration.name === 'ssh'),
      ) as Array<IntegrationStatus & { name: 'bolt' | 'ansible' | 'ssh' }>;

      if (executionIntegrations.length > 0) {
        availableTools = executionIntegrations.map((i) => i.name);
        if (!availableTools.includes(selectedTool)) {
          selectedTool = availableTools[0];
        }
      }
    } catch {
      availableTools = ['bolt'];
    }
    toolsLoaded = true;
  }

  // Toggle expanded state
  function toggleExpanded(): void {
    expanded = !expanded;
    if (expanded) {
      void fetchExecutionTools();
    }
  }

  // Handle noop toggle - ensure noop and noNoop are mutually exclusive
  function handleNoopToggle(): void {
    noop = !noop;
    if (noop && noNoop) {
      noNoop = false;
    }
  }

  // Handle no-noop toggle - ensure noop and noNoop are mutually exclusive
  function handleNoNoopToggle(): void {
    noNoop = !noNoop;
    if (noNoop && noop) {
      noop = false;
    }
  }

  // Execute Puppet run
  async function executePuppetRun(event: Event): Promise<void> {
    event.preventDefault();

    executing = true;
    error = null;
    result = null;
    executionStream = null;

    try {
      const targetLabel = isMultiNode ? `${String(targetCount)} node(s)` : 'node';
      showInfo(`Running Puppet agent on ${targetLabel}...`);

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

      if (splay) {
        config.splay = true;
        config.splayLimit = splayLimit;
      }

      config.tool = selectedTool;

      if (isMultiNode) {
        // Multi-node execution
        const payload = {
          targetNodeIds: nodeIds,
          ...config,
          expertMode: expertMode.enabled,
        };

        const data = await post<{ executionIds: string[] }>(
          '/api/puppet-run',
          payload,
          { maxRetries: 0 }
        );

        showSuccess(`Puppet run started on ${String(data.executionIds.length)} node(s)`);

        if (data.executionIds.length > 0) {
          await pollExecutionResult(data.executionIds[0]);
        }

        if (onExecutionComplete) {
          onExecutionComplete();
        }
      } else {
        // Single-node execution
        const payload = {
          ...config,
          expertMode: expertMode.enabled,
        };

        const data = await post<{ executionId: string }>(
          `/api/nodes/${nodeId}/puppet-run`,
          payload,
          { maxRetries: 0 }
        );

        const executionId = data.executionId;

        if (expertMode.enabled) {
          executionStream = useExecutionStream(executionId, {
            onComplete: () => {
              pollExecutionResult(executionId);
              showSuccess('Puppet run completed');
              if (onExecutionComplete) {
                onExecutionComplete();
              }
            },
            onError: (streamError) => {
              error = streamError;
              showError('Puppet run failed', streamError);
            },
          });
          executionStream.connect();
        } else {
          await pollExecutionResult(executionId);
          showSuccess('Puppet run completed');
          if (onExecutionComplete) {
            onExecutionComplete();
          }
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      logger.error('PuppetRunInterface', 'executePuppetRun', 'Error executing Puppet run', err instanceof Error ? err : new Error(String(err)));
      showError('Puppet run failed', error);
    } finally {
      executing = false;
    }
  }

  // Poll for execution result
  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 120;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/executions/${executionId}`);

        if (response.ok) {
          const data = await response.json();
          const execution = data.execution;

          if (execution.status !== 'running') {
            result = execution;
            return;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err) {
        logger.error('PuppetRunInterface', 'pollExecutionResult', 'Error polling execution result', err instanceof Error ? err : new Error(String(err)));
        break;
      }
    }

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
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
        Run Puppet
        {#if isMultiNode}
          <span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({targetCount} nodes)
          </span>
        {/if}
      </h2>
      <IntegrationBadge integration={selectedTool} variant="badge" size="sm" />
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
        <!-- Execution Tool Selection (buttons) -->
        {#if availableTools.length > 1}
          <div>
            <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Execution Tool
            </div>
            <div class="flex gap-2" role="group" aria-label="Execution Tool">
              {#each availableTools as tool}
                <button
                  type="button"
                  onclick={() => selectedTool = tool}
                  class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {selectedTool === tool
                    ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-purple-400 dark:hover:bg-gray-700'}"
                  disabled={executing}
                >
                  <IntegrationBadge integration={tool} variant="dot" size="md" />
                  <span class="capitalize">{tool}</span>
                  {#if selectedTool === tool}
                    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

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

        <!-- Noop Mode Toggle -->
        <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex-1">
            <label for="puppet-noop-toggle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Noop mode (dry-run)
            </label>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Run Puppet without making changes
            </p>
          </div>
          <button
            type="button"
            id="puppet-noop-toggle"
            role="switch"
            aria-checked={noop}
            aria-label="Toggle noop mode (dry-run)"
            onclick={handleNoopToggle}
            disabled={executing}
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {noop ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {noop ? 'translate-x-5' : 'translate-x-0'}"
            ></span>
          </button>
        </div>

        <!-- No-noop Mode Toggle -->
        <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex-1">
            <label for="puppet-no-noop-toggle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              No-noop mode (override node noop setting)
            </label>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Force Puppet to make changes even if node is in noop mode
            </p>
          </div>
          <button
            type="button"
            id="puppet-no-noop-toggle"
            role="switch"
            aria-checked={noNoop}
            aria-label="Toggle no-noop mode (override node noop setting)"
            onclick={handleNoNoopToggle}
            disabled={executing}
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {noNoop ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {noNoop ? 'translate-x-5' : 'translate-x-0'}"
            ></span>
          </button>
        </div>

        <!-- Debug Mode Toggle -->
        <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex-1">
            <label for="puppet-debug-toggle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Debug mode (verbose output)
            </label>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Enable detailed logging for troubleshooting
            </p>
          </div>
          <button
            type="button"
            id="puppet-debug-toggle"
            role="switch"
            aria-checked={debug}
            aria-label="Toggle debug mode (verbose output)"
            onclick={() => debug = !debug}
            disabled={executing}
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {debug ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {debug ? 'translate-x-5' : 'translate-x-0'}"
            ></span>
          </button>
        </div>

        <!-- Splay Toggle -->
        <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div class="flex-1">
            <label for="puppet-splay-toggle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Splay (randomized delay)
            </label>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Add a random delay before running to avoid thundering herd
            </p>
          </div>
          <button
            type="button"
            id="puppet-splay-toggle"
            role="switch"
            aria-checked={splay}
            aria-label="Toggle splay (randomized delay)"
            onclick={() => splay = !splay}
            disabled={executing}
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {splay ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {splay ? 'translate-x-5' : 'translate-x-0'}"
            ></span>
          </button>
        </div>

        <!-- Splay Limit (shown when splay is enabled) -->
        {#if splay}
          <div>
            <label for="puppet-splay-limit" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Splay limit (seconds)
            </label>
            <input
              id="puppet-splay-limit"
              type="number"
              bind:value={splayLimit}
              min="1"
              max="600"
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              disabled={executing}
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Maximum random delay in seconds (1-600)
            </p>
          </div>
        {/if}

        <!-- Execute Button -->
        <button
          type="submit"
          class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={executing}
        >
          {#if executing}
            Running...
          {:else if isMultiNode}
            Run Puppet on {targetCount} nodes
          {:else}
            Run Puppet
          {/if}
        </button>
      </form>

      <!-- Executing State -->
      {#if executing}
        <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Running Puppet agent{isMultiNode ? ` on ${String(targetCount)} nodes` : ''}...</span>
        </div>
      {/if}

      <!-- Error State -->
      {#if error}
        <div class="mt-4">
          <ErrorAlert message="Puppet run failed" details={error} />
        </div>
      {/if}

      <!-- Real-time Output (Expert Mode + Running) -->
      {#if executionStream && expertMode.enabled && (executionStream.executionStatus === 'running' || executionStream.isConnecting)}
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Real-time Output:</h3>
          <RealtimeOutputViewer stream={executionStream} autoConnect={false} />
        </div>
      {:else if result}
        <!-- Static Result State -->
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

              <!-- Show command if available -->
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
