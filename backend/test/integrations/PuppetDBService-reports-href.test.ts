/**
 * Integration tests for PuppetDB reports with href metrics references
 *
 * Tests that getNodeReports properly handles the case where PuppetDB returns
 * metrics as href references instead of embedded data, and fetches the actual
 * metrics data from the href endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuppetDBService } from '../../src/integrations/puppetdb/PuppetDBService';
import type { IntegrationConfig } from '../../src/integrations/types';

describe('PuppetDBService - Reports with href metrics', () => {
  let service: PuppetDBService;
  let mockClient: any;

  beforeEach(() => {
    service = new PuppetDBService();

    // Create a mock client
    mockClient = {
      query: vi.fn(),
      get: vi.fn(),
      getBaseUrl: () => 'https://puppetdb.example.com:8081',
      hasAuthentication: () => true,
      hasSSL: () => true,
    };

    // Initialize the service with mock client
    const config: IntegrationConfig = {
      name: 'puppetdb',
      type: 'information',
      enabled: true,
      priority: 1,
      config: {
        serverUrl: 'https://puppetdb.example.com',
        port: 8081,
        token: 'test-token',
        ssl: {
          enabled: true,
          rejectUnauthorized: false,
        },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      },
    };

    // Inject mock client
    (service as any).config = config;
    (service as any).puppetDBConfig = config.config;
    (service as any).client = mockClient;
    (service as any).circuitBreaker = {
      execute: async (fn: () => Promise<any>) => fn(),
      getState: () => 'closed',
    };
    (service as any).retryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };
    (service as any).initialized = true; // Mark as initialized
  });

  it('should fetch metrics from href when returned as reference', async () => {
    // Mock report data with metrics as href reference
    const mockReports = [
      {
        certname: 'test-node.example.com',
        hash: 'report-hash-1',
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
          href: '/pdb/query/v4/reports/report-hash-1/metrics',
        },
        logs: [],
        resource_events: [],
      },
    ];

    // Mock metrics data that would be fetched from href
    const mockMetrics = [
      { name: 'total', value: 100, category: 'resources' },
      { name: 'changed', value: 10, category: 'resources' },
      { name: 'failed', value: 2, category: 'resources' },
      { name: 'skipped', value: 0, category: 'resources' },
      { name: 'total', value: 10, category: 'changes' },
      { name: 'success', value: 8, category: 'events' },
      { name: 'failure', value: 2, category: 'events' },
      { name: 'total', value: 10, category: 'events' },
    ];

    // Setup mock responses
    mockClient.query.mockResolvedValue(mockReports);
    mockClient.get.mockResolvedValue(mockMetrics);

    // Call getNodeReports
    const reports = await service.getNodeReports('test-node.example.com', 10);

    // Verify query was called
    expect(mockClient.query).toHaveBeenCalledWith(
      'pdb/query/v4/reports',
      '["=", "certname", "test-node.example.com"]',
      {
        limit: 10,
        order_by: '[{"field": "producer_timestamp", "order": "desc"}]',
      }
    );

    // Verify get was called to fetch metrics
    expect(mockClient.get).toHaveBeenCalledWith('/pdb/query/v4/reports/report-hash-1/metrics');

    // Verify report has correct metrics
    expect(reports).toHaveLength(1);
    expect(reports[0].metrics.resources.total).toBe(100);
    expect(reports[0].metrics.resources.changed).toBe(10);
    expect(reports[0].metrics.resources.failed).toBe(2);
    expect(reports[0].metrics.changes.total).toBe(10);
    expect(reports[0].metrics.events.success).toBe(8);
    expect(reports[0].metrics.events.failure).toBe(2);
    expect(reports[0].metrics.events.total).toBe(10);
  });

  it('should handle multiple reports with href metrics', async () => {
    // Mock multiple reports with metrics as href references
    const mockReports = [
      {
        certname: 'test-node.example.com',
        hash: 'report-hash-1',
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
          href: '/pdb/query/v4/reports/report-hash-1/metrics',
        },
        logs: [],
        resource_events: [],
      },
      {
        certname: 'test-node.example.com',
        hash: 'report-hash-2',
        environment: 'production',
        status: 'unchanged',
        noop: false,
        puppet_version: '7.12.0',
        report_format: 12,
        configuration_version: '1234567891',
        start_time: '2024-01-15T09:00:00.000Z',
        end_time: '2024-01-15T09:01:30.000Z',
        producer_timestamp: '2024-01-15T09:01:30.000Z',
        receive_time: '2024-01-15T09:01:31.000Z',
        transaction_uuid: '550e8400-e29b-41d4-a716-446655440001',
        metrics: {
          href: '/pdb/query/v4/reports/report-hash-2/metrics',
        },
        logs: [],
        resource_events: [],
      },
    ];

    // Mock metrics data for each report
    const mockMetrics1 = [
      { name: 'total', value: 100, category: 'resources' },
      { name: 'changed', value: 10, category: 'resources' },
      { name: 'failed', value: 0, category: 'resources' },
    ];

    const mockMetrics2 = [
      { name: 'total', value: 100, category: 'resources' },
      { name: 'changed', value: 0, category: 'resources' },
      { name: 'failed', value: 0, category: 'resources' },
    ];

    // Setup mock responses
    mockClient.query.mockResolvedValue(mockReports);
    mockClient.get
      .mockResolvedValueOnce(mockMetrics1)
      .mockResolvedValueOnce(mockMetrics2);

    // Call getNodeReports
    const reports = await service.getNodeReports('test-node.example.com', 10);

    // Verify get was called twice to fetch metrics for both reports
    expect(mockClient.get).toHaveBeenCalledTimes(2);
    expect(mockClient.get).toHaveBeenCalledWith('/pdb/query/v4/reports/report-hash-1/metrics');
    expect(mockClient.get).toHaveBeenCalledWith('/pdb/query/v4/reports/report-hash-2/metrics');

    // Verify both reports have correct metrics
    expect(reports).toHaveLength(2);
    expect(reports[0].metrics.resources.total).toBe(100);
    expect(reports[0].metrics.resources.changed).toBe(10);
    expect(reports[1].metrics.resources.total).toBe(100);
    expect(reports[1].metrics.resources.changed).toBe(0);
  });

  it('should handle metrics fetch failure gracefully', async () => {
    // Mock report with metrics as href reference
    const mockReports = [
      {
        certname: 'test-node.example.com',
        hash: 'report-hash-1',
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
          href: '/pdb/query/v4/reports/report-hash-1/metrics',
        },
        logs: [],
        resource_events: [],
      },
    ];

    // Setup mock responses - query succeeds but get fails
    mockClient.query.mockResolvedValue(mockReports);
    mockClient.get.mockRejectedValue(new Error('Metrics endpoint not found'));

    // Override retry config to avoid long delays
    (service as any).retryConfig = {
      maxAttempts: 1, // No retries
      initialDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
    };

    // Call getNodeReports - should not throw
    const reports = await service.getNodeReports('test-node.example.com', 10);

    // Verify report is returned with default metrics (requirement 8.4)
    expect(reports).toHaveLength(1);
    expect(reports[0].metrics.resources.total).toBe(0);
    expect(reports[0].metrics.resources.changed).toBe(0);
    expect(reports[0].metrics.resources.failed).toBe(0);
  });

  it('should handle reports with embedded metrics (no href)', async () => {
    // Mock report with embedded metrics (no href fetch needed)
    const mockReports = [
      {
        certname: 'test-node.example.com',
        hash: 'report-hash-1',
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
            { name: 'total', value: 50, category: 'resources' },
            { name: 'changed', value: 5, category: 'resources' },
            { name: 'failed', value: 0, category: 'resources' },
          ],
          href: '/pdb/query/v4/reports/report-hash-1/metrics',
        },
        logs: [],
        resource_events: [],
      },
    ];

    // Setup mock responses
    mockClient.query.mockResolvedValue(mockReports);

    // Call getNodeReports
    const reports = await service.getNodeReports('test-node.example.com', 10);

    // Verify get was NOT called since metrics are already embedded
    expect(mockClient.get).not.toHaveBeenCalled();

    // Verify report has correct metrics
    expect(reports).toHaveLength(1);
    expect(reports[0].metrics.resources.total).toBe(50);
    expect(reports[0].metrics.resources.changed).toBe(5);
    expect(reports[0].metrics.resources.failed).toBe(0);
  });
});
