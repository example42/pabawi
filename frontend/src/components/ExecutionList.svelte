<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import ReExecutionButton from './ReExecutionButton.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import { router } from '../lib/router.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: any[];
    error?: string;
    command?: string;
    expertMode?: boolean;
  }

  interface Props {
    executions: ExecutionResult[];
    currentNodeId?: string;
    onExecutionClick?: (execution: ExecutionResult) => void;
    showTargets?: boolean;
  }

  let {
    executions,
    currentNodeId,
    onExecutionClick,
    showTargets = true
  }: Props = $props();

  // Get type badge color
  function getTypeColor(type: string): string {
    switch (type) {
      case 'command':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'task':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'facts':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400';
      case 'puppet':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      case 'package':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Get type display label
  function getTypeLabel(type: string): string {
    switch (type) {
      case 'puppet':
        return 'puppet run';
      case 'package':
        return 'package';
      default:
        return type;
    }
  }

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Format duration - always in seconds
  function formatDuration(startedAt: string, completedAt?: string): string {
    if (!completedAt) {
      return '-';
    }

    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;
    const durationSeconds = (durationMs / 1000).toFixed(1);

    return `${durationSeconds}s`;
  }

  // Navigate to node detail
  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  // Handle execution click
  function handleExecutionClick(execution: ExecutionResult): void {
    if (onExecutionClick) {
      onExecutionClick(execution);
    }
  }
</script>

<div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-900">
        <tr>
          <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Type
          </th>
          <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Action
          </th>
          {#if showTargets}
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Targets
            </th>
          {/if}
          <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Status
          </th>
          <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Started
          </th>
          <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Duration
          </th>
          <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
        {#each executions as execution (execution.id)}
          <tr
            class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            role="button"
            tabindex="0"
            onclick={() => handleExecutionClick(execution)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExecutionClick(execution); } }}
          >
            <td class="whitespace-nowrap px-6 py-4 text-sm">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTypeColor(execution.type)}">
                  {getTypeLabel(execution.type)}
                </span>
                {#if execution.status === 'running'}
                  <span class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400" title="Execution is running">
                    <span class="relative flex h-2 w-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                    </span>
                    Live
                  </span>
                {/if}
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
              <div class="max-w-xs truncate" title={execution.action}>
                {execution.action}
              </div>
            </td>
            {#if showTargets}
              <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                <div class="flex flex-wrap gap-1">
                  {#each execution.targetNodes.slice(0, 2) as nodeId}
                    <button
                      type="button"
                      class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      onclick={(e) => {
                        e.stopPropagation();
                        navigateToNode(nodeId);
                      }}
                    >
                      {nodeId}
                    </button>
                  {/each}
                  {#if execution.targetNodes.length > 2}
                    <span class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      +{execution.targetNodes.length - 2} more
                    </span>
                  {/if}
                </div>
              </td>
            {/if}
            <td class="whitespace-nowrap px-6 py-4 text-sm">
              <StatusBadge status={execution.status} size="sm" />
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
              {formatTimestamp(execution.startedAt)}
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
              {formatDuration(execution.startedAt, execution.completedAt)}
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-right text-sm" onclick={(e) => e.stopPropagation()}>
              <div class="flex items-center justify-end gap-2">
                <ReExecutionButton execution={execution} currentNodeId={currentNodeId} size="sm" variant="icon" />
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
