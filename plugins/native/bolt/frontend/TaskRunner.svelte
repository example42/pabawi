<!--
  Bolt Task Runner Widget

  A comprehensive widget for browsing and executing Bolt tasks.
  Can be rendered in dashboard, node-detail, or standalone-page slots.

  Features:
  - Task browser with module grouping
  - Parameter form with validation
  - Target selection
  - Real-time streaming output
  - Task execution history

  @module plugins/native/bolt/frontend/TaskRunner
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import RealtimeOutputViewer from '../../../../frontend/src/components/RealtimeOutputViewer.svelte';
  import StatusBadge from '../../../../frontend/src/components/StatusBadge.svelte';
  import TaskParameterForm from '../../../../frontend/src/components/TaskParameterForm.svelte';
  import { get, post } from '../../../../frontend/src/lib/api';
  import { showError, showSuccess } from '../../../../frontend/src/lib/toast.svelte';
  import { debugMode } from '../../../../frontend/src/lib/debug';
  import { useExecutionStream, type ExecutionStream } from '../../../../frontend/src/lib/executionStream.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

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

  interface Node {
    id: string;
    name: string;
    uri?: string;
    transport?: string;
  }

  interface ExecutionResult {
    id: string;
    type: 'task';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
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

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Pre-selected target node(s) */
    targetNodes?: string | string[];
    /** Pre-selected task name */
    initialTask?: string;
    /** Initial task parameters */
    initialParameters?: Record<string, unknown>;
    /** Show task browser */
    showTaskBrowser?: boolean;
    /** Show parameter form */
    showParameterForm?: boolean;
    /** Compact mode */
    compact?: boolean;
    /** Widget configuration */
    config?: Record<string, unknown>;
    /** Callback when task completes */
    onExecutionComplete?: (result: ExecutionResult) => void;
  }

  let {
    targetNodes = [],
    initialTask,
    initialParameters = {},
    showTaskBrowser = true,
    showParameterForm = true,
    compact = false,
    config = {},
    onExecutionComplete,
  }: Props = $props();

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function normalizeTargets(targets: string | string[] | undefined): string[] {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : [targets];
  }

  // ==========================================================================
  // State
  // ==========================================================================

  const initialTargets = normalizeTargets(targetNodes);
  const initialParams = { ...initialParameters };

  let tasksByModule = $state<TasksByModule>({});
  let tasksLoading = $state(false);
  let tasksError = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedModules = $state<Set<string>>(new Set());
  let selectedTask = $state<Task | null>(null);

  let nodes = $state<Node[]>([]);
  let nodesLoading = $state(false);
  let selectedTargets = $state<string[]>(initialTargets);

  let taskParameters = $state<Record<string, unknown>>(initialParams);
  let executing = $state(false);
  let executionError = $state<string | null>(null);
  let executionResult = $state<ExecutionResult | null>(null);
  let executionStream = $state<ExecutionStream | null>(null);

  let activeView = $state<'browser' | 'executor'>('browser');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredTasksByModule = $derived.by(() => {
    if (!searchQuery.trim()) return tasksByModule;

    const query = searchQuery.toLowerCase();
    const filtered: TasksByModule = {};

    for (const [moduleName, tasks] of Object.entries(tasksByModule)) {
      const matchingTasks = tasks.filter(
        task =>
          task.name.toLowerCase().includes(query) ||
          task.module.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
      if (matchingTasks.length > 0) {
        filtered[moduleName] = matchingTasks;
      }
    }
    return filtered;
  });

  let canExecute = $derived(selectedTask && selectedTargets.length > 0 && !executing);
  let isStreaming = $derived(executionStream?.status === 'streaming');
  let hasOutput = $derived(executionResult?.results && executionResult.results.length > 0);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchTasks();
    void fetchNodes();
  });

  $effect(() => {
    if (initialTask && tasksByModule) {
      for (const tasks of Object.values(tasksByModule)) {
        const task = tasks.find(t => t.name === initialTask);
        if (task) {
          selectedTask = task;
          activeView = 'executor';
          break;
        }
      }
    }
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchTasks(): Promise<void> {
    tasksLoading = true;
    tasksError = null;
    try {
      const response = await get<{ tasksByModule: TasksByModule }>('/api/tasks');
      tasksByModule = response.tasksByModule || {};
    } catch (err) {
      tasksError = err instanceof Error ? err.message : 'Failed to load tasks';
    } finally {
      tasksLoading = false;
    }
  }

  async function fetchNodes(): Promise<void> {
    nodesLoading = true;
    try {
      const response = await get<{ nodes: Node[] }>('/api/inventory');
      nodes = response.nodes || [];
    } catch {
      // Non-critical
    } finally {
      nodesLoading = false;
    }
  }

  // ==========================================================================
  // Task Selection
  // ==========================================================================

  function selectTask(task: Task): void {
    selectedTask = task;
    taskParameters = {};
    for (const param of task.parameters) {
      if (param.default !== undefined) {
        taskParameters[param.name] = param.default;
      }
    }
    activeView = 'executor';
  }

  function toggleModule(moduleName: string): void {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleName)) {
      newExpanded.delete(moduleName);
    } else {
      newExpanded.add(moduleName);
    }
    expandedModules = newExpanded;
  }

  function backToBrowser(): void {
    activeView = 'browser';
    executionResult = null;
    executionError = null;
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  async function executeTask(): Promise<void> {
    if (!canExecute || !selectedTask) return;

    executing = true;
    executionError = null;
    executionResult = null;

    try {
      const targetsParam = selectedTargets.length === 1
        ? selectedTargets[0]
        : selectedTargets.join(',');

      const response = await post<ExecutionResult>('/api/tasks/execute', {
        task: selectedTask.name,
        targets: targetsParam,
        parameters: taskParameters,
        expertMode: debugMode.enabled,
      });

      if (response.id) {
        executionStream = useExecutionStream(response.id);
      }

      executionResult = response;

      if (response.status === 'success') {
        showSuccess(`Task ${selectedTask.name} completed successfully`);
      } else if (response.status === 'failed') {
        showError(`Task ${selectedTask.name} failed`);
      }

      onExecutionComplete?.(response);
    } catch (err) {
      executionError = err instanceof Error ? err.message : 'Task execution failed';
      showError(executionError);
    } finally {
      executing = false;
    }
  }

  function toggleTarget(nodeId: string): void {
    if (selectedTargets.includes(nodeId)) {
      selectedTargets = selectedTargets.filter(id => id !== nodeId);
    } else {
      selectedTargets = [...selectedTargets, nodeId];
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      case 'running': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }
</script>

<div class="bolt-task-runner {compact ? 'space-y-3' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Task Runner
      </h3>
    </div>
    {#if activeView === 'executor' && showTaskBrowser}
      <button
        type="button"
        onclick={backToBrowser}
        class="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tasks
      </button>
    {/if}
  </div>

  <!-- Task Browser View -->
  {#if activeView === 'browser' && showTaskBrowser}
    <div class="relative">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search tasks..."
        class="w-full px-3 py-2 pl-9 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
      />
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>

    {#if tasksLoading}
      <div class="flex items-center justify-center py-8">
        <LoadingSpinner />
        <span class="ml-2 text-sm text-gray-500">Loading tasks...</span>
      </div>
    {:else if tasksError}
      <ErrorAlert message={tasksError} />
    {:else}
      <div class="space-y-2 max-h-80 overflow-y-auto">
        {#each Object.keys(filteredTasksByModule).sort() as moduleName (moduleName)}
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onclick={() => toggleModule(moduleName)}
              class="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <span class="font-medium text-sm text-gray-700 dark:text-gray-300">{moduleName}</span>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">{filteredTasksByModule[moduleName].length} tasks</span>
                <svg class="w-4 h-4 text-gray-400 transition-transform {expandedModules.has(moduleName) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {#if expandedModules.has(moduleName)}
              <div class="divide-y divide-gray-100 dark:divide-gray-700">
                {#each filteredTasksByModule[moduleName] as task (task.name)}
                  <button
                    type="button"
                    onclick={() => selectTask(task)}
                    class="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div class="text-sm font-medium text-gray-900 dark:text-white">{task.name}</div>
                    {#if task.description}
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{task.description}</div>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            No tasks found
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Task Executor View -->
  {#if activeView === 'executor' && selectedTask}
    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
      <div class="font-medium text-amber-800 dark:text-amber-200">{selectedTask.name}</div>
      {#if selectedTask.description}
        <div class="text-sm text-amber-700 dark:text-amber-300 mt-1">{selectedTask.description}</div>
      {/if}
    </div>

    <div class="space-y-2">
      <label for="task-target-nodes" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Target Nodes ({selectedTargets.length} selected)
      </label>
      <div id="task-target-nodes" class="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {#if nodesLoading}
          <LoadingSpinner size="sm" />
        {:else}
          {#each nodes as node (node.id)}
            <button
              type="button"
              onclick={() => toggleTarget(node.name)}
              class="px-2 py-1 text-xs rounded-full transition-colors {
                selectedTargets.includes(node.name)
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
              }"
            >
              {node.name}
            </button>
          {:else}
            <span class="text-sm text-gray-500">No nodes available</span>
          {/each}
        {/if}
      </div>
    </div>

    {#if showParameterForm && selectedTask.parameters.length > 0}
      <div class="space-y-2">
        <label for="task-parameters" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Parameters
        </label>
        <div id="task-parameters">
          <TaskParameterForm
            parameters={selectedTask.parameters}
            bind:values={taskParameters}
          />
        </div>
      </div>
    {/if}

    <button
      type="button"
      onclick={executeTask}
      disabled={!canExecute}
      class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {#if executing}
        <LoadingSpinner size="sm" />
        Running Task...
      {:else}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        </svg>
        Run Task
      {/if}
    </button>

    {#if executionError}
      <ErrorAlert message={executionError} variant="inline" />
    {/if}

    {#if isStreaming || hasOutput}
      <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Output</h4>
          {#if executionResult}
            <StatusBadge status={executionResult.status} size="sm" />
          {/if}
        </div>

        {#if executionStream && isStreaming}
          <RealtimeOutputViewer
            executionId={executionResult?.id || ''}
            initialStdout={executionStream.stdout}
            initialStderr={executionStream.stderr}
            status={executionResult?.status || 'running'}
          />
        {:else if executionResult?.results}
          <div class="space-y-2">
            {#each executionResult.results as result (result.nodeId)}
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{result.nodeId}</span>
                  <span class="{getStatusColor(result.status)} text-xs">
                    {result.status} ({result.duration}ms)
                  </span>
                </div>
                {#if result.value}
                  <pre class="text-xs font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32">{JSON.stringify(result.value, null, 2)}</pre>
                {/if}
                {#if result.output?.stdout}
                  <pre class="text-xs font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32">{result.output.stdout}</pre>
                {/if}
                {#if result.error}
                  <div class="text-xs text-red-600 dark:text-red-400 mt-2">{result.error}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
