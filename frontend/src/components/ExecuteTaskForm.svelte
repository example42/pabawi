<script lang="ts">
  /**
   * ExecuteTaskForm Component
   *
   * Reusable form component for Bolt task execution configuration.
   * Extracted from TaskRunInterface for use in both single-node
   * and multi-node contexts (ParallelExecutionModal, GroupActionModal).
   *
   * @component
   * @example
   * ```svelte
   * <ExecuteTaskForm
   *   multiNode={true}
   *   onSubmit={(data) => handleTaskExecution(data)}
   * />
   * ```
   */

  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import TaskParameterForm from './TaskParameterForm.svelte';

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

  interface ExecuteTaskFormData {
    taskName: string;
    parameters: Record<string, unknown>;
  }

  interface Props {
    /** Initial task name (for re-execution) */
    initialTaskName?: string;
    /** Initial task parameters (for re-execution) */
    initialParameters?: Record<string, unknown>;
    /** Whether the form is in a loading/executing state */
    executing?: boolean;
    /** Error message to display */
    error?: string | null;
    /** Whether this is for multi-node context (affects UI hints) */
    multiNode?: boolean;
    /** Callback when form is submitted */
    onSubmit?: (data: ExecuteTaskFormData) => void;
  }

  let {
    initialTaskName = undefined,
    initialParameters = undefined,
    executing = false,
    error = null,
    multiNode = false,
    onSubmit
  }: Props = $props();

  // State
  let tasksByModule = $state<TasksByModule>({});
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedModules = $state<Set<string>>(new Set());
  let selectedTask = $state<Task | null>(null);
  let taskParameters = $state<Record<string, unknown>>({});
  let parameterFormRef = $state<TaskParameterForm | null>(null);
  let validationError = $state<string | null>(null);

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
    loadError = null;

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
      loadError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching tasks by module:', err);
      showError('Failed to load tasks', loadError);
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
    validationError = null;
  }

  // Handle parameter values change
  function handleParametersChange(values: Record<string, unknown>): void {
    taskParameters = values;
  }

  // Validate form
  function validateForm(): boolean {
    validationError = null;

    if (!selectedTask) {
      validationError = 'Please select a task';
      return false;
    }

    // Validate parameters using TaskParameterForm
    if (parameterFormRef && !parameterFormRef.validate()) {
      validationError = 'Please fix parameter validation errors';
      return false;
    }

    return true;
  }

  // Handle form submission
  function handleSubmit(event: Event): void {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!selectedTask) {
      return;
    }

    onSubmit?.({
      taskName: selectedTask.name,
      parameters: taskParameters
    });
  }

  // Pre-select task if initial task name is provided
  function preselectTask(): void {
    if (!initialTaskName) return;

    // Find the task by name
    for (const tasks of Object.values(tasksByModule)) {
      const task = tasks.find(t => t.name === initialTaskName);
      if (task) {
        selectTask(task);

        // Pre-fill parameters if provided
        if (initialParameters) {
          taskParameters = { ...initialParameters };
        }

        break;
      }
    }
  }

  // Watch for tasksByModule changes to pre-select task
  $effect(() => {
    if (Object.keys(tasksByModule).length > 0 && initialTaskName) {
      preselectTask();
    }
  });

  // On mount
  onMount(() => {
    fetchTasksByModule();
  });
</script>

