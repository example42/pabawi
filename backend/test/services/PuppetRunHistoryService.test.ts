import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuppetRunHistoryService, ReportProvider, Report } from '../../src/services/PuppetRunHistoryService';
import type { LoggerService } from '../../src/services/LoggerService';

describe('PuppetRunHistoryService', () => {
  let service: PuppetRunHistoryService;
  let mockReportProvider: ReportProvider;
  let mockLogger: LoggerService;

  // Helper function to create mock reports
  const createMockReport = (
    status: 'unchanged' | 'changed' | 'failed',
    timestamp: string,
    startTime: string,
    endTime: string
  ): Report => ({
    status,
    start_time: startTime,
    end_time: endTime,
    producer_timestamp: timestamp,
    metrics: {
      resources: {
        total: 100,
      },
      time: {
        catalog_application: 30,
      },
    },
  });

  beforeEach(() => {
    // Create mock report provider
    mockReportProvider = {
      getNodeReports: vi.fn(),
      getReportCountsByDateAndStatus: vi.fn(),
      getNodeReportCountsByDateAndStatus: vi.fn(),
    } as unknown as ReportProvider;

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as LoggerService;

    // Create service instance
    service = new PuppetRunHistoryService(mockReportProvider, mockLogger);
  });

  describe('getNodeHistory', () => {
    describe('date range handling', () => {
      it('should query report provider with correct date range for node', async () => {
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        await service.getNodeHistory('node1', 7);

        // Verify it called getNodeReportCountsByDateAndStatus with nodeId and date range
        expect(mockReportProvider.getNodeReportCountsByDateAndStatus).toHaveBeenCalledWith(
          'node1',
          expect.any(String), // startDate ISO string
          expect.any(String)  // endDate ISO string
        );
      });

      it('should handle custom day ranges', async () => {
        const now = new Date();
        const oneDayAgo = new Date(now);
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const oneDayAgoStr = oneDayAgo.toISOString().split('T')[0];

        // Mock aggregate counts - only data from 1 day ago
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: oneDayAgoStr, status: 'unchanged', count: 1 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        // Request only 3 days of history
        const result = await service.getNodeHistory('node1', 3);

        // Should return 4 days (today + 3 days back)
        expect(result.history.length).toBe(4);
        // Total runs from counts
        expect(result.summary.totalRuns).toBe(1);
      });

      it('should default to 7 days when no days parameter provided', async () => {
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        await service.getNodeHistory('node1');

        // Verify it called getNodeReportCountsByDateAndStatus
        expect(mockReportProvider.getNodeReportCountsByDateAndStatus).toHaveBeenCalledWith(
          'node1',
          expect.any(String),
          expect.any(String)
        );
        // Verify it fetched 10 recent reports for summary stats
        expect(mockReportProvider.getNodeReports).toHaveBeenCalledWith('node1', 10);
      });
    });

    describe('data aggregation', () => {
      it('should aggregate counts from PuppetDB response for node', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 2);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);
        const date1Str = date1.toISOString().split('T')[0];
        const date2Str = date2.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: date1Str, status: 'unchanged', count: 1 },
          { date: date1Str, status: 'changed', count: 1 },
          { date: date2Str, status: 'failed', count: 1 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // Should return 8 days (today + 7 days back), with data on 2 of them
        expect(result.history.length).toBe(8);

        // Find the entries for our specific dates
        const date1Entry = result.history.find(h => h.date === date1Str);
        const date2Entry = result.history.find(h => h.date === date2Str);

        expect(date1Entry).toBeDefined();
        expect(date2Entry).toBeDefined();
        expect(date1Entry!.unchanged).toBe(1);
        expect(date1Entry!.changed).toBe(1);
        expect(date2Entry!.failed).toBe(1);
      });

      it('should count status types correctly', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 1 },
          { date: dateStr, status: 'changed', count: 1 },
          { date: dateStr, status: 'failed', count: 1 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // Find the entry for our specific date
        const dateEntry = result.history.find(h => h.date === dateStr);

        expect(dateEntry).toBeDefined();
        expect(dateEntry!.unchanged).toBe(1);
        expect(dateEntry!.changed).toBe(1);
        expect(dateEntry!.failed).toBe(1);
        expect(dateEntry!.success).toBe(1); // unchanged counts as success
      });

      it('should sort history by date in ascending order', async () => {
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // Verify dates are sorted in ascending order
        for (let i = 1; i < result.history.length; i++) {
          expect(result.history[i].date > result.history[i - 1].date).toBe(true);
        }
      });
    });

    describe('summary calculations', () => {
      it('should calculate total runs correctly from counts', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 1 },
          { date: dateStr, status: 'changed', count: 1 },
          { date: dateStr, status: 'failed', count: 1 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.summary.totalRuns).toBe(3);
      });

      it('should calculate success rate correctly from counts', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts: 2 successful (unchanged + changed), 2 failed
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 1 },
          { date: dateStr, status: 'changed', count: 1 },
          { date: dateStr, status: 'failed', count: 2 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // 2 successful (unchanged + changed) out of 4 total = 50%
        expect(result.summary.successRate).toBe(50);
      });

      it('should calculate average duration from recent reports', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 2 },
        ]);

        // Mock recent reports for duration calculation
        const reports: Report[] = [
          // Duration: 60 seconds
          createMockReport(
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 60000).toISOString()
          ),
          // Duration: 120 seconds
          createMockReport(
            'unchanged',
            date.toISOString(),
            date.toISOString(),
            new Date(date.getTime() + 120000).toISOString()
          ),
        ];
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Average: (60 + 120) / 2 = 90 seconds
        expect(result.summary.avgDuration).toBe(90);
      });

      it('should identify the last run timestamp from recent reports', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 3);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);
        const date1Str = date1.toISOString().split('T')[0];
        const date2Str = date2.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: date1Str, status: 'unchanged', count: 1 },
          { date: date2Str, status: 'changed', count: 1 },
        ]);

        // Mock recent reports - date2 is most recent
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
        ];
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Should be the most recent timestamp
        expect(result.summary.lastRun).toBe(date2.toISOString());
      });

      it('should round success rate to 2 decimal places', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts: 1 successful, 2 failed = 33.33%
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 1 },
          { date: dateStr, status: 'failed', count: 2 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // 1 successful out of 3 = 33.333...% -> should be 33.33
        expect(result.summary.successRate).toBe(33.33);
      });

      it('should round average duration to 2 decimal places', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock aggregate counts
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 3 },
        ]);

        // Mock recent reports for duration calculation
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
            'unchanged',
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
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue(reports);

        const result = await service.getNodeHistory('node1', 7);

        // Average: (100 + 200 + 150) / 3 = 150 seconds
        expect(result.summary.avgDuration).toBe(150);
      });
    });

    describe('missing data handling', () => {
      it('should return all days with zero counts when no data', async () => {
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        expect(result.nodeId).toBe('node1');
        // Should return 8 days (today + 7 days back) with zero counts
        expect(result.history.length).toBe(8);
        result.history.forEach(day => {
          expect(day.success).toBe(0);
          expect(day.failed).toBe(0);
          expect(day.changed).toBe(0);
          expect(day.unchanged).toBe(0);
        });
        expect(result.summary.totalRuns).toBe(0);
        expect(result.summary.successRate).toBe(0);
        expect(result.summary.avgDuration).toBe(0);
        expect(result.summary.lastRun).toBeDefined();
      });

      it('should return correct day count for custom range with no data', async () => {
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 3);

        // Should return 4 days (today + 3 days back) with zero counts
        expect(result.history.length).toBe(4);
        result.history.forEach(day => {
          expect(day.success).toBe(0);
          expect(day.failed).toBe(0);
          expect(day.changed).toBe(0);
          expect(day.unchanged).toBe(0);
        });
        expect(result.summary.totalRuns).toBe(0);
      });

      it('should handle PuppetDB service errors on aggregate query', async () => {
        const error = new Error('PuppetDB connection failed');
        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockRejectedValue(error);

        await expect(service.getNodeHistory('node1', 7)).rejects.toThrow(
          'PuppetDB connection failed'
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to get run history for node 'node1'"),
          expect.objectContaining({ component: 'PuppetRunHistoryService' }),
          error
        );
      });

      it('should normalize dates to YYYY-MM-DD format', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        vi.mocked(mockReportProvider.getNodeReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 1 },
        ]);
        vi.mocked(mockReportProvider.getNodeReports).mockResolvedValue([]);

        const result = await service.getNodeHistory('node1', 7);

        // Should normalize to YYYY-MM-DD format - find the entry with data
        const dateEntry = result.history.find(h => h.date === dateStr);
        expect(dateEntry).toBeDefined();
        expect(dateEntry!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('getAggregatedHistory', () => {
    describe('date range handling', () => {
      it('should query PuppetDB with correct date range', async () => {
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([]);

        await service.getAggregatedHistory(7);

        // Verify it called getReportCountsByDateAndStatus with date range
        expect(mockReportProvider.getReportCountsByDateAndStatus).toHaveBeenCalledWith(
          expect.any(String), // startDate ISO string
          expect.any(String)  // endDate ISO string
        );
      });

      it('should return all days in range even with no data', async () => {
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([]);

        const result = await service.getAggregatedHistory(7);

        // Should return 8 days (today + 7 days back) with zero counts
        expect(result.length).toBe(8);
        result.forEach(day => {
          expect(day.success).toBe(0);
          expect(day.failed).toBe(0);
          expect(day.changed).toBe(0);
          expect(day.unchanged).toBe(0);
        });
      });
    });

    describe('data aggregation', () => {
      it('should aggregate counts from PuppetDB response', async () => {
        const now = new Date();
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        const dateStr = date.toISOString().split('T')[0];

        // Mock PuppetDB returning counts grouped by date and status
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([
          { date: dateStr, status: 'unchanged', count: 10 },
          { date: dateStr, status: 'changed', count: 5 },
          { date: dateStr, status: 'failed', count: 2 },
        ]);

        const result = await service.getAggregatedHistory(7);

        // Should return 8 days with data on the specific date
        expect(result.length).toBe(8);

        const dateEntry = result.find(h => h.date === dateStr);
        expect(dateEntry).toBeDefined();
        expect(dateEntry!.unchanged).toBe(10);
        expect(dateEntry!.changed).toBe(5);
        expect(dateEntry!.failed).toBe(2);
        expect(dateEntry!.success).toBe(10); // unchanged counts as success
      });

      it('should handle counts across multiple dates', async () => {
        const now = new Date();
        const date1 = new Date(now);
        date1.setDate(date1.getDate() - 2);
        const date2 = new Date(now);
        date2.setDate(date2.getDate() - 1);
        const date1Str = date1.toISOString().split('T')[0];
        const date2Str = date2.toISOString().split('T')[0];

        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([
          { date: date1Str, status: 'unchanged', count: 5 },
          { date: date1Str, status: 'changed', count: 3 },
          { date: date2Str, status: 'failed', count: 1 },
          { date: date2Str, status: 'unchanged', count: 8 },
        ]);

        const result = await service.getAggregatedHistory(7);

        // Should return 8 days with data on 2 specific dates
        expect(result.length).toBe(8);

        const date1Entry = result.find(h => h.date === date1Str);
        const date2Entry = result.find(h => h.date === date2Str);

        expect(date1Entry).toBeDefined();
        expect(date1Entry!.unchanged).toBe(5);
        expect(date1Entry!.changed).toBe(3);

        expect(date2Entry).toBeDefined();
        expect(date2Entry!.failed).toBe(1);
        expect(date2Entry!.unchanged).toBe(8);
      });

      it('should sort history by date in ascending order', async () => {
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([]);

        const result = await service.getAggregatedHistory(7);

        // Verify dates are sorted in ascending order
        for (let i = 1; i < result.length; i++) {
          expect(result[i].date > result[i - 1].date).toBe(true);
        }
      });
    });

    describe('missing data handling', () => {
      it('should return all days with zero counts when report list is empty', async () => {
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockResolvedValue([]);

        const result = await service.getAggregatedHistory(7);

        // Should return 8 days (today + 7 days back) with zero counts
        expect(result.length).toBe(8);
        result.forEach(day => {
          expect(day.success).toBe(0);
          expect(day.failed).toBe(0);
          expect(day.changed).toBe(0);
          expect(day.unchanged).toBe(0);
        });
      });

      it('should handle PuppetDB service errors', async () => {
        const error = new Error('PuppetDB connection failed');
        vi.mocked(mockReportProvider.getReportCountsByDateAndStatus).mockRejectedValue(error);

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
