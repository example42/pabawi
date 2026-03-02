<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import ActionSelector from './ActionSelector.svelte';
  import ExecuteCommandForm from './ExecuteCommandForm.svelte';
  import InstallSoftwareForm from './InstallSoftwareForm.svelte';
  import ExecutePlaybookForm from './ExecutePlaybookForm.svelte';
  import ExecuteTaskForm from './ExecuteTaskForm.svelte';
  import { get, post } from '../lib/api';

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: string;
    source?: string;
  }

  interface CommandWhitelistConfig {
    allowAll: boolean;
    whitelist: string[];
    matchMode: 'exact' | 'prefix';
  }

  interface IntegrationStatus {
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
    type: 'execution' | 'information' | 'both';
  }

  interface Props {
    open: boolean;
    groupName: string;
    groupId: string;
    targetNodes: Node[];
    onClose: () => void;
    onSuccess: (batchId: string) => void;
  }

  let { open = $bindable(), groupName, groupId, targetNodes, onClose, onSuccess }: Props = $props();

  // State for command whitelist and execution tools
  let commandWhitelist = $state<CommandWhitelistConfig | null>(null);
  let availableExecutionTools = $state<Array<'bolt' | 'ansible' | 'ssh'>>(['bolt']);
  let executionTool = $state<'bolt' | 'ansible' | 'ssh'>('bolt');

  // Focus management
  let modalRef = $state<HTMLDivElement | null>(null);
  let previousActiveElement = $state<HTMLElement | null>(null);

  // State for action configuration
  type ActionType = 'install-software' | 'execute-playbook' | 'execute-command' | 'execute-task';
  let selectedAction = $state<ActionType>('execute-command');
  let actionFormData = $state<Record<string, unknown> | null>(null);

  // State for loading and errors
  let loading = $state<boolean>(false);
  let error = $state<string | null>(null);

  // Derived state for target node IDs
  let targetNodeIds = $derived(targetNodes.map(n => n.id));

  function handleClose(): void {
    if (!loading) {
      resetForm();
      onClose();

      // Restore focus to the element that opened the modal
      if (previousActiveElement) {
        previousActiveElement.focus();
        previousActiveElement = null;
      }
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  // Handle keyboard navigation
  function handleKeyDown(event: KeyboardEvent): void {
    // Close modal on Escape key
    if (event.key === 'Escape' && !loading) {
      event.preventDefault();
      handleClose();
    }

    // Trap focus within modal
    if (event.key === 'Tab' && modalRef) {
      const focusableElements = modalRef.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }

  function resetForm(): void {
    selectedAction = 'execute-command';
    actionFormData = null;
    error = null;
    executionTool = availableExecutionTools[0] ?? 'bolt';
  }

  // Fetch command whitelist configuration
  async function fetchCommandWhitelist(): Promise<void> {
    try {
      const data = await get<{ commandWhitelist: CommandWhitelistConfig }>(
        '/api/config',
        { maxRetries: 2 }
      );

      commandWhitelist = data.commandWhitelist;
    } catch (err) {
      console.error('[GroupActionModal] Error fetching command whitelist:', err);
    }
  }

  // Fetch available execution tools
  async function fetchExecutionTools(): Promise<void> {
    try {
      const data = await get<{ integrations: IntegrationStatus[] }>('/api/integrations/status', {
        maxRetries: 1,
      });

      const executionIntegrations = data.integrations.filter(
        (integration) => (integration.type === 'execution' || integration.type === 'both')
          && (integration.status === 'connected' || integration.status === 'degraded')
          && (integration.name === 'bolt' || integration.name === 'ansible' || integration.name === 'ssh'),
      ) as Array<IntegrationStatus & { name: 'bolt' | 'ansible' | 'ssh' }>;

      if (executionIntegrations.length > 0) {
        availableExecutionTools = executionIntegrations.map((integration) => integration.name);
      }

      if (!availableExecutionTools.includes(executionTool)) {
        executionTool = availableExecutionTools[0] ?? 'bolt';
      }
    } catch {
      availableExecutionTools = ['bolt'];
      executionTool = 'bolt';
    }
  }

  // Handle action selection change
  function handleActionSelect(action: ActionType): void {
    selectedAction = action;
    actionFormData = null;
  }

  // Handle form submission from action components
  function handleActionFormSubmit(data: Record<string, unknown>): void {
    actionFormData = data;
  }

  // Map action types to batch execution types
  function mapActionTypeToBatchType(action: ActionType): 'command' | 'task' | 'plan' {
    switch (action) {
      case 'execute-command':
        return 'command';
      case 'execute-task':
        return 'task';
      case 'execute-playbook':
        return 'plan';
      case 'install-software':
        return 'task'; // Software installation uses tasks
      default:
        return 'command';
    }
  }

  // Watch for modal open to fetch configuration
  let hasLoadedConfig = $state<boolean>(false);

  $effect(() => {
    if (open && !hasLoadedConfig) {
      hasLoadedConfig = true;
      fetchCommandWhitelist();
      fetchExecutionTools();
    }

    // Reset flags when modal closes
    if (!open) {
      hasLoadedConfig = false;
    }
  });

  // Focus management effect
  $effect(() => {
    if (open) {
      // Store the currently focused element
      previousActiveElement = document.activeElement as HTMLElement;

      // Focus the modal after a short delay to ensure it's rendered
      setTimeout(() => {
        modalRef?.focus();
      }, 100);

      // Add keyboard event listener
      document.addEventListener('keydown', handleKeyDown);
    } else {
      // Remove keyboard event listener
      document.removeEventListener('keydown', handleKeyDown);
    }

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  async function handleSubmit(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }

    // Validation
    if (targetNodeIds.length === 0) {
      error = "No target nodes available in this group";
      return;
    }

    // Get form data from the action form component
    if (!actionFormData) {
      error = "Please configure the action";
      return;
    }

    const formData = actionFormData;

    loading = true;
    error = null;

    try {
      const batchType = mapActionTypeToBatchType(selectedAction);

      // Build request body based on action type
      const requestBody: {
        targetNodeIds: string[];
        type: "command" | "task" | "plan";
        action: string;
        parameters?: Record<string, unknown>;
        tool?: 'bolt' | 'ansible' | 'ssh';
      } = {
        targetNodeIds: targetNodeIds,
        type: batchType,
        action: '', // Will be set based on action type
      };

      // Configure action based on type
      if (selectedAction === 'execute-command') {
        const commandData = formData as { command: string; tool: 'bolt' | 'ansible' | 'ssh'; parameters?: Record<string, unknown> };
        requestBody.action = commandData.command;
        requestBody.tool = commandData.tool;
        if (commandData.parameters) {
          requestBody.parameters = commandData.parameters;
        }
      } else if (selectedAction === 'execute-task') {
        const taskData = formData as { taskName: string; parameters: Record<string, unknown> };
        requestBody.action = taskData.taskName;
        requestBody.tool = 'bolt';
        if (Object.keys(taskData.parameters).length > 0) {
          requestBody.parameters = taskData.parameters;
        }
      } else if (selectedAction === 'execute-playbook') {
        const playbookData = formData as { playbookPath: string; extraVars?: Record<string, unknown> };
        requestBody.action = playbookData.playbookPath;
        requestBody.tool = 'ansible';
        if (playbookData.extraVars) {
          requestBody.parameters = playbookData.extraVars;
        }
      } else if (selectedAction === 'install-software') {
        const softwareData = formData as {
          packageName: string;
          tool: 'bolt' | 'ansible' | 'ssh';
          taskName?: string;
          version?: string;
          ensure: 'present' | 'absent' | 'latest';
          settings?: Record<string, unknown>;
        };

        // For software installation, use the task name if available (Bolt), otherwise use a generic action
        requestBody.action = softwareData.taskName || `package::${softwareData.ensure}`;
        requestBody.tool = softwareData.tool;

        // Build parameters for package installation
        const params: Record<string, unknown> = {
          packageName: softwareData.packageName,
          ensure: softwareData.ensure,
        };

        if (softwareData.version) {
          params.version = softwareData.version;
        }

        if (softwareData.settings) {
          params.settings = softwareData.settings;
        }

        requestBody.parameters = params;
      }

      // Send POST request to batch execution endpoint
      const response = await post<{ batchId: string; executionIds: string[]; targetCount: number; expandedNodeIds: string[] }>(
        '/api/executions/batch',
        requestBody
      );

      // Success - display batch ID and call onSuccess callback
      console.log('[GroupActionModal] Batch execution created:', response.batchId, 'Targets:', response.targetCount);

      resetForm();
      onSuccess(response.batchId);
      onClose();
    } catch (err) {
      // Handle error responses
      if (err instanceof Error) {
        const message = err.message.toLowerCase();

        // Handle specific error cases
        if (message.includes('queue') && message.includes('full')) {
          error = 'Execution queue is full. Please wait for some executions to complete and try again.';
        } else if (message.includes('validation') || message.includes('invalid')) {
          error = 'Validation error: ' + err.message;
        } else if (message.includes('not found')) {
          error = 'Some selected nodes were not found. Please refresh and try again.';
        } else {
          error = err.message;
        }
      } else {
        error = 'Failed to create batch execution. Please try again.';
      }

      console.error('[GroupActionModal] Error creating batch execution:', err);
    } finally {
      loading = false;
    }
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity z-40"
    onclick={handleBackdropClick}
    aria-hidden="true"
  ></div>

  <!-- Dialog -->
  <div
    class="fixed inset-0 z-50 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    aria-describedby="modal-description"
    aria-busy={loading}
  >
    <div class="flex min-h-full items-center justify-center p-2 sm:p-4 text-center">
      <div
        bind:this={modalRef}
        tabindex="-1"
        class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-all w-full max-w-3xl mx-auto"
      >
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 px-3 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4">
          <div class="flex items-start justify-between mb-3 sm:mb-4">
            <div>
              <h3
                id="modal-title"
                class="text-base sm:text-lg font-medium leading-6 text-gray-900 dark:text-white"
              >
                Execute Action on Group
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {groupName}
              </p>
            </div>
            <button
              type="button"
              onclick={handleClose}
              disabled={loading}
              aria-label="Close dialog"
              class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <span class="sr-only">Close</span>
              <svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p id="modal-description" class="sr-only">
            Configure and execute an action on all {targetNodes.length} nodes in the {groupName} group. Use Tab to navigate between controls, Escape to close the dialog.
          </p>

          <!-- Error Display -->
          {#if error}
            <div
              class="mb-3 sm:mb-4 rounded-md bg-red-50 dark:bg-red-900/20 p-3 sm:p-4"
              role="alert"
              aria-live="assertive"
            >
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Form -->
          <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4 sm:space-y-6">
            <!-- Target Nodes Display (Read-only) -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white" id="target-nodes-label">
                  Target Nodes
                </h4>
                <div
                  class="text-sm"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${targetNodes.length} target ${targetNodes.length === 1 ? 'node' : 'nodes'} selected`}
                >
                  <span class="text-gray-500 dark:text-gray-400">Total:</span>
                  <span class="font-medium text-primary-600 dark:text-primary-400">{targetNodes.length}</span>
                  <span class="text-gray-500 dark:text-gray-400">{targetNodes.length === 1 ? 'node' : 'nodes'}</span>
                </div>
              </div>

              <!-- Nodes List (Read-only) -->
              <div
                class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900/50"
                role="region"
                aria-labelledby="target-nodes-label"
                tabindex="0"
              >
                {#if targetNodes.length === 0}
                  <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
                    No nodes in this group
                  </div>
                {:else}
                  <div class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each targetNodes as node}
                      <div class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
                        <div class="flex-shrink-0">
                          <svg class="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                          </svg>
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {node.name}
                          </div>
                          <div class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1 sm:gap-2">
                            <span class="truncate">{node.uri}</span>
                            {#if node.source}
                              <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs whitespace-nowrap">
                                {node.source}
                              </span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Action Configuration Section -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3" id="action-config-label">
                Configure Action
              </h4>

              <!-- Action Selector -->
              <div class="mb-4" role="group" aria-labelledby="action-config-label">
                <ActionSelector
                  mode="single"
                  bind:selectedAction={selectedAction}
                  onActionSelect={handleActionSelect}
                  disabled={loading}
                />
              </div>

              <!-- Conditional Action Forms -->
              <div class="mt-4">
                {#if selectedAction === 'execute-command'}
                  <ExecuteCommandForm
                    availableTools={availableExecutionTools}
                    commandWhitelist={commandWhitelist}
                    multiNode={true}
                    executing={loading}
                    onSubmit={handleActionFormSubmit}
                  />
                {:else if selectedAction === 'install-software'}
                  <InstallSoftwareForm
                    availableTools={availableExecutionTools}
                    multiNode={true}
                    executing={loading}
                    onSubmit={handleActionFormSubmit}
                  />
                {:else if selectedAction === 'execute-playbook'}
                  <ExecutePlaybookForm
                    multiNode={true}
                    executing={loading}
                    onSubmit={handleActionFormSubmit}
                  />
                {:else if selectedAction === 'execute-task'}
                  <ExecuteTaskForm
                    multiNode={true}
                    executing={loading}
                    onSubmit={handleActionFormSubmit}
                  />
                {/if}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onclick={handleClose}
                disabled={loading}
                aria-label="Cancel and close dialog"
                class="w-full sm:flex-1 inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || targetNodes.length === 0 || !actionFormData}
                aria-disabled={loading || targetNodes.length === 0 || !actionFormData}
                aria-label={loading ? 'Executing action on nodes' : `Execute action on ${targetNodes.length} ${targetNodes.length === 1 ? 'node' : 'nodes'}`}
                class="w-full sm:flex-1 inline-flex justify-center items-center gap-2 rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {#if loading}
                  <LoadingSpinner size="sm" />
                  Executing...
                {:else}
                  Execute on {targetNodes.length} {targetNodes.length === 1 ? 'Node' : 'Nodes'}
                {/if}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}
