<!--
  Bolt Plugin Home Page

  A comprehensive home page for the Bolt plugin with tabbed interface showing:
  - Inventory: All nodes from Bolt inventory (global view)
  - Tasks: Available Bolt tasks (global view)
  - Executions: Execution history (global view)
  - Packages: Package management (global view)

  @module plugins/native/bolt/frontend/PluginHomePage
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context
  const { ui, api, router } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Node {
    id: string;
    name: string;
    uri?: string;
    transport?: string;
    groups?: string[];
    source?: string;
  }

  interface BoltTask {
    name: string;
    description?: string;
    module?: string;
    parameters?: Record<string, unknown>;
  }

  interface ExecutionRecord {
    id: string;
    type: string;
    targetNodes: string[];
    action: string;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    error?: string;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let activeTab = $state<'inventory' | 'tasks' | 'executions' | 'packages'>('inventory');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Inventory state
  let nodes = $state<Node[]>([]);
  let filteredNodes = $state<Node[]>([]);
  let searchQuery = $state('');
  let selectedGroup = $state<string>('all');
  let groups = $state<string[]>([]);

  // Tasks state
  let tasks = $state<BoltTask[]>([]);
  let filteredTasks = $state<BoltTask[]>([]);
  let taskSearchQuery = $state('');

  // Executions state
  let executions = $state<ExecutionRecord[]>([]);
  let executionFilter = $state<'all' | 'running' | 'success' | 'failed' | 'partial'>('all');
  let executionPage = $state(1);
  let executionTotal = $state(0);

  // Packages state
  let selectedNodesForPackage = $state<string[]>([]);
  let packageOperation = $state<'install' | 'uninstall' | 'update'>('install');
  let packageName = $state('');
  let packageVersion = $state('');
  let packageOperationRunning = $state(false);
  let packageOperationResult = $state<string | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  $effect(() => {
    // Filter nodes based on search and group
    filteredNodes = nodes.filter(node => {
      const matchesSearch = searchQuery === '' ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesGroup = selectedGroup === 'all' ||
        node.groups?.includes(selectedGroup);

      return matchesSearch && matchesGroup;
    });
  });

  $effect(() => {
    // Filter tasks based on search
    filteredTasks = tasks.filter(task =>
      taskSearchQuery === '' ||
      task.name.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(taskSearchQuery.toLowerCase())
    );
  });

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
      case 'inventory':
        await loadInventory();
        break;
      case 'tasks':
        await loadTasks();
        break;
      case 'executions':
        await loadExecutions();
        break;
      case 'packages':
        await loadInventory(); // Load nodes for package operations
        break;
    }
  }

  // ==========================================================================
  // Inventory Tab
  // ==========================================================================

  async function loadInventory(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await api.get<{ nodes: Node[] }>('/api/inventory?source=bolt');
      nodes = response.nodes || [];

      // Extract unique groups
      const groupSet = new Set<string>();
      nodes.forEach(node => {
        node.groups?.forEach(group => groupSet.add(group));
      });
      groups = Array.from(groupSet).sort();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load inventory';
    } finally {
      loading = false;
    }
  }

  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  // ==========================================================================
  // Tasks Tab
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

  function navigateToTaskRunner(taskName: string): void {
    // Navigate to task runner with pre-selected task
    router.navigate(`/integrations/bolt/task/${encodeURIComponent(taskName)}`);
  }

  // ==========================================================================
  // Executions Tab
  // ==========================================================================

  async function loadExecutions(): Promise<void> {
    loading = true;
    error = null;

    try {
      const filterParam = executionFilter !== 'all' ? `&status=${executionFilter}` : '';
      const response = await api.get<{ executions: ExecutionRecord[]; total: number }>(
        `/api/executions?type=command,task&page=${executionPage}&pageSize=20${filterParam}`
      );
      executions = response.executions || [];
      executionTotal = response.total || 0;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load executions';
    } finally {
      loading = false;
    }
  }

  function navigateToExecution(executionId: string): void {
    router.navigate(`/executions/${executionId}`);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'failed': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'running': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case 'partial': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  }

  // ==========================================================================
  // Packages Tab
  // ==========================================================================

  function toggleNodeSelection(nodeId: string): void {
    if (selectedNodesForPackage.includes(nodeId)) {
      selectedNodesForPackage = selectedNodesForPackage.filter(id => id !== nodeId);
    } else {
      selectedNodesForPackage = [...selectedNodesForPackage, nodeId];
    }
  }

  function selectAllNodes(): void {
    selectedNodesForPackage = filteredNodes.map(node => node.id);
  }

  function clearNodeSelection(): void {
    selectedNodesForPackage = [];
  }

  async function executePackageOperation(): Promise<void> {
    if (!packageName.trim() || selectedNodesForPackage.length === 0) {
      return;
    }

    packageOperationRunning = true;
    packageOperationResult = null;
    error = null;

    try {
      const capabilityMap = {
        install: 'package.install',
        uninstall: 'package.uninstall',
        update: 'package.update',
      };

      const payload: Record<string, unknown> = {
        packageName: packageName.trim(),
        targets: selectedNodesForPackage,
      };

      if (packageOperation === 'install' && packageVersion.trim()) {
        payload.version = packageVersion.trim();
      }

      await api.post(`/api/capabilities/${capabilityMap[packageOperation]}`, payload);

      packageOperationResult = `Successfully ${packageOperation}ed ${packageName} on ${selectedNodesForPackage.length} node(s)`;

      // Clear form on success
      packageName = '';
      packageVersion = '';
      clearNodeSelection();
    } catch (err) {
      error = err instanceof Error ? err.message : `Failed to ${packageOperation} package`;
    } finally {
      packageOperationRunning = false;
    }
  }

