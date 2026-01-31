<script lang="ts">
  import { api } from '../lib/api';
  import { logger } from '../lib/logger.svelte';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { useExecutionStream, type ExecutionStream } from '../lib/executionStream.svelte';

  interface Props {
    nodeId: string;
    onExecutionComplete?: () => void;
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

  let { nodeId, onExecutionComplete }: Props = $props();

  // State
  let expanded = $state(false);
  let packageName = $state('');
  let packageVersion = $state('');
  let provider = $state('');
  let selectedNode = $state('');
  let nodes = $state<string[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let executing = $state(false);
  let result = $state<ExecutionResult | null>(null);
  let executionStream = $state<ExecutionStream | null>(null);

  // Validation
  let validationError = $state<string | null>(null);

  // Update validation to only check packageName
  function validateForm(): boolean {
    validationError = null;

    if (!packageName.trim()) {
      validationError = 'Package name is required';
      return false;
    }

    // Validate package name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(packageName.trim())) {
      validationError = 'Package name can only contain letters, numbers, hyphens, and underscores';
      return false;
    }

    return true;
  }

  // Update the existing installPackage event handler
  async function installPackage(event: Event): Promise<void> {
    event.preventDefault();

    if (!validateForm()) {
      showError('Validation failed', validationError || 'Invalid form data');
      return;
    }

    executing = true;
    error = null;
    result = null;
    executionStream = null;

    try {
      showInfo('Installing package...');

      // Simplified parameters for new API
      const parameters: Record<string, unknown> = {
        packageName: packageName.trim(),
        expertMode: expertMode.enabled,
      };

      if (packageVersion.trim()) {
        parameters.version = packageVersion.trim();
      }

      // ✅ CORRECT: Use api.post() - not just post()
      const response = await api.post<{
        executionId: string;
        message: string;
        results?: Array<{
          node: string;
          status: string;
          message?: string;
        }>;
      }>(
        `/nodes/${selectedNode}/install-package`,
        parameters
      );

      const executionId = response.executionId;

      // If expert mode is enabled, create a stream for real-time output
      if (expertMode.enabled) {
        executionStream = useExecutionStream(executionId, {
          onComplete: (result) => {
            // Fetch final execution result
            pollExecutionResult(executionId);
            showSuccess('Package installation completed');
            // Call completion callback
            if (onExecutionComplete) {
              onExecutionComplete();
            }
          },
          onError: (error) => {
            error = error;
            showError('Package installation failed', error);
          },
        });
        executionStream.connect();
      } else {
        // Poll for execution result (non-streaming)
        await pollExecutionResult(executionId);
        showSuccess('Package installation completed');
        // Call completion callback
        if (onExecutionComplete) {
          onExecutionComplete();
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error installing package:', err);
      showError('Package installation failed', error);
    } finally {
      executing = false;
    }
  }

  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 120; // 2 minutes max
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
        console.error('Error polling execution result:', err);
        break;
      }
    }

    error = 'Execution timed out';
  }

  function resetForm(): void {
    packageName = '';
    packageVersion = '';
    ensure = 'present';
    settings = '';
    error = null;
    result = null;
    validationError = null;
  }

  // Remove the $effect that calls fetchPackageTasks
  // $effect(() => {
  //   if (expanded && !tasksFetched) {
  //     tasksFetched = true;
  //     fetchPackageTasks();
  //   }
  // });
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <button
    type="button"
    class="flex w-full items-center justify-between text-left"
    onclick={() => expanded = !expanded}
  >
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
      Install Software
      <IntegrationBadge integration="bolt" variant="badge" size="sm" />
    </h2>
    <svg
      class="h-5 w-5 transform text-gray-500 transition-transform dark:text-gray-400"
      class:rotate-180={expanded}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <div class="mt-4 space-y-4">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Install software on this node. The system will automatically detect the OS and use the appropriate package manager.
      </p>

      <form onsubmit={installPackage} class="space-y-4">
        <!-- Package Name -->
        <div>
          <label for="package-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Package Name <span class="text-red-500">*</span>
          </label>
          <input
            id="package-name"
            type="text"
            bind:value={packageName}
            placeholder="e.g., nginx, apache, mysql"
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
            required
          />
        </div>

        <!-- Package Version -->
        <div>
          <label for="package-version" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Version (optional)
          </label>
          <input
            id="package-version"
            type="text"
            bind:value={packageVersion}
            placeholder="e.g., 1.18.0, latest"
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
          />
        </div>

        {#if validationError}
          <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p class="text-sm text-red-600 dark:text-red-400">{validationError}</p>
          </div>
        {/if}

        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={executing || !packageName.trim()}
          >
            {executing ? 'Installing...' : 'Install Package'}
          </button>

          {#if result || error}
            <button
              type="button"
              onclick={resetForm}
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Reset
            </button>
          {/if}
        </div>
      </form>

      {#if executing}
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Installing package...</span>
        </div>
      {/if}

      {#if error}
        <ErrorAlert message="Package installation failed" details={error} />
      {/if}

      <!-- Real-time Output (Expert Mode + Running) -->
      {#if executionStream && expertMode.enabled && (executionStream.executionStatus === 'running' || executionStream.isConnecting)}
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Real-time Output:</h3>
          <RealtimeOutputViewer stream={executionStream} autoConnect={false} />
        </div>
      {:else if result}
        <!-- Static Installation Result -->
        <div class="mt-4 space-y-2">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Installation Result:</h3>
            <StatusBadge status={result.status} />
          </div>

          {#if result.results.length > 0}
            {#each result.results as nodeResult}
              {#if nodeResult.value}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <pre class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{JSON.stringify(nodeResult.value, null, 2)}</pre>
                </div>
              {/if}

              {#if nodeResult.output}
                <CommandOutput
                  stdout={nodeResult.output.stdout}
                  stderr={nodeResult.output.stderr}
                  exitCode={nodeResult.output.exitCode}
                  boltCommand={result.command}
                />
              {/if}

              {#if nodeResult.error}
                <ErrorAlert message="Installation error" details={nodeResult.error} />
              {/if}
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
