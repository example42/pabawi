import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createPuppetDBRouter } from "../../src/routes/integrations/puppetdb";
import { PuppetDBService } from "../../src/integrations/puppetdb/PuppetDBService";
import { expertModeMiddleware } from "../../src/middleware/expertMode";
import type { Report } from "../../src/integrations/puppetdb/types";

describe("PuppetDB Reports Filtering", () => {
  let app: Express;
  let mockPuppetDBService: PuppetDBService;

  // Mock reports with different characteristics for filtering
  const mockReports: Report[] = [
    {
      certname: "node1.example.com",
      hash: "hash1",
      status: "success",
      start_time: "2024-01-19T10:00:00Z",
      end_time: "2024-01-19T10:05:00Z", // 300 seconds duration
      metrics: {
        resources: { total: 100 },
        time: { catalog_application: 20 },
      },
    },
    {
      certname: "node2.example.com",
      hash: "hash2",
      status: "failed",
      start_time: "2024-01-19T10:00:00Z",
      end_time: "2024-01-19T10:10:00Z", // 600 seconds duration
      metrics: {
        resources: { total: 200 },
        time: { catalog_application: 40 },
      },
    },
    {
      certname: "node3.example.com",
      hash: "hash3",
      status: "changed",
      start_time: "2024-01-19T10:00:00Z",
      end_time: "2024-01-19T10:02:00Z", // 120 seconds duration
      metrics: {
        resources: { total: 50 },
        time: { catalog_application: 10 },
      },
    },
    {
      certname: "node4.example.com",
      hash: "hash4",
      status: "unchanged",
      start_time: "2024-01-19T10:00:00Z",
      end_time: "2024-01-19T10:08:00Z", // 480 seconds duration
      metrics: {
        resources: { total: 150 },
        time: { catalog_application: 30 },
      },
    },
  ] as Report[];

  beforeAll(() => {
    // Create mock PuppetDB service
    mockPuppetDBService = {
      isInitialized: () => true,
      getAllReports: async () => mockReports,
    } as unknown as PuppetDBService;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(expertModeMiddleware);
    app.use("/api/integrations/puppetdb", createPuppetDBRouter(mockPuppetDBService));
  });

  describe("GET /api/integrations/puppetdb/reports", () => {
    it("should return all reports when no filters are applied", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports")
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.reports).toBeDefined();
      expect(response.body.reports).toHaveLength(4);
      expect(response.body.count).toBe(4);
      expect(response.body.totalCount).toBe(4);
      expect(response.body.filtersApplied).toBe(false);
    });

    it("should filter reports by single status", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=failed")
        .expect(200);

      expect(response.body.reports).toHaveLength(1);
      expect(response.body.reports[0].status).toBe("failed");
      expect(response.body.count).toBe(1);
      expect(response.body.totalCount).toBe(4);
      expect(response.body.filtersApplied).toBe(true);
    });

    it("should filter reports by multiple statuses", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=success,failed")
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.totalCount).toBe(4);
      expect(response.body.filtersApplied).toBe(true);

      const statuses = response.body.reports.map((r: Report) => r.status);
      expect(statuses).toContain("success");
      expect(statuses).toContain("failed");
    });

    it("should filter reports by minimum duration", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?minDuration=400")
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.filtersApplied).toBe(true);

      // Should include reports with 480s and 600s duration
      const certnames = response.body.reports.map((r: Report) => r.certname);
      expect(certnames).toContain("node2.example.com"); // 600s
      expect(certnames).toContain("node4.example.com"); // 480s
    });

    it("should filter reports by minimum compile time", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?minCompileTime=25")
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.filtersApplied).toBe(true);

      // Should include reports with 30s and 40s compile time
      const certnames = response.body.reports.map((r: Report) => r.certname);
      expect(certnames).toContain("node2.example.com"); // 40s
      expect(certnames).toContain("node4.example.com"); // 30s
    });

    it("should filter reports by minimum total resources", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?minTotalResources=100")
        .expect(200);

      expect(response.body.reports).toHaveLength(3);
      expect(response.body.count).toBe(3);
      expect(response.body.filtersApplied).toBe(true);

      // Should exclude node3 with 50 resources
      const certnames = response.body.reports.map((r: Report) => r.certname);
      expect(certnames).not.toContain("node3.example.com");
    });

    it("should apply multiple filters with AND logic", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=failed,unchanged&minDuration=400")
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.filtersApplied).toBe(true);

      // Should include node2 (failed, 600s) and node4 (unchanged, 480s)
      const certnames = response.body.reports.map((r: Report) => r.certname);
      expect(certnames).toContain("node2.example.com");
      expect(certnames).toContain("node4.example.com");
    });

    it("should return empty array when no reports match filters", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=failed&minDuration=1000")
        .expect(200);

      expect(response.body.reports).toHaveLength(0);
      expect(response.body.count).toBe(0);
      expect(response.body.totalCount).toBe(4);
      expect(response.body.filtersApplied).toBe(true);
    });

    it("should return 400 for invalid status values", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=invalid-status")
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("INVALID_FILTERS");
      expect(response.body.error.message).toContain("Invalid status values");
    });

    it("should return 400 for negative duration", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?minDuration=-100")
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("INVALID_FILTERS");
      expect(response.body.error.message).toContain("minDuration cannot be negative");
    });

    it("should include filter metadata in debug info when expert mode is enabled", async () => {
      const response = await request(app)
        .get("/api/integrations/puppetdb/reports?status=failed&minDuration=400")
        .set("X-Expert-Mode", "true")
        .expect(200);

      expect(response.body._debug).toBeDefined();
      expect(response.body._debug.metadata).toBeDefined();
      expect(response.body._debug.metadata.filtersApplied).toBe(true);
      expect(response.body._debug.metadata.filters).toBeDefined();
      expect(response.body._debug.metadata.filters.status).toEqual(["failed"]);
      expect(response.body._debug.metadata.filters.minDuration).toBe(400);
      expect(response.body._debug.metadata.totalReports).toBe(4);
      expect(response.body._debug.metadata.filteredReports).toBe(1);
    });
  });
});
