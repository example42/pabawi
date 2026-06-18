<script lang="ts">
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api';
  import { router } from '../lib/router.svelte';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  interface IntegrationStatus {
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
    type: 'execution' | 'information' | 'both';
  }

  let { nodeId, onReady, onError }: Props = $props();

  let executionTool = $state<'bolt' | 'ansible' | 'ssh' | null>(null);
  let actionInProgress = $state<string | null>(null);

  async function detectExecutionTool(): Promise<void> {
    try {
      const data = await get<{ integrations: IntegrationStatus[] }>(
        '/api/integrations/status',
        { maxRetries: 1 },
      );

      // Prefer ssh > bolt > ansible for puppet agent commands
      const preferredOrder: Array<'ssh' | 'bolt' | 'ansible'> = ['ssh', 'bolt', 'ansible'];
      for (const tool of preferredOrder) {
        const match = data.integrations.find(
          (i) => i.name === tool
            && (i.type === 'execution' || i.type === 'both')
            && (i.status === 'connected' || i.status === 'degraded'),
        );
        if (match) {
          executionTool = tool;
          break;
        }
      }

      if (!executionTool) {
        onError(new Error('No execution tool available for puppet agent actions'));
        return;
      }

      onReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to detect execution tools';
      onError(new Error(message));
    }
  }

  async function executeAgentCommand(command: string, label: string): Promise<void> {
    if (actionInProgress || !executionTool) return;

    actionInProgress = label;
    showInfo(`Executing: ${label}...`);

    try {
      await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/command`,
        {
          command,
          expertMode: expertMode.enabled,
          tool: executionTool,
        },
        { maxRetries: 0 },
      );
      showSuccess(`${label} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to execute ${label}`;
      showError(label, message);
    } finally {
      actionInProgress = null;
    }
  }

  function handleEnable(): void {
    void executeAgentCommand('puppet agent --enable', 'Enable Agent');
  }

  function handleDisable(): void {
    void executeAgentCommand('puppet agent --disable', 'Disable Agent');
  }

  function handleRun(): void {
    router.navigate(`/nodes/${nodeId}?tab=actions`);
  }

  onMount(() => {
    void detectExecutionTool();
  });
</script>

<div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <!-- Header with integration label -->
  <div class="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
    <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Puppet Agent</span>
    <div class="flex items-center gap-1.5">
      <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
      {#if executionTool}
        <IntegrationBadge integration={executionTool} variant="badge" size="sm" />
      {/if}
    </div>
  </div>

  <!-- Action buttons — horizontal row -->
  <div class="flex items-center gap-2 px-4 py-3">
    <button
      type="button"
      onclick={handleEnable}
      disabled={actionInProgress !== null}
      class="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
    >
      {#if actionInProgress === 'Enable Agent'}
        <svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      {:else}
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      {/if}
      Enable
    </button>

    <button
      type="button"
      onclick={handleDisable}
      disabled={actionInProgress !== null}
      class="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
    >
      {#if actionInProgress === 'Disable Agent'}
        <svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      {:else}
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      {/if}
      Disable
    </button>

    <button
      type="button"
      onclick={handleRun}
      disabled={actionInProgress !== null}
      class="inline-flex items-center gap-1.5 rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      </svg>
      Run
    </button>
  </div>
</div>
