<script lang="ts">
  /**
   * PaginationControls Component
   *
   * Reusable pagination control component for navigating through paginated data.
   * Provides Previous/Next buttons, page indicator, page size selector, and results count.
   */

  interface Props {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
  }

  let {
    currentPage,
    pageSize,
    totalCount,
    hasMore,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [100, 200, 500]
  }: Props = $props();

  // Calculate derived values
  const totalPages = $derived(Math.ceil(totalCount / pageSize));
  const startIndex = $derived((currentPage - 1) * pageSize + 1);
  const endIndex = $derived(Math.min(currentPage * pageSize, totalCount));
  const hasPrevious = $derived(currentPage > 1);
  const hasNext = $derived(hasMore || currentPage < totalPages);

  function handlePrevious(): void {
    if (hasPrevious) {
      onPageChange(currentPage - 1);
    }
  }

  function handleNext(): void {
    if (hasNext) {
      onPageChange(currentPage + 1);
    }
  }

  function handlePageSizeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newSize = parseInt(target.value, 10);
    onPageSizeChange(newSize);
  }

  function handleKeyDown(event: KeyboardEvent, action: () => void): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }
</script>

<div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
  <!-- Left side: Previous/Next buttons and page indicator -->
  <div class="flex items-center gap-4">
    <!-- Previous Button -->
    <button
      type="button"
      onclick={handlePrevious}
      disabled={!hasPrevious}
      class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label="Go to previous page"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Previous
    </button>

    <!-- Page Indicator -->
    <div class="text-sm text-gray-700 dark:text-gray-300">
      Page <span class="font-medium">{currentPage}</span>
      {#if totalPages > 0}
        of <span class="font-medium">{totalPages}</span>
      {/if}
    </div>

    <!-- Next Button -->
    <button
      type="button"
      onclick={handleNext}
      disabled={!hasNext}
      class="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label="Go to next page"
    >
      Next
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <!-- Right side: Results count and page size selector -->
  <div class="flex items-center gap-4">
    <!-- Results Count -->
    {#if totalCount > 0}
      <div class="text-sm text-gray-700 dark:text-gray-300">
        Showing <span class="font-medium">{startIndex}</span>-<span class="font-medium">{endIndex}</span> of <span class="font-medium">{totalCount}</span>
      </div>
    {/if}

    <!-- Page Size Selector -->
    <div class="flex items-center gap-2">
      <label for="page-size-select" class="text-sm text-gray-700 dark:text-gray-300">
        Per page:
      </label>
      <select
        id="page-size-select"
        value={pageSize}
        onchange={handlePageSizeChange}
        class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        aria-label="Select page size"
      >
        {#each pageSizeOptions as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </div>
  </div>
</div>