</script>

<!-- Page Header -->
<div class="p-6 border-b border-gray-200 dark:border-gray-700">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="p-3 rounded-lg bg-amber-500/20">
        <svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Bolt</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">Remote Execution & Task Orchestration</p>
      </div>
    </div>
  </div>
</div>

<!-- Tab Navigation -->
<div class="border-b border-gray-200 dark:border-gray-700">
  <nav class="flex gap-4 px-6" aria-label="Tabs">
    <button
      type="button"
      onclick={() => switchTab('inventory')}
      class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'inventory'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Inventory
    </button>
    <button
      type="button"
      onclick={() => switchTab('tasks')}
      class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'tasks'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Tasks
    </button>
    <button
      type="button"
      onclick={() => switchTab('executions')}
      class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'executions'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Executions
    </button>
    <button
      type="button"
      onclick={() => switchTab('packages')}
      class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'packages'
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
    >
      Packages
    </button>
  </nav>
</div>

<!-- Tab Content -->
<div class="p-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  {:else if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span class="text-sm text-red-800 dark:text-red-200">{error}</span>
      </div>
    </div>
  {:else}
    <!-- Inventory Tab Content -->
    {#if activeTab === 'inventory'}
      <div class="space-y-4">
        <!-- Search and Filter -->
        <div class="flex gap-4">
          <div class="flex-1">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search nodes..."
              class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <select
            bind:value={selectedGroup}
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="all">All Groups</option>
            {#each groups as group}
              <option value={group}>{group}</option>
            {/each}
          </select>
        </div>

        <!-- Nodes List -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each filteredNodes as node}
            <button
              type="button"
              onclick={() => navigateToNode(node.id)}
              class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-amber-500 dark:hover:border-amber-500 transition-colors text-left"
            >
              <div class="font-medium text-gray-900 dark:text-white">{node.name}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{node.id}</div>
              {#if node.groups && node.groups.length > 0}
                <div class="flex flex-wrap gap-1 mt-2">
                  {#each node.groups as group}
                    <span class="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {group}
                    </span>
                  {/each}
                </div>
              {/if}
            </button>
          {/each}
        </div>

        {#if filteredNodes.length === 0}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No nodes found
          </div>
        {/if}
      </div>
    {/if}

    <!-- Tasks Tab Content -->
    {#if activeTab === 'tasks'}
      <div class="space-y-4">
        <!-- Search -->
        <input
          type="text"
          bind:value={taskSearchQuery}
          placeholder="Search tasks..."
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />

        <!-- Tasks List -->
        <div class="space-y-2">
          {#each filteredTasks as task}
            <button
              type="button"
              onclick={() => navigateToTaskRunner(task.name)}
              class="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-amber-500 dark:hover:border-amber-500 transition-colors text-left"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="font-medium text-gray-900 dark:text-white">{task.name}</div>
                  {#if task.description}
                    <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.description}</div>
                  {/if}
                  {#if task.module}
                    <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">Module: {task.module}</div>
                  {/if}
                </div>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          {/each}
        </div>

        {#if filteredTasks.length === 0}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No tasks found
          </div>
        {/if}
      </div>
    {/if}

    <!-- Executions Tab Content -->
    {#if activeTab === 'executions'}
      <div class="space-y-4">
        <!-- Filter -->
        <div class="flex gap-2">
          {#each ['all', 'running', 'success', 'failed', 'partial'] as filter}
            <button
              type="button"
              onclick={() => { executionFilter = filter as typeof executionFilter; void loadExecutions(); }}
              class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {executionFilter === filter
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          {/each}
        </div>

        <!-- Executions List -->
        <div class="space-y-2">
          {#each executions as execution}
            <button
              type="button"
              onclick={() => navigateToExecution(execution.id)}
              class="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-amber-500 dark:hover:border-amber-500 transition-colors text-left"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900 dark:text-white">{execution.action}</span>
                    <span class="px-2 py-0.5 text-xs rounded-full {getStatusColor(execution.status)}">
                      {execution.status}
                    </span>
                  </div>
                  <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {execution.targetNodes.length} node{execution.targetNodes.length !== 1 ? 's' : ''}
                  </div>
                  <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {formatDate(execution.startedAt)}
                  </div>
                </div>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          {/each}
        </div>

        {#if executions.length === 0}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No executions found
          </div>
        {/if}

        <!-- Pagination -->
        {#if executionTotal > 20}
          <div class="flex items-center justify-between pt-4">
            <button
              type="button"
              onclick={() => { executionPage--; void loadExecutions(); }}
              disabled={executionPage === 1}
              class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Page {executionPage} of {Math.ceil(executionTotal / 20)}
            </span>
            <button
              type="button"
              onclick={() => { executionPage++; void loadExecutions(); }}
              disabled={executionPage >= Math.ceil(executionTotal / 20)}
              class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Packages Tab Content -->
    {#if activeTab === 'packages'}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Package Operation Form -->
        <div class="lg:col-span-1 space-y-4">
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Package Operation</h3>

            <!-- Operation Type -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Operation
              </label>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => packageOperation = 'install'}
                  class="flex-1 px-3 py-2 text-sm rounded-lg transition-colors {packageOperation === 'install'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                >
                  Install
                </button>
                <button
                  type="button"
                  onclick={() => packageOperation = 'update'}
                  class="flex-1 px-3 py-2 text-sm rounded-lg transition-colors {packageOperation === 'update'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                >
                  Update
                </button>
                <button
                  type="button"
                  onclick={() => packageOperation = 'uninstall'}
                  class="flex-1 px-3 py-2 text-sm rounded-lg transition-colors {packageOperation === 'uninstall'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                >
                  Uninstall
                </button>
              </div>
            </div>

            <!-- Package Name -->
            <div class="mb-4">
              <label for="pkg-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Package Name
              </label>
              <input
                id="pkg-name"
                type="text"
                bind:value={packageName}
                placeholder="e.g., nginx, apache2, postgresql"
                class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <!-- Package Version (only for install) -->
            {#if packageOperation === 'install'}
              <div class="mb-4">
                <label for="pkg-version" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Version (optional)
                </label>
                <input
                  id="pkg-version"
                  type="text"
                  bind:value={packageVersion}
                  placeholder="e.g., 1.18.0"
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            {/if}

            <!-- Selected Nodes Count -->
            <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-sm text-gray-700 dark:text-gray-300">
                <span class="font-medium">{selectedNodesForPackage.length}</span> node(s) selected
              </div>
            </div>

            <!-- Execute Button -->
            <button
              type="button"
              onclick={executePackageOperation}
              disabled={packageOperationRunning || !packageName.trim() || selectedNodesForPackage.length === 0}
              class="w-full px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {packageOperationRunning ? 'Processing...' : `${packageOperation.charAt(0).toUpperCase() + packageOperation.slice(1)} Package`}
            </button>

            <!-- Operation Result -->
            {#if packageOperationResult}
              <div class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div class="flex items-start gap-2">
                  <svg class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-sm text-green-800 dark:text-green-200">{packageOperationResult}</span>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Right Column: Node Selection -->
        <div class="lg:col-span-2 space-y-4">
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Select Target Nodes</h3>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={selectAllNodes}
                  class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onclick={clearNodeSelection}
                  class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- Search -->
            <div class="mb-4">
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search nodes..."
                class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <!-- Nodes List -->
            <div class="space-y-2 max-h-96 overflow-y-auto">
              {#each filteredNodes as node}
                <label
                  class="flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-amber-500 dark:hover:border-amber-500 transition-colors cursor-pointer {selectedNodesForPackage.includes(node.id) ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-500' : ''}"
                >
                  <input
                    type="checkbox"
                    checked={selectedNodesForPackage.includes(node.id)}
                    onchange={() => toggleNodeSelection(node.id)}
                    class="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <div class="ml-3 flex-1">
                    <div class="font-medium text-gray-900 dark:text-white">{node.name}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">{node.id}</div>
                  </div>
                  {#if node.groups && node.groups.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each node.groups.slice(0, 2) as group}
                        <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {group}
                        </span>
                      {/each}
                      {#if node.groups.length > 2}
                        <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          +{node.groups.length - 2}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </label>
              {/each}
            </div>

            {#if filteredNodes.length === 0}
              <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                No nodes found
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
