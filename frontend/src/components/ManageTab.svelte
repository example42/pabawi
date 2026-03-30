<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import { fetchLifecycleActions, executeNodeAction, destroyNode, get } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import type { LifecycleAction, ProvisioningResult } from '../lib/types/provisioning';

  interface Props {
    nodeId: string;
    nodeType?: 'vm' | 'lxc' | 'unknown';
    currentStatus?: string;
    onStatusChange?: () => void | Promise<void>;
  }

  let { nodeId, nodeType = 'unknown', currentStatus = 'unknown', onStatusChange }: Props = $props();

  // State
  let availableActions = $state<LifecycleAction[]>([]);
  let provider = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionInProgress = $state<string | null>(null);
  let confirmDialog = $state<{ action: string; open: boolean }>({ action: '', open: false });
  let allowDestructiveActions = $state(false);
  let refreshing = $state(false);

  // Derived: Filter actions based on current node status and destructive config
  const displayableActions = $derived.by(() => {
    let filtered = availableActions;

    // Filter out destructive actions when disabled by config
    if (!allowDestructiveActions) {
      filtered = filtered.filter(action => !action.destructive);
    }

    if (!currentStatus) return filtered;

    return filtered.filter(action => {
      const availableWhen = action.availableWhen || [];
      return availableWhen.length === 0 || availableWhen.includes(currentStatus);
    });
  });

  // Refresh node status and available actions
  async function refreshStatus(): Promise<void> {
    refreshing = true;
    try {
      if (onStatusChange) {
        await onStatusChange();
      }
      await fetchAvailableActions();
      showSuccess('Status refreshed');
    } finally {
      refreshing = false;
    }
  }

  // Fetch available actions from backend based on provider
  async function fetchAvailableActions(): Promise<void> {
    loading = true;
    error = null;

    try {
      // Fetch provisioning config and lifecycle actions in parallel
      const [configResponse, response] = await Promise.all([
        get<{ provisioning: { allowDestructiveActions: boolean } }>('/api/config/provisioning').catch(() => ({
          provisioning: { allowDestructiveActions: false },
        })),
        fetchLifecycleActions(nodeId),
      ]);

      allowDestructiveActions = configResponse.provisioning.allowDestructiveActions;
      provider = response.provider;
      availableActions = response.actions;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load available actions';
      console.error('Error fetching available actions:', err);
      showError('Failed to load available actions', error);
    } finally {
      loading = false;
    }
  }

  // Execute a lifecycle action
  async function executeAction(action: string): Promise<void> {
    // Check if action requires confirmation
    const actionDef = availableActions.find(a => a.name === action);
    if (actionDef?.requiresConfirmation) {
      confirmDialog = { action, open: true };
      return;
    }

    await performAction(action);
  }

  // Perform the actual action execution
  async function performAction(action: string): Promise<void> {
    actionInProgress = action;

    try {
      showInfo(`Executing ${action}...`);

      let result: ProvisioningResult;

      // Use destroyNode for destructive destroy/terminate actions
      const actionDef = availableActions.find(a => a.name === action);
      if (actionDef?.destructive && (action === 'destroy' || action === 'destroy_vm' || action === 'destroy_lxc' || action === 'terminate' || action === 'terminate_instance')) {
        result = await destroyNode(nodeId);
      } else {
        result = await executeNodeAction(nodeId, action);
      }

      if (result.success) {
        showSuccess(`Action ${action} completed successfully`, result.message);

        // Refresh node status if callback provided
        if (onStatusChange) {
          await onStatusChange();
        }
      } else {
        showError(`Action ${action} failed`, result.error || result.message);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error(`Error executing action ${action}:`, err);
      showError(`Failed to execute ${action}`, errorMessage);
    } finally {
      actionInProgress = null;
      confirmDialog = { action: '', open: false };
    }
  }

  // Cancel confirmation dialog
  function cancelConfirmation(): void {
    confirmDialog = { action: '', open: false };
  }

  // Handle Escape key to close confirmation dialog via window-level listener
  $effect(() => {
    if (!confirmDialog.open) return;
    function handleKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape') cancelConfirmation();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => { window.removeEventListener('keydown', handleKeydown); };
  });

  // Confirm and execute destructive action
  function confirmAction(): void {
    if (confirmDialog.action) {
      performAction(confirmDialog.action);
    }
  }

  // Get icon for action
  function getActionIcon(actionName: string): string {
    const icons: Record<string, string> = {
      start: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      stop: 'M10 9h4v6h-4V9z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      shutdown: 'M13 10V3L4 14h7v7l9-11h-7z',
      reboot: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
      suspend: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
      resume: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z',
      snapshot: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
      destroy: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
      destroy_vm: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
      destroy_lxc: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
      terminate: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
      terminate_instance: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    };
    return icons[actionName] || 'M13 10V3L4 14h7v7l9-11h-7z';
  }

  onMount(() => {
    fetchAvailableActions();
  });
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Lifecycle Actions</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage the lifecycle of this {nodeType === 'vm' ? 'virtual machine' : nodeType === 'lxc' ? 'container' : 'node'}
        </p>
      </div>
      <div class="flex items-center gap-2">
        {#if provider}
          <IntegrationBadge integration={provider} variant="badge" size="sm" />
        {/if}
        <button
          type="button"
          onclick={refreshStatus}
          disabled={refreshing || actionInProgress !== null}
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          title="Refresh status"
        >
          <svg class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>

    <!-- Current Status -->
    {#if currentStatus && currentStatus !== 'unknown'}
      <div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Current Status:</span>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize {currentStatus === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : currentStatus === 'stopped' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'}">
            {currentStatus}
          </span>
        </div>
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading}
      <div class="flex justify-center py-8">
        <LoadingSpinner message="Loading available actions..." />
      </div>
    {:else if error}
      <!-- Error State -->
      <ErrorAlert message="Failed to load actions" details={error} onRetry={fetchAvailableActions} />
    {:else if displayableActions.length === 0}
      <!-- No Actions Available -->
      <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No actions are available for the current node state.
        </p>
        {#if currentStatus && currentStatus !== 'unknown'}
          <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Current status: {currentStatus}
          </p>
        {/if}
      </div>
    {:else}
      <!-- Action Buttons -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each displayableActions as action}
          <button
            type="button"
            onclick={() => executeAction(action.name)}
            disabled={actionInProgress !== null}
            class="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 {action.destructive ? 'border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:hover:bg-red-900/30' : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700'}"
          >
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 {action.destructive ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getActionIcon(action.name)} />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium {action.destructive ? 'text-red-900 dark:text-red-300' : 'text-gray-900 dark:text-white'}">
                  {action.displayName}
                </span>
                {#if actionInProgress === action.name}
                  <LoadingSpinner size="sm" />
                {/if}
              </div>
              <p class="mt-0.5 text-xs {action.destructive ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}">
                {action.description}
              </p>
            </div>
          </button>
        {/each}
      </div>

      <!-- Action in Progress Indicator -->
      {#if actionInProgress}
        <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div class="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span class="text-sm text-blue-800 dark:text-blue-400">
              Executing {actionInProgress}... This may take a moment.
            </span>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Confirmation Dialog -->
{#if confirmDialog.open}
  <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div
        class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity dark:bg-gray-900 dark:bg-opacity-75"
        onclick={cancelConfirmation}
        role="button"
        tabindex="0"
        aria-label="Close dialog"
      ></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

      <div class="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
        <div class="bg-white px-4 pb-4 pt-5 dark:bg-gray-800 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
              <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">
                Confirm Destructive Action
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to {confirmDialog.action} this {nodeType === 'vm' ? 'virtual machine' : nodeType === 'lxc' ? 'container' : 'node'}?
                </p>
                <p class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Node ID: <span class="font-mono text-red-600 dark:text-red-400">{nodeId}</span>
                </p>
                {#if confirmDialog.action === 'destroy' || confirmDialog.action === 'destroy_vm' || confirmDialog.action === 'destroy_lxc' || confirmDialog.action === 'terminate' || confirmDialog.action === 'terminate_instance'}
                  <p class="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">
                    ⚠️ This action cannot be undone. All data will be permanently deleted.
                  </p>
                {/if}
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 dark:bg-gray-900 sm:flex sm:flex-row-reverse sm:px-6">
          <button
            type="button"
            onclick={confirmAction}
            disabled={actionInProgress !== null}
            class="inline-flex w-full justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-3 sm:w-auto sm:text-sm"
          >
            {actionInProgress ? 'Processing...' : 'Confirm'}
          </button>
          <button
            type="button"
            onclick={cancelConfirmation}
            disabled={actionInProgress !== null}
            class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:mt-0 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
