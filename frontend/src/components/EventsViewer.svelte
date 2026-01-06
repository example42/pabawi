<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import StatusBadge from './StatusBadge.svelte';

  interface Event {
    certname: string;
    timestamp: string;
    report: string;
    resource_type: string;
    resource_title: string;
    property: string;
    status: 'success' | 'failure' | 'noop' | 'skipped';
    old_value?: unknown;
    new_value?: unknown;
    message?: string;
    file?: string;
    line?: number;
  }

  interface EventFilters {
    status?: 'success' | 'failure' | 'noop' | 'skipped';
    resourceType?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }

  type TimeFilter = 'last-run' | '1h' | '6h' | '12h' | '1d' | '1w' | 'all';

  interface Props {
    events: Event[];
    filters?: EventFilters;
    onFilterChange?: (filters: EventFilters) => void;
  }

  let { events, filters = {}, onFilterChange }: Props = $props();

  // Local filter state
  let statusFilter = $state<'all' | 'success' | 'failure' | 'noop' | 'skipped'>('all');
  let resourceTypeFilter = $state('');
  let searchQuery = $state('');
  let timeFilter = $state<TimeFilter>('last-run');

  // Get the latest report hash (identifies the last puppet run)
  const latestReportHash = $derived.by(() => {
    if (events.length === 0) return null;
    // Sort by timestamp to find the most recent event, then get its report hash
    const sorted = [...events].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0]?.report ?? null;
  });

  // Filter events by time
  function filterByTime(eventList: Event[]): Event[] {
    if (timeFilter === 'all') return eventList;

    if (timeFilter === 'last-run') {
      if (!latestReportHash) return eventList;
      return eventList.filter(e => e.report === latestReportHash);
    }

    // Time-based filters
    const now = Date.now();
    const hoursMap: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '12h': 12,
      '1d': 24,
      '1w': 168,
    };
    const hours = hoursMap[timeFilter];
    if (!hours) return eventList;

    const cutoff = now - hours * 60 * 60 * 1000;
    return eventList.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  }

  // Get unique resource types (from time-filtered events)
  const timeFilteredEvents = $derived.by(() => filterByTime(events));

  const resourceTypes = $derived.by(() => {
    const types = new SvelteSet<string>();
    for (const event of timeFilteredEvents) {
      types.add(event.resource_type);
    }
    return Array.from(types).sort();
  });

  // Filter events
  const filteredEvents = $derived.by(() => {
    // Start with time-filtered events
    let filtered = [...timeFilteredEvents];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }

    // Resource type filter
    if (resourceTypeFilter) {
      filtered = filtered.filter(e => e.resource_type === resourceTypeFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.resource_type.toLowerCase().includes(query) ||
        e.resource_title.toLowerCase().includes(query) ||
        e.property.toLowerCase().includes(query) ||
        (e.message && e.message.toLowerCase().includes(query))
      );
    }

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  // Count events by status (from time-filtered events)
  const eventCounts = $derived.by(() => {
    return {
      all: timeFilteredEvents.length,
      success: timeFilteredEvents.filter(e => e.status === 'success').length,
      failure: timeFilteredEvents.filter(e => e.status === 'failure').length,
      noop: timeFilteredEvents.filter(e => e.status === 'noop').length,
      skipped: timeFilteredEvents.filter(e => e.status === 'skipped').length,
    };
  });

  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  function formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return JSON.stringify(value, null, 2);
  }

  function isComplexValue(value: unknown): boolean {
    return typeof value === 'object' && value !== null;
  }

  function applyFilters(): void {
    const newFilters: EventFilters = {};

    if (statusFilter !== 'all') {
      newFilters.status = statusFilter;
    }

    if (resourceTypeFilter) {
      newFilters.resourceType = resourceTypeFilter;
    }

    onFilterChange?.(newFilters);
  }

  function clearFilters(): void {
    statusFilter = 'all';
    resourceTypeFilter = '';
    searchQuery = '';
    timeFilter = 'last-run';
    onFilterChange?.({});
  }

  function setTimeFilter(filter: TimeFilter): void {
    timeFilter = filter;
    // Reset resource type filter when time filter changes since available types may differ
    resourceTypeFilter = '';
    applyFilters();
  }

  // Time filter button config
  const timeFilterOptions: { value: TimeFilter; label: string }[] = [
    { value: 'last-run', label: 'Last Run' },
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '12h', label: '12 Hours' },
    { value: '1d', label: '1 Day' },
    { value: '1w', label: '1 Week' },
    { value: 'all', label: 'All' },
  ];
</script>

