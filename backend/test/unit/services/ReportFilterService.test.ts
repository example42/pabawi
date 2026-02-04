/**
 * Unit tests for ReportFilterService
 *
 * Tests filtering functionality, validation, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  ReportFilterService,
  ReportFilters,
  Report,
} from "../../../src/services/ReportFilterService";

describe("ReportFilterService", () => {
  const service = new ReportFilterService();

  // Helper function to create a test report
  const createReport = (overrides: Partial<Report> = {}): Report => ({
    status: "changed",
    start_time: "2024-01-01T10:00:00Z",
    end_time: "2024-01-01T10:05:00Z", // 5 minutes = 300 seconds
    metrics: {
      resources: {
        total: 100,
      },
      time: {
        catalog_application: 30, // 30 seconds compile time
      },
    },
    ...overrides,
  });

  describe("filterReports", () => {
    describe("status filtering", () => {
      it("should filter by single status", () => {
        const reports = [
          createReport({ status: "changed" }),
          createReport({ status: "failed" }),
          createReport({ status: "unchanged" }),
        ];

        const filtered = service.filterReports(reports, {
          status: ["changed"],
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].status).toBe("changed");
      });

      it("should filter by multiple statuses", () => {
        const reports = [
          createReport({ status: "changed" }),
          createReport({ status: "failed" }),
          createReport({ status: "unchanged" }),
        ];

        const filtered = service.filterReports(reports, {
          status: ["changed", "failed"],
        });

        expect(filtered).toHaveLength(2);
        expect(filtered.map((r) => r.status)).toEqual(
          expect.arrayContaining(["changed", "failed"])
        );
      });

      it("should return all reports when status filter is empty array", () => {
        const reports = [
          createReport({ status: "changed" }),
          createReport({ status: "failed" }),
        ];

        const filtered = service.filterReports(reports, { status: [] });

        expect(filtered).toHaveLength(2);
      });

      it("should return all reports when status filter is undefined", () => {
        const reports = [
          createReport({ status: "changed" }),
          createReport({ status: "failed" }),
        ];

        const filtered = service.filterReports(reports, {});

        expect(filtered).toHaveLength(2);
      });
    });

    describe("duration filtering", () => {
      it("should filter by minimum duration", () => {
        const reports = [
          createReport({
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:02:00Z", // 120 seconds
          }),
          createReport({
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:05:00Z", // 300 seconds
          }),
          createReport({
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:10:00Z", // 600 seconds
          }),
        ];

        const filtered = service.filterReports(reports, { minDuration: 250 });

        expect(filtered).toHaveLength(2);
        expect(filtered.every((r) => {
          const duration = (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000;
          return duration >= 250;
        })).toBe(true);
      });

      it("should include reports with duration equal to minimum", () => {
        const reports = [
          createReport({
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:05:00Z", // exactly 300 seconds
          }),
        ];

        const filtered = service.filterReports(reports, { minDuration: 300 });

        expect(filtered).toHaveLength(1);
      });

      it("should handle zero duration", () => {
        const reports = [
          createReport({
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:00:00Z", // 0 seconds
          }),
        ];

        const filtered = service.filterReports(reports, { minDuration: 0 });

        expect(filtered).toHaveLength(1);
      });
    });

    describe("compile time filtering", () => {
      it("should filter by minimum compile time", () => {
        const reports = [
          createReport({
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 10 },
            },
          }),
          createReport({
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 30 },
            },
          }),
          createReport({
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 50 },
            },
          }),
        ];

        const filtered = service.filterReports(reports, {
          minCompileTime: 25,
        });

        expect(filtered).toHaveLength(2);
        expect(
          filtered.every((r) => r.metrics.time.catalog_application >= 25)
        ).toBe(true);
      });

      it("should handle missing catalog_application time", () => {
        const reports = [
          createReport({
            metrics: {
              ...createReport().metrics,
              time: {}, // No catalog_application
            },
          }),
        ];

        const filtered = service.filterReports(reports, {
          minCompileTime: 10,
        });

        expect(filtered).toHaveLength(0);
      });
    });

    describe("total resources filtering", () => {
      it("should filter by minimum total resources", () => {
        const reports = [
          createReport({
            metrics: {
              ...createReport().metrics,
              resources: { ...createReport().metrics.resources, total: 50 },
            },
          }),
          createReport({
            metrics: {
              ...createReport().metrics,
              resources: { ...createReport().metrics.resources, total: 100 },
            },
          }),
          createReport({
            metrics: {
              ...createReport().metrics,
              resources: { ...createReport().metrics.resources, total: 150 },
            },
          }),
        ];

        const filtered = service.filterReports(reports, {
          minTotalResources: 75,
        });

        expect(filtered).toHaveLength(2);
        expect(
          filtered.every((r) => r.metrics.resources.total >= 75)
        ).toBe(true);
      });

      it("should include reports with resources equal to minimum", () => {
        const reports = [
          createReport({
            metrics: {
              ...createReport().metrics,
              resources: { ...createReport().metrics.resources, total: 100 },
            },
          }),
        ];

        const filtered = service.filterReports(reports, {
          minTotalResources: 100,
        });

        expect(filtered).toHaveLength(1);
      });
    });

    describe("combined filters (AND logic)", () => {
      it("should apply all filters with AND logic", () => {
        const reports = [
          createReport({
            status: "changed",
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:05:00Z", // 300 seconds
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 30 },
              resources: { ...createReport().metrics.resources, total: 100 },
            },
          }),
          createReport({
            status: "failed",
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:05:00Z", // 300 seconds
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 30 },
              resources: { ...createReport().metrics.resources, total: 100 },
            },
          }),
          createReport({
            status: "changed",
            start_time: "2024-01-01T10:00:00Z",
            end_time: "2024-01-01T10:02:00Z", // 120 seconds (too short)
            metrics: {
              ...createReport().metrics,
              time: { catalog_application: 30 },
              resources: { ...createReport().metrics.resources, total: 100 },
            },
          }),
        ];

        const filtered = service.filterReports(reports, {
          status: ["changed"],
          minDuration: 250,
          minCompileTime: 20,
          minTotalResources: 50,
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].status).toBe("changed");
      });

      it("should return empty array when no reports match all criteria", () => {
        const reports = [
          createReport({ status: "changed" }),
          createReport({ status: "failed" }),
        ];

        const filtered = service.filterReports(reports, {
          status: ["unchanged"], // No reports have this status
          minDuration: 100,
        });

        expect(filtered).toHaveLength(0);
      });
    });

    describe("edge cases", () => {
      it("should handle empty reports array", () => {
        const filtered = service.filterReports([], { status: ["changed"] });
        expect(filtered).toHaveLength(0);
      });

      it("should handle empty filters object", () => {
        const reports = [createReport(), createReport()];
        const filtered = service.filterReports(reports, {});
        expect(filtered).toHaveLength(2);
      });

      it("should throw error for invalid filters", () => {
        const reports = [createReport()];
        expect(() => {
          service.filterReports(reports, { minDuration: -10 });
        }).toThrow("Invalid filters");
      });
    });
  });

  describe("validateFilters", () => {
    describe("status validation", () => {
      it("should accept valid status values", () => {
        const result = service.validateFilters({
          status: ["success", "failed", "changed", "unchanged"],
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should reject invalid status values", () => {
        const result = service.validateFilters({
          status: ["invalid" as any],
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("Invalid status values");
      });

      it("should reject non-array status", () => {
        const result = service.validateFilters({
          status: "changed" as any,
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("status must be an array");
      });
    });

    describe("minDuration validation", () => {
      it("should accept valid positive duration", () => {
        const result = service.validateFilters({ minDuration: 100 });
        expect(result.valid).toBe(true);
      });

      it("should accept zero duration", () => {
        const result = service.validateFilters({ minDuration: 0 });
        expect(result.valid).toBe(true);
      });

      it("should reject negative duration", () => {
        const result = service.validateFilters({ minDuration: -10 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minDuration cannot be negative");
      });

      it("should reject non-number duration", () => {
        const result = service.validateFilters({ minDuration: "100" as any });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minDuration must be a number");
      });

      it("should reject infinite duration", () => {
        const result = service.validateFilters({ minDuration: Infinity });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minDuration must be a finite number");
      });
    });

    describe("minCompileTime validation", () => {
      it("should accept valid positive compile time", () => {
        const result = service.validateFilters({ minCompileTime: 30 });
        expect(result.valid).toBe(true);
      });

      it("should accept zero compile time", () => {
        const result = service.validateFilters({ minCompileTime: 0 });
        expect(result.valid).toBe(true);
      });

      it("should reject negative compile time", () => {
        const result = service.validateFilters({ minCompileTime: -5 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minCompileTime cannot be negative");
      });

      it("should reject non-number compile time", () => {
        const result = service.validateFilters({ minCompileTime: "30" as any });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minCompileTime must be a number");
      });

      it("should reject infinite compile time", () => {
        const result = service.validateFilters({ minCompileTime: Infinity });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minCompileTime must be a finite number");
      });
    });

    describe("minTotalResources validation", () => {
      it("should accept valid positive resources", () => {
        const result = service.validateFilters({ minTotalResources: 100 });
        expect(result.valid).toBe(true);
      });

      it("should accept zero resources", () => {
        const result = service.validateFilters({ minTotalResources: 0 });
        expect(result.valid).toBe(true);
      });

      it("should reject negative resources", () => {
        const result = service.validateFilters({ minTotalResources: -10 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minTotalResources cannot be negative");
      });

      it("should reject non-integer resources", () => {
        const result = service.validateFilters({ minTotalResources: 10.5 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minTotalResources must be an integer");
      });

      it("should reject non-number resources", () => {
        const result = service.validateFilters({
          minTotalResources: "100" as any,
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("minTotalResources must be a number");
      });
    });

    describe("multiple validation errors", () => {
      it("should return all validation errors", () => {
        const result = service.validateFilters({
          status: ["invalid" as any],
          minDuration: -10,
          minCompileTime: "not-a-number" as any,
          minTotalResources: 10.5,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(4);
      });
    });

    describe("empty filters", () => {
      it("should accept empty filters object", () => {
        const result = service.validateFilters({});
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});
