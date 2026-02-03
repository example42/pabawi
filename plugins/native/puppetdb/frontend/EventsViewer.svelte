<!--
  PuppetDB Events Viewer Widget

  Displays resource events from Puppet runs with filtering and timeline view.
  Shows event details including old/new values for changed resources.

  Features:
  - Event timeline with status filtering
  - Resource type grouping
  - Old value → New value display
  - Event status indicators (success, failure, noop, skip)
  - Node-specific filtering

  @module plugins/native/puppetdb/frontend/EventsViewer
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import { get } from '../../../../frontend/src/lib/api';
  import { formatTimestamp } from '../../../../frontend/src/lib/utils';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PuppetDBEvent {
    certname: string;
    timestamp: string;
    report: string;
    resource_type: string;
    resource_title: string;
    property: string | null;
    old_value: unknown;
    new_value: unknown;
    status: 'success' | 'failure' | 'noop' | 'skipped';
    message: string | null;
    file: string | null;
    line: number | null;
  }

  interface EventsResponse {
    events: PuppetDBEvent[];
    total: number;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Integration name (for API calls) */
    integration?: string;
    /** Filter by specific node */
    certname?: string;
    /** Maximum events to display */
    limit?: number;
    /** Show status filter */
    showStatusFilter?: boolean;
    /** Show resource type filter */
    showResourceFilter?: boolean;
  }

  let {
    integration = 'puppetdb',
    certname = undefined,
    limit = 100,
    showStatusFilter = true,
    showResourceFilter = true,
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  let events = $state<PuppetDBEvent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Filters
  let statusFilter = $state<'all' | 'success' | 'failure' | 'noop' | 'skipped'>('all');
  let resourceTypeFilter = $state<string>('all');
  let searchTerm = $state('');

  // Derived state
  let resourceTypes = $derived.by(() => {
    const types = new Set<string>();
    events.forEach(event => types.add(event.resource_type));
    return Array.from(types).sort();
  });

  let filteredEvents = $derived.by(() => {
    return events.filter(event => {
      // Status filter
      if (statusFilter !== 'all' && event.status !== statusFilter) {
        return false;
      }

      // Resource type filter
      if (resourceTypeFilter !== 'all' && event.resource_type !== resourceTypeFilter) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          event.resource_title.toLowerCase().includes(search) ||
          event.resource_type.toLowerCase().includes(search) ||
          (event.message && event.message.toLowerCase().includes(search))
        );
      }

      return true;
    });
  });

  // ==========================================================================
  // Functions
  // ==========================================================================

  async function loadEvents() {
    if (!certname) {
      error = 'No certname provided';
      return;
    }

    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });

      const response = await get<EventsResponse>(`/api/puppetdb/events/${certname}?${params}`);
      events = response.events || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load events';
      error = message;
      console.error('Failed to load events:', err);
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'failure':
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'noop':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
      case 'skipped':
        return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-400';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    if (certname) {
      void loadEvents();
    }
  });

  // Reload when filters change
  $effect(() => {
    if (certname && (statusFilter || resourceTypeFilter)) {
      void loadEvents();
    }
  });
</script>

<div class="puppetdb-events-viewer">
  <!-- Header -->
  <header class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Events {certname ? `for ${certname}` : ''}
        </h2>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Resource events from Puppet runs
        </p>
      </div>

      <button
        onclick={() => loadEvents()}
        disabled={loading || !certname}
        class="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-600"
      >
        Refresh
      </button>
    </div>

    <!-- Filters -->
    <div class="mt-4 flex flex-wrap gap-4">
      <!-- Search -->
      <div class="flex-1 min-w-64">
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Search events..."
          class="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
        />
      </div>

      {#if showStatusFilter}
        <!-- Status Filter -->
        <div>
          <label for="status-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <select
            id="status-filter"
            bind:value={statusFilter}
            class="mt-1 rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="noop">No-op</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      {/if}

      {#if showResourceFilter && resourceTypes.length > 0}
        <!-- Resource Type Filter -->
        <div>
          <label for="resource-type-filter" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Resource Type</label>
          <select
            id="resource-type-filter"
            bind:value={resourceTypeFilter}
            class="mt-1 rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="all">All Types</option>
            {#each resourceTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </header>

  <!-- Content -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner />
    </div>
  {:else if error}
    <ErrorAlert message={error} />
  {:else if !certname}
    <div class="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Node Selected</h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Select a node to view its events
      </p>
    </div>
  {:else if filteredEvents.length === 0}
    <div class="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No Events Found</h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        No events match your current filters
      </p>
    </div>
  {:else}
    <!-- Events List -->
    <div class="space-y-3">
      {#each filteredEvents as event (event.timestamp + event.resource_type + event.resource_title)}
        <div class="event-item rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <!-- Event Header -->
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <!-- Resource Type and Title -->
                <h3 class="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                  {event.resource_type}[{event.resource_title}]
                </h3>

                <!-- Status Badge -->
                <span class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(event.status)}`}>
                  {event.status}
                </span>
              </div>

              <!-- Timestamp -->
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(event.timestamp)}
              </p>
            </div>
          </div>

          <!-- Event Details -->
          {#if event.property}
            <div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <div class="grid grid-cols-2 gap-4">
                <!-- Old Value -->
                <div>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Old Value</p>
                  <pre class="mt-1 rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{formatValue(event.old_value)}</pre>
                </div>

                <!-- New Value -->
                <div>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400">New Value</p>
                  <pre class="mt-1 rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{formatValue(event.new_value)}</pre>
                </div>
              </div>
            </div>
          {/if}

          <!-- Message -->
          {#if event.message}
            <div class="mt-2">
              <p class="text-sm text-gray-600 dark:text-gray-400">{event.message}</p>
            </div>
          {/if}

          <!-- Source Location -->
          {#if event.file}
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-500">
              Source: {event.file}{event.line ? `:${event.line}` : ''}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Results Summary -->
    <div class="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredEvents.length} of {events.length} events
    </div>
  {/if}
</div>

<style>
  .puppetdb-events-viewer {
    padding: 0;
  }

  .event-item {
    transition: all 0.2s ease;
  }

  pre {
    overflow-x: auto;
    max-height: 150px;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  }
</style>
