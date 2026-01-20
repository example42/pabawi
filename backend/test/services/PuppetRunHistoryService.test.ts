import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuppetRunHistoryService } from '../../src/services/PuppetRunHistoryService';
import type { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { LoggerService } from '../../src/services/LoggerService';
import type { Report } from '../../src/integrations/puppetdb/types';

describe('PuppetRunHistoryService', () => {
  let service: PuppetRunHistoryService;
  let mockPuppetDBService: PuppetDBService;
  let mockLogger: LoggerService;

  // Helper function to create mock reports
  const createMockReport = (
    certname: string,
    status: 'unchanged' | 'changed' | 'failed',
    timestamp: string,
    startTime: string,
    endTime: string
  ): Report => ({
    certname,
    hash: `hash-${certname}-${timestamp}`,
    environment: 'production',
    status,
    noop: false,
    puppet_version: '7.0.0',
    report_format: 11,
    configuration_version: '1234567890',
    start_time: startTime,
    end_time: endTime,
    producer_timestamp: timestamp,
    receive_time: timestamp,
    transaction_uuid: `uuid-${certname}-${timestamp}`,
    metrics: {
      resources: {
        total: 100,
        skipped: 0,
        failed: status === 'failed' ? 5 : 0,
        failed_to_restart: 0,
        restarted: 0,
        changed: status === 'changed' ? 10 : 0,
        out_of_sync: 0,
        scheduled: 0,
      },
      time: {},
      changes: {
        total: status === 'changed' ? 10 : 0,
      },
      events: {
        success: status === 'failed' ? 95 : 100,
        failure: status === 'failed' ? 5 : 0,
        total: 100,
      },
    },
    logs: [],
    resource_events: [],
  });

  beforeEach(() => {
    // Create mock PuppetDB service
    mockPuppetDBService = {
      getNodeReports: vi.fn(),
      getAllReports: vi.fn(),
    } as unknown as PuppetDBService;

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as LoggerService;

    // Create service instance
    service = new PuppetRunHistoryService(mockPuppetDBService, mockLogger);
  });

  describe('getNodeHistory', () => {
    describe('date range handling', () => {
      it('should filter reports within the specified date range', async () => {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const tenDaysAgo = new Date(now);
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const reports: Report[] = [
          // Within range (3 days ago)
          createMockReport(
            'node1',
            'unchanged',
            threeDaysAgo.toISOString(),
            threeDaysAgo.toISOString(),
            new Date(threeDaysAgo.getTime() + 60000).toISOString()
          ),
          // Outside range (10 days ago)
          createMockReport(
            'node1',
            'changed',
            tenDaysAgo.toISOString(),
            tenDaysAgo.toISOString(),
            new Date(tenDaysAgo.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.nodeId).toBe('node1');
        // Should only include the report from 3 days ago
        expect(result.summary.totalRuns).toBe(1);
      });

      it('should handle custom day ranges', async () => {
        const now = new Date();
        const oneDayAgo = new Date(now);
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const fiveDaysAgo = new Date(now);
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            oneDayAgo.toISOString(),
            oneDayAgo.toISOString(),
            new Date(oneDayAgo.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            fiveDaysAgo.toISOString(),
            fiveDaysAgo.toISOString(),
            new Date(fiveDaysAgo.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        // Request only 3 days of history
        const result = await service.getNodeHistory('node1', 3);

        // Should only include the report from 1 day ago
        expect(result.summary.totalRuns).toBe(1);
      });

      it('should default to 7 days when no days parameter provided', async () => {
        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue([]);

        await service.getNodeHistory('node1');

        // Verify it requested 7 * 10 = 70 reports (the service multiplies by 10)
        expect(mockPuppetDBService.getNodeReports).toHaveBeenCalledWith('node1', 70);
      });
    });

    describe('data aggregation', () => {
      it('should group reports by date', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 2);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.history).toHaveLength(2);
        expect(result.history[0].date).toBe(date1.toISOString().split('T')[0]);
        expect(result.history[1].date).toBe(date2.toISOString().split('T')[0]);
      });

      it('should count status types correctly', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.history[0].unchanged).toBe(1);
        expect(result.history[0].changed).toBe(1);
        expect(result.history[0].failed).toBe(1);
        expect(result.history[0].success).toBe(1); // unchanged counts as success
      });

      it('should sort history by date in ascending order', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 1);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 3);
        const date3 = new Date(now);
        date3.setDate(date3.getDate() - 2);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date3.toISOString(),
            date3.toISOString(),
            new Date(date3.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.history[0].date).toBe(date2.toISOString().split('T')[0]);
        expect(result.history[1].date).toBe(date3.toISOString().split('T')[0]);
        expect(result.history[2].date).toBe(date1.toISOString().split('T')[0]);
      });
    });

    describe('summary calculations', () => {
      it('should calculate total runs correctly', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.summary.totalRuns).toBe(3);
      });

      it('should calculate success rate correctly', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // 2 successful (unchanged + changed) out of 4 total = 50%
        expect(result.summary.successRate).toBe(50);
      });

      it('should calculate average duration correctly', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          // Duration: 60 seconds
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          // Duration: 120 seconds
          createMockReport(
            'node1',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 120000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Average: (60 + 120) / 2 = 90 seconds
        expect(result.summary.avgDuration).toBe(90);
      });

      it('should identify the last run timestamp', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 3);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);
        const date3 = new Date(now);
        date3.setDate(date3.getDate() - 5);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'changed',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date3.toISOString(),
            date3.toISOString(),
            new Date(date3.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Should be the most recent timestamp
        expect(result.summary.lastRun).toBe(date2.toISOString());
      });

      it('should round success rate to 2 decimal places', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // 1 successful out of 3 = 33.333...% -> should be 33.33
        expect(result.summary.successRate).toBe(33.33);
      });

      it('should round average duration to 2 decimal places', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          // Duration: 100 seconds
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 100000).toISOString()
          ),
          // Duration: 200 seconds
          createMockReport(
            'node1',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 200000).toISOString()
          ),
          // Duration: 150 seconds
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 150000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Average: (100 + 200 + 150) / 3 = 150 seconds
        expect(result.summary.avgDuration).toBe(150);
      });
    });

    describe('missing data handling', () => {
      it('should handle empty report list', async () => {
        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.nodeId).toBe('node1');
        expect(result.history).toEqual([]);
        expect(result.summary.totalRuns).toBe(0);
        expect(result.summary.successRate).toBe(0);
        expect(result.summary.avgDuration).toBe(0);
        expect(result.summary.lastRun).toBeDefined();
      });

      it('should handle reports with no data in date range', async () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            tenDaysAgo.toISOString(),
            tenDaysAgo.toISOString(),
            new Date(tenDaysAgo.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 3);

        expect(result.history).toEqual([]);
        expect(result.summary.totalRuns).toBe(0);
      });

      it('should handle PuppetDB service errors', async () => {
        const error = new Error('PuppetDB connection failed');
        vi.mocked(mockPuppetDBService.getNodeReports).mockRejectedValue(error);

        await expect(service.getNodeHistory('node1', 7)).rejects.toThrow(
          'PuppetDB connection failed'
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to get run history for node 'node1'"),
          expect.objectContaining({ component: 'PuppetRunHistoryService' }),
          error
        );
      });

      it('should handle dates with different timezones', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Should normalize to YYYY-MM-DD format
        expect(result.history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('getAggregatedHistory', () => {
    describe('date range handling', () => {
      it('should filter reports within the specified date range', async () => {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const tenDaysAgo = new Date(now);
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            threeDaysAgo.toISOString(),
            threeDaysAgo.toISOString(),
            new Date(threeDaysAgo.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node2',
            'changed',
            tenDaysAgo.toISOString(),
            tenDaysAgo.toISOString(),
            new Date(tenDaysAgo.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(reports);

        const result = await service.getAggregatedHistory(7);

        // Should only include the report from 3 days ago
        expect(result).toHaveLength(1);
      });

      it('should default to 7 days when no days parameter provided', async () => {
        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);

        await service.getAggregatedHistory();

        // Verify it requested 7 * 100 = 700 reports
        expect(mockPuppetDBService.getAllReports).toHaveBeenCalledWith(700);
      });
    });

    describe('data aggregation', () => {
      it('should aggregate reports from multiple nodes', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node2',
            'changed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node3',
            'failed',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(reports);

        const result = await service.getAggregatedHistory(7);

        expect(result).toHaveLength(1);
        expect(result[0].unchanged).toBe(1);
        expect(result[0].changed).toBe(1);
        expect(result[0].failed).toBe(1);
        expect(result[0].success).toBe(1);
      });

      it('should group reports by date across multiple nodes', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 2);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node2',
            'changed',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node1',
            'failed',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node3',
            'unchanged',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(reports);

        const result = await service.getAggregatedHistory(7);

        expect(result).toHaveLength(2);
        expect(result[0].date).toBe(date1.toISOString().split('T')[0]);
        expect(result[0].unchanged).toBe(1);
        expect(result[0].changed).toBe(1);
        expect(result[1].date).toBe(date2.toISOString().split('T')[0]);
        expect(result[1].failed).toBe(1);
        expect(result[1].unchanged).toBe(1);
      });

      it('should sort aggregated history by date', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 1);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 3);
        const date3 = new Date(now);
        date3.setDate(date3.getDate() - 2);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            date1.toISOString(),
            date1.toISOString(),
            new Date(date1.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node2',
            'changed',
            date2.toISOString(),
            date2.toISOString(),
            new Date(date2.getTime() + 60000).toISOString()
          ),
          createMockReport(
            'node3',
            'failed',
            date3.toISOString(),
            date3.toISOString(),
            new Date(date3.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(reports);

        const result = await service.getAggregatedHistory(7);

        expect(result[0].date).toBe(date2.toISOString().split('T')[0]);
        expect(result[1].date).toBe(date3.toISOString().split('T')[0]);
        expect(result[2].date).toBe(date1.toISOString().split('T')[0]);
      });
    });

    describe('missing data handling', () => {
      it('should handle empty report list', async () => {
        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);

        const result = await service.getAggregatedHistory(7);

        expect(result).toEqual([]);
      });

      it('should handle reports with no data in date range', async () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const reports: Report[] = [
          createMockReport(
            'node1',
            'unchanged',
            tenDaysAgo.toISOString(),
            tenDaysAgo.toISOString(),
            new Date(tenDaysAgo.getTime() + 60000).toISOString()
          ),
        ];

        vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(reports);

        const result = await service.getAggregatedHistory(3);

        expect(result).toEqual([]);
      });

      it('should handle PuppetDB service errors', async () => {
        const error = new Error('PuppetDB connection failed');
        vi.mocked(mockPuppetDBService.getAllReports).mockRejectedValue(error);

        await expect(service.getAggregatedHistory(7)).rejects.toThrow(
          'PuppetDB connection failed'
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to get aggregated run history'),
          expect.objectContaining({ component: 'PuppetRunHistoryService' }),
          error
        );
      });
    });
  });
});
