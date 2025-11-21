<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import TaskParameterForm from './TaskParameterForm.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface Task {
    name: string;
    module: string;
    description?: string;
    parameters: TaskParameter[];
    modulePath: string;
  }

  interface TaskParameter {
    name: string;
    type: 'String' | 'Integer' | 'Boolean' | 'Array' | 'Hash';
    description?: string;
    required: boolean;
    default?: unknown;
  }

  interface TasksByModule {
    [moduleName: string]: Task[];
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

  interface Props {
    nodeId: string;
    onTaskSelect?: (task: Task) => void;
    onExecutionComplete?: (result: ExecutionResult) => void;
  }

  let { nodeId, onTaskSelect, onExecutionComplete }: Props = $props();

  // State
  let tasksByModule = $state<TasksByModule>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedModules = $state<Set<string>>(new Set());
  let selectedTask = $state<Task | null>(null);

  // Execution state
  let taskParameters = $state<Record<string, unknown>>({});
  let executing = $state(false);
  let executionError = $state<string | null>(null);
  let executionResult = $state<ExecutionResult | null>(null);
  let parameterFormRef = $state<TaskParameterForm | null>(null);

  // Execution history state
  let executionHistory = $state<ExecutionResult[]>([]);
  let historyLoading = $state(false);

  // Computed
  const modules = $derived(Object.keys(tasksByModule).sort());

  const filteredTasksByModule = $derived(() => {
    if (!searchQuery.trim()) {
      return tasksByModule;
    }

    const query = searchQuery.toLowerCase();
    const filtered: TasksByModule = {};

    for (const [moduleName, tasks] of Object.entries(tasksByModule)) {
      const matchingTasks = tasks.filter(
        task =>
          task.name.toLowerCase().includes(query) ||
          task.module.toLowerCase().includes(query) ||
          (task.description && task.description.toLowerCase().includes(query))
      );

      if (matchingTasks.length > 0) {
        filtered[moduleName] = matchingTasks;
      }
    }

    return filtered;
  });

  // Fetch tasks grouped by module
  async function fetchTasksByModule(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ tasksByModule: TasksByModule }>('/api/tasks/by-module', {
        maxRetries: 2,
      });

      tasksByModule = data.tasksByModule || {};

      // Auto-expand first module if only one exists
      if (modules.length === 1) {
        expandedModules.add(modules[0]);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching tasks by module:', err);
      showError('Failed to load tasks', error);
    } finally {
      loading = false;
    }
  }

  // Toggle module expansion
  function toggleModule(moduleName: string): void {
    if (expandedModules.has(moduleName)) {
      expandedModules.delete(moduleName);
    } else {
      expandedModules.add(moduleName);
    }
    expandedModules = new Set(expandedModules); // Trigger reactivity
  }

  // Expand all modules
  function expandAll(): void {
    expandedModules = new Set(modules);
  }

  // Collapse all modules
  function collapseAll(): void {
    expandedModules = new Set();
  }

  // Select task
  function selectTask(task: Task): void {
    selectedTask = task;
    taskParameters = {};
    executionError = null;
    executionResult = null;

    if (onTaskSelect) {
      onTaskSelect(task);
    }
  }

  // Handle parameter values change
  function handleParametersChange(values: Record<string, unknown>): void {
    taskParameters = values;
  }

  // Execute task
  async function executeTask(event: Event): Promise<void> {
    event.preventDefault();

    if (!selectedTask) {
      executionError = 'Please select a task';
      showError('Please select a task');
      return;
    }

    // Validate parameters
    if (parameterFormRef && !parameterFormRef.validate()) {
      executionError = 'Please fix parameter validation errors';
      showError('Please fix parameter validation errors');
      return;
    }

    executing = true;
    executionError = null;
    executionResult = null;

    try {
      showInfo('Executing task...');

      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/task`,
        {
          taskName: selectedTask.name,
          parameters: taskParameters,
          expertMode: expertMode.enabled,
        },
        { maxRetries: 0 } // Don't retry task executions
      );

      const executionId = data.executionId;

      // Poll for execution result
      await pollExecutionResult(executionId);

      showSuccess('Task executed successfully');

      // Refresh execution history
      fetchExecutionHistory();
    } catch (err) {
      executionError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error executing task:', err);
      showError('Task execution failed', executionError);
    } finally {
      executing = false;
    }
  }

  // Poll for execution result
  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 60; // 60 seconds max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/executions/${executionId}`);

        if (response.ok) {
          const data = await response.json();
          const execution = data.execution;

          if (execution.status !== 'running') {
            // Execution completed
            executionResult = execution;

            if (onExecutionComplete) {
              onExecutionComplete(execution);
            }

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
    executionError = 'Execution timed out';
  }

  // Fetch execution history for selected task
  async function fetchExecutionHistory(): Promise<void> {
    if (!selectedTask) return;

    historyLoading = true;

    try {
      const data = await get<{ executions: ExecutionResult[] }>(
        `/api/executions?targetNode=${nodeId}&action=${encodeURIComponent(selectedTask.name)}&pageSize=5`,
        { maxRetries: 2 }
      );

      executionHistory = data.executions || [];
    } catch (err) {
      console.error('Error fetching execution history:', err);
    } finally {
      historyLoading = false;
    }
  }

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Watch for selected task changes to fetch history
  $effect(() => {
    if (selectedTask) {
      fetchExecutionHistory();
    } else {
      executionHistory = [];
    }
  });

  // On mount
  onMount(() => {
    fetchTasksByModule();
  });
</script>

<div class="task-run-interface">
  <!-- Header with search -->
  <div class="mb-4 flex items-center justify-between gap-4">
    <div class="flex-1">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search tasks or modules..."
        class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
      />
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={expandAll}
        class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Expand All
      </button>
      <button
        type="button"
        onclick={collapseAll}
        class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Collapse All
      </button>
    </div>
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-8">
      <LoadingSpinner message="Loading tasks..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert
      message="Failed to load tasks"
      details={error}
      onRetry={fetchTasksByModule}
    />
  {:else if modules.length === 0}
    <!-- Empty State -->
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No tasks found. Make sure Bolt modules are installed in your project.
      </p>
    </div>
  {:else}
    <!-- Tasks by Module -->
    <div class="space-y-2">
      {#each Object.entries(filteredTasksByModule()) as [moduleName, tasks]}
        <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <!-- Module Header -->
          <button
            type="button"
            onclick={() => toggleModule(moduleName)}
            class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-5 w-5 text-gray-400 transition-transform {expandedModules.has(moduleName) ? 'rotate-90' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                  {moduleName}
                </h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </p>
              </div>
            </div>
          </button>

          <!-- Module Tasks -->
          {#if expandedModules.has(moduleName)}
            <div class="border-t border-gray-200 dark:border-gray-700">
              {#each tasks as task}
                <button
                  type="button"
                  onclick={() => selectTask(task)}
                  class="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 last:border-b-0 dark:border-gray-700 dark:hover:bg-gray-700 {selectedTask?.name === task.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
                >
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        {task.name}
                      </span>
                      {#if task.parameters.some(p => p.required)}
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                          Required params
                        </span>
                      {/if}
                    </div>
                    {#if task.description}
                      <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {task.description}
                      </p>
                    {/if}
                    {#if task.parameters.length > 0}
                      <div class="mt-2 flex flex-wrap gap-1">
                        {#each task.parameters as param}
                          <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {param.name}
                            {#if param.required}
                              <span class="ml-0.5 text-red-500">*</span>
                            {/if}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  {#if selectedTask?.name === task.name}
                    <svg class="h-5 w-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Selected Task Execution Form -->
    {#if selectedTask}
      <div class="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h4 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Execute: {selectedTask.name}
        </h4>

        {#if selectedTask.description}
          <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {selectedTask.description}
          </p>
        {/if}

        <form onsubmit={executeTask} class="space-y-4">
          <!-- Task Parameters Form -->
          {#if selectedTask.parameters.length > 0}
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <h5 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Parameters</h5>
              <TaskParameterForm
                bind:this={parameterFormRef}
                parameters={selectedTask.parameters}
                values={taskParameters}
                onValuesChange={handleParametersChange}
                disabled={executing}
              />
            </div>
          {/if}

          <!-- Execute Button -->
          <button
            type="submit"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={executing}
          >
            {executing ? 'Executing...' : 'Execute Task'}
          </button>
        </form>

        <!-- Execution Status -->
        {#if executing}
          <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <LoadingSpinner size="sm" />
            <span>Executing task...</span>
          </div>
        {/if}

        <!-- Execution Error -->
        {#if executionError}
          <div class="mt-4">
            <ErrorAlert message="Task execution failed" details={executionError} />
          </div>
        {/if}

        <!-- Execution Result -->
        {#if executionResult}
          <div class="mt-4 space-y-3">
            <div class="flex items-center justify-between">
              <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h5>
              <StatusBadge status={executionResult.status} />
            </div>

            {#if executionResult.command}
              <CommandOutput boltCommand={executionResult.command} />
            {/if}

            {#if executionResult.results.length > 0}
              {#each executionResult.results as result}
                {#if result.value}
                  <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                    <pre class="text-sm text-gray-900 dark:text-gray-100 overflow-x-auto">{JSON.stringify(result.value, null, 2)}</pre>
                  </div>
                {/if}
                {#if result.error}
                  <div class="mt-2">
                    <ErrorAlert message="Execution error" details={result.error} />
                  </div>
                {/if}
              {/each}
            {/if}
          </div>
        {/if}

        <!-- Execution History -->
        {#if executionHistory.length > 0}
          <div class="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
            <h5 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Recent Executions
            </h5>

            {#if historyLoading}
              <div class="flex justify-center py-2">
                <LoadingSpinner size="sm" />
              </div>
            {:else}
              <div class="space-y-2">
                {#each executionHistory as execution}
                  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                    <div class="flex items-center gap-3">
                      <StatusBadge status={execution.status} size="sm" />
                      <span class="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(execution.startedAt)}
                      </span>
                    </div>
                    {#if execution.completedAt}
                      <span class="text-xs text-gray-500 dark:text-gray-500">
                        {Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)}s
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
