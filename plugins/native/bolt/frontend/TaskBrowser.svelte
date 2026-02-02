<!--
  Bolt Task Browser Widget

  A compact widget for browsing available Bolt tasks.
  Ideal for dashboard or sidebar placement.

  Features:
  - Module-grouped task list
  - Search functionality
  - Quick task info display
  - Link to full task runner

  @module plugins/native/bolt/frontend/TaskBrowser
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { router } from '../../../../frontend/src/lib/router.svelte';

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
    type: string;
    description?: string;
    required: boolean;
    default?: unknown;
  }

  interface TasksByModule {
    [moduleName: string]: Task[];
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    limit?: number;
    compact?: boolean;
    config?: Record<string, unknown>;
    onTaskSelect?: (task: Task) => void;
  }

  let {
    limit = 10,
    compact = false,
    config = {},
    onTaskSelect,
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let tasksByModule = $state<TasksByModule>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');

  // ==========================================================================
  // Derived
  // ==========================================================================

  let totalTasks = $derived.by(() => {
    let count = 0;
    for (const tasks of Object.values(tasksByModule)) {
      count += tasks.length;
    }
    return count;
  });

  let totalModules = $derived(Object.keys(tasksByModule).length);

  let filteredTasks = $derived.by(() => {
    const tasks: Task[] = [];
    const query = searchQuery.toLowerCase().trim();

    for (const moduleTasks of Object.values(tasksByModule)) {
      for (const task of moduleTasks) {
        if (!query ||
            task.name.toLowerCase().includes(query) ||
            task.module.toLowerCase().includes(query) ||
            task.description?.toLowerCase().includes(query)) {
          tasks.push(task);
        }
      }
    }

    return tasks.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    void fetchTasks();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchTasks(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await get<{ tasksByModule: TasksByModule }>('/api/tasks');
      tasksByModule = response.tasksByModule || {};
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tasks';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Actions
  // ==========================================================================

  function selectTask(task: Task): void {
    if (onTaskSelect) {
      onTaskSelect(task);
    } else {
      router.navigate(`/tasks?task=${encodeURIComponent(task.name)}`);
    }
  }

  function viewAllTasks(): void {
    router.navigate('/tasks');
  }
</script>

<div class="bolt-task-browser {compact ? 'space-y-2' : 'space-y-3'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Available Tasks
      </h3>
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {totalTasks} tasks / {totalModules} modules
    </span>
  </div>

  <!-- Search -->
  <div class="relative">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search tasks..."
      class="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
    />
    <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  </div>

  <!-- Task List -->
  {#if loading}
    <div class="flex items-center justify-center py-4">
      <LoadingSpinner size="sm" />
      <span class="ml-2 text-sm text-gray-500">Loading tasks...</span>
    </div>
  {:else if error}
    <ErrorAlert message={error} variant="inline" />
  {:else if filteredTasks.length === 0}
    <div class="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
      {searchQuery ? 'No tasks match your search' : 'No tasks available'}
    </div>
  {:else}
    <div class="space-y-1 {compact ? 'max-h-40' : 'max-h-60'} overflow-y-auto">
      {#each filteredTasks as task (task.name)}
        <button
          type="button"
          onclick={() => selectTask(task)}
          class="w-full px-3 py-2 flex items-start gap-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors group"
        >
          <div class="flex-shrink-0 mt-0.5">
            <svg class="w-4 h-4 text-amber-500 group-hover:text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">
              {task.name}
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs text-gray-500 dark:text-gray-400">{task.module}</span>
              {#if task.parameters.length > 0}
                <span class="text-xs text-gray-400 dark:text-gray-500">
                  · {task.parameters.filter(p => p.required).length} required params
                </span>
              {/if}
            </div>
            {#if task.description && !compact}
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                {task.description}
              </p>
            {/if}
          </div>

          <svg class="w-4 h-4 text-gray-400 group-hover:text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      {/each}
    </div>

    {#if totalTasks > filteredTasks.length || searchQuery}
      <div class="text-center pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          onclick={viewAllTasks}
          class="text-sm text-amber-600 dark:text-amber-400 hover:underline"
        >
          View all {totalTasks} tasks →
        </button>
      </div>
    {/if}
  {/if}
</div>
