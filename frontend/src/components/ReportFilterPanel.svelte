<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { reportFilters, type ReportFilters } from '../lib/reportFilters.svelte';

  interface Props {
    onFilterChange?: () => void;
  }

  let { onFilterChange }: Props = $props();

  // Local state for filter values
  let statusFilters = $state<SvelteSet<string>>(new SvelteSet(reportFilters.filters.status || []));
  let minDuration = $state<number | undefined>(reportFilters.filters.minDuration);
  let minCompileTime = $state<number | undefined>(reportFilters.filters.minCompileTime);
  let minTotalResources = $state<number | undefined>(reportFilters.filters.minTotalResources);

  // Status options (matching PuppetDB report statuses)
  const statusOptions = [
    { value: 'unchanged', label: 'Unchanged', color: 'gray' },
    { value: 'changed', label: 'Changed', color: 'blue' },
    { value: 'failed', label: 'Failed', color: 'red' }
  ];

  // Calculate active filter count
  const activeFilterCount = $derived.by(() => {
    let count = 0;
    if (statusFilters.size > 0) count++;
    if (minDuration !== undefined && minDuration > 0) count++;
    if (minCompileTime !== undefined && minCompileTime > 0) count++;
    if (minTotalResources !== undefined && minTotalResources > 0) count++;
    return count;
  });

  // Toggle status filter
  const toggleStatus = (status: string) => {
    const newFilters = new SvelteSet(statusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    statusFilters = newFilters;
    applyFilters();
  };

  // Apply filters to store
  const applyFilters = () => {
    // Update status filter
    if (statusFilters.size > 0) {
      reportFilters.setFilter('status', Array.from(statusFilters) as ('unchanged' | 'changed' | 'failed')[]);
    } else {
      reportFilters.setFilter('status', undefined);
    }

    // Update numeric filters
    reportFilters.setFilter('minDuration', minDuration && minDuration > 0 ? minDuration : undefined);
    reportFilters.setFilter('minCompileTime', minCompileTime && minCompileTime > 0 ? minCompileTime : undefined);
    reportFilters.setFilter('minTotalResources', minTotalResources && minTotalResources > 0 ? minTotalResources : undefined);

    // Notify parent component
    if (onFilterChange) {
      onFilterChange();
    }
  };

  // Clear all filters
  const clearFilters = () => {
    statusFilters = new SvelteSet();
    minDuration = undefined;
    minCompileTime = undefined;
    minTotalResources = undefined;
    reportFilters.clearFilters();

    if (onFilterChange) {
      onFilterChange();
    }
  };

  // Get button color classes based on status
  const getStatusButtonClasses = (status: string, color: string) => {
    const isActive = statusFilters.has(status);

    const colorClasses = {
      green: isActive
        ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600',
      red: isActive
        ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600',
      blue: isActive
        ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600',
      gray: isActive
        ? 'bg-gray-600 text-white border-gray-600 hover:bg-gray-700'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
    };

    return colorClasses[color as keyof typeof colorClasses];
  };
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <!-- Header with title and active filter badge -->
  <div class="mb-4 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Filter Reports
      </h3>
      {#if activeFilterCount > 0}
        <span class="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-300">
          {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
        </span>
      {/if}
    </div>
    {#if activeFilterCount > 0}
      <button
        type="button"
        class="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
        onclick={clearFilters}
      >
        Clear Filters
      </button>
    {/if}
  </div>

  <!-- Filter Controls -->
  <div class="space-y-4">
    <!-- Status Filter -->
    <div>
      <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        Status
      </div>
      <div class="flex flex-wrap gap-2">
        {#each statusOptions as option (option.value)}
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors {getStatusButtonClasses(option.value, option.color)}"
            onclick={() => toggleStatus(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Numeric Filters - Single Row -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <!-- Duration Filter -->
      <div>
        <label for="min-duration" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Minimum Duration (seconds)
        </label>
        <input
          id="min-duration"
          type="number"
          min="0"
          step="1"
          class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-primary-400 dark:focus:ring-primary-400"
          placeholder="e.g., 60"
          bind:value={minDuration}
          oninput={applyFilters}
        />
      </div>

      <!-- Compile Time Filter -->
      <div>
        <label for="min-compile-time" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Minimum Compile Time (seconds)
        </label>
        <input
          id="min-compile-time"
          type="number"
          min="0"
          step="1"
          class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-primary-400 dark:focus:ring-primary-400"
          placeholder="e.g., 10"
          bind:value={minCompileTime}
          oninput={applyFilters}
        />
      </div>

      <!-- Total Resources Filter -->
      <div>
        <label for="min-total-resources" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Minimum Total Resources
        </label>
        <input
          id="min-total-resources"
          type="number"
          min="0"
          step="1"
          class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-primary-400 dark:focus:ring-primary-400"
          placeholder="e.g., 100"
          bind:value={minTotalResources}
          oninput={applyFilters}
        />
      </div>
    </div>
  </div>
</div>
