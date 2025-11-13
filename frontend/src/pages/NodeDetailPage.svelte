<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import FactsViewer from '../components/FactsViewer.svelte';
  import CommandOutput from '../components/CommandOutput.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';

  interface Props {
    params?: { id: string };
  }

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config: Record<string, unknown> & {
      user?: string;
      port?: number;
    };
  }

  interface Facts {
    nodeId: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
  }

  interface Task {
    name: string;
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

  let { params }: Props = $props();
  const nodeId = $derived(params?.id || '');

  // State
  let node = $state<Node | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Facts state
  let facts = $state<Facts | null>(null);
  let factsLoading = $state(false);
  let factsError = $state<string | null>(null);

  // Command execution state
  let commandInput = $state('');
  let commandExecuting = $state(false);
  let commandError = $state<string | null>(null);
  let commandResult = $state<ExecutionResult | null>(null);

  // Task execution state
  let availableTasks = $state<Task[]>([]);
  let tasksLoading = $state(false);
  let selectedTask = $state<string>('');
  let taskParameters = $state<Record<string, unknown>>({});
  let taskExecuting = $state(false);
  let taskError = $state<string | null>(null);
  let taskResult = $state<ExecutionResult | null>(null);

  // Execution history state
  let executions = $state<ExecutionResult[]>([]);
  let executionsLoading = $state(false);
  let executionsError = $state<string | null>(null);

  // Computed
  const selectedTaskDef = $derived(availableTasks.find(t => t.name === selectedTask));

  // Fetch node details
  async function fetchNode(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ node: Node }>(`/api/nodes/${nodeId}`, {
        maxRetries: 2,
      });
      
      node = data.node;
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching node:', err);
      showError('Failed to load node details', error);
    } finally {
      loading = false;
    }
  }

  // Gather facts
  async function gatherFacts(): Promise<void> {
    factsLoading = true;
    factsError = null;

    try {
      showInfo('Gathering facts...');
      
      const data = await post<{ facts: Facts }>(`/api/nodes/${nodeId}/facts`, undefined, {
        maxRetries: 1,
      });
      
      facts = data.facts;
      showSuccess('Facts gathered successfully');
    } catch (err) {
      factsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error gathering facts:', err);
      showError('Failed to gather facts', factsError);
    } finally {
      factsLoading = false;
    }
  }

  // Execute command
  async function executeCommand(event: Event): Promise<void> {
    event.preventDefault();
    
    if (!commandInput.trim()) {
      commandError = 'Command cannot be empty';
      showError('Command cannot be empty');
      return;
    }

    commandExecuting = true;
    commandError = null;
    commandResult = null;

    try {
      showInfo('Executing command...');
      
      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/command`,
        { command: commandInput },
        { maxRetries: 0 } // Don't retry command executions
      );
      
      const executionId = data.executionId;

      // Poll for execution result
      await pollExecutionResult(executionId, 'command');
      
      showSuccess('Command executed successfully');
    } catch (err) {
      commandError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error executing command:', err);
      showError('Command execution failed', commandError);
    } finally {
      commandExecuting = false;
    }
  }

  // Fetch available tasks
  async function fetchTasks(): Promise<void> {
    tasksLoading = true;

    try {
      const data = await get<{ tasks: Task[] }>('/api/tasks', {
        maxRetries: 2,
      });
      
      availableTasks = data.tasks || [];
    } catch (err) {
      console.error('Error fetching tasks:', err);
      showError('Failed to load available tasks');
    } finally {
      tasksLoading = false;
    }
  }

  // Execute task
  async function executeTask(event: Event): Promise<void> {
    event.preventDefault();
    
    if (!selectedTask) {
      taskError = 'Please select a task';
      showError('Please select a task');
      return;
    }

    taskExecuting = true;
    taskError = null;
    taskResult = null;

    try {
      showInfo('Executing task...');
      
      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/task`,
        {
          taskName: selectedTask,
          parameters: taskParameters,
        },
        { maxRetries: 0 } // Don't retry task executions
      );
      
      const executionId = data.executionId;

      // Poll for execution result
      await pollExecutionResult(executionId, 'task');
      
      showSuccess('Task executed successfully');
    } catch (err) {
      taskError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error executing task:', err);
      showError('Task execution failed', taskError);
    } finally {
      taskExecuting = false;
    }
  }

  // Poll for execution result
  async function pollExecutionResult(executionId: string, type: 'command' | 'task'): Promise<void> {
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
            if (type === 'command') {
              commandResult = execution;
            } else {
              taskResult = execution;
            }
            
            // Refresh execution history
            fetchExecutions();
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
    if (type === 'command') {
      commandError = 'Execution timed out';
    } else {
      taskError = 'Execution timed out';
    }
  }

  // Fetch execution history
  async function fetchExecutions(): Promise<void> {
    executionsLoading = true;
    executionsError = null;

    try {
      const data = await get<{ executions: ExecutionResult[] }>(
        `/api/executions?targetNode=${nodeId}&pageSize=10`,
        { maxRetries: 2 }
      );
      
      executions = data.executions || [];
    } catch (err) {
      executionsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching executions:', err);
    } finally {
      executionsLoading = false;
    }
  }

  // Handle task selection change
  function handleTaskSelection(): void {
    taskParameters = {};
    taskError = null;
    taskResult = null;
  }

  // Handle parameter input change
  function handleParameterChange(paramName: string, value: string, type: string): void {
    if (type === 'Integer') {
      taskParameters[paramName] = parseInt(value, 10);
    } else if (type === 'Boolean') {
      taskParameters[paramName] = value === 'true';
    } else {
      taskParameters[paramName] = value;
    }
  }

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Navigate back to inventory
  function navigateBack(): void {
    router.navigate('/');
  }

  // On mount
  onMount(() => {
    fetchNode();
    fetchTasks();
    fetchExecutions();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Back button -->
  <button
    type="button"
    class="mb-4 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    onclick={navigateBack}
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
    Back to Inventory
  </button>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading node details..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert 
      message="Failed to load node details" 
      details={error}
      onRetry={fetchNode}
    />
  {:else if node}
    <!-- Node Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        {node.name}
      </h1>
      <div class="mt-2 flex items-center gap-3">
        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
          {node.transport}
        </span>
        <span class="text-gray-600 dark:text-gray-400">{node.uri}</span>
      </div>
    </div>

    <!-- Node Metadata -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Configuration</h2>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Node ID</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.id}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Transport</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.transport}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">URI</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.uri}</dd>
        </div>
        {#if node.config.user}
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">User</dt>
            <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.config.user}</dd>
          </div>
        {/if}
        {#if node.config.port}
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Port</dt>
            <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.config.port}</dd>
          </div>
        {/if}
      </dl>
    </div>

    <!-- Facts Section -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Facts</h2>
        <button
          type="button"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={gatherFacts}
          disabled={factsLoading}
        >
          {factsLoading ? 'Gathering...' : 'Gather Facts'}
        </button>
      </div>

      {#if factsLoading}
        <div class="flex justify-center py-8">
          <LoadingSpinner message="Gathering facts..." />
        </div>
      {:else if factsError}
        <ErrorAlert message="Failed to gather facts" details={factsError} onRetry={gatherFacts} />
      {:else if facts}
        <div class="mb-2 text-sm text-gray-500 dark:text-gray-400">
          Gathered at: {formatTimestamp(facts.gatheredAt)}
        </div>
        <FactsViewer facts={facts.facts} />
      {:else}
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Click "Gather Facts" to collect system information from this node.
        </p>
      {/if}
    </div>

    <!-- Command Execution Section -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Execute Command</h2>
      
      <form onsubmit={executeCommand} class="space-y-4">
        <div>
          <label for="command-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Command
          </label>
          <input
            id="command-input"
            type="text"
            bind:value={commandInput}
            placeholder="Enter command to execute..."
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={commandExecuting}
          />
        </div>

        <button
          type="submit"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={commandExecuting || !commandInput.trim()}
        >
          {commandExecuting ? 'Executing...' : 'Execute'}
        </button>
      </form>

      {#if commandExecuting}
        <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Executing command...</span>
        </div>
      {/if}

      {#if commandError}
        <div class="mt-4">
          <ErrorAlert message="Command execution failed" details={commandError} />
        </div>
      {/if}

      {#if commandResult}
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h3>
          <div class="mb-2">
            <StatusBadge status={commandResult.status} />
          </div>
          {#if commandResult.results.length > 0}
            {#each commandResult.results as result}
              {#if result.output}
                <CommandOutput 
                  stdout={result.output.stdout}
                  stderr={result.output.stderr}
                  exitCode={result.output.exitCode}
                />
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
    </div>

    <!-- Task Execution Section -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Execute Task</h2>
      
      {#if tasksLoading}
        <div class="flex justify-center py-4">
          <LoadingSpinner message="Loading tasks..." />
        </div>
      {:else}
        <form onsubmit={executeTask} class="space-y-4">
          <div>
            <label for="task-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Task
            </label>
            <select
              id="task-select"
              bind:value={selectedTask}
              onchange={handleTaskSelection}
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              disabled={taskExecuting}
            >
              <option value="">-- Select a task --</option>
              {#each availableTasks as task}
                <option value={task.name}>
                  {task.name}{task.description ? ` - ${task.description}` : ''}
                </option>
              {/each}
            </select>
          </div>

          {#if selectedTaskDef && selectedTaskDef.parameters.length > 0}
            <div class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Parameters</h3>
              {#each selectedTaskDef.parameters as param}
                <div>
                  <label for="param-{param.name}" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {param.name}
                    {#if param.required}
                      <span class="text-red-500">*</span>
                    {/if}
                  </label>
                  {#if param.description}
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{param.description}</p>
                  {/if}
                  
                  {#if param.type === 'Boolean'}
                    <select
                      id="param-{param.name}"
                      onchange={(e) => handleParameterChange(param.name, (e.target as HTMLSelectElement).value, param.type)}
                      class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      disabled={taskExecuting}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  {:else}
                    <input
                      id="param-{param.name}"
                      type={param.type === 'Integer' ? 'number' : 'text'}
                      placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
                      oninput={(e) => handleParameterChange(param.name, (e.target as HTMLInputElement).value, param.type)}
                      class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                      disabled={taskExecuting}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <button
            type="submit"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={taskExecuting || !selectedTask}
          >
            {taskExecuting ? 'Executing...' : 'Execute Task'}
          </button>
        </form>

        {#if taskExecuting}
          <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <LoadingSpinner size="sm" />
            <span>Executing task...</span>
          </div>
        {/if}

        {#if taskError}
          <div class="mt-4">
            <ErrorAlert message="Task execution failed" details={taskError} />
          </div>
        {/if}

        {#if taskResult}
          <div class="mt-4">
            <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h3>
            <div class="mb-2">
              <StatusBadge status={taskResult.status} />
            </div>
            {#if taskResult.results.length > 0}
              {#each taskResult.results as result}
                {#if result.value}
                  <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                    <pre class="text-sm text-gray-900 dark:text-gray-100">{JSON.stringify(result.value, null, 2)}</pre>
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
      {/if}
    </div>

    <!-- Execution History Section -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Recent Executions</h2>
      
      {#if executionsLoading}
        <div class="flex justify-center py-4">
          <LoadingSpinner message="Loading executions..." />
        </div>
      {:else if executionsError}
        <ErrorAlert message="Failed to load executions" details={executionsError} onRetry={fetchExecutions} />
      {:else if executions.length === 0}
        <p class="text-sm text-gray-500 dark:text-gray-400">
          No executions found for this node.
        </p>
      {:else}
        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Action
                </th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Started
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each executions as execution}
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {execution.type}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    <div class="max-w-xs truncate">{execution.action}</div>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm">
                    <StatusBadge status={execution.status} size="sm" />
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatTimestamp(execution.startedAt)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>
