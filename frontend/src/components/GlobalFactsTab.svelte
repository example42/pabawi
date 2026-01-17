<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface Node {
    id: string;
    name: string;
    source?: string;
  }

  interface NodeFacts {
    certname: string;
    facts: Record<string, unknown>;
  }

  // Common facts that users frequently search for (using modern fact names)
  const COMMON_FACTS = [
    'os.name',
    'os.release.full',
    'os.family',
    'os.architecture',
    'kernelversion',
    'processors.count',
    'memory.system.total',
    'networking.ip',
    'networking.fqdn',
    'networking.hostname',
    'networking.domain',
    'system_uptime.uptime',
    'virtual',
    'timezone',
    'aio_agent_version',
  ];

  // State
  let nodes = $state<Node[]>([]);
  let nodesLoading = $state(false);
  let nodesError = $state<string | null>(null);

  let selectedFacts = $state<string[]>([]);
  let customFactInput = $state('');
  let nodeSearchQuery = $state('');

  let factsData = $state<Map<string, Record<string, unknown>>>(new Map());
  let factsLoading = $state<Set<string>>(new Set());
  let factsErrors = $state<Map<string, string>>(new Map());

  // Helper to check if facts are loading for a node
  function isFactsLoading(certname: string): boolean {
    return factsLoading.has(certname);
  }

  // Helper to check if there's an error for a node
  function hasFactsError(certname: string): boolean {
    return factsErrors.has(certname);
  }

  // Helper to get error message
  function getFactsError(certname: string): string | undefined {
    return factsErrors.get(certname);
  }

  // Fetch all nodes from PuppetDB only
  async function fetchNodes(): Promise<void> {
    nodesLoading = true;
    nodesError = null;

    try {
      // Get nodes from inventory but filter to only PuppetDB nodes
      const data = await get<{ nodes: Node[] }>('/api/inventory?sources=puppetdb', { maxRetries: 2 });
      nodes = data.nodes || [];
    } catch (err) {
      nodesError = err instanceof Error ? err.message : 'Failed to load nodes';
      console.error('Error fetching nodes:', err);
      showError('Failed to load nodes', nodesError);
    } finally {
      nodesLoading = false;
    }
  }

  // Fetch facts for a specific node
  async function fetchNodeFacts(certname: string): Promise<void> {
    if (factsData.has(certname)) return; // Already loaded

    factsLoading = new Set(factsLoading).add(certname); // Create new Set for reactivity

    try {
      // Use PuppetDB only (Puppetserver would be too slow)
      const data = await get<{ facts: Record<string, unknown> }>(
        `/api/integrations/puppetdb/nodes/${certname}/facts`,
        { maxRetries: 1, showRetryNotifications: false }
      );
      
      // Create new Map for reactivity
      factsData = new Map(factsData).set(certname, data.facts || {});
      
      // Remove from errors if it was there
      if (factsErrors.has(certname)) {
        factsErrors = new Map(factsErrors);
        factsErrors.delete(certname);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load facts';
      
      // Create new Map for reactivity
      factsErrors = new Map(factsErrors).set(certname, errorMsg);
    } finally {
      // Remove from loading set
      factsLoading = new Set([...factsLoading].filter(id => id !== certname));
    }
  }

  // Add a fact to the selection
  function addFact(factName: string): void {
    const trimmed = factName.trim();
    if (trimmed && !selectedFacts.includes(trimmed)) {
      selectedFacts = [...selectedFacts, trimmed];
      customFactInput = '';
      
      // Fetch facts for all nodes (not just filtered ones)
      nodes.forEach(node => {
        void fetchNodeFacts(node.id);
      });
    }
  }

  // Remove a fact from the selection
  function removeFact(factName: string): void {
    selectedFacts = selectedFacts.filter(f => f !== factName);
  }

  // Add custom fact from input
  function addCustomFact(): void {
    if (customFactInput.trim()) {
      addFact(customFactInput);
    }
  }

  // Handle Enter key in custom fact input
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      addCustomFact();
    }
  }

  // Get fact value for a node (supports nested facts like os.name)
  function getFactValue(certname: string, factName: string): string {
    const data = factsData.get(certname);
    
    if (!data) {
      return '-';
    }
    
    // The facts are nested inside a "facts" property
    const facts = (data as { facts?: Record<string, unknown> }).facts;
    
    if (!facts) {
      return '-';
    }
    
    // Handle nested facts (e.g., "os.name" -> facts.os.name)
    const parts = factName.split('.');
    let value: unknown = facts;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return '-';
      }
    }
    
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  // Filter nodes based on search query
  const filteredNodes = $derived(nodes.filter(node => {
    if (!nodeSearchQuery.trim()) return true;
    const query = nodeSearchQuery.toLowerCase();
    return node.name.toLowerCase().includes(query) || node.id.toLowerCase().includes(query);
  }));

  // On mount
  onMount(() => {
    void fetchNodes();
  });