<div class="space-y-4">
  {#if multiNode}
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div class="flex items-start gap-2">
        <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm text-blue-800 dark:text-blue-400">
            This task will be executed on all selected nodes in parallel.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Bolt Integration Badge -->
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Execution Tool:</span>
    <IntegrationBadge integration="bolt" variant="badge" size="sm" />
  </div>

  <!-- Task Selection -->
  <div>
    <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Select Task <span class="text-red-500">*</span>
    </div>

    <!-- Loading State -->
    {#if loading}
      <div class="flex justify-center py-8">
        <LoadingSpinner message="Loading tasks..." />
      </div>
    {:else if loadError}
      <!-- Error State -->
      <ErrorAlert
        message="Failed to load tasks"
        details={loadError}
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
      <!-- Search and Controls -->
      <div class="mb-4 flex items-center justify-between gap-4">
        <div class="flex-1">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search tasks or modules..."
            class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
          />
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={expandAll}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            disabled={executing}
          >
            Expand All
          </button>
          <button
            type="button"
            onclick={collapseAll}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            disabled={executing}
          >
            Collapse All
          </button>
        </div>
      </div>

      <!-- Tasks by Module - Multi-Column Grid Layout -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
        {#each Object.entries(filteredTasksByModule()) as [moduleName, tasks]}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 hover:shadow-md transition-shadow flex flex-col">
            <!-- Module Card Header -->
            <button
              type="button"
              onclick={() => toggleModule(moduleName)}
              class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0"
              disabled={executing}
            >
              <div class="flex items-center gap-2 min-w-0">
                <svg
                  class="h-4 w-4 text-gray-400 transition-transform flex-shrink-0 {expandedModules.has(moduleName) ? 'rotate-90' : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <div class="min-w-0">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white truncate">
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
              <div class="border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto flex-1">
                {#each tasks as task}
                  <div class="relative group">
                    <button
                      type="button"
                      onclick={() => selectTask(task)}
                      class="flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2 text-left hover:bg-blue-50 last:border-b-0 dark:border-gray-700 dark:hover:bg-blue-900/20 transition-colors {selectedTask?.name === task.name ? 'bg-blue-100 dark:bg-blue-900/30' : ''}"
                      disabled={executing}
                    >
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {task.name.replace(`${moduleName}::`, '')}
                          </span>
                          {#if task.parameters.some(p => p.required)}
                            <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 flex-shrink-0">
                              *
                            </span>
                          {/if}
                        </div>
                      </div>
                      {#if selectedTask?.name === task.name}
                        <svg class="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                      {/if}
                    </button>

                    <!-- Hover Tooltip with Task Details -->
                    <div class="absolute left-full top-0 ml-2 z-50 hidden group-hover:block w-96 pointer-events-none">
                      <div class="rounded-lg border border-gray-300 bg-white p-4 shadow-xl dark:border-gray-600 dark:bg-gray-800">
                        <div class="mb-2">
                          <span class="text-sm font-semibold text-gray-900 dark:text-white break-words">
                            {task.name}
                          </span>
                        </div>
                        {#if task.description}
                          <p class="mb-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                            {task.description}
                          </p>
                        {/if}
                        {#if task.parameters.length > 0}
                          <div class="border-t border-gray-200 pt-2 dark:border-gray-700">
                            <p class="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Parameters:</p>
                            <div class="space-y-2 max-h-64 overflow-y-auto">
                              {#each task.parameters as param}
                                <div class="text-xs bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                                  <div class="flex items-start gap-1 mb-1">
                                    <span class="font-mono font-medium text-gray-900 dark:text-white">
                                      {param.name}
                                    </span>
                                    {#if param.required}
                                      <span class="text-red-500 font-bold">*</span>
                                    {/if}
                                    <span class="text-gray-500 dark:text-gray-400">
                                      ({param.type})
                                    </span>
                                  </div>
                                  {#if param.description}
                                    <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
                                      {param.description}
                                    </p>
                                  {/if}
                                  {#if param.default !== undefined}
                                    <p class="text-gray-500 dark:text-gray-500 mt-1">
                                      Default: <span class="font-mono">{JSON.stringify(param.default)}</span>
                                    </p>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          </div>
                        {:else}
                          <p class="text-xs text-gray-500 dark:text-gray-400 italic">No parameters required</p>
                        {/if}
                        <div class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <p class="text-xs text-gray-500 dark:text-gray-400 italic">
                            Click to select and configure this task
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Selected Task Configuration -->
  {#if selectedTask}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        Selected: {selectedTask.name}
      </h4>

      {#if selectedTask.description}
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {selectedTask.description}
        </p>
      {/if}

      <!-- Task Parameters Form -->
      {#if selectedTask.parameters.length > 0}
        <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h5 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Parameters</h5>
          <TaskParameterForm
            bind:this={parameterFormRef}
            parameters={selectedTask.parameters}
            values={taskParameters}
            onValuesChange={handleParametersChange}
            disabled={executing}
          />
        </div>
      {:else}
        <p class="text-sm text-gray-500 dark:text-gray-400 italic">
          No parameters required for this task
        </p>
      {/if}
    </div>
  {/if}

  <!-- Validation Error -->
  {#if validationError}
    <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <p class="text-sm text-red-600 dark:text-red-400">{validationError}</p>
    </div>
  {/if}

  <!-- Submit Button -->
  <form onsubmit={handleSubmit}>
    <button
      type="submit"
      class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={executing || !selectedTask}
    >
      {executing ? 'Executing...' : 'Execute Task'}
    </button>
  </form>

  <!-- Loading State -->
  {#if executing}
    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <LoadingSpinner size="sm" />
      <span>Executing task...</span>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <ErrorAlert message="Task execution failed" details={error} />
  {/if}
</div>
