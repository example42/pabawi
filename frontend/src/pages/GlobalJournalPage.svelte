<script lang="ts">
  import { onMount } from 'svelte';
  import JournalTimeline from '../components/JournalTimeline.svelte';
  import MultiSelectDropdown from '../components/MultiSelectDropdown.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { get } from '../lib/api';

  const pageTitle = 'Pabawi - Journal';

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

  // Inventory state
  let allNodes = $state<Node[]>([]);
  let allGroups = $state<NodeGroup[]>([]);
  let inventoryLoading = $state(false);
  let inventoryError = $state<string | null>(null);

  // Target selection
  let targetsExpanded = $state(true);
  let selectedNodeIds = $state<string[]>([]);
  let selectedGroupId = $state('');
  let viewMode = $state<'nodes' | 'groups'>('nodes');
  let searchQuery = $state('');
  let sourceFilter = $state('all');

  // Other filters
  let startDateInput = $state('');
  let endDateInput = $state('');
  let selectedEventTypes = $state<string[]>([]);
  let selectedSources = $state<string[]>([]);

  // Applied filters (only update on Apply click)
  let appliedNodeIds = $state<string[] | undefined>(undefined);
  let appliedGroupId = $state<string | undefined>(undefined);
  let appliedStartDate = $state<string | undefined>(undefined);
  let appliedEndDate = $state<string | undefined>(undefined);
  let appliedEventTypes = $state<string[] | undefined>(undefined);
  let appliedSources = $state<string[] | undefined>(undefined);

  const eventTypeOptions = [
    { value: 'provision', label: 'Provisioned' },
    { value: 'destroy', label: 'Destroyed' },
    { value: 'start', label: 'Started' },
    { value: 'stop', label: 'Stopped' },
    { value: 'reboot', label: 'Rebooted' },
    { value: 'suspend', label: 'Suspended' },
    { value: 'resume', label: 'Resumed' },
    { value: 'command_execution', label: 'Command' },
    { value: 'task_execution', label: 'Task' },
    { value: 'puppet_run', label: 'Puppet Run' },
    { value: 'package_install', label: 'Package' },
    { value: 'config_change', label: 'Config Change' },
    { value: 'note', label: 'Note' },
  ];

  const sourceOptions = [
    { value: 'proxmox', label: 'Proxmox' },
    { value: 'aws', label: 'AWS' },
    { value: 'bolt', label: 'Bolt' },
    { value: 'ansible', label: 'Ansible' },
    { value: 'ssh', label: 'SSH' },
    { value: 'puppetdb', label: 'PuppetDB' },
    { value: 'user', label: 'User' },
    { value: 'system', label: 'System' },
  ];

  // Derived: filtered nodes
  let filteredNodes = $derived.by(() => {
    let result = allNodes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    }
    if (sourceFilter !== 'all') {
      result = result.filter(n => n.source === sourceFilter);
    }
    return result;
  });

  // Derived: filtered groups
  let filteredGroups = $derived.by(() => {
    let result = allGroups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
    }
    if (sourceFilter !== 'all') {
      result = result.filter(g => g.sources.includes(sourceFilter));
    }
    return result;
  });

  // Derived: available integration sources
  let availableSources = $derived.by(() => {
    const s = new Set<string>();
    allNodes.forEach(n => { if (n.source) s.add(n.source); });
    allGroups.forEach(g => { g.sources.forEach(src => s.add(src)); });
    return Array.from(s).sort();
  });

  async function fetchInventory(): Promise<void> {
    inventoryLoading = true;
    inventoryError = null;
    try {
      const data = await get<InventoryResponse>('/api/inventory');
      allNodes = data.nodes || [];
      allGroups = data.groups || [];
    } catch (err) {
      inventoryError = err instanceof Error ? err.message : 'Failed to load inventory';
      allNodes = [];
      allGroups = [];
    } finally {
      inventoryLoading = false;
    }
  }

  function toggleNode(nodeId: string): void {
    if (selectedNodeIds.includes(nodeId)) {
      selectedNodeIds = selectedNodeIds.filter(id => id !== nodeId);
    } else {
      selectedNodeIds = [...selectedNodeIds, nodeId];
    }
  }

  function selectAllNodes(): void {
    const ids = filteredNodes.map(n => n.id);
    selectedNodeIds = [...new Set([...selectedNodeIds, ...ids])];
  }

  function clearNodeSelection(): void {
    selectedNodeIds = [];
  }

  function selectGroup(groupId: string): void {
    selectedGroupId = selectedGroupId === groupId ? '' : groupId;
    // When selecting a group, clear individual node selection
    if (selectedGroupId) {
      selectedNodeIds = [];
    }
  }

  function applyFilters(): void {
    appliedNodeIds = selectedNodeIds.length > 0 ? [...selectedNodeIds] : undefined;
    appliedGroupId = selectedGroupId || undefined;
    appliedStartDate = startDateInput ? new Date(startDateInput).toISOString() : undefined;
    appliedEndDate = endDateInput ? new Date(endDateInput).toISOString() : undefined;
    appliedEventTypes = selectedEventTypes.length > 0 ? [...selectedEventTypes] : undefined;
    appliedSources = selectedSources.length > 0 ? [...selectedSources] : undefined;
  }

  function clearFilters(): void {
    selectedNodeIds = [];
    selectedGroupId = '';
    startDateInput = '';
    endDateInput = '';
    selectedEventTypes = [];
    selectedSources = [];
    searchQuery = '';
    sourceFilter = 'all';
    applyFilters();
  }

  onMount(() => {
    fetchInventory();
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Page Header -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Journal</h1>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Cross-node journal timeline</p>
  </div>

  <!-- Filter Panel -->
  <div class="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <!-- Target Selection -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <!-- Collapsible header -->
      <button
        type="button"
        onclick={() => targetsExpanded = !targetsExpanded}
        class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
        aria-expanded={targetsExpanded}
      >
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white">Select Targets</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {#if selectedGroupId}
              {@const grp = allGroups.find(g => g.id === selectedGroupId)}
              — Group: <span class="font-medium text-primary-600 dark:text-primary-400">{grp?.name ?? selectedGroupId}</span>
              ({grp?.nodes.length ?? 0} nodes)
            {:else if selectedNodeIds.length > 0}
              — <span class="font-medium text-primary-600 dark:text-primary-400">{selectedNodeIds.length}</span>
              {selectedNodeIds.length === 1 ? 'node' : 'nodes'} selected
            {:else}
              — All nodes
            {/if}
          </span>
        </div>
        <svg class="h-4 w-4 shrink-0 text-gray-400 transition-transform {targetsExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {#if targetsExpanded}
      <div class="px-4 pb-4">

      {#if inventoryLoading}
        <div class="flex items-center justify-center py-6 text-sm text-gray-500 dark:text-gray-400">
          <svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Loading inventory…
        </div>
      {:else if inventoryError}
        <div class="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {inventoryError}
          <button type="button" onclick={fetchInventory} class="ml-2 font-medium underline">Retry</button>
        </div>
      {:else}
        <!-- Tabs: Nodes / Groups -->
        <div class="flex gap-2 mb-3">
          <button type="button" onclick={() => viewMode = 'nodes'}
            class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'nodes' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}">
            Nodes ({allNodes.length})
          </button>
          <button type="button" onclick={() => viewMode = 'groups'}
            class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors {viewMode === 'groups' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}">
            Groups ({allGroups.length})
          </button>
        </div>

        <!-- Search + Source filter -->
        <div class="flex gap-2 mb-3">
          <input type="text" bind:value={searchQuery} placeholder="Search by name…"
            class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" />
          <select bind:value={sourceFilter}
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            <option value="all">All Sources</option>
            {#each availableSources as src}
              <option value={src}>{src}</option>
            {/each}
          </select>
        </div>

        {#if viewMode === 'nodes'}
          <!-- Select All / Clear -->
          <div class="flex gap-2 mb-2">
            <button type="button" onclick={selectAllNodes}
              class="px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded hover:bg-primary-100 dark:text-primary-300 dark:bg-primary-900/20 dark:hover:bg-primary-900/30">
              Select All
            </button>
            <button type="button" onclick={clearNodeSelection}
              class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 dark:text-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600">
              Clear
            </button>
          </div>

          <!-- Node list -->
          <div class="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
            {#if filteredNodes.length === 0}
              <div class="p-3 text-center text-xs text-gray-500 dark:text-gray-400">No nodes found</div>
            {:else}
              <div class="divide-y divide-gray-100 dark:divide-gray-700">
                {#each filteredNodes as node (node.id)}
                  <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input type="checkbox" checked={selectedNodeIds.includes(node.id)} onchange={() => toggleNode(node.id)}
                      class="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600" />
                    <span class="flex-1 truncate text-gray-800 dark:text-gray-200">{node.name}</span>
                    {#if node.source}
                      <IntegrationBadge integration={node.source} size="xs" />
                    {/if}
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <!-- Group list (radio-style — one group at a time) -->
          <div class="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
            {#if filteredGroups.length === 0}
              <div class="p-3 text-center text-xs text-gray-500 dark:text-gray-400">No groups found</div>
            {:else}
              <div class="divide-y divide-gray-100 dark:divide-gray-700">
                {#each filteredGroups as group (group.id)}
                  <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input type="radio" name="group-select" checked={selectedGroupId === group.id} onchange={() => selectGroup(group.id)}
                      class="h-3.5 w-3.5 border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600" />
                    <span class="flex-1 truncate text-gray-800 dark:text-gray-200">{group.name}</span>
                    <span class="text-xs text-gray-400 dark:text-gray-500">{group.nodes.length} nodes</span>
                    <IntegrationBadge integration={group.source} size="xs" />
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
      </div>
      {/if}
    </div>

    <!-- Other Filters -->
    <div class="p-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label for="filter-event-type" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Event Type</label>
          <MultiSelectDropdown
            id="filter-event-type"
            label="Event Types"
            options={eventTypeOptions}
            selected={selectedEventTypes}
            onchange={(v) => selectedEventTypes = v}
          />
        </div>
        <div>
          <label for="filter-source" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Journal Source</label>
          <MultiSelectDropdown
            id="filter-source"
            label="Sources"
            options={sourceOptions}
            selected={selectedSources}
            onchange={(v) => selectedSources = v}
          />
        </div>
        <div>
          <label for="filter-start-date" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
          <input id="filter-start-date" type="datetime-local" bind:value={startDateInput}
            class="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </div>
        <div>
          <label for="filter-end-date" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End Date</label>
          <input id="filter-end-date" type="datetime-local" bind:value={endDateInput}
            class="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      <!-- Apply / Clear -->
      <div class="mt-4 flex items-center gap-3">
        <button type="button" onclick={applyFilters}
          class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">
          Apply Filters
        </button>
        <button type="button" onclick={clearFilters}
          class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
          Clear All
        </button>
      </div>
    </div>
  </div>

  <!-- Journal Timeline -->
  <JournalTimeline
    mode="global"
    active={true}
    nodeIds={appliedNodeIds}
    groupId={appliedGroupId}
    startDate={appliedStartDate}
    endDate={appliedEndDate}
    eventTypes={appliedEventTypes}
    sources={appliedSources}
  />
</div>