<div class="events-viewer space-y-4">
  <!-- Header with Stats -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Puppet Events</h3>
    <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{eventCounts.all}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">Total</div>
      </div>
      <div class="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
        <div class="text-2xl font-bold text-green-700 dark:text-green-400">{eventCounts.success}</div>
        <div class="text-sm text-green-600 dark:text-green-500">Success</div>
      </div>
      <div class="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
        <div class="text-2xl font-bold text-red-700 dark:text-red-400">{eventCounts.failure}</div>
        <div class="text-sm text-red-600 dark:text-red-500">Failure</div>
      </div>
      <div class="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
        <div class="text-2xl font-bold text-purple-700 dark:text-purple-400">{eventCounts.noop}</div>
        <div class="text-sm text-purple-600 dark:text-purple-500">No-op</div>
      </div>
      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
        <div class="text-2xl font-bold text-gray-700 dark:text-gray-400">{eventCounts.skipped}</div>
        <div class="text-sm text-gray-600 dark:text-gray-500">Skipped</div>
      </div>
    </div>
  </div>

  <!-- Filters -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div class="space-y-4">
      <!-- Search -->
      <div class="relative">
        <svg
          class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search events by resource, property, or message..."
          class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
        {#if searchQuery}
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onclick={() => searchQuery = ''}
            aria-label="Clear search"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Time Range Filter -->
      <div>
        <label for="time-filter-group" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Time Range
        </label>
        <div id="time-filter-group" role="group" aria-label="Filter by time range">
          <div class="flex flex-wrap gap-2">
            {#each timeFilterOptions as option (option.value)}
              <button
                type="button"
                class="rounded px-3 py-1.5 text-sm font-medium transition-colors {timeFilter === option.value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => setTimeFilter(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Status Filter -->
      <div>
        <label for="status-filter-group" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Filter by Status
        </label>
        <div id="status-filter-group" role="group" aria-label="Filter by status">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            onclick={() => { statusFilter = 'all'; applyFilters(); }}
          >
            All ({eventCounts.all})
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === 'success' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            onclick={() => { statusFilter = 'success'; applyFilters(); }}
          >
            Success ({eventCounts.success})
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === 'failure' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            onclick={() => { statusFilter = 'failure'; applyFilters(); }}
          >
            Failure ({eventCounts.failure})
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === 'noop' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            onclick={() => { statusFilter = 'noop'; applyFilters(); }}
          >
            No-op ({eventCounts.noop})
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === 'skipped' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
            onclick={() => { statusFilter = 'skipped'; applyFilters(); }}
          >
            Skipped ({eventCounts.skipped})
          </button>
        </div>
        </div>
      </div>

      <!-- Resource Type Filter -->
      <div>
        <label for="resource-type-filter" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Filter by Resource Type
        </label>
        <select
          id="resource-type-filter"
          bind:value={resourceTypeFilter}
          onchange={applyFilters}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">All Resource Types</option>
          {#each resourceTypes as type (type)}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>

      <!-- Clear Filters -->
      {#if statusFilter !== 'all' || resourceTypeFilter || searchQuery || timeFilter !== 'last-run'}
        <button
          type="button"
          class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          onclick={clearFilters}
        >
          Clear all filters
        </button>
      {/if}
    </div>
  </div>

  <!-- Results Count -->
  {#if filteredEvents.length !== events.length}
    <div class="text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredEvents.length} of {events.length} events
    </div>
  {/if}

  <!-- Events List -->
  <div class="space-y-3">
    {#if filteredEvents.length === 0}
      <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <p class="text-gray-500 dark:text-gray-400">
          {searchQuery || statusFilter !== 'all' || resourceTypeFilter ? 'No events match your filters' : 'No events to display'}
        </p>
      </div>
    {:else}
      {#each filteredEvents as event (`${event.report}-${event.resource_type}-${event.resource_title}-${event.timestamp}`)}
        <div
          class="rounded-lg border p-4 {event.status === 'failure' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <!-- Resource Info -->
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {event.resource_type}[{event.resource_title}]
                </span>
                <StatusBadge
                  status={event.status === 'failure' ? 'failed' : event.status === 'success' ? 'success' : 'partial'}
                  size="sm"
                />
              </div>

              <!-- Property -->
              {#if event.property}
                <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Property: <span class="font-mono">{event.property}</span>
                </div>
              {/if}

              <!-- Message (Highlight for failures - Requirement 5.4) -->
              {#if event.message}
                <div class="mt-2 text-sm {event.status === 'failure' ? 'font-medium text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}">
                  {event.message}
                </div>
              {/if}

              <!-- Value Changes -->
              {#if event.old_value !== undefined || event.new_value !== undefined}
                <div class="mt-3 space-y-1">
                  {#if event.old_value !== undefined}
                    <div class="text-sm">
                      <span class="text-gray-500 dark:text-gray-400">Old value:</span>
                      {#if isComplexValue(event.old_value)}
                        <pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{formatValue(event.old_value)}</pre>
                      {:else}
                        <span class="ml-2 font-mono text-red-600 dark:text-red-400">{formatValue(event.old_value)}</span>
                      {/if}
                    </div>
                  {/if}
                  {#if event.new_value !== undefined}
                    <div class="text-sm">
                      <span class="text-gray-500 dark:text-gray-400">New value:</span>
                      {#if isComplexValue(event.new_value)}
                        <pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">{formatValue(event.new_value)}</pre>
                      {:else}
                        <span class="ml-2 font-mono text-green-600 dark:text-green-400">{formatValue(event.new_value)}</span>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Source Location -->
              {#if event.file}
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Source: {event.file}{event.line ? `:${event.line}` : ''}
                </div>
              {/if}
            </div>

            <!-- Timestamp -->
            <div class="flex flex-col items-end gap-1 text-right">
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {formatRelativeTime(event.timestamp)}
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">
                {formatTimestamp(event.timestamp)}
              </div>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
