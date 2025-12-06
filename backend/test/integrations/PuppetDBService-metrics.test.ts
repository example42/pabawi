/**
 * Tests for PuppetDB metrics parsing
 *
 * Validates that metrics are correctly parsed from PuppetDB report responses
 * in both array format (older) and object format (newer).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';

describe('PuppetDBService - Metrics Parsing', () => {
  let service: PuppetDBService;

  beforeEach(() => {
    service = new PuppetDBService();
  });

  describe('transformReport metrics parsing', () => {
    it('should parse metrics in object format with data array (current PuppetDB format)', () => {
      // Sample report with metrics in object format (as returned by current PuppetDB)
      const reportData = {
        certname: 'test-node.example.com',
        hash: 'abc123',
        environment: 'production',
        status: 'changed',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567890',
        start_time: '2024-01-15T10:00:00.000Z',
        end_time: '2024-01-15T10:01:30.000Z',
        producer_timestamp: '2024-01-15T10:01:30.000Z',
        receive_time: '2024-01-15T10:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        metrics: {
          data: [
            { name: 'total', value: 2153, category: 'resources' },
            { name: 'changed', value: 23, category: 'resources' },
            { name: 'failed', value: 0, category: 'resources' },
            { name: 'skipped', value: 0, category: 'resources' },
            { name: 'failed_to_restart', value: 0, category: 'resources' },
            { name: 'restarted', value: 0, category: 'resources' },
            { name: 'out_of_sync', value: 23, category: 'resources' },
            { name: 'scheduled', value: 0, category: 'resources' },
            { name: 'total', value: 62.32, category: 'time' },
            { name: 'config_retrieval', value: 20.62, category: 'time' },
            { name: 'catalog_application', value: 26.19, category: 'time' },
            { name: 'total', value: 23, category: 'changes' },
            { name: 'success', value: 23, category: 'events' },
            { name: 'failure', value: 0, category: 'events' },
            { name: 'total', value: 23, category: 'events' },
          ],
          href: '/pdb/query/v4/reports/abc123/metrics',
        },
        logs: [],
        resource_events: [],
      };

      // Access private method through type assertion
      const report = (service as any).transformReport(reportData);

      // Verify metrics are correctly parsed
      expect(report.metrics.resources.total).toBe(2153);
      expect(report.metrics.resources.changed).toBe(23);
      expect(report.metrics.resources.failed).toBe(0);
      expect(report.metrics.resources.skipped).toBe(0);
      expect(report.metrics.resources.out_of_sync).toBe(23);

      expect(report.metrics.time.total).toBe(62.32);
      expect(report.metrics.time.config_retrieval).toBe(20.62);
      expect(report.metrics.time.catalog_application).toBe(26.19);

      expect(report.metrics.changes.total).toBe(23);

      expect(report.metrics.events.success).toBe(23);
      expect(report.metrics.events.failure).toBe(0);
      expect(report.metrics.events.total).toBe(23);
    });

    it('should parse metrics in direct array format (older PuppetDB format)', () => {
      // Sample report with metrics in direct array format (older PuppetDB versions)
      const reportData = {
        certname: 'test-node.example.com',
        hash: 'abc123',
        environment: 'production',
        status: 'changed',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567890',
        start_time: '2024-01-15T10:00:00.000Z',
        end_time: '2024-01-15T10:01:30.000Z',
        producer_timestamp: '2024-01-15T10:01:30.000Z',
        receive_time: '2024-01-15T10:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        metrics: [
          { name: 'total', value: 47, category: 'resources' },
          { name: 'changed', value: 5, category: 'resources' },
          { name: 'failed', value: 0, category: 'resources' },
          { name: 'skipped', value: 0, category: 'resources' },
          { name: 'failed_to_restart', value: 0, category: 'resources' },
          { name: 'restarted', value: 1, category: 'resources' },
          { name: 'out_of_sync', value: 5, category: 'resources' },
          { name: 'scheduled', value: 0, category: 'resources' },
          { name: 'total', value: 45.3, category: 'time' },
          { name: 'config_retrieval', value: 2.1, category: 'time' },
          { name: 'catalog_application', value: 43.2, category: 'time' },
          { name: 'total', value: 5, category: 'changes' },
          { name: 'success', value: 5, category: 'events' },
          { name: 'failure', value: 0, category: 'events' },
          { name: 'total', value: 5, category: 'events' },
        ],
        logs: [],
        resource_events: [],
      };

      // Access private method through type assertion
      const report = (service as any).transformReport(reportData);

      // Verify metrics are correctly parsed
      expect(report.metrics.resources.total).toBe(47);
      expect(report.metrics.resources.changed).toBe(5);
      expect(report.metrics.resources.failed).toBe(0);
      expect(report.metrics.resources.restarted).toBe(1);
      expect(report.metrics.resources.out_of_sync).toBe(5);

      expect(report.metrics.time.total).toBe(45.3);
      expect(report.metrics.time.config_retrieval).toBe(2.1);
      expect(report.metrics.time.catalog_application).toBe(43.2);

      expect(report.metrics.changes.total).toBe(5);

      expect(report.metrics.events.success).toBe(5);
      expect(report.metrics.events.failure).toBe(0);
      expect(report.metrics.events.total).toBe(5);
    });

    it('should handle missing metrics gracefully', () => {
      const reportData = {
        certname: 'test-node.example.com',
        hash: 'abc123',
        environment: 'production',
        status: 'unchanged',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567890',
        start_time: '2024-01-15T10:00:00.000Z',
        end_time: '2024-01-15T10:01:30.000Z',
        producer_timestamp: '2024-01-15T10:01:30.000Z',
        receive_time: '2024-01-15T10:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        metrics: null, // No metrics
        logs: [],
        resource_events: [],
      };

      // Access private method through type assertion
      const report = (service as any).transformReport(reportData);

      // Verify default values are used
      expect(report.metrics.resources.total).toBe(0);
      expect(report.metrics.resources.changed).toBe(0);
      expect(report.metrics.resources.failed).toBe(0);
      expect(report.metrics.changes.total).toBe(0);
      expect(report.metrics.events.total).toBe(0);
    });

    it('should handle empty metrics array gracefully', () => {
      const reportData = {
        certname: 'test-node.example.com',
        hash: 'abc123',
        environment: 'production',
        status: 'unchanged',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567890',
        start_time: '2024-01-15T10:00:00.000Z',
        end_time: '2024-01-15T10:01:30.000Z',
        producer_timestamp: '2024-01-15T10:01:30.000Z',
        receive_time: '2024-01-15T10:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        metrics: {
          data: [], // Empty metrics
          href: '/pdb/query/v4/reports/abc123/metrics',
        },
        logs: [],
        resource_events: [],
      };

      // Access private method through type assertion
      const report = (service as any).transformReport(reportData);

      // Verify default values are used
      expect(report.metrics.resources.total).toBe(0);
      expect(report.metrics.resources.changed).toBe(0);
      expect(report.metrics.resources.failed).toBe(0);
      expect(report.metrics.changes.total).toBe(0);
      expect(report.metrics.events.total).toBe(0);
    });

    it('should handle metrics with only href reference (before fetching)', () => {
      // This tests the case where PuppetDB returns only an href reference
      // The getNodeReports method will fetch the actual data, but transformReport
      // should handle this case gracefully if called before the fetch
      const reportData = {
        certname: 'test-node.example.com',
        hash: 'abc123',
        environment: 'production',
        status: 'changed',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567890',
        start_time: '2024-01-15T10:00:00.000Z',
        end_time: '2024-01-15T10:01:30.000Z',
        producer_timestamp: '2024-01-15T10:01:30.000Z',
        receive_time: '2024-01-15T10:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440000',
        metrics: {
          href: '/pdb/query/v4/reports/abc123/metrics',
          // No data field - just the reference
        },
        logs: [],
        resource_events: [],
      };

      // Access private method through type assertion
      const report = (service as any).transformReport(reportData);

      // Verify default values are used when only href is present
      expect(report.metrics.resources.total).toBe(0);
      expect(report.metrics.resources.changed).toBe(0);
      expect(report.metrics.resources.failed).toBe(0);
      expect(report.metrics.changes.total).toBe(0);
      expect(report.metrics.events.total).toBe(0);
    });
  });
});
