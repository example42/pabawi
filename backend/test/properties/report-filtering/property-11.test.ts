/**
 * Feature: pabawi-v0.5.0-release, Property 11: Report Filter Correctness
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * This property test verifies that:
 * For any combination of report filters (status, minDuration, minCompileTime, minTotalResources),
 * all returned reports should satisfy ALL applied filter criteria.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ReportFilterService, ReportFilters, Report } from '../../../src/services/ReportFilterService';

describe('Property 11: Report Filter Correctness', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  const service = new ReportFilterService();

  // Generator for valid report status values (matching Report type)
  const statusArb = fc.constantFrom('unchanged', 'changed', 'failed') as fc.Arbitrary<'unchanged' | 'changed' | 'failed'>;

  // Generator for a single report
  const reportArb = fc.record({
    status: statusArb,
    start_time: fc.integer({ min: 1704067200000, max: 1735689600000 }), // 2024-01-01 to 2025-01-01 in ms
    duration_ms: fc.integer({ min: 1000, max: 600000 }), // 1 second to 10 minutes
    metrics: fc.record({
      resources: fc.record({
        total: fc.integer({ min: 0, max: 1000 }),
      }),
      time: fc.record({
        catalog_application: fc.float({ min: 0, max: 300, noNaN: true }),
      }),
    }),
  }).map(report => {
    // Convert timestamps to ISO strings and ensure end_time is after start_time
    const startTime = new Date(report.start_time);
    const endTime = new Date(report.start_time + report.duration_ms);

    return {
      status: report.status,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      metrics: report.metrics,
    } as Report;
  });

  // Generator for valid filter combinations
  const filterArb = fc.record({
    status: fc.option(fc.array(statusArb, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]), { nil: undefined }),
    minDuration: fc.option(fc.float({ min: 0, max: 300, noNaN: true }), { nil: undefined }),
    minCompileTime: fc.option(fc.float({ min: 0, max: 200, noNaN: true }), { nil: undefined }),
    minTotalResources: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  });

  it('should only return reports that match ALL filter criteria (status filter)', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        fc.array(statusArb, { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]),
        (reports, statusFilter) => {
          const filters: ReportFilters = { status: statusFilter };
          const filtered = service.filterReports(reports, filters);

          // All filtered reports must have a status in the filter list
          return filtered.every(report => statusFilter.includes(report.status));
        }
      ),
      propertyTestConfig
    );
  });

  it('should only return reports that match ALL filter criteria (minDuration filter)', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (reports, minDuration) => {
          const filters: ReportFilters = { minDuration };
          const filtered = service.filterReports(reports, filters);

          // All filtered reports must have duration >= minDuration
          return filtered.every(report => {
            const startTime = new Date(report.start_time).getTime();
            const endTime = new Date(report.end_time).getTime();
            const duration = (endTime - startTime) / 1000;
            return duration >= minDuration;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should only return reports that match ALL filter criteria (minCompileTime filter)', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (reports, minCompileTime) => {
          const filters: ReportFilters = { minCompileTime };
          const filtered = service.filterReports(reports, filters);

          // All filtered reports must have compile time >= minCompileTime
          return filtered.every(report => {
            const compileTime = report.metrics.time.catalog_application || 0;
            return compileTime >= minCompileTime;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should only return reports that match ALL filter criteria (minTotalResources filter)', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        fc.integer({ min: 0, max: 500 }),
        (reports, minTotalResources) => {
          const filters: ReportFilters = { minTotalResources };
          const filtered = service.filterReports(reports, filters);

          // All filtered reports must have total resources >= minTotalResources
          return filtered.every(report => {
            return report.metrics.resources.total >= minTotalResources;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should only return reports that match ALL filter criteria (combined filters)', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 20, maxLength: 100 }),
        filterArb,
        (reports, filters) => {
          // Skip if no filters are applied
          if (!filters.status && filters.minDuration === undefined &&
              filters.minCompileTime === undefined && filters.minTotalResources === undefined) {
            return true;
          }

          const filtered = service.filterReports(reports, filters);

          // All filtered reports must satisfy ALL filter criteria
          return filtered.every(report => {
            // Check status filter
            if (filters.status && filters.status.length > 0) {
              if (!filters.status.includes(report.status)) {
                return false;
              }
            }

            // Check minDuration filter
            if (filters.minDuration !== undefined) {
              const startTime = new Date(report.start_time).getTime();
              const endTime = new Date(report.end_time).getTime();
              const duration = (endTime - startTime) / 1000;
              if (duration < filters.minDuration) {
                return false;
              }
            }

            // Check minCompileTime filter
            if (filters.minCompileTime !== undefined) {
              const compileTime = report.metrics.time.catalog_application || 0;
              if (compileTime < filters.minCompileTime) {
                return false;
              }
            }

            // Check minTotalResources filter
            if (filters.minTotalResources !== undefined) {
              if (report.metrics.resources.total < filters.minTotalResources) {
                return false;
              }
            }

            return true;
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should return empty array when no reports match the filter criteria', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        (reports) => {
          // Create a filter that is impossible to match
          const maxTotalResources = Math.max(...reports.map(r => r.metrics.resources.total));
          const filters: ReportFilters = { minTotalResources: maxTotalResources + 1000 };

          const filtered = service.filterReports(reports, filters);

          // Should return empty array
          return filtered.length === 0;
        }
      ),
      propertyTestConfig
    );
  });

  it('should return all reports when filters match all reports', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        (reports) => {
          // Create a filter that matches all reports
          const minTotalResources = Math.min(...reports.map(r => r.metrics.resources.total));
          const filters: ReportFilters = { minTotalResources: minTotalResources };

          const filtered = service.filterReports(reports, filters);

          // Should return all reports
          return filtered.length === reports.length;
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain report order after filtering', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        filterArb,
        (reports, filters) => {
          // Skip if no filters are applied
          if (!filters.status && filters.minDuration === undefined &&
              filters.minCompileTime === undefined && filters.minTotalResources === undefined) {
            return true;
          }

          const filtered = service.filterReports(reports, filters);

          // Check that filtered reports maintain their relative order from original array
          // We track indices to verify order preservation
          const originalIndices = filtered.map(filteredReport => {
            // Find the index in the original array
            return reports.indexOf(filteredReport);
          });

          // Check that indices are in ascending order
          for (let i = 1; i < originalIndices.length; i++) {
            if (originalIndices[i] <= originalIndices[i - 1]) {
              return false;
            }
          }

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should be idempotent - filtering twice should produce same result', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        filterArb,
        (reports, filters) => {
          // Skip if no filters are applied
          if (!filters.status && filters.minDuration === undefined &&
              filters.minCompileTime === undefined && filters.minTotalResources === undefined) {
            return true;
          }

          const filtered1 = service.filterReports(reports, filters);
          const filtered2 = service.filterReports(filtered1, filters);

          // Filtering twice should produce the same result
          return filtered1.length === filtered2.length &&
                 filtered1.every((report, index) => report === filtered2[index]);
        }
      ),
      propertyTestConfig
    );
  });

  it('should throw error for invalid filter values', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 5, maxLength: 20 }),
        fc.oneof(
          fc.constant({ minDuration: -1 }),
          fc.constant({ minCompileTime: -5 }),
          fc.constant({ minTotalResources: -10 }),
          fc.constant({ minTotalResources: 1.5 }), // Non-integer
          fc.constant({ status: ['invalid_status'] as any }),
        ),
        (reports, invalidFilter) => {
          // Should throw an error for invalid filters
          expect(() => service.filterReports(reports, invalidFilter)).toThrow();
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle edge case of zero values in filters', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 10, maxLength: 50 }),
        (reports) => {
          const filters: ReportFilters = {
            minDuration: 0,
            minCompileTime: 0,
            minTotalResources: 0,
          };

          const filtered = service.filterReports(reports, filters);

          // All reports should pass (zero is minimum valid value)
          return filtered.length === reports.length;
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle empty report array', () => {
    fc.assert(
      fc.property(
        filterArb,
        (filters) => {
          const filtered = service.filterReports([], filters);

          // Should return empty array
          return filtered.length === 0;
        }
      ),
      propertyTestConfig
    );
  });

  it('should correctly apply AND logic for multiple filters', () => {
    fc.assert(
      fc.property(
        fc.array(reportArb, { minLength: 20, maxLength: 100 }),
        fc.array(statusArb, { minLength: 1, maxLength: 2 }).map(arr => [...new Set(arr)]),
        fc.float({ min: 5, max: 50, noNaN: true }),
        (reports, statusFilter, minDuration) => {
          const filters: ReportFilters = {
            status: statusFilter,
            minDuration: minDuration,
          };

          const filtered = service.filterReports(reports, filters);

          // Manually filter to verify AND logic
          const manuallyFiltered = reports.filter(report => {
            const startTime = new Date(report.start_time).getTime();
            const endTime = new Date(report.end_time).getTime();
            const duration = (endTime - startTime) / 1000;

            return statusFilter.includes(report.status) && duration >= minDuration;
          });

          // Results should match
          return filtered.length === manuallyFiltered.length &&
                 filtered.every((report, index) => report === manuallyFiltered[index]);
        }
      ),
      propertyTestConfig
    );
  });
});
