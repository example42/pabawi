// Report filter state management with session persistence

const STORAGE_KEY = "pabawi_report_filters";

export interface ReportFilters {
  status?: ('unchanged' | 'changed' | 'failed')[];
  minDuration?: number;
  minCompileTime?: number;
  minTotalResources?: number;
}

class ReportFilterStore {
  filters = $state<ReportFilters>({});

  constructor() {
    // Load from sessionStorage on initialization
    this.loadFromSession();
  }

  /**
   * Set an individual filter value
   */
  setFilter(key: keyof ReportFilters, value: unknown): void {
    // Type-safe assignment based on key
    if (key === 'status' && (Array.isArray(value) || value === undefined)) {
      this.filters[key] = value as ('unchanged' | 'changed' | 'failed')[] | undefined;
    } else if ((key === 'minDuration' || key === 'minCompileTime' || key === 'minTotalResources') &&
               (typeof value === 'number' || value === undefined)) {
      this.filters[key] = value as number | undefined;
    }

    this.persistToSession();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filters = {};
    this.persistToSession();
  }

  /**
   * Get current filter state
   */
  getFilters(): ReportFilters {
    return { ...this.filters };
  }

  /**
   * Persist filters to sessionStorage (not localStorage)
   */
  private persistToSession(): void {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.filters));
    }
  }

  /**
   * Load filters from sessionStorage on initialization
   */
  private loadFromSession(): void {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Validate the parsed data structure
          if (typeof parsed === 'object' && parsed !== null) {
            this.filters = parsed as ReportFilters;
          }
        } catch (error) {
          // If parsing fails, start with empty filters
          console.warn('Failed to parse stored report filters:', error);
          this.filters = {};
        }
      }
    }
  }
}

// Export singleton instance for use across components
export const reportFilters = new ReportFilterStore();
