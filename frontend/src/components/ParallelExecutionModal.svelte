<script lang="ts">
  import LoadingSpinner from './LoadingSpinner.svelte';
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
  let actionType = $state<"command" | "task" | "plan">("command");
  let actionValue = $state<string>("");
  let parameters = $state<Record<string, unknown>>({});
  let parametersInput = $state<string>("");
  let parametersError = $state<string | null>(null);

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
  }

  function resetForm(): void {
    selectedNodeIds = [];
    selectedGroupIds = [];
    actionType = "command";
    actionValue = "";
    parameters = {};
    parametersInput = "";
    parametersError = null;
    error = null;
    searchQuery = "";
    sourceFilter = "all";
    viewMode = "nodes";
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

  // Watch for modal open to fetch inventory
  // Use untrack to prevent infinite loops
  let hasLoadedInventory = $state<boolean>(false);

  $effect(() => {
    if (open && !hasLoadedInventory && nodes.length === 0 && !inventoryLoading) {
      hasLoadedInventory = true;
      fetchInventory();
    }

    // Reset flag when modal closes
    if (!open) {
      hasLoadedInventory = false;
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

  // Validate and parse parameters JSON
  function validateParameters(): boolean {
    parametersError = null;

    // If parameters input is empty, that's valid (no parameters)
    if (!parametersInput.trim()) {
      parameters = {};
      return true;
    }

    try {
      const parsed = JSON.parse(parametersInput);

      // Ensure it's an object
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        parametersError = "Parameters must be a JSON object";
        return false;
      }

      parameters = parsed;
      return true;
    } catch (err) {
      parametersError = err instanceof Error ? err.message : "Invalid JSON format";
      return false;
    }
  }

  // Watch parameters input and validate on change
  $effect(() => {
    // Read parametersInput to track it
    const input = parametersInput;

    if (input.trim()) {
      validateParameters();
    } else {
      parametersError = null;
      parameters = {};
    }
  });

  async function handleSubmit(): Promise<void> {
    // Validation
    if (totalTargetCount() === 0) {
      error = "Please select at least one target node or group";
      return;
    }

    if (!actionValue.trim()) {
      error = "Please enter an action";
      return;
    }

    // Validate parameters if provided
    if (parametersInput.trim() && !validateParameters()) {
      error = "Invalid parameters: " + parametersError;
      return;
    }

    loading = true;
    error = null;

    try {
      // Build request body
      const requestBody: {
        targetNodeIds?: string[];
        targetGroupIds?: string[];
        type: "command" | "task" | "plan";
        action: string;
        parameters?: Record<string, unknown>;
      } = {
        type: actionType,
        action: actionValue,
      };

      // Add target node IDs if any selected
      if (selectedNodeIds.length > 0) {
        requestBody.targetNodeIds = selectedNodeIds;
      }

      // Add target group IDs if any selected
      if (selectedGroupIds.length > 0) {
        requestBody.targetGroupIds = selectedGroupIds;
      }

      // Add parameters if provided
      if (Object.keys(parameters).length > 0) {
        requestBody.parameters = parameters;
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
            Select target nodes or groups and configure an action to execute in parallel across multiple systems.
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
                    aria-selected={viewMode === "nodes"}
                    aria-controls="nodes-panel"
                    onclick={() => viewMode = "nodes"}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 {viewMode === 'nodes' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                  >
                    Nodes ({nodes.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "groups"}
                    aria-controls="groups-panel"
                    onclick={() => viewMode = "groups"}
                    class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 {viewMode === 'groups' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                  >
                    Groups ({groups.length})
                  </button>
                </div>

                <!-- Search and Filter Controls -->
                <div class="flex flex-col sm:flex-row gap-2 mb-4">
                  <div class="flex-1">
                    <label for="search-input" class="sr-only">Search by name</label>
                    <input
                      id="search-input"
                      type="text"
                      bind:value={searchQuery}
                      placeholder="Search by name..."
                      aria-label="Search targets by name"
                      class="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div class="w-full sm:w-auto">
                    <label for="source-filter" class="sr-only">Filter by source</label>
                    <select
                      id="source-filter"
                      bind:value={sourceFilter}
                      aria-label="Filter targets by source"
                      class="block w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    aria-label="Select all visible targets"
                    class="px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onclick={clearAll}
                    aria-label="Clear all selections"
                    class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                    class="max-h-48 sm:max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md"
                  >
                    {#if filteredNodes().length === 0}
                      <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        No nodes found
                      </div>
                    {:else}
                      <div class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each filteredNodes() as node}
                          <label class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedNodeIds.includes(node.id)}
                              onchange={() => toggleNodeSelection(node.id)}
                              aria-label="Select {node.name}"
                              class="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500"
                            />
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
                            {#if isNodeSelected(node.id) && !selectedNodeIds.includes(node.id)}
                              <span class="text-xs text-gray-500 dark:text-gray-400 italic whitespace-nowrap">
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
                    class="max-h-48 sm:max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md"
                  >
                    {#if filteredGroups().length === 0}
                      <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        No groups found
                      </div>
                    {:else}
                      <div class="divide-y divide-gray-200 dark:divide-gray-700">
                        {#each filteredGroups() as group}
                          <label class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedGroupIds.includes(group.id)}
                              onchange={() => toggleGroupSelection(group.id)}
                              aria-label="Select group {group.name} with {group.nodes.length} nodes"
                              class="h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500"
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {group.name}
                              </div>
                              <div class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1 sm:gap-2">
                                <span>{group.nodes.length} {group.nodes.length === 1 ? 'node' : 'nodes'}</span>
                                {#if group.linked}
                                  <span class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs whitespace-nowrap">
                                    linked
                                  </span>
                                {/if}
                                <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs whitespace-nowrap">
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

              <!-- Action Type -->
              <div class="mb-4">
                <label for="actionType" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Action Type
                </label>
                <select
                  id="actionType"
                  bind:value={actionType}
                  disabled={loading}
                  aria-describedby="actionType-description"
                  class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="command">Command</option>
                  <option value="task">Task</option>
                  <option value="plan">Plan</option>
                </select>
                <p id="actionType-description" class="sr-only">
                  Select the type of action to execute on target nodes
                </p>
              </div>

              <!-- Action Value -->
              <div class="mb-4">
                <label for="actionValue" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {actionType === 'command' ? 'Command' : actionType === 'task' ? 'Task Name' : 'Plan Name'}
                </label>
                <input
                  id="actionValue"
                  type="text"
                  bind:value={actionValue}
                  disabled={loading}
                  required
                  aria-required="true"
                  aria-invalid={!actionValue.trim() && error ? "true" : "false"}
                  class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={actionType === 'command' ? 'uptime' : actionType === 'task' ? 'package::install' : 'deploy::app'}
                />
              </div>

              <!-- Parameters -->
              <div>
                <label for="parameters" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parameters (Optional)
                </label>
                <textarea
                  id="parameters"
                  bind:value={parametersInput}
                  disabled={loading}
                  rows="4"
                  aria-describedby="parameters-help parameters-error"
                  aria-invalid={parametersError ? "true" : "false"}
                  class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed {parametersError ? 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500' : ''}"
                  placeholder='&#123;"key": "value", "timeout": 30&#125;'
                ></textarea>
                <div class="mt-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <p id="parameters-help" class="text-xs text-gray-500 dark:text-gray-400">
                    Enter parameters as a JSON object
                  </p>
                  {#if parametersError}
                    <p
                      id="parameters-error"
                      class="text-xs text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {parametersError}
                    </p>
                  {/if}
                </div>
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
                disabled={loading || totalTargetCount() === 0 || !actionValue.trim() || !!parametersError}
                aria-disabled={loading || totalTargetCount() === 0 || !actionValue.trim() || !!parametersError}
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
