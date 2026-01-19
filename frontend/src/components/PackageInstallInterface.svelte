<script lang="ts">
  import { get, post } from '../lib/api';
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

  interface PackageTask {
    name: string;
    label: string;
    parameterMapping: {
      packageName: string;
      ensure?: string;
      version?: string;
      settings?: string;
    };
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
  let availableTasks = $state<PackageTask[]>([]);
  let selectedTask = $state<string>('');
  let packageName = $state('');
  let packageVersion = $state('');
  let ensure = $state<'present' | 'absent' | 'latest'>('present');
  let settings = $state('');
  let executing = $state(false);
  let error = $state<string | null>(null);
  let result = $state<ExecutionResult | null>(null);
  let tasksLoading = $state(false);
  let tasksFetched = $state(false);
  let executionStream = $state<ExecutionStream | null>(null);

  // Validation
  let validationError = $state<string | null>(null);

  // Fetch available package tasks
  async function fetchPackageTasks(): Promise<void> {
    tasksLoading = true;
    try {
      const data = await get<{ tasks: PackageTask[] }>('/api/package-tasks', {
        maxRetries: 2,
      });
      availableTasks = data.tasks || [];
      if (availableTasks.length > 0 && !selectedTask) {
        selectedTask = availableTasks[0].name;
      }
    } catch (err) {
      console.error('Error fetching package tasks:', err);
      showError('Failed to load package tasks');
    } finally {
      tasksLoading = false;
    }
  }

  // Get the selected task configuration
  const selectedTaskConfig = $derived(
    availableTasks.find((t) => t.name === selectedTask)
  );

  // Check if settings are supported by the selected task
  const supportsSettings = $derived(
    selectedTaskConfig?.parameterMapping.settings !== undefined
  );

  function validateForm(): boolean {
    validationError = null;

    if (!selectedTask) {
      validationError = 'Please select a package task';
      return false;
    }

    if (!packageName.trim()) {
      validationError = 'Package name is required';
      return false;
    }

    // Validate package name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(packageName.trim())) {
      validationError = 'Package name can only contain letters, numbers, hyphens, and underscores';
      return false;
    }

    // Validate settings JSON if provided
    if (settings.trim()) {
      try {
        JSON.parse(settings);
      } catch (e) {
        validationError = 'Settings must be valid JSON';
        return false;
      }
    }

    return true;
  }

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

      // Build parameters
      const parameters: Record<string, unknown> = {
        taskName: selectedTask,
        packageName: packageName.trim(),
        ensure,
        expertMode: expertMode.enabled,
      };

      if (packageVersion.trim()) {
        parameters.version = packageVersion.trim();
      }

      if (settings.trim() && supportsSettings) {
        parameters.settings = JSON.parse(settings);
      }

      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/install-package`,
        parameters,
        { maxRetries: 0 }
      );

      const executionId = data.executionId;

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

  // Fetch tasks when component expands
  $effect(() => {
    if (expanded && !tasksFetched) {
      tasksFetched = true;
      fetchPackageTasks();
    }
  });
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
        Install software on this node using the configured package installation task.
      </p>

      <form onsubmit={installPackage} class="space-y-4">
        <!-- Task Selection -->
        <div>
          <label for="task-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Package Task <span class="text-red-500">*</span>
          </label>
          {#if tasksLoading}
            <div class="mt-1 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>Loading tasks...</span>
            </div>
          {:else if availableTasks.length === 0}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              No package tasks available
            </p>
          {:else}
            <select
              id="task-select"
              bind:value={selectedTask}
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              disabled={executing}
              required
            >
              {#each availableTasks as task}
                <option value={task.name}>{task.label}</option>
              {/each}
            </select>
            {#if selectedTaskConfig}
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Task: {selectedTaskConfig.name}
              </p>
            {/if}
          {/if}
        </div>

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

        <!-- Ensure -->
        <div>
          <label for="ensure" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Ensure
          </label>
          <select
            id="ensure"
            bind:value={ensure}
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            disabled={executing}
          >
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="latest">Latest</option>
          </select>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Present: Install if not present, Absent: Remove if present, Latest: Install/upgrade to latest version
          </p>
        </div>

        <!-- Settings -->
        {#if supportsSettings}
          <div>
            <label for="settings" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Additional Settings (JSON)
            </label>
            <textarea
              id="settings"
              bind:value={settings}
              placeholder='&#123;"option1": "value1", "option2": "value2"&#125;'
              rows="3"
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
              disabled={executing}
            ></textarea>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional JSON object with additional package-specific settings
            </p>
          </div>
        {/if}

        {#if validationError}
          <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p class="text-sm text-red-600 dark:text-red-400">{validationError}</p>
          </div>
        {/if}

        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={executing || !packageName.trim() || !selectedTask || availableTasks.length === 0}
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
