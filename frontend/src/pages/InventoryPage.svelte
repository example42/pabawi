<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { DebugInfo, LabeledDebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - Inventory';

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config: Record<string, unknown> & {
      user?: string;
      port?: number;
    };
    source?: string;
    sources?: string[]; // List of sources this node appears in (Requirement 3.3)
    linked?: boolean; // True if node exists in multiple sources (Requirement 3.4)
    lastCheckIn?: string;
  }

  interface NodeGroup {
    id: string;
    name: string;
    source: string;
    sources: string[];
    linked: boolean;
    nodes: string[];
    metadata?: {
      description?: string;
      variables?: Record<string, unknown>;
      hierarchy?: string[];
      [key: string]: unknown;
    };
  }

  interface SourceInfo {
    nodeCount: number;
    groupCount: number;
    lastSync: string;
    status: 'healthy' | 'degraded' | 'unavailable';
  }

  interface InventoryResponse {
    nodes: Node[];
    groups: NodeGroup[];
    sources?: Record<string, SourceInfo>;
  }

  // State
  let nodes = $state<Node[]>([]);
  let groups = $state<NodeGroup[]>([]);
  let sources = $state<Record<string, SourceInfo>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let transportFilter = $state<string>('all');
  let sourceFilter = $state<string>('all');
  let sortBy = $state<string>('name');
  let sortOrder = $state<'asc' | 'desc'>('asc');
  let viewMode = $state<'grid' | 'list'>('list');
  let searchTimeout: number | undefined;
  let pqlQuery = $state('');
  let pqlError = $state<string | null>(null);
  let showPqlInput = $state(false);
  let selectedPqlTemplate = $state('');

  // Debug info state for expert mode - support multiple debug blocks
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA; // Newest first
    });
  });

  // Callback to receive debug info from API calls
  function handleDebugInfo(label: string, info: DebugInfo | null): void {
    if (info) {
      // Add or update debug info for this label
      const existingIndex = debugInfoBlocks.findIndex(block => block.label === label);
      if (existingIndex >= 0) {
        // Update existing block
        debugInfoBlocks[existingIndex] = { label, debugInfo: info };
      } else {
        // Add new block
        debugInfoBlocks = [...debugInfoBlocks, { label, debugInfo: info }];
      }
    } else {
      // Remove debug info for this label
      debugInfoBlocks = debugInfoBlocks.filter(block => block.label !== label);
    }
  }

  // Placeholder text to avoid Svelte expression parsing issues
  const placeholderText = 'Example: nodes[certname] { certname = "node1.example.com" }';
  const helpText = 'Select a template above or enter a custom PQL query to filter PuppetDB nodes. Use PQL syntax (e.g., nodes[certname] { certname = "example" }).';

  // Common PQL query templates
  const pqlTemplates = [
    {
      name: 'All nodes',
      description: 'Get all nodes from PuppetDB',
      query: 'nodes[certname]'
    },
    {
      name: 'Nodes by certname pattern',
      description: 'Find nodes matching a certname pattern',
      query: 'nodes[certname] { certname ~ "web.*" }'
    },
    {
      name: 'Nodes with specific OS',
      description: 'Find nodes with a specific operating system (using modern os fact)',
      query: 'inventory[certname] { facts.os.name = "Ubuntu" }'
    },
    {
      name: 'Nodes by environment',
      description: 'Get nodes from a specific environment',
      query: 'nodes[certname] { catalog_environment = "production" }'
    },
    {
      name: 'Recently active nodes',
      description: 'Find nodes that checked in within the last 24 hours',
      query: `nodes[certname] { report_timestamp > "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}" }`
    },
    {
      name: 'Nodes with failed reports',
      description: 'Find nodes with recent failed reports',
      query: 'nodes[certname] { latest_report_status = "failed" }'
    },
    {
      name: 'Nodes by OS family',
      description: 'Find nodes by operating system family (using modern os fact)',
      query: 'inventory[certname] { facts.os.family = "RedHat" }'
    },
    {
      name: 'Nodes with specific resource',
      description: 'Find nodes that have a specific service resource',
      query: 'inventory[certname] { resources { type = "Service" and title = "apache2" } }'
    },
    {
      name: 'Nodes by processor count',
      description: 'Find nodes with specific processor count (using modern processors fact)',
      query: 'inventory[certname] { facts.processors.count = 4 }'
    },
    {
      name: 'Nodes with high uptime',
      description: 'Find nodes with uptime greater than 30 days (using modern system_uptime fact)',
      query: 'inventory[certname] { facts.system_uptime.days > 30 }'
    },
    {
      name: 'Deactivated nodes',
      description: 'Find deactivated nodes',
      query: 'nodes[certname] { deactivated is not null }'
    },
    {
      name: 'Nodes by IP subnet',
      description: 'Find nodes in a specific IP subnet (using modern networking fact)',
      query: 'inventory[certname] { facts.networking.ip ~ "192\\\\.168\\\\.1\\\\..*" }'
    },
    {
      name: 'Nodes with specific class',
      description: 'Find nodes that have a specific Puppet class applied',
      query: 'inventory[certname] { resources { type = "Class" and title = "Apache" } }'
    },
    {
      name: 'Windows nodes',
      description: 'Find all Windows nodes (using modern os fact)',
      query: 'inventory[certname] { facts.os.family = "windows" }'
    },
    {
      name: 'Nodes not checked in recently',
      description: 'Find nodes that have not checked in for 7 days',
      query: `nodes[certname] { report_timestamp < "${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}" }`
    }
  ];

  // Computed filtered nodes
  let filteredNodes = $derived.by(() => {
    let result = nodes;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(node =>
        node.name.toLowerCase().includes(query) ||
        node.uri.toLowerCase().includes(query)
      );
    }

    // Filter by transport type
    if (transportFilter !== 'all') {
      result = result.filter(node => node.transport === transportFilter);
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      result = result.filter(node => (node.source || 'bolt') === sourceFilter);
    }



    // Sort nodes (Requirement 11.5)
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'lastCheckIn': {
          // Sort by last check-in time (most recent first when desc)
          const timeA = a.lastCheckIn ? new Date(a.lastCheckIn).getTime() : 0;
          const timeB = b.lastCheckIn ? new Date(b.lastCheckIn).getTime() : 0;
          comparison = timeA - timeB;
          break;
        }
        case 'source':
          comparison = (a.source || 'bolt').localeCompare(b.source || 'bolt');
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  });

  // Computed node counts by source
  let nodeCountsBySource = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      const source = node.source || 'bolt';
      counts[source] = (counts[source] || 0) + 1;
    }
    return counts;
  });

  // Computed group counts by source
  let groupCountsBySource = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      const source = group.source || 'bolt';
      counts[source] = (counts[source] || 0) + 1;
    }
    return counts;
  });

  // Computed filtered groups (Requirement 9.1, 9.2)
  let filteredGroups = $derived.by(() => {
    let result = groups;

    // Filter by search query (case-insensitive substring match)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(group =>
        group.name.toLowerCase().includes(query)
      );
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      result = result.filter(group => (group.source || 'bolt') === sourceFilter);
    }

    // Sort groups (same logic as nodes)
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'source':
          comparison = (a.source || 'bolt').localeCompare(b.source || 'bolt');
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  });

  // Combined results with groups first, then nodes (Requirement 11.1, 11.3)
  let combinedResults = $derived.by(() => {
    // Create a unified array with groups appearing before nodes
    // Each item is tagged with a type for visual differentiation
    const groupItems = filteredGroups.map(group => ({
      type: 'group' as const,
      entity: group
    }));

    const nodeItems = filteredNodes.map(node => ({
      type: 'node' as const,
      entity: node
    }));

    // Groups first, then nodes
    return [...groupItems, ...nodeItems];
  });

  // Fetch inventory from API
  async function fetchInventory(pql?: string): Promise<void> {
    loading = true;
    error = null;
    pqlError = null;

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (pql) {
        params.append('pql', pql);
      }

      // Add sorting parameters (Requirement 11.5)
      if (sortBy !== 'name') {
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
      }

      const url = `/api/inventory${params.toString() ? `?${params.toString()}` : ''}`;

      const data = await get<InventoryResponse & { _debug?: DebugInfo }>(url, {
        maxRetries: 2,
      });

      nodes = data.nodes || [];
      groups = data.groups || [];
      sources = data.sources || {};

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Inventory', data._debug);
      }

      // Show success toast only on retry success
      if (error) {
        showSuccess('Inventory loaded successfully');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching inventory:', err);
      showError('Failed to load inventory', error);
    } finally {
      loading = false;
    }
  }

  // Apply PQL query
  async function applyPqlQuery(): Promise<void> {
    if (!pqlQuery.trim()) {
      // Clear PQL filter
      await fetchInventory();
      return;
    }

    // Basic PQL query validation (check for common syntax)
    const query = pqlQuery.trim();
    if (!query.match(/^(nodes|facts|resources|reports|catalogs|edges|events|inventory|fact-contents)/)) {
      pqlError = 'Invalid PQL query: must start with a valid entity (nodes, facts, resources, inventory, etc.)';
      showError('Invalid PQL query', pqlError);
      return;
    }

    // Fetch with PQL filter
    try {
      await fetchInventory(pqlQuery);
      pqlError = null;
      showSuccess('PQL query applied successfully');
    } catch (err) {
      pqlError = err instanceof Error ? err.message : 'Failed to apply PQL query';
      showError('PQL query failed', pqlError);
    }
  }

  // Clear PQL query
  async function clearPqlQuery(): Promise<void> {
    pqlQuery = '';
    pqlError = null;
    selectedPqlTemplate = '';
    await fetchInventory();
  }

  // Apply PQL template
  function applyPqlTemplate(): void {
    if (selectedPqlTemplate) {
      const template = pqlTemplates.find(t => t.name === selectedPqlTemplate);
      if (template) {
        pqlQuery = template.query;
        pqlError = null;
      }
    }
  }

  // Handle search with debouncing
  function handleSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for 300ms debounce
    searchTimeout = setTimeout(() => {
      searchQuery = value;
    }, 300) as unknown as number;
  }

  // Navigate to node detail page
  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  // Retry fetching inventory
  function retryFetch(): void {
    fetchInventory();
  }

  // Get transport badge color
  function getTransportColor(transport: string): string {
    switch (transport) {
      case 'ssh':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'winrm':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'docker':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
      case 'local':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  // Get source display name
  function getSourceDisplayName(source: string): string {
    switch (source) {
      case 'bolt':
        return 'Bolt';
      case 'puppetdb':
        return 'PuppetDB';
      case 'puppetserver':
        return 'Puppetserver';
      case 'hiera':
        return 'Hiera';
      case 'ansible':
        return 'Ansible';
      default:
        return source.charAt(0).toUpperCase() + source.slice(1);
    }
  }

  // Toggle sort order
  function toggleSort(field: string): void {
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'asc';
    }
  }

  // Fetch inventory on mount
  onMount(() => {
    debugInfoBlocks = []; // Clear debug info blocks on mount
    fetchInventory();
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Inventory
          </h1>
          {#each Object.keys(nodeCountsBySource).sort() as source}
            <IntegrationBadge integration={source as import('../lib/integrationColors.svelte').IntegrationType} variant="badge" size="sm" />
          {/each}
        </div>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Manage and monitor your infrastructure nodes
        </p>
      </div>
      {#if Object.keys(sources).includes('puppetdb')}
        <button
          type="button"
          onclick={() => showPqlInput = !showPqlInput}
          class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {showPqlInput ? 'Hide' : 'Show'} PQL Query
        </button>
      {/if}
    </div>
  </div>

  <!-- PQL Query Input -->
  {#if showPqlInput && Object.keys(sources).includes('puppetdb')}
    <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <label for="pql-query" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          PuppetDB PQL Query
        </label>
        <a
          href="https://puppet.com/docs/puppetdb/latest/api/query/v4/pql.html"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          PQL Documentation ↗
        </a>
      </div>

      <!-- Query Template Selector -->
      <div class="mb-3">
        <label for="pql-template" class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Common Queries
        </label>
        <div class="flex gap-2">
          <select
            id="pql-template"
            bind:value={selectedPqlTemplate}
            onchange={applyPqlTemplate}
            class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Select a query template...</option>
            {#each pqlTemplates as template}
              <option value={template.name}>{template.name} - {template.description}</option>
            {/each}
          </select>
          <button
            type="button"
            onclick={() => selectedPqlTemplate = ''}
            disabled={!selectedPqlTemplate}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Clear template selection"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <textarea
          id="pql-query"
          bind:value={pqlQuery}
          placeholder={placeholderText}
          rows="3"
          class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        ></textarea>
        <div class="flex flex-col gap-2">
          <button
            type="button"
            onclick={applyPqlQuery}
            disabled={loading}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <button
            type="button"
            onclick={clearPqlQuery}
            disabled={loading || !pqlQuery}
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>
      {#if pqlError}
        <p class="mt-2 text-sm text-red-600 dark:text-red-400">
          {pqlError}
        </p>
      {/if}
      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {helpText}
      </p>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading inventory..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert
      message="Failed to load inventory"
      details={error}
      onRetry={retryFetch}
    />
  {:else}
    <!-- Filters and Controls -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <!-- Search -->
      <div class="flex-1 max-w-md">
        <label for="search" class="sr-only">Search nodes</label>
        <div class="relative">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="search"
            type="text"
            placeholder="Search by name or URI..."
            class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            oninput={handleSearch}
          />
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-4 flex-wrap">
        <!-- Source Filter Buttons -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Source:</span>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={() => sourceFilter = 'all'}
              class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors {sourceFilter === 'all' ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            >
              All ({nodes.length})
            </button>
            {#each Object.keys(nodeCountsBySource).sort() as source}
              <button
                type="button"
                onclick={() => sourceFilter = sourceFilter === source ? 'all' : source}
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors {sourceFilter === source ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-gray-900' : 'hover:opacity-80'}"
              >
                <IntegrationBadge integration={source as import('../lib/integrationColors.svelte').IntegrationType} variant="badge" size="sm" />
                <span class="text-gray-600 dark:text-gray-300">({nodeCountsBySource[source]})</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Transport Filter -->
        <div class="flex items-center gap-2">
          <label for="transport-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Transport:
          </label>
          <select
            id="transport-filter"
            bind:value={transportFilter}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">All</option>
            <option value="ssh">SSH</option>
            <option value="winrm">WinRM</option>
            <option value="docker">Docker</option>
            <option value="local">Local</option>
          </select>
        </div>

        <!-- Sort By (Requirement 11.5) -->
        <div class="flex items-center gap-2">
          <label for="sort-by" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Sort:
          </label>
          <select
            id="sort-by"
            bind:value={sortBy}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="name">Name</option>
            <option value="source">Source</option>
            {#if nodes.some(n => n.lastCheckIn)}
              <option value="lastCheckIn">Last Check-in</option>
            {/if}
          </select>
          <button
            type="button"
            onclick={() => toggleSort(sortBy)}
            class="rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label="Toggle sort order"
          >
            {#if sortOrder === 'asc'}
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            {:else}
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <!-- View Toggle -->
      <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
        <button
          type="button"
          aria-label="Grid view"
          class="px-3 py-2 text-sm font-medium {viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'} rounded-l-lg"
          onclick={() => viewMode = 'grid'}
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="List view"
          class="px-3 py-2 text-sm font-medium {viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'} rounded-r-lg border-l border-gray-300 dark:border-gray-600"
          onclick={() => viewMode = 'list'}
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Results Count -->
    <div class="mb-4 text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredNodes.length + filteredGroups.length} results ({filteredGroups.length} groups, {filteredNodes.length} nodes)
    </div>

    <!-- Empty State (Requirement 12.1, 12.2, 12.3, 12.4) -->
    {#if combinedResults.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        {#if nodes.length === 0 && groups.length === 0}
          <!-- No data at all - check integrations -->
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No groups or nodes in inventory</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No inventory data available. Check your integration configurations.
          </p>
        {:else if filteredGroups.length === 0 && filteredNodes.length === 0}
          <!-- Filters exclude everything -->
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No groups or nodes found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your filters or search query to see results.
          </p>
          {#if searchQuery}
            <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Current search: "{searchQuery}"
            </p>
          {/if}
        {:else if filteredGroups.length === 0 && filteredNodes.length > 0}
          <!-- No groups match filters, but nodes exist -->
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No groups found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {#if searchQuery || sourceFilter !== 'all'}
              Try adjusting your filters to see groups, or this source may not support groups.
            {:else}
              The selected integration source does not provide group information.
            {/if}
          </p>
        {:else}
          <!-- Fallback -->
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No results found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your filters or search query.
          </p>
        {/if}
      </div>
    {:else}
      <!-- Node List/Grid -->
      {#if viewMode === 'grid'}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each combinedResults as item (item.type === 'group' ? item.entity.id : item.entity.id)}
            {#if item.type === 'group'}
              <!-- Group Card (Requirement 8.1, 11.2) -->
              <button
                type="button"
                class="group relative rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
                onclick={() => router.navigate(`/groups/${item.entity.id}`)}
              >
                <div class="mb-3 flex items-start justify-between gap-2">
                  <div class="flex items-start gap-2 flex-1 min-w-0">
                    <!-- Folder icon to distinguish from nodes (Requirement 11.2) -->
                    <svg class="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 6a3 3 0 013-3h2.25a3 3 0 012.12.879l1.06 1.06A1.5 1.5 0 0012.5 5.5H18a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
                    </svg>
                    <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 flex-1 min-w-0">
                      {item.entity.name}
                      <!-- Multi-source indicator for linked groups -->
                      {#if item.entity.linked && item.entity.sources.length > 1}
                        <span class="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {item.entity.sources.length} sources: {item.entity.sources.join(', ')}">
                          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          {item.entity.sources.length}
                        </span>
                      {/if}
                    </h3>
                  </div>
                  <div class="flex flex-col gap-1 items-end">
                    <!-- Member count badge (Requirement 8.4) -->
                    <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {item.entity.nodes.length} {item.entity.nodes.length === 1 ? 'node' : 'nodes'}
                    </span>
                    <!-- Display all sources for linked groups (Requirement 8.2, 8.3) -->
                    {#if item.entity.sources && item.entity.sources.length > 0}
                      {#each item.entity.sources as source}
                        <IntegrationBadge integration={source} variant="badge" size="sm" />
                      {/each}
                    {:else}
                      <IntegrationBadge integration={item.entity.source || 'bolt'} variant="badge" size="sm" />
                    {/if}
                  </div>
                </div>
                {#if item.entity.metadata?.description}
                  <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {item.entity.metadata.description}
                  </p>
                {/if}
              </button>
            {:else}
              <!-- Node Card -->
              <button
                type="button"
                class="group relative rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
                onclick={() => navigateToNode(item.entity.id)}
              >
                <div class="mb-3 flex items-start justify-between gap-2">
                  <div class="flex items-start gap-2 flex-1 min-w-0">
                    <!-- Server icon for nodes (Requirement 11.2) -->
                    <svg class="h-5 w-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                    <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 flex-1 min-w-0">
                      {item.entity.name}
                      <!-- Multi-source indicator (Requirement 3.4) -->
                      {#if item.entity.linked && item.entity.sources && item.entity.sources.length > 1}
                        <span class="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {item.entity.sources.length} sources: {item.entity.sources.join(', ')}">
                          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          {item.entity.sources.length}
                        </span>
                      {/if}
                    </h3>
                  </div>
                  <div class="flex flex-col gap-1 items-end">
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(item.entity.transport)}">
                      {item.entity.transport}
                    </span>
                    <!-- Display all sources for linked nodes (Requirement 3.3) -->
                    {#if item.entity.sources && item.entity.sources.length > 0}
                      {#each item.entity.sources as source}
                        <IntegrationBadge integration={source} variant="badge" size="sm" />
                      {/each}
                    {:else}
                      <IntegrationBadge integration={item.entity.source || 'bolt'} variant="badge" size="sm" />
                    {/if}
                  </div>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {item.entity.uri}
                </p>
                {#if item.entity.config.user}
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-500">
                    User: {item.entity.config.user}
                  </p>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Source
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each combinedResults as item (item.type === 'group' ? item.entity.id : item.entity.id)}
                {#if item.type === 'group'}
                  <!-- Group Row (Requirement 8.1, 8.2, 8.3, 8.4, 10.1, 10.3, 11.2) -->
                  <tr
                    class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                    onclick={() => router.navigate(`/groups/${item.entity.id}`)}
                  >
                    <td class="whitespace-nowrap px-6 py-4 text-sm">
                      <!-- Folder icon to distinguish from nodes (Requirement 11.2) -->
                      <svg class="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 6a3 3 0 013-3h2.25a3 3 0 012.12.879l1.06 1.06A1.5 1.5 0 0012.5 5.5H18a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
                      </svg>
                    </td>
                    <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      <div class="flex items-center gap-2">
                        <span>{item.entity.name}</span>
                        <!-- Multi-source indicator for linked groups -->
                        {#if item.entity.linked && item.entity.sources.length > 1}
                          <span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {item.entity.sources.length} sources: {item.entity.sources.join(', ')}">
                            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            {item.entity.sources.length}
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="whitespace-nowrap px-6 py-4 text-sm">
                      <!-- Display all sources for linked groups (Requirement 8.2, 8.3) -->
                      {#if item.entity.sources && item.entity.sources.length > 0}
                        <div class="flex flex-wrap gap-1">
                          {#each item.entity.sources as source}
                            <IntegrationBadge integration={source} variant="badge" size="sm" />
                          {/each}
                        </div>
                      {:else}
                        <IntegrationBadge integration={item.entity.source || 'bolt'} variant="badge" size="sm" />
                      {/if}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      <!-- Member count badge (Requirement 8.4) -->
                      <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {item.entity.nodes.length} {item.entity.nodes.length === 1 ? 'node' : 'nodes'}
                      </span>
                      {#if item.entity.metadata?.description}
                        <span class="ml-2 text-gray-500 dark:text-gray-400">
                          {item.entity.metadata.description}
                        </span>
                      {/if}
                    </td>
                  </tr>
                {:else}
                  <!-- Node Row -->
                  <tr
                    class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                    onclick={() => navigateToNode(item.entity.id)}
                  >
                    <td class="whitespace-nowrap px-6 py-4 text-sm">
                      <!-- Server icon for nodes (Requirement 11.2) -->
                      <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                    </td>
                    <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      <div class="flex items-center gap-2">
                        <span>{item.entity.name}</span>
                        <!-- Multi-source indicator (Requirement 3.4) -->
                        {#if item.entity.linked && item.entity.sources && item.entity.sources.length > 1}
                          <span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {item.entity.sources.length} sources: {item.entity.sources.join(', ')}">
                            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            {item.entity.sources.length}
                          </span>
                        {/if}
                      </div>
                    </td>
                    <td class="whitespace-nowrap px-6 py-4 text-sm">
                      <!-- Display all sources for linked nodes (Requirement 3.3) -->
                      {#if item.entity.sources && item.entity.sources.length > 0}
                        <div class="flex flex-wrap gap-1">
                          {#each item.entity.sources as source}
                            <IntegrationBadge integration={source} variant="badge" size="sm" />
                          {/each}
                        </div>
                      {:else}
                        <IntegrationBadge integration={item.entity.source || 'bolt'} variant="badge" size="sm" />
                      {/if}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      <div class="flex items-center gap-2">
                        <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(item.entity.transport)}">
                          {item.entity.transport}
                        </span>
                        <span>{item.entity.uri}</span>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Expert Mode Debug Panel -->
  <!-- Expert Mode Debug Panel -->
  {#if expertMode.enabled && sortedDebugInfoBlocks.length > 0}
    <div class="mt-8 space-y-4">
      {#each sortedDebugInfoBlocks as block (block.label)}
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{block.label}</h3>
          <ExpertModeDebugPanel debugInfo={block.debugInfo} />
        </div>
      {/each}
    </div>
  {/if}
</div>
