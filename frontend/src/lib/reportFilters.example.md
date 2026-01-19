# ReportFilterStore Usage Example

The `ReportFilterStore` provides reactive state management for Puppet report filters with session persistence.

## Basic Usage

```typescript
import { reportFilters } from '$lib/reportFilters.svelte';

// Set individual filters
reportFilters.setFilter('status', ['success', 'failed']);
reportFilters.setFilter('minDuration', 300); // seconds
reportFilters.setFilter('minCompileTime', 60); // seconds
reportFilters.setFilter('minTotalResources', 100);

// Get current filters
const currentFilters = reportFilters.getFilters();

// Clear all filters
reportFilters.clearFilters();

// Clear individual filter
reportFilters.setFilter('minDuration', undefined);
```

## Using in Svelte Components

```svelte
<script lang="ts">
  import { reportFilters } from '$lib/reportFilters.svelte';
  
  // Access reactive state directly
  $inspect(reportFilters.filters); // Svelte 5 rune for debugging
  
  function handleStatusChange(statuses: string[]) {
    reportFilters.setFilter('status', statuses);
  }
  
  function handleDurationChange(duration: number) {
    reportFilters.setFilter('minDuration', duration);
  }
  
  function clearAll() {
    reportFilters.clearFilters();
  }
</script>

<div>
  <h3>Current Filters</h3>
  <pre>{JSON.stringify(reportFilters.filters, null, 2)}</pre>
  
  <button onclick={clearAll}>Clear All Filters</button>
</div>
```

## Filter Types

```typescript
interface ReportFilters {
  status?: ('success' | 'failed' | 'changed' | 'unchanged')[];
  minDuration?: number;          // Minimum run duration in seconds
  minCompileTime?: number;       // Minimum compile time in seconds
  minTotalResources?: number;    // Minimum total resources count
}
```

## Session Persistence

- Filters are automatically persisted to `sessionStorage` (not `localStorage`)
- Filters persist across page navigation within the same browser session
- Filters are cleared when the browser tab/window is closed
- Filters are loaded automatically on store initialization

## Key Features

1. **Reactive State**: Uses Svelte 5 `$state` rune for automatic reactivity
2. **Type Safety**: Full TypeScript support with proper type checking
3. **Session Persistence**: Automatic save/load from sessionStorage
4. **Singleton Pattern**: Single shared instance across the application
5. **Immutable Getters**: `getFilters()` returns a copy to prevent accidental mutations

## Example: Filter Panel Component

```svelte
<script lang="ts">
  import { reportFilters } from '$lib/reportFilters.svelte';
  
  let selectedStatuses = $state<string[]>(reportFilters.filters.status || []);
  let minDuration = $state<number | undefined>(reportFilters.filters.minDuration);
  
  function applyFilters() {
    if (selectedStatuses.length > 0) {
      reportFilters.setFilter('status', selectedStatuses as any);
    } else {
      reportFilters.setFilter('status', undefined);
    }
    
    reportFilters.setFilter('minDuration', minDuration);
  }
</script>

<div class="filter-panel">
  <h3>Filter Reports</h3>
  
  <label>
    <input type="checkbox" bind:group={selectedStatuses} value="success" />
    Success
  </label>
  <label>
    <input type="checkbox" bind:group={selectedStatuses} value="failed" />
    Failed
  </label>
  <label>
    <input type="checkbox" bind:group={selectedStatuses} value="changed" />
    Changed
  </label>
  <label>
    <input type="checkbox" bind:group={selectedStatuses} value="unchanged" />
    Unchanged
  </label>
  
  <label>
    Min Duration (seconds):
    <input type="number" bind:value={minDuration} min="0" />
  </label>
  
  <button onclick={applyFilters}>Apply Filters</button>
  <button onclick={() => reportFilters.clearFilters()}>Clear All</button>
</div>
```

## Example: Using Filters in Report List

```svelte
<script lang="ts">
  import { reportFilters } from '$lib/reportFilters.svelte';
  import type { PuppetReport } from '$lib/types';
  
  let allReports = $state<PuppetReport[]>([]);
  
  // Computed filtered reports (reactive to filter changes)
  let filteredReports = $derived(() => {
    let reports = allReports;
    const filters = reportFilters.filters;
    
    // Apply status filter
    if (filters.status && filters.status.length > 0) {
      reports = reports.filter(r => filters.status!.includes(r.status));
    }
    
    // Apply duration filter
    if (filters.minDuration !== undefined) {
      reports = reports.filter(r => r.duration >= filters.minDuration!);
    }
    
    // Apply compile time filter
    if (filters.minCompileTime !== undefined) {
      reports = reports.filter(r => r.compileTime >= filters.minCompileTime!);
    }
    
    // Apply total resources filter
    if (filters.minTotalResources !== undefined) {
      reports = reports.filter(r => r.totalResources >= filters.minTotalResources!);
    }
    
    return reports;
  });
</script>

<div>
  <p>Showing {filteredReports.length} of {allReports.length} reports</p>
  
  {#each filteredReports as report}
    <div class="report-item">
      <!-- Report display -->
    </div>
  {/each}
</div>
```
