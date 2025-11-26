<script lang="ts">
  import { router } from '../lib/router.svelte';

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    command?: string;
  }

  interface Props {
    execution: ExecutionResult;
    currentNodeId?: string; // If provided, will set this as the target node
    disabled?: boolean;
    size?: 'sm' | 'md';
    variant?: 'button' | 'icon';
  }

  let { execution, currentNodeId, disabled = false, size = 'md', variant = 'button' }: Props = $props();

  let navigating = $state(false);

  // Determine if button should be disabled
  const isDisabled = $derived(disabled || execution.status === 'running' || navigating);

  // Handle re-execute click
  function handleReExecute(): void {
    if (isDisabled) return;

    navigating = true;

    try {
      // Determine the target node(s)
      const targetNodes = currentNodeId ? [currentNodeId] : execution.targetNodes;

      // Navigate based on execution type
      switch (execution.type) {
        case 'command':
          // Navigate to node detail page with command pre-filled
          if (targetNodes.length === 1) {
            const nodeId = targetNodes[0];
            // Store command in sessionStorage for pre-filling
            sessionStorage.setItem('reExecuteCommand', execution.action);
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          } else {
            // For multiple nodes, we'd need a multi-node command interface
            // For now, navigate to first node
            const nodeId = targetNodes[0];
            sessionStorage.setItem('reExecuteCommand', execution.action);
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          }
          break;

        case 'task':
          // Navigate to node detail page with task pre-filled
          if (targetNodes.length === 1) {
            const nodeId = targetNodes[0];
            // Store task info in sessionStorage for pre-filling
            sessionStorage.setItem('reExecuteTask', JSON.stringify({
              taskName: execution.action,
              parameters: execution.parameters || {}
            }));
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          } else {
            // For multiple nodes, navigate to first node
            const nodeId = targetNodes[0];
            sessionStorage.setItem('reExecuteTask', JSON.stringify({
              taskName: execution.action,
              parameters: execution.parameters || {}
            }));
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          }
          break;

        case 'puppet':
          // Navigate to node detail page for puppet run
          if (targetNodes.length === 1) {
            const nodeId = targetNodes[0];
            sessionStorage.setItem('reExecutePuppet', JSON.stringify({
              parameters: execution.parameters || {}
            }));
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          }
          break;

        case 'package':
          // Navigate to node detail page for package installation
          if (targetNodes.length === 1) {
            const nodeId = targetNodes[0];
            sessionStorage.setItem('reExecutePackage', JSON.stringify({
              parameters: execution.parameters || {}
            }));
            router.navigate(`/nodes/${nodeId}?tab=overview`);
          }
          break;

        default:
          console.warn('Unknown execution type:', execution.type);
      }
    } finally {
      // Reset navigating state after a short delay
      setTimeout(() => {
        navigating = false;
      }, 500);
    }
  }

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm'
  };

  const iconSizeClasses = {
    sm: 'p-1',
    md: 'p-2'
  };
</script>

{#if variant === 'icon'}
  <button
    type="button"
    onclick={handleReExecute}
    disabled={isDisabled}
    class="inline-flex items-center justify-center rounded-md text-gray-600 hover:text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 {iconSizeClasses[size]}"
    title="Re-execute this action"
  >
    {#if navigating}
      <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    {:else}
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    {/if}
  </button>
{:else}
  <button
    type="button"
    onclick={handleReExecute}
    disabled={isDisabled}
    class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 {sizeClasses[size]}"
  >
    {#if navigating}
      <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    {:else}
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    {/if}
    Re-execute
  </button>
{/if}
