<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { router } from '../lib/router.svelte';
  import ExecutionList from './ExecutionList.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: unknown[];
    error?: string;
    command?: string;
    expertMode?: boolean;
    executionTool?: 'bolt' | 'ansible' | 'ssh';
  }

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  let { nodeId, onReady, onError }: Props = $props();

  let executions = $state<ExecutionResult[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function fetchExecutions(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ executions: ExecutionResult[]; _debug?: DebugInfo }>(
        `/api/executions?targetNode=${nodeId}&pageSize=10`,
        { maxRetries: 2 }
      );

      executions = data.executions || [];
      onReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load executions';
      error = message;
      onError(new Error(message));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchExecutions();
  });
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Latest Actions</h2>
    <IntegrationBadge integration="bolt" variant="badge" size="sm" />
  </div>
  {#if loading}
    <div class="flex justify-center py-4">
      <LoadingSpinner message="Loading executions..." />
    </div>
  {:else if error}
    <ErrorAlert message="Failed to load executions" details={error} onRetry={fetchExecutions} />
  {:else if executions.length === 0}
    <p class="text-sm text-gray-500 dark:text-gray-400">
      No executions found for this node.
    </p>
  {:else}
    <ExecutionList
      executions={executions.slice(0, 5)}
      currentNodeId={nodeId}
      onExecutionClick={(execution) => router.navigate(`/executions?id=${execution.id}`)}
      showTargets={false}
    />
    {#if executions.length > 5}
      <a
        href="/executions?targetNode={nodeId}"
        class="mt-4 block w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        onclick={(e) => { e.preventDefault(); router.navigate(`/executions?targetNode=${nodeId}`); }}
      >
        View all executions →
      </a>
    {/if}
  {/if}
</div>