</script>

<div class="global-facts-tab">
  <!-- Fact Selection Section -->
  <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <h3 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Select Facts to Display</h3>
    
    <!-- Common Facts -->
    <div class="mb-4">
      <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Common Facts
      </label>
      <div class="flex flex-wrap gap-2">
        {#each COMMON_FACTS as fact}
          <button
            type="button"
            onclick={() => addFact(fact)}
            disabled={selectedFacts.includes(fact)}
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors
              {selectedFacts.includes(fact)
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
          >
            {fact}
          </button>
        {/each}
      </div>
    </div>

    <!-- Custom Fact Input -->
    <div class="mb-4">
      <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Custom Fact Name
      </label>
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={customFactInput}
          onkeydown={handleKeydown}
          placeholder="Enter fact name (e.g., custom_fact)"
          class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
        />
        <button
          type="button"
          onclick={addCustomFact}
          disabled={!customFactInput.trim()}
          class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          Add
        </button>
      </div>
    </div>

    <!-- Selected Facts -->
    {#if selectedFacts.length > 0}
      <div>
        <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Selected Facts ({selectedFacts.length})
        </label>
        <div class="flex flex-wrap gap-2">
          {#each selectedFacts as fact}
            <span class="inline-flex items-center gap-1.5 rounded-md bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
              {fact}
              <button
                type="button"
                onclick={() => removeFact(fact)}
                aria-label="Remove {fact}"
                class="hover:text-primary-900 dark:hover:text-primary-200"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Facts Table Section -->
  {#if selectedFacts.length > 0}
    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <!-- Node Search -->
      <div class="border-b border-gray-200 p-4 dark:border-gray-700">
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            bind:value={nodeSearchQuery}
            placeholder="Search nodes..."
            class="flex-1 border-0 bg-transparent px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white dark:placeholder-gray-500"
          />
          {#if nodeSearchQuery}
            <button
              type="button"
              onclick={() => nodeSearchQuery = ''}
              aria-label="Clear search"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
        <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {#if nodesLoading}
            Loading nodes...
          {:else}
            Showing {filteredNodes.length} of {nodes.length} nodes
          {/if}
        </div>
      </div>

      <!-- Loading State -->
      {#if nodesLoading}
        <div class="flex justify-center py-12">
          <LoadingSpinner size="lg" message="Loading nodes..." />
        </div>
      {:else if nodesError}
        <div class="p-4">
          <ErrorAlert
            message="Failed to load nodes"
            details={nodesError}
            onRetry={fetchNodes}
          />
        </div>
      {:else if filteredNodes.length === 0}
        <div class="p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No nodes found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {nodeSearchQuery ? 'Try adjusting your search query' : 'No nodes available in inventory'}
          </p>
        </div>
      {:else}
        <!-- Facts Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th class="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-900 dark:bg-gray-900/50 dark:text-white">
                  Node
                </th>
                {#each selectedFacts as fact}
                  <th class="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                    {fact}
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each filteredNodes as node}
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td class="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-900 dark:bg-gray-800 dark:text-white">
                    <div class="flex items-center gap-2">
                      <span class="truncate">{node.name}</span>
                      {#if node.source}
                        <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium
                          {node.source === 'puppetdb' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 
                           node.source === 'puppetserver' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                           'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}">
                          {node.source}
                        </span>
                      {/if}
                    </div>
                  </td>
                  {#each selectedFacts as fact}
                    <td class="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {#if isFactsLoading(node.id)}
                        <div class="flex items-center gap-2">
                          <svg class="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span class="text-xs text-gray-400">Loading...</span>
                        </div>
                      {:else if hasFactsError(node.id)}
                        <span class="text-xs text-red-600 dark:text-red-400" title={getFactsError(node.id)}>
                          Error
                        </span>
                      {:else}
                        <span class="truncate" title={getFactValue(node.id, fact)}>
                          {getFactValue(node.id, fact)}
                        </span>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {:else}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No facts selected</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Select one or more facts above to view their values across all nodes
      </p>
    </div>
  {/if}
</div>
