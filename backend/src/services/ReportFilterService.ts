/**
 * ReportFilterService
 *
 * Service for filtering reports based on various criteria.
 * Supports filtering by status, minimum duration, minimum compile time,
 * and minimum total resources. All filters use AND logic when combined.
 *
 * This service is plugin-agnostic and works with any plugin that provides
 * report data through the standard Report interface.
 */

/**
 * Generic report interface for filtering
 * Plugins should provide reports that conform to this interface
 */
export interface Report {
  status: 'success' | 'failed' | 'changed' | 'unchanged';
  start_time: string;
  end_time: string;
  metrics: {
    resources: {
      total: number;
    };
    time: {
      catalog_application?: number;
    };
  };
}

/**
 * Filter criteria for reports
 */
export interface ReportFilters {
  status?: ("success" | "failed" | "changed" | "unchanged")[];
  minDuration?: number; // in seconds
  minCompileTime?: number; // in seconds
  minTotalResources?: number;
}

/**
 * Result of filter validation
 */
export interface FilterValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Service for filtering reports from any reporting plugin
 */
export class ReportFilterService {
  /**
   * Filter reports based on provided criteria
   * All filters use AND logic - a report must match ALL criteria to be included
   *
   * @param reports - Array of reports to filter
   * @param filters - Filter criteria to apply
   * @returns Filtered array of reports
   */
  filterReports(reports: Report[], filters: ReportFilters): Report[] {
    // Validate filters first
    const validation = this.validateFilters(filters);
    if (!validation.valid) {
      throw new Error(`Invalid filters: ${validation.errors.join(", ")}`);
    }

    return reports.filter((report) => {
      // Filter by status
      if (filters.status && filters.status.length > 0) {
        if (!filters.status.includes(report.status)) {
          return false;
        }
      }

      // Filter by minimum duration
      if (filters.minDuration !== undefined) {
        const duration = this.calculateDuration(report);
        if (duration < filters.minDuration) {
          return false;
        }
      }

      // Filter by minimum compile time
      if (filters.minCompileTime !== undefined) {
        const compileTime = this.getCompileTime(report);
        if (compileTime < filters.minCompileTime) {
          return false;
        }
      }

      // Filter by minimum total resources
      if (filters.minTotalResources !== undefined) {
        const totalResources = report.metrics.resources.total;
        if (totalResources < filters.minTotalResources) {
          return false;
        }
      }

      // Report matches all criteria
      return true;
    });
  }

  /**
   * Validate filter inputs
   *
   * @param filters - Filter criteria to validate
   * @returns Validation result with any errors
   */
  validateFilters(filters: ReportFilters): FilterValidation {
    const errors: string[] = [];

    // Validate status values
    if (filters.status) {
      if (!Array.isArray(filters.status)) {
        errors.push("status must be an array");
      } else {
        const validStatuses = ["success", "failed", "changed", "unchanged"];
        const invalidStatuses = filters.status.filter(
          (s) => !validStatuses.includes(s)
        );
        if (invalidStatuses.length > 0) {
          errors.push(
            `Invalid status values: ${invalidStatuses.join(", ")}. Valid values are: ${validStatuses.join(", ")}`
          );
        }
      }
    }

    // Validate minDuration
    if (filters.minDuration !== undefined) {
      if (typeof filters.minDuration !== "number") {
        errors.push("minDuration must be a number");
      } else if (filters.minDuration < 0) {
        errors.push("minDuration cannot be negative");
      } else if (!Number.isFinite(filters.minDuration)) {
        errors.push("minDuration must be a finite number");
      }
    }

    // Validate minCompileTime
    if (filters.minCompileTime !== undefined) {
      if (typeof filters.minCompileTime !== "number") {
        errors.push("minCompileTime must be a number");
      } else if (filters.minCompileTime < 0) {
        errors.push("minCompileTime cannot be negative");
      } else if (!Number.isFinite(filters.minCompileTime)) {
        errors.push("minCompileTime must be a finite number");
      }
    }

    // Validate minTotalResources
    if (filters.minTotalResources !== undefined) {
      if (typeof filters.minTotalResources !== "number") {
        errors.push("minTotalResources must be a number");
      } else if (filters.minTotalResources < 0) {
        errors.push("minTotalResources cannot be negative");
      } else if (!Number.isInteger(filters.minTotalResources)) {
        errors.push("minTotalResources must be an integer");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate report duration in seconds
   * Duration is the time between start_time and end_time
   *
   * @param report - Puppet report
   * @returns Duration in seconds
   */
  private calculateDuration(report: Report): number {
    const startTime = new Date(report.start_time).getTime();
    const endTime = new Date(report.end_time).getTime();
    return (endTime - startTime) / 1000; // Convert milliseconds to seconds
  }

  /**
   * Get compile time from report metrics
   * Compile time is stored in the time metrics under the 'catalog_application' key
   *
   * @param report - Report object
   * @returns Compile time in seconds
   */
  private getCompileTime(report: Report): number {
    // Report providers store compile time in the time metrics
    // Common keys: 'catalog_application', 'config_retrieval', 'total'
    return report.metrics.time.catalog_application || 0;
  }
}
