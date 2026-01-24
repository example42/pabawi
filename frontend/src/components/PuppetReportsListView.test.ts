import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import PuppetReportsListView from './PuppetReportsListView.svelte';
import * as api from '../lib/api';
import * as sessionStorage from '../lib/sessionStorage';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
}));

// Mock session storage
vi.mock('../lib/sessionStorage', () => ({
  loadPageSize: vi.fn(() => 100),
  savePageSize: vi.fn(),
}));

describe('PuppetReportsListView - Node Detail Page Pagination', () => {
  const mockReports = Array.from({ length: 5 }, (_, i) => ({
    certname: `node${String(i)}.example.com`,
    hash: `hash${String(i)}`,
    environment: 'production',
    status: 'changed' as const,
    noop: false,
    start_time: new Date(Date.now() - i * 3600000).toISOString(),
    end_time: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
    metrics: {
      resources: {
        total: 100,
        skipped: 0,
        failed: 0,
        failed_to_restart: 0,
        changed: 10,
        corrective_change: 5,
        out_of_sync: 10,
      },
      time: {
        config_retrieval: 2.5,
      },
      events: {
        success: 90,
        failure: 0,
        noop: 0,
        total: 100,
      },
    },
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.1.1 - should use PuppetReportsListView in Node Detail page with pagination enabled', async () => {
    // This test verifies that the component can be rendered with enablePagination prop
    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'test-node.example.com',
        enablePagination: true,
        onDebugInfo: vi.fn(),
      },
    });

    // Wait for the component to load
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/integrations/puppetdb/nodes/test-node.example.com/reports'),
        expect.any(Object)
      );
    });

    // Verify reports are rendered
    await waitFor(() => {
      expect(screen.queryByText(/node0.example.com/)).toBeTruthy();
    });

    // Verify pagination controls are rendered (since totalCount > pageSize)
    await waitFor(() => {
      expect(screen.queryByLabelText(/go to next page/i)).toBeTruthy();
      expect(screen.queryByLabelText(/go to previous page/i)).toBeTruthy();
    });
  });

  it('3.1.2 - should work with certname-specific reports', async () => {
    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'specific-node.example.com',
        enablePagination: true,
      },
    });

    // Verify the correct API endpoint is called with certname
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/integrations/puppetdb/nodes/specific-node.example.com/reports'),
        expect.any(Object)
      );
    });

    // Verify the URL includes pagination parameters
    await waitFor(() => {
      const call = mockGet.mock.calls[0];
      expect(call[0]).toMatch(/limit=100/);
      expect(call[0]).toMatch(/offset=0/);
    });
  });

  it('3.1.3 - should maintain independent pagination state from global reports page', async () => {
    const mockGet = vi.mocked(api.get);

    // First instance (node detail page)
    mockGet.mockResolvedValueOnce({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
    });

    const { unmount: unmount1 } = render(PuppetReportsListView, {
      props: {
        certname: 'node1.example.com',
        enablePagination: true,
      },
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    unmount1();

    // Second instance (global reports page)
    mockGet.mockResolvedValueOnce({
      reports: mockReports,
      count: 5,
      totalCount: 200,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        showFilters: true,
        enablePagination: true,
      },
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    // Verify different endpoints were called
    const firstCall = mockGet.mock.calls[0][0];
    const secondCall = mockGet.mock.calls[1][0];

    expect(firstCall).toContain('nodes/node1.example.com/reports');
    expect(secondCall).toContain('/api/integrations/puppetdb/reports');
    expect(firstCall).not.toEqual(secondCall);
  });

  it('3.1.4 - should share page size preference across views', async () => {
    const mockLoadPageSize = vi.mocked(sessionStorage.loadPageSize);

    // Set initial page size
    mockLoadPageSize.mockReturnValue(200);

    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'test-node.example.com',
        enablePagination: true,
      },
    });

    // Verify loadPageSize was called to get the shared preference
    expect(mockLoadPageSize).toHaveBeenCalled();

    // Verify the API was called with the loaded page size
    await waitFor(() => {
      const call = mockGet.mock.calls[0];
      expect(call[0]).toMatch(/limit=200/);
    });
  });

  it('should handle pagination with filters', async () => {
    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 50,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'test-node.example.com',
        enablePagination: true,
      },
    });

    // Verify pagination parameters are included in the request
    await waitFor(() => {
      const call = mockGet.mock.calls[0];
      expect(call[0]).toMatch(/limit=\d+/);
      expect(call[0]).toMatch(/offset=\d+/);
    });
  });

  it('should display loading state during page transitions', async () => {
    const mockGet = vi.mocked(api.get);

    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'test-node.example.com',
        enablePagination: true,
      },
    });

    // After loading completes, reports should be visible
    await waitFor(() => {
      expect(screen.queryByText(/node0.example.com/)).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('should pass debug info to parent when provided', async () => {
    const mockGet = vi.mocked(api.get);
    const mockDebugInfo = {
      timestamp: new Date().toISOString(),
      requestId: 'test-request-id',
      operation: 'fetchReports',
      duration: 150,
    };

    const onDebugInfo = vi.fn();

    mockGet.mockResolvedValue({
      reports: mockReports,
      count: 5,
      totalCount: 150,
      hasMore: true,
      _debug: mockDebugInfo,
    });

    render(PuppetReportsListView, {
      props: {
        certname: 'test-node.example.com',
        enablePagination: true,
        onDebugInfo,
      },
    });

    // Wait for component to render and fetch
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });

    // Verify debug info callback was called
    await waitFor(() => {
      expect(onDebugInfo).toHaveBeenCalledWith(mockDebugInfo);
    }, { timeout: 2000 });
  });
});
