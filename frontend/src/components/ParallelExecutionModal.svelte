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

  interface NodeGroup {
    id: string;
    name: string;
    source: string;
    sources: string[];
    linked: boolean;
    nodes: string[];
  }

  interface InventoryResponse {
    nodes: Node[];
    groups: NodeGroup[];
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
    onClose: () => void;
    onSuccess: (batchId: string) => void;
  }

  let { open = $bindable(), onClose, onSuccess }: Props = $props();

  // State for inventory data
  let nodes = $state<Node[]>([]);
  let groups = $state<NodeGroup[]>([]);
  let inventoryLoading = $state<boolean>(false);
  let inventoryError = $state<string | null>(null);

  // State for command whitelist and execution tools
  let commandWhitelist = $state<CommandWhitelistConfig | null>(null);
  let availableExecutionTools = $state<Array<'bolt' | 'ansible' | 'ssh'>>(['bolt']);
  let executionTool = $state<'bolt' | 'ansible' | 'ssh'>('bolt');

  // Focus management
  let modalRef = $state<HTMLDivElement | null>(null);
  let previousActiveElement = $state<HTMLElement | null>(null);

  // State for target selection
  let selectedNodeIds = $state<string[]>([]);
  let selectedGroupIds = $state<string[]>([]);

  // State for search and filtering
  let searchQuery = $state<string>("");
  let sourceFilter = $state<string>("all");
  let viewMode = $state<"nodes" | "groups">("nodes");

  // State for action configuration
  type ActionType = 'install-software' | 'execute-playbook' | 'execute-command' | 'execute-task';
  let selectedAction = $state<ActionType>('execute-command');
  let actionFormData = $state<Record<string, unknown> | null>(null);

  // State for loading and errors
  let loading = $state<boolean>(false);
  let error = $state<string | null>(null);

  // Derived state for filtered nodes
  let filteredNodes = $derived(() => {
    let result = nodes;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(node =>
        node.name.toLowerCase().includes(query) ||
        node.id.toLowerCase().includes(query)
      );
    }

    // Apply source filter
    if (sourceFilter !== "all") {
      result = result.filter(node => node.source === sourceFilter);
    }

    return result;
  });

  // Derived state for filtered groups
  let filteredGroups = $derived(() => {
    let result = groups;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(group =>
        group.name.toLowerCase().includes(query) ||
        group.id.toLowerCase().includes(query)
      );
    }

    // Apply source filter
    if (sourceFilter !== "all") {
      result = result.filter(group => group.sources.includes(sourceFilter));
    }

    return result;
  });

  // Derived state for available sources
  let availableSources = $derived(() => {
    const sources = new Set<string>();
    nodes.forEach(node => {
      if (node.source) sources.add(node.source);
    });
    groups.forEach(group => {
      group.sources.forEach(source => sources.add(source));
    });
    return Array.from(sources).sort();
  });

  // Derived state for total target count (deduplicated)
  let totalTargetCount = $derived(() => {
    const nodeSet = new Set(selectedNodeIds);

    // Add nodes from selected groups
    selectedGroupIds.forEach(groupId => {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        group.nodes.forEach(nodeId => nodeSet.add(nodeId));
      }
    });

    return nodeSet.size;
  });

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

    // Keyboard shortcuts for view mode switching (Alt+N for nodes, Alt+G for groups)
    if (event.altKey && !loading) {
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        viewMode = 'nodes';
      } else if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        viewMode = 'groups';
      }
    }
  }

  function resetForm(): void {
    selectedNodeIds = [];
    selectedGroupIds = [];
    selectedAction = 'execute-command';
    actionFormData = null;
    error = null;
    searchQuery = "";
    sourceFilter = "all";
    viewMode = "nodes";
    executionTool = availableExecutionTools[0] ?? 'bolt';
  }

  // Fetch inventory data
  async function fetchInventory(): Promise<void> {
    inventoryLoading = true;
    inventoryError = null;

    try {
      const data = await get<InventoryResponse>('/api/inventory');
      nodes = data.nodes || [];
      groups = data.groups || [];
    } catch (err) {
      inventoryError = err instanceof Error ? err.message : 'Failed to load inventory';
      console.error('[ParallelExecutionModal] Error fetching inventory:', err);
      nodes = [];
      groups = [];
    } finally {
      inventoryLoading = false;
    }
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
      console.error('[ParallelExecutionModal] Error fetching command whitelist:', err);
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

  // Handle node selection toggle
  function toggleNodeSelection(nodeId: string): void {
    if (selectedNodeIds.includes(nodeId)) {
      selectedNodeIds = selectedNodeIds.filter(id => id !== nodeId);
    } else {
      selectedNodeIds = [...selectedNodeIds, nodeId];
    }
  }

  // Handle group selection toggle
  function toggleGroupSelection(groupId: string): void {
    if (selectedGroupIds.includes(groupId)) {
      selectedGroupIds = selectedGroupIds.filter(id => id !== groupId);
    } else {
      selectedGroupIds = [...selectedGroupIds, groupId];
    }
  }

  // Select all visible items
  function selectAll(): void {
    if (viewMode === "nodes") {
      const visibleNodeIds = filteredNodes().map(n => n.id);
      selectedNodeIds = [...new Set([...selectedNodeIds, ...visibleNodeIds])];
    } else {
      const visibleGroupIds = filteredGroups().map(g => g.id);
      selectedGroupIds = [...new Set([...selectedGroupIds, ...visibleGroupIds])];
    }
  }

  // Clear all selections
  function clearAll(): void {
    if (viewMode === "nodes") {
      selectedNodeIds = [];
    } else {
      selectedGroupIds = [];
    }
  }

  // Check if a node is selected (directly or via group)
  function isNodeSelected(nodeId: string): boolean {
    if (selectedNodeIds.includes(nodeId)) return true;

    // Check if node is in any selected group
    return selectedGroupIds.some(groupId => {
      const group = groups.find(g => g.id === groupId);
      return group?.nodes.includes(nodeId);
    });
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

  // Watch for modal open to fetch inventory and configuration
  // Use untrack to prevent infinite loops
  let hasLoadedInventory = $state<boolean>(false);
  let hasLoadedConfig = $state<boolean>(false);

  $effect(() => {
    if (open && !hasLoadedInventory && nodes.length === 0 && !inventoryLoading) {
      hasLoadedInventory = true;
      fetchInventory();
    }

    if (open && !hasLoadedConfig) {
      hasLoadedConfig = true;
      fetchCommandWhitelist();
      fetchExecutionTools();
    }

    // Reset flags when modal closes
    if (!open) {
      hasLoadedInventory = false;
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
    if (totalTargetCount() === 0) {
      error = "Please select at least one target node or group";
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
        targetNodeIds?: string[];
        targetGroupIds?: string[];
        type: "command" | "task" | "plan";
        action: string;
        parameters?: Record<string, unknown>;
        tool?: 'bolt' | 'ansible' | 'ssh';
      } = {
        type: batchType,
        action: '', // Will be set based on action type
      };

      // Add target node IDs if any selected
      if (selectedNodeIds.length > 0) {
        requestBody.targetNodeIds = selectedNodeIds;
      }

      // Add target group IDs if any selected
      if (selectedGroupIds.length > 0) {
        requestBody.targetGroupIds = selectedGroupIds;
      }

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
        // Tasks are Bolt-specific, so always use bolt
        requestBody.tool = 'bolt';
        if (Object.keys(taskData.parameters).length > 0) {
          requestBody.parameters = taskData.parameters;
        }
      } else if (selectedAction === 'execute-playbook') {
        const playbookData = formData as { playbookPath: string; extraVars?: Record<string, unknown> };
        requestBody.action = playbookData.playbookPath;
        // Playbooks are Ansible-specific, so always use ansible
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
      console.log('[ParallelExecutionModal] Batch execution created:', response.batchId, 'Targets:', response.targetCount);

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
          error = 'Some selected nodes or groups were not found. Please refresh and try again.';
        } else {
          error = err.message;
        }
      } else {
        error = 'Failed to create batch execution. Please try again.';
      }

      console.error('[ParallelExecutionModal] Error creating batch execution:', err);
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
  >
    <div class="flex min-h-full items-center justify-center p-2 sm:p-4 text-center">
      <div
        bind:this={modalRef}
        tabindex="-1"
        class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-all w-full max-w-4xl mx-auto"
      >
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 px-3 sm:px-4 pt-4 sm:pt-5 pb-3 sm:pb-4">
          <div class="flex items-start justify-between mb-3 sm:mb-4">
            <h3
              id="modal-title"
              class="text-base sm:text-lg font-medium leading-6 text-gray-900 dark:text-white"
            >
              New Parallel Execution
            </h3>
            <button
              type="button"
              onclick={handleClose}
              disabled={loading}
              aria-label="Close dialog"
              class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">Close</span>
              <svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p id="modal-description" class="sr-only">
            Select target nodes or groups and configure an action to execute in parallel across multiple systems. Press Escape to close. Use Alt+N for nodes view, Alt+G for groups view.
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
            <!-- Target Selection Section -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                  Select Targets
                </h4>
                <div
                  class="text-sm"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span class="text-gray-500 dark:text-gray-400">Selected:</span>
                  <span class="font-medium text-primary-600 dark:text-primary-400">{totalTargetCount()}</span>
                  <span class="text-gray-500 dark:text-gray-400">{totalTargetCount() === 1 ? 'target' : 'targets'}</span>
                </div>
              </div>

              {#if inventoryLoading}
                <div
                  class="flex items-center justify-center py-8"
                  role="status"
                  aria-live="polite"
                >
                  <LoadingSpinner size="md" />
                  <span class="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading inventory...</span>
                </div>
              {:else if inventoryError}
                <div
                  class="rounded-md bg-red-50 dark:bg-red-900/20 p-3 sm:p-4"
                  role="alert"
                >
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                      </svg>
                    </div>
                    <div class="ml-3">
                      <p class="text-sm text-red-800 dark:text-red-200">{inventoryError}</p>
                      <button
                        type="button"
                        onclick={fetchInventory}
                        class="mt-2 text-sm font-medium text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- View Mode Tabs -->
                <div
                  class="flex gap-2 mb-4"
                  role="tablist"
                  aria-label="Target selection view"
                >
                  <button
                    type="button"
                    role="tab"
                    id="nodes-tab"
                    aria-selected={viewMode === "nodes"}
                    aria-controls="nodes-panel"
                    tabindex={viewMode === "nodes" ? 0 : -1}
                    onclick={() => viewMode = "nodes"}
                    onkeydown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        viewMode = 'groups';
                      }
                    }}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 {viewMode === 'nodes' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                  >
                    Nodes ({nodes.length})
                    <span class="sr-only">{viewMode === 'nodes' ? '(selected)' : ''}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="groups-tab"
                    aria-selected={viewMode === "groups"}
                    aria-controls="groups-panel"
                    tabindex={viewMode === "groups" ? 0 : -1}
                    onclick={() => viewMode = "groups"}
                    onkeydown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        viewMode = 'nodes';
                      }
                    }}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 {viewMode === 'groups' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                  >
                    Groups ({groups.length})
                    <span class="sr-only">{viewMode === 'groups' ? '(selected)' : ''}</span>
                  </button>
                </div>

                <!-- Search and Filter Controls -->
                <div class="flex flex-col sm:flex-row gap-2 mb-4">
                  <div class="flex-1">
                    <label for="search-input" class="sr-only">Search {viewMode === 'nodes' ? 'nodes' : 'groups'} by name</label>
                    <input
                      id="search-input"
                      type="text"
                      bind:value={searchQuery}
                      placeholder="Search by name..."
                      aria-label="Search {viewMode === 'nodes' ? 'nodes' : 'groups'} by name"
                      class="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:border-primary-500"
                    />
                  </div>
                  <div class="w-full sm:w-auto">
                    <label for="source-filter" class="sr-only">Filter {viewMode === 'nodes' ? 'nodes' : 'groups'} by source</label>
                    <select
                      id="source-filter"
                      bind:value={sourceFilter}
                      aria-label="Filter {viewMode === 'nodes' ? 'nodes' : 'groups'} by source"
                      class="block w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:border-primary-500"
                    >
                      <option value="all">All Sources</option>
                      {#each availableSources() as source}
                        <option value={source}>{source}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onclick={selectAll}
                    aria-label="Select all visible {viewMode === 'nodes' ? 'nodes' : 'groups'}"
                    class="px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onclick={clearAll}
                    aria-label="Clear all {viewMode === 'nodes' ? 'node' : 'group'} selections"
                    class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  >
                    Clear All
                  </button>
                </div>

                <!-- Nodes List -->
                {#if viewMode === "nodes"}
                  <div
                    id="nodes-panel"
                    role="tabpanel"
                    aria-labelledby="nodes-tab"
                    tabindex="0"
                    class="max-h-48 sm:max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {#if filteredNodes().length === 0}
                      <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
                        No nodes found
                      </div>
                    {:else}
                      <div class="divide-y divide-gray-200 dark:divide-gray-700" role="group" aria-label="Node selection list">
                        {#each filteredNodes() as node}
                          <label class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-inset">
                            <input
                              type="checkbox"
                              checked={selectedNodeIds.includes(node.id)}
                              onchange={() => toggleNodeSelection(node.id)}
                              aria-label="Select node {node.name}"
                              aria-describedby="node-{node.id}-details"
                              class="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
                            />
                            <div class="flex-1 min-w-0" id="node-{node.id}-details">
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
                            {#if isNodeSelected(node.id) && !selectedNodeIds.includes(node.id)}
                              <span class="text-xs text-gray-500 dark:text-gray-400 italic whitespace-nowrap" aria-label="Selected via group">
                                (via group)
                              </span>
                            {/if}
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- Groups List -->
                {#if viewMode === "groups"}
                  <div
                    id="groups-panel"
                    role="tabpanel"
                    aria-labelledby="groups-tab"
                    tabindex="0"
                    class="max-h-48 sm:max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {#if filteredGroups().length === 0}
                      <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
                        No groups found
                      </div>
                    {:else}
                      <div class="divide-y divide-gray-200 dark:divide-gray-700" role="group" aria-label="Group selection list">
                        {#each filteredGroups() as group}
                          <label class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-inset">
                            <input
                              type="checkbox"
                              checked={selectedGroupIds.includes(group.id)}
                              onchange={() => toggleGroupSelection(group.id)}
                              aria-label="Select group {group.name} with {group.nodes.length} nodes"
                              aria-describedby="group-{group.id}-details"
                              class="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
                            />
                            <div class="flex-1 min-w-0" id="group-{group.id}-details">
                              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {group.name}
                              </div>
                              <div class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1 sm:gap-2">
                                <span>{group.nodes.length} {group.nodes.length === 1 ? 'node' : 'nodes'}</span>
                                {#if group.linked}
                                  <span class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs whitespace-nowrap" aria-label="Linked group">
                                    linked
                                  </span>
                                {/if}
                                <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs whitespace-nowrap" aria-label="Sources: {group.sources.join(', ')}">
                                  {group.sources.join(', ')}
                                </span>
                              </div>
                            </div>
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/if}
            </div>

            <!-- Action Configuration Section -->
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Configure Action
              </h4>

              <!-- Action Selector -->
              <div class="mb-4">
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
                aria-label="Cancel"
                class="w-full sm:flex-1 inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || totalTargetCount() === 0 || !actionFormData}
                aria-disabled={loading || totalTargetCount() === 0 || !actionFormData}
                class="w-full sm:flex-1 inline-flex justify-center items-center gap-2 rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {#if loading}
                  <LoadingSpinner size="sm" />
                  Executing...
                {:else}
                  Execute on {totalTargetCount()} {totalTargetCount() === 1 ? 'Target' : 'Targets'}
                {/if}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}
