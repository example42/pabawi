<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';

  interface Props {
    params?: { id: string };
  }

  let { params }: Props = $props();

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

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    source?: string;
  }

  let group = $state<NodeGroup | null>(null);
  let groupNodes = $state<Node[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const groupId = $derived(params?.id || '');

  onMount(async () => {
    await fetchGroupDetails();
  });

  async function fetchGroupDetails(): Promise<void> {
    if (!groupId) {
      error = 'No group ID provided';
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      // Fetch inventory to get groups and nodes
      const inventory = await get<{
        nodes: Node[];
        groups: NodeGroup[];
      }>('/api/inventory');

      // Find the group by ID
      const foundGroup = inventory.groups.find(g => g.id === groupId);

      if (!foundGroup) {
        error = `Group not found: ${groupId}`;
        loading = false;
        return;
      }

      group = foundGroup;

      // Filter nodes that are members of this group
      groupNodes = inventory.nodes.filter(node =>
        foundGroup.nodes.includes(node.id)
      );

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch group details';
      error = errorMessage;
      showError(errorMessage);
    } finally {
      loading = false;
    }
  }

  function navigateToNode(nodeId: string): void {
    router.navigate(`/nodes/${nodeId}`);
  }

  function navigateBack(): void {
    router.navigate('/inventory');
  }
</script>

<svelte:head>
  <title>{group ? `Pabawi - ${group.name}` : 'Pabawi - Group Details'}</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <ErrorAlert message={error} />
    <button
      type="button"
      onclick={navigateBack}
      class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
    >
      Back to Inventory
    </button>
  {:else if group}
    <!-- Header -->
    <div class="mb-8">
      <button
        type="button"
        onclick={navigateBack}
        class="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Inventory
      </button>

      <div class="flex items-start justify-between">
        <div class="flex items-start gap-3">
          <!-- Folder icon -->
          <svg class="h-8 w-8 text-yellow-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 6a3 3 0 013-3h2.25a3 3 0 012.12.879l1.06 1.06A1.5 1.5 0 0012.5 5.5H18a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
          </svg>
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {group.name}
            </h1>
            {#if group.metadata?.description}
              <p class="mt-2 text-gray-600 dark:text-gray-400">
                {group.metadata.description}
              </p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Source badges -->
      <div class="mt-4 flex flex-wrap gap-2">
        {#if group.sources && group.sources.length > 0}
          {#each group.sources as source}
            <IntegrationBadge integration={source} variant="badge" size="md" />
          {/each}
        {:else}
          <IntegrationBadge integration={group.source || 'bolt'} variant="badge" size="md" />
        {/if}
        {#if group.linked}
          <span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1 text-sm font-medium text-white">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Linked across {group.sources.length} sources
          </span>
        {/if}
      </div>
    </div>

    <!-- Group Info -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Group Information</h2>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Group ID</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{group.id}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Member Count</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{group.nodes.length} nodes</dd>
        </div>
        {#if group.metadata?.hierarchy && group.metadata.hierarchy.length > 0}
          <div class="sm:col-span-2">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Nested Groups</dt>
            <dd class="mt-1 text-sm text-gray-900 dark:text-white">
              {group.metadata.hierarchy.join(', ')}
            </dd>
          </div>
        {/if}
        {#if group.metadata?.variables}
          <div class="sm:col-span-2">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Variables</dt>
            <dd class="mt-1">
              <pre class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">{JSON.stringify(group.metadata.variables, null, 2)}</pre>
            </dd>
          </div>
        {/if}
      </dl>
    </div>

    <!-- Member Nodes -->
    <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Member Nodes ({groupNodes.length})
        </h2>
      </div>

      {#if groupNodes.length === 0}
        <div class="p-12 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No nodes found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This group has no member nodes or the nodes are not in the inventory.
          </p>
        </div>
      {:else}
        <div class="overflow-hidden">
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
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  URI
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {#each groupNodes as node (node.id)}
                <tr
                  class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                  onclick={() => navigateToNode(node.id)}
                >
                  <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {node.name}
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm">
                    <IntegrationBadge integration={node.source || 'bolt'} variant="badge" size="sm" />
                  </td>
                  <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.transport}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.uri}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>
