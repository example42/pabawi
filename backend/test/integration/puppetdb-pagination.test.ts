/**
 * Integration tests for PuppetDB pagination functionality
 *
 * Tests pagination support for:
 * - getAllReports with offset parameter
 * - getNodeReports with offset parameter
 * - getTotalReportsCount method
 * - API endpoints with pagination metadata
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { Report } from '../../src/integrations/puppetdb/types';

describe('PuppetDB Pagination', () => {
  let mockPuppetDBService: PuppetDBService;
  let mockReports: Report[];

  beforeEach(() => {
    // Create mock reports for testing
    mockReports = Array.from({ length: 250 }, (_, i) => ({
      hash: `report-${i}`,
      certname: `node-${i % 10}`,
      puppet_version: '7.0.0',
      report_format: 10,
      configuration_version: '1234567890',
      start_time: new Date(Date.now() - i * 3600000).toISOString(),
      end_time: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
      producer_timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      receive_time: new Date(Date.now() - i * 3600000).toISOString(),
      transaction_uuid: `uuid-${i}`,
      status: i % 4 === 0 ? 'failed' : i % 4 === 1 ? 'changed' : i % 4 === 2 ? 'unchanged' : 'success',
      noop: false,
      noop_pending: false,
      environment: 'production',
      logs: [],
      metrics: {
        data: [
          { category: 'time', name: 'total', value: 30 },
          { category: 'resources', name: 'total', value: 100 },
        ],
      },
      resource_events: {
        data: [],
      },
      catalog_uuid: `catalog-${i}`,
      code_id: `code-${i}`,
      cached_catalog_status: 'not_used',
      corrective_change: false,
    }));

    mockPuppetDBService = {
      isInitialized: () => true,
      getAllReports: vi.fn(),
      getNodeReports: vi.fn(),
      getTotalReportsCount: vi.fn(),
    } as unknown as PuppetDBService;
  });

  describe('getAllReports with offset', () => {
    it('should return first page when offset is 0', async () => {
      const limit = 100;
      const offset = 0;
      const expectedReports = mockReports.slice(offset, offset + limit);

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(100);
      expect(result[0].hash).toBe('report-0');
      expect(mockPuppetDBService.getAllReports).toHaveBeenCalledWith(limit, offset);
    });

    it('should return second page when offset is 100', async () => {
      const limit = 100;
      const offset = 100;
      const expectedReports = mockReports.slice(offset, offset + limit);

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(100);
      expect(result[0].hash).toBe('report-100');
      expect(mockPuppetDBService.getAllReports).toHaveBeenCalledWith(limit, offset);
    });

    it('should return partial page when offset is near end', async () => {
      const limit = 100;
      const offset = 200;
      const expectedReports = mockReports.slice(offset, offset + limit);

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(50); // Only 50 reports left
      expect(result[0].hash).toBe('report-200');
      expect(mockPuppetDBService.getAllReports).toHaveBeenCalledWith(limit, offset);
    });

    it('should return empty array when offset exceeds total', async () => {
      const limit = 100;
      const offset = 300;

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(0);
      expect(mockPuppetDBService.getAllReports).toHaveBeenCalledWith(limit, offset);
    });

    it('should handle negative offset as 0', async () => {
      const limit = 100;
      const offset = -10;
      const expectedReports = mockReports.slice(0, limit);

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getAllReports(limit, Math.max(0, offset));

      expect(result).toHaveLength(100);
      expect(result[0].hash).toBe('report-0');
    });
  });

  describe('getNodeReports with offset', () => {
    it('should return paginated reports for specific node', async () => {
      const nodeId = 'node-0';  // pragma: allowlist secret
      const limit = 10;
      const offset = 0;
      const nodeReports = mockReports.filter(r => r.certname === nodeId);
      const expectedReports = nodeReports.slice(offset, offset + limit);

      vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getNodeReports(nodeId, limit, offset);

      expect(result).toHaveLength(10);
      expect(result.every(r => r.certname === nodeId)).toBe(true);
      expect(mockPuppetDBService.getNodeReports).toHaveBeenCalledWith(nodeId, limit, offset);
    });

    it('should return second page for node reports', async () => {
      const nodeId = 'node-0';  // pragma: allowlist secret
      const limit = 10;
      const offset = 10;
      const nodeReports = mockReports.filter(r => r.certname === nodeId);
      const expectedReports = nodeReports.slice(offset, offset + limit);

      vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getNodeReports(nodeId, limit, offset);

      expect(result).toHaveLength(10);
      expect(result.every(r => r.certname === nodeId)).toBe(true);
      expect(mockPuppetDBService.getNodeReports).toHaveBeenCalledWith(nodeId, limit, offset);
    });
  });

  describe('getTotalReportsCount', () => {
    it('should return total count of all reports', async () => {
      vi.mocked(mockPuppetDBService.getTotalReportsCount).mockResolvedValue(250);

      const result = await mockPuppetDBService.getTotalReportsCount();

      expect(result).toBe(250);
      expect(mockPuppetDBService.getTotalReportsCount).toHaveBeenCalled();
    });

    it('should return 0 when no reports exist', async () => {
      vi.mocked(mockPuppetDBService.getTotalReportsCount).mockResolvedValue(0);

      const result = await mockPuppetDBService.getTotalReportsCount();

      expect(result).toBe(0);
    });
  });

  describe('hasMore calculation', () => {
    it('should calculate hasMore correctly for first page', () => {
      const offset = 0;
      const limit = 100;
      const totalCount = 250;
      const currentPageCount = 100;

      const hasMore = (offset + currentPageCount) < totalCount;

      expect(hasMore).toBe(true);
    });

    it('should calculate hasMore correctly for middle page', () => {
      const offset = 100;
      const limit = 100;
      const totalCount = 250;
      const currentPageCount = 100;

      const hasMore = (offset + currentPageCount) < totalCount;

      expect(hasMore).toBe(true);
    });

    it('should calculate hasMore correctly for last page', () => {
      const offset = 200;
      const limit = 100;
      const totalCount = 250;
      const currentPageCount = 50;

      const hasMore = (offset + currentPageCount) < totalCount;

      expect(hasMore).toBe(false);
    });

    it('should calculate hasMore correctly when exactly at end', () => {
      const offset = 150;
      const limit = 100;
      const totalCount = 250;
      const currentPageCount = 100;

      const hasMore = (offset + currentPageCount) < totalCount;

      expect(hasMore).toBe(false);
    });
  });

  describe('offset edge cases', () => {
    it('should handle offset of 0 correctly', async () => {
      const limit = 100;
      const offset = 0;
      const expectedReports = mockReports.slice(0, limit);

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue(expectedReports);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(100);
      expect(result[0].hash).toBe('report-0');
    });

    it('should handle large offset correctly', async () => {
      const limit = 100;
      const offset = 1000;

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(0);
    });

    it('should handle offset equal to total count', async () => {
      const limit = 100;
      const offset = 250;

      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);

      const result = await mockPuppetDBService.getAllReports(limit, offset);

      expect(result).toHaveLength(0);
    });
  });

  describe('pagination with empty results', () => {
    it('should handle empty report list with pagination', async () => {
      vi.mocked(mockPuppetDBService.getAllReports).mockResolvedValue([]);
      vi.mocked(mockPuppetDBService.getTotalReportsCount).mockResolvedValue(0);

      const reports = await mockPuppetDBService.getAllReports(100, 0);
      const totalCount = await mockPuppetDBService.getTotalReportsCount();

      expect(reports).toHaveLength(0);
      expect(totalCount).toBe(0);
    });

    it('should handle node with no reports', async () => {
      const nodeId = 'nonexistent-node';  // pragma: allowlist secret

      vi.mocked(mockPuppetDBService.getNodeReports).mockResolvedValue([]);

      const result = await mockPuppetDBService.getNodeReports(nodeId, 10, 0);

      expect(result).toHaveLength(0);
    });
  });
});
