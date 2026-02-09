<!--
  Bolt Node Detail Tabs

  Node-specific tabs for the Bolt plugin showing:
  - Execute Command: Run commands on this specific node
  - Run Task: Execute Bolt tasks on this node
  - Manage Packages: Package management for this node
  - Facts: View node facts

  @module plugins/native/bolt/frontend/NodeDetailTabs
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context
  const { ui, api } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node ID */
    nodeId: string;
    /** Initial active tab */
    initialTab?: 'command' | 'task' | 'packages' | 'facts';
  }

  let { nodeId, initialTab = 'command' }: Props = $props();

  // ==========================================================================
  // Types
  // ==========================================================================

  interface BoltTask {
    name: string;
    description?: string;
    module?: string;
    parameters?: Record<string, unknown>;
  }

  interface ExecutionResult {
    id: string;
    status: 'running' | 'success' | 'failed' | 'partial';
    results: Array<{
      nodeId: string;
      status: string;
      output?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
      error?: string;
    }>;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let activeTab = $state<'facts' | 'tasks' | 'command' | 'packages'>('command');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Sync initialTab prop to activeTab state
  $effect(() => {
    activeTab = initialTab;
  });

  // Command tab state
  let command = $state('');
  let commandExecuting = $state(false);
  let commandResult = $state<ExecutionResult | null>(null);

  // Task tab state
  let tasks = $state<BoltTask[]>([]);
  let selectedTask = $state<string>('');
  let taskParameters = $state<Record<string, string>>({});
  let taskExecuting = $state(false);
  let taskResult = $state<ExecutionResult | null>(null);

  // Facts tab state
  let facts = $state<Record<string, unknown>>({});
  let factsLoading = $state(false);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void loadTabData();
  });

  // ==========================================================================
  // Tab Management
  // ==========================================================================

  function switchTab(tab: typeof activeTab): void {
    activeTab = tab;
    void loadTabData();
  }

  async function loadTabData(): Promise<void> {
    switch (activeTab) {
      case 'task':
        await loadTasks();
        break;
      case 'facts':
        await loadFacts();
        break;
    }
  }

  // ==========================================================================
  // Command Tab
  // ==========================================================================

  async function executeCommand(): Promise<void> {
    if (!command.trim()) return;

    commandExecuting = true;
    error = null;
    commandResult = null;

    try {
      const response = await api.post<ExecutionResult>('/api/capabilities/command.execute', {
        command: command.trim(),
        targets: [nodeId],
        async: false,
      });

      commandResult = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to execute command';
    } finally {
      commandExecuting = false;
    }
  }

  // ==========================================================================
  // Task Tab
  // ==========================================================================

  async function loadTasks(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await api.post<{ tasks: BoltTask[] }>('/api/capabilities/bolt.task.list', {});
      tasks = response.tasks || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tasks';
    } finally {
      loading = false;
    }
  }

  async function executeTask(): Promise<void> {
    if (!selectedTask) return;

    taskExecuting = true;
    error = null;
    taskResult = null;

    try {
      const response = await api.post<ExecutionResult>('/api/capabilities/task.execute', {
        task: selectedTask,
        targets: [nodeId],
        parameters: taskParameters,
        async: false,
      });

      taskResult = response;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to execute task';
    } finally {
      taskExecuting = false;
    }
  }

  function addTaskParameter(): void {
    const key = prompt('Parameter name:');
    if (key) {
      taskParameters[key] = '';
    }
  }

  function removeTaskParameter(key: string): void {
    const { [key]: _, ...rest } = taskParameters;
    taskParameters = rest;
  }

  // ==========================================================================
  // Facts Tab
  // ==========================================================================

  async function loadFacts(): Promise<void> {
    factsLoading = true;
    error = null;

    try {
      const response = await api.post<{ facts: Record<string, unknown> }>('/api/capabilities/info.facts', {
        nodeId,
      });

      facts = response.facts || {};
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load facts';
    } finally {
      factsLoading = false;
    }
  }

  async function refreshFacts(): Promise<void> {
    factsLoading = true;
    error = null;

    try {
      const response = await api.post<{ facts: Record<string, unknown> }>('/api/capabilities/info.refresh', {
        nodeId,
      });

      facts = response.facts || {};
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to refresh facts';
    } finally {
      factsLoading = false;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getStatusColor(status: string): string {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'failed': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'running': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case 'partial': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  }

  function formatFactValue(value: unknown): string {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
</script>

<!-- Tab Navigation -->
<div class="border-b border-gray-200 dark:border-gray-700 mb-4">
  <nav class="flex gap-4" aria-label="Node Tabs">
    <button
      type="button"
      onclick={() => switchTab('command')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'command'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Execute Command
    </button>
    <button
      type="button"
      onclick={() => switchTab('task')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'task'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Run Task
    </button>
    <button
      type="button"
      onclick={() => switchTab('packages')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'packages'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Manage Packages
    </button>
    <button
      type="button"
      onclick={() => switchTab('facts')}
      class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'facts'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Facts
    </button>
  </nav>
</div>

<!-- Tab Content -->
<div>
  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span class="text-sm text-red-800 dark:text-red-200">{error}</span>
      </div>
    </div>
  {/if}

  <!-- Execute Command Tab -->
  {#if activeTab === 'command'}
    <div class="space-y-4">
      <div>
        <label for="command-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Command
        </label>
        <textarea
          id="command-input"
          bind:value={command}
          placeholder="Enter command to execute..."
          rows="3"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
        ></textarea>
      </div>

      <button
        type="button"
        onclick={executeCommand}
        disabled={commandExecuting || !command.trim()}
        class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {commandExecuting ? 'Executing...' : 'Execute Command'}
      </button>

      {#if commandResult}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-medium text-gray-900 dark:text-white">Result</h3>
            <span class="px-2 py-1 text-xs rounded-full {getStatusColor(commandResult.status)}">
              {commandResult.status}
            </span>
          </div>

          {#each commandResult.results as result}
            {#if result.output?.stdout}
              <div class="mb-3">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">STDOUT</div>
                <pre class="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm overflow-x-auto">{result.output.stdout}</pre>
              </div>
            {/if}

            {#if result.output?.stderr}
              <div class="mb-3">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">STDERR</div>
                <pre class="bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm overflow-x-auto text-red-800 dark:text-red-200">{result.output.stderr}</pre>
              </div>
            {/if}

            {#if result.output?.exitCode !== undefined}
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Exit Code: <span class="font-mono">{result.output.exitCode}</span>
              </div>
            {/if}

            {#if result.error}
              <div class="text-sm text-red-600 dark:text-red-400">
                Error: {result.error}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Run Task Tab -->
  {#if activeTab === 'task'}
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else}
      <div class="space-y-4">
        <div>
          <label for="task-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Task
          </label>
          <select
            id="task-select"
            bind:value={selectedTask}
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="">-- Select a task --</option>
            {#each tasks as task}
              <option value={task.name}>{task.name}</option>
            {/each}
          </select>
        </div>

        {#if selectedTask}
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Parameters
              </label>
              <button
                type="button"
                onclick={addTaskParameter}
                class="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
              >
                + Add Parameter
              </button>
            </div>

            {#if Object.keys(taskParameters).length > 0}
              <div class="space-y-2">
                {#each Object.entries(taskParameters) as [key, value]}
                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={key}
                      disabled
                      class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                    />
                    <input
                      type="text"
                      bind:value={taskParameters[key]}
                      placeholder="Value"
                      class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onclick={() => removeTaskParameter(key)}
                      class="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-gray-500 dark:text-gray-400">No parameters added</p>
            {/if}
          </div>

          <button
            type="button"
            onclick={executeTask}
            disabled={taskExecuting}
            class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {taskExecuting ? 'Executing...' : 'Execute Task'}
          </button>
        {/if}

        {#if taskResult}
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-medium text-gray-900 dark:text-white">Result</h3>
              <span class="px-2 py-1 text-xs rounded-full {getStatusColor(taskResult.status)}">
                {taskResult.status}
              </span>
            </div>

            {#each taskResult.results as result}
              {#if result.output?.stdout}
                <div class="mb-3">
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">OUTPUT</div>
                  <pre class="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm overflow-x-auto">{result.output.stdout}</pre>
                </div>
              {/if}

              {#if result.error}
                <div class="text-sm text-red-600 dark:text-red-400">
                  Error: {result.error}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Manage Packages Tab -->
  {#if activeTab === 'packages'}
    <div class="text-center py-12">
      <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Package Management</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Package management capabilities will be available in the next update.
      </p>
    </div>
  {/if}

  <!-- Facts Tab -->
  {#if activeTab === 'facts'}
    {#if factsLoading}
      <div class="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else}
      <div class="space-y-4">
        <div class="flex justify-end">
          <button
            type="button"
            onclick={refreshFacts}
            class="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Refresh Facts
          </button>
        </div>

        {#if Object.keys(facts).length > 0}
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {#each Object.entries(facts) as [key, value]}
              <div class="p-4">
                <div class="font-medium text-gray-900 dark:text-white mb-1">{key}</div>
                <pre class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{formatFactValue(value)}</pre>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No facts available
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
