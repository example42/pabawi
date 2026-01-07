<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { router } from '../lib/router.svelte';
  import { get } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';

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
    certificateStatus?: 'signed' | 'requested' | 'revoked';
    lastCheckIn?: string;
  }

  interface SourceInfo {
    nodeCount: number;
    lastSync: string;
    status: 'healthy' | 'degraded' | 'unavailable';
  }

  interface InventoryResponse {
    nodes: Node[];
    sources?: Record<string, SourceInfo>;
  }

  // State
  let nodes = $state<Node[]>([]);
  let sources = $state<Record<string, SourceInfo>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let transportFilter = $state<string>('all');
  let sourceFilter = $state<string>('all');
  let certificateStatusFilter = $state<string>('all');
  let sortBy = $state<string>('name');
  let sortOrder = $state<'asc' | 'desc'>('asc');
  let viewMode = $state<'grid' | 'list'>('grid');
  let searchTimeout: number | undefined;
  let pqlQuery = $state('');
  let pqlError = $state<string | null>(null);
  let showPqlInput = $state(false);
  let selectedPqlTemplate = $state('');

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

    // Filter by certificate status (Requirement 11.4)
    if (certificateStatusFilter !== 'all') {
      result = result.filter(node => node.certificateStatus === certificateStatusFilter);
    }

    // Sort nodes (Requirement 11.5)
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'certificateStatus': {
          // Sort by certificate status (signed < requested < revoked)
          const statusOrder = { signed: 1, requested: 2, revoked: 3 };
          const statusA = a.certificateStatus ? statusOrder[a.certificateStatus] : 999;
          const statusB = b.certificateStatus ? statusOrder[b.certificateStatus] : 999;
          comparison = statusA - statusB;
          break;
        }
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

      // Add certificate status filter if set (Requirement 11.4)
      if (certificateStatusFilter !== 'all') {
        params.append('certificateStatus', certificateStatusFilter);
      }

      // Add sorting parameters (Requirement 11.5)
      if (sortBy !== 'name') {
        params.append('sortBy', sortBy);
        params.append('sortOrder', sortOrder);
      }

      const url = `/api/inventory${params.toString() ? `?${params.toString()}` : ''}`;

      const data = await get<InventoryResponse>(url, {
        maxRetries: 2,
        onRetry: (attempt) => {
          console.log(`Retrying inventory fetch (attempt ${attempt})...`);
        },
      });

      nodes = data.nodes || [];
      sources = data.sources || {};

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

  // Get source badge color
  function getSourceColor(source: string): string {
    switch (source) {
      case 'bolt':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'puppetdb':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case 'puppetserver':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
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
      default:
        return source.charAt(0).toUpperCase() + source.slice(1);
    }
  }

  // Get certificate status badge color (Requirement 11.1, 11.2, 11.3)
  function getCertificateStatusColor(status: string): string {
    switch (status) {
      case 'signed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'requested':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'revoked':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  // Get certificate status icon (Requirement 11.1, 11.2, 11.3)
  function getCertificateStatusIcon(status: string): string {
    switch (status) {
      case 'signed':
        return '✓'; // Checkmark for signed
      case 'requested':
        return '⏳'; // Hourglass for pending
      case 'revoked':
        return '⚠'; // Warning for revoked
      default:
        return '';
    }
  }

  // Get certificate status display name
  function getCertificateStatusDisplayName(status: string): string {
    switch (status) {
      case 'signed':
        return 'Signed';
      case 'requested':
        return 'Pending';
      case 'revoked':
        return 'Revoked';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
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
    fetchInventory();
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Inventory
        </h1>
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
        <!-- Source Filter -->
        <div class="flex items-center gap-2">
          <label for="source-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Source:
          </label>
          <select
            id="source-filter"
            bind:value={sourceFilter}
            class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="all">All ({nodes.length})</option>
            {#each Object.keys(nodeCountsBySource).sort() as source}
              <option value={source}>
                {getSourceDisplayName(source)} ({nodeCountsBySource[source]})
              </option>
            {/each}
          </select>
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

        <!-- Certificate Status Filter (Requirement 11.4) -->
        {#if nodes.some(n => n.source === 'puppetserver')}
          <div class="flex items-center gap-2">
            <label for="cert-status-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Certificate:
            </label>
            <select
              id="cert-status-filter"
              bind:value={certificateStatusFilter}
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">All</option>
              <option value="signed">Signed</option>
              <option value="requested">Pending</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        {/if}

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
            {#if nodes.some(n => n.certificateStatus)}
              <option value="certificateStatus">Certificate Status</option>
            {/if}
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
      Showing {filteredNodes.length} of {nodes.length} nodes
    </div>

    <!-- Empty State -->
    {#if filteredNodes.length === 0}
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No nodes found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {searchQuery || transportFilter !== 'all' ? 'Try adjusting your filters' : 'No nodes in inventory'}
        </p>
      </div>
    {:else}
      <!-- Node List/Grid -->
      {#if viewMode === 'grid'}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each filteredNodes as node (node.id)}
            <button
              type="button"
              class="group relative rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
              onclick={() => navigateToNode(node.id)}
            >
              <!-- Revoked certificate warning banner (Requirement 11.3) -->
              {#if node.certificateStatus === 'revoked'}
                <div class="absolute -top-2 -right-2 rounded-full bg-red-600 p-2 shadow-lg" title="Certificate Revoked">
                  <svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              {/if}

              <div class="mb-3 flex items-start justify-between gap-2">
                <h3 class="font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 flex-1 min-w-0">
                  {node.name}
                  <!-- Multi-source indicator (Requirement 3.4) -->
                  {#if node.linked && node.sources && node.sources.length > 1}
                    <span class="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {node.sources.length} sources: {node.sources.join(', ')}">
                      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {node.sources.length}
                    </span>
                  {/if}
                </h3>
                <div class="flex flex-col gap-1 items-end">
                  <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                    {node.transport}
                  </span>
                  <!-- Display all sources for linked nodes (Requirement 3.3) -->
                  {#if node.sources && node.sources.length > 0}
                    {#each node.sources as source}
                      <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(source)}">
                        {getSourceDisplayName(source)}
                      </span>
                    {/each}
                  {:else}
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(node.source || 'bolt')}">
                      {getSourceDisplayName(node.source || 'bolt')}
                    </span>
                  {/if}
                  <!-- Certificate status badge (Requirement 11.1, 11.2) -->
                  {#if node.certificateStatus}
                    <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium {getCertificateStatusColor(node.certificateStatus)}">
                      <span>{getCertificateStatusIcon(node.certificateStatus)}</span>
                      <span>{getCertificateStatusDisplayName(node.certificateStatus)}</span>
                    </span>
                  {/if}
                </div>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 truncate">
                {node.uri}
              </p>
              {#if node.config.user}
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  User: {node.config.user}
                </p>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Name
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Source
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Transport
                </th>
                {#if nodes.some(n => n.certificateStatus)}
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Certificate
                  </th>
                {/if}
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  URI
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  User
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each filteredNodes as node (node.id)}
                <tr
                  class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 {node.certificateStatus === 'revoked' ? 'bg-red-50 dark:bg-red-900/10' : ''}"
                  onclick={() => navigateToNode(node.id)}
                >
                  <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    <div class="flex items-center gap-2">
                      {#if node.certificateStatus === 'revoked'}
                        <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Certificate Revoked">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      {/if}
                      <span>{node.name}</span>
                      <!-- Multi-source indicator (Requirement 3.4) -->
                      {#if node.linked && node.sources && node.sources.length > 1}
                        <span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white" title="Available in {node.sources.length} sources: {node.sources.join(', ')}">
                          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          {node.sources.length}
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <!-- Display all sources for linked nodes (Requirement 3.3) -->
                    {#if node.sources && node.sources.length > 0}
                      <div class="flex flex-wrap gap-1">
                        {#each node.sources as source}
                          <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(source)}">
                            {getSourceDisplayName(source)}
                          </span>
                        {/each}
                      </div>
                    {:else}
                      <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getSourceColor(node.source || 'bolt')}">
                        {getSourceDisplayName(node.source || 'bolt')}
                      </span>
                    {/if}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {getTransportColor(node.transport)}">
                      {node.transport}
                    </span>
                  </td>
                  {#if nodes.some(n => n.certificateStatus)}
                    <td class="whitespace-nowrap px-6 py-4 text-sm">
                      {#if node.certificateStatus}
                        <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium {getCertificateStatusColor(node.certificateStatus)}">
                          <span>{getCertificateStatusIcon(node.certificateStatus)}</span>
                          <span>{getCertificateStatusDisplayName(node.certificateStatus)}</span>
                        </span>
                      {:else}
                        <span class="text-gray-400 dark:text-gray-600">-</span>
                      {/if}
                    </td>
                  {/if}
                  <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.uri}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.config.user || '-'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</div>
