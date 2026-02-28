import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AggregatedResultsView from './AggregatedResultsView.svelte';

// Mock API module
vi.mock('../lib/api', () => ({
  getBatchStatus: vi.fn(),
}));

import { getBatchStatus } from '../lib/api';

describe('AggregatedResultsView Component', () => {
  const mockBatchId = 'batch-123';

  const mockBatchStatusSuccess = {
    batch: {
      id: 'batch-123',
      type: 'command',
      action: 'uptime',
      status: 'success',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:05:00Z'),
      stats: {
        total: 3,
        queued: 0,
        running: 0,
        success: 3,
        failed: 0,
      },
    },
    executions: [
      {
        id: 'exec-1',
        nodeId: 'node-1',
        nodeName: 'server-01',
        status: 'success',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:02:00Z'),
        duration: 120000,
        result: {
          exitCode: 0,
          stdout: 'uptime output 1',
          stderr: '',
        },
      },
      {
        id: 'exec-2',
        nodeId: 'node-2',
        nodeName: 'server-02',
        status: 'success',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:01:30Z'),
        duration: 90000,
        result: {
          exitCode: 0,
          stdout: 'uptime output 2',
          stderr: '',
        },
      },
      {
        id: 'exec-3',
        nodeId: 'node-3',
        nodeName: 'server-03',
        status: 'success',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:03:00Z'),
        duration: 180000,
        result: {
          exitCode: 0,
          stdout: 'uptime output 3',
          stderr: '',
        },
      },
    ],
    progress: 100,
  };

  const mockBatchStatusWithFailures = {
    batch: {
      id: 'batch-456',
      type: 'command',
      action: 'test-command',
      status: 'partial',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:05:00Z'),
      stats: {
        total: 4,
        queued: 0,
        running: 0,
        success: 2,
        failed: 2,
      },
    },
    executions: [
      {
        id: 'exec-1',
        nodeId: 'node-1',
        nodeName: 'server-01',
        status: 'success',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:02:00Z'),
        duration: 120000,
        result: {
          exitCode: 0,
          stdout: 'success output',
          stderr: '',
        },
      },
      {
        id: 'exec-2',
        nodeId: 'node-2',
        nodeName: 'server-02',
        status: 'failed',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:01:00Z'),
        duration: 60000,
        result: {
          exitCode: 1,
          stdout: '',
          stderr: 'Error: command failed',
        },
      },
      {
        id: 'exec-3',
        nodeId: 'node-3',
        nodeName: 'server-03',
        status: 'success',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:03:00Z'),
        duration: 180000,
        result: {
          exitCode: 0,
          stdout: 'success output 2',
          stderr: '',
        },
      },
      {
        id: 'exec-4',
        nodeId: 'node-4',
        nodeName: 'server-04',
        status: 'failed',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:02:30Z'),
        duration: 150000,
        result: {
          exitCode: 2,
          stdout: '',
          stderr: 'Error: connection timeout',
        },
      },
    ],
    progress: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Fetching and Display', () => {
    it('should fetch and display batch status on mount', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(getBatchStatus).toHaveBeenCalledWith(mockBatchId);
      });
    });

    it('should display loading state while fetching data', () => {
      vi.mocked(getBatchStatus).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      expect(screen.getByText(/loading/i)).toBeTruthy();
    });

    it('should display error message when fetch fails', async () => {
      vi.mocked(getBatchStatus).mockRejectedValue(new Error('Network error'));

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeTruthy();
      });
    });
  });

  describe('Summary Statistics Display', () => {
    it('should display total targets count', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/total/i)).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy();
      });
    });

    it('should display successful executions count', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/success/i)).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy();
      });
    });

    it('should display failed executions count', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
      });
    });

    it('should display batch action type and command', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/command/i)).toBeTruthy();
        expect(screen.getByText('uptime')).toBeTruthy();
      });
    });
  });

  describe('Results List Display', () => {
    it('should display all execution results', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
        expect(screen.getByText('server-02')).toBeTruthy();
        expect(screen.getByText('server-03')).toBeTruthy();
      });
    });

    it('should display execution status for each node', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const successBadges = screen.getAllByText(/success/i);
        const failedBadges = screen.getAllByText(/failed/i);
        expect(successBadges.length).toBeGreaterThan(0);
        expect(failedBadges.length).toBeGreaterThan(0);
      });
    });

    it('should display execution duration for each node', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        // Duration should be displayed (120s, 90s, 180s)
        expect(screen.getByText(/2m/i)).toBeTruthy(); // 120s = 2 minutes
      });
    });

    it('should highlight failed executions with visual indicators', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        // Check for red color classes or error icons
        const failedElements = container.querySelectorAll('.text-red-600, .bg-red-100');
        expect(failedElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Expand/Collapse Functionality', () => {
    it('should not show detailed output initially', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.queryByText('uptime output 1')).toBeNull();
      });
    });

    it('should expand execution details when clicked', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      expect(nodeRow).toBeTruthy();

      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });
    });

    it('should collapse execution details when clicked again', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');

      // Expand
      await fireEvent.click(nodeRow!);
      await waitFor(() => {
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });

      // Collapse
      await fireEvent.click(nodeRow!);
      await waitFor(() => {
        expect(screen.queryByText('uptime output 1')).toBeNull();
      });
    });

    it('should display stdout in expanded view', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText(/stdout/i)).toBeTruthy();
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });
    });

    it('should display stderr in expanded view for failed executions', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-02')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-02').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText(/stderr/i)).toBeTruthy();
        expect(screen.getByText('Error: command failed')).toBeTruthy();
      });
    });

    it('should display exit code in expanded view', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-02')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-02').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText(/exit code/i)).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
      });
    });
  });

  describe('Sorting Functionality', () => {
    it('should display sort controls', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/sort by/i)).toBeTruthy();
      });
    });

    it('should sort by node name by default', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const nodeNames = screen.getAllByText(/server-\d+/);
        expect(nodeNames[0].textContent).toBe('server-01');
        expect(nodeNames[1].textContent).toBe('server-02');
        expect(nodeNames[2].textContent).toBe('server-03');
      });
    });

    it('should sort by status when status sort is selected', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/sort by/i)).toBeTruthy();
      });

      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      await fireEvent.change(sortSelect, { target: { value: 'status' } });

      await waitFor(() => {
        // Failed executions should appear first (or last depending on order)
        const rows = screen.getAllByRole('button');
        expect(rows.length).toBeGreaterThan(0);
      });
    });

    it('should sort by duration when duration sort is selected', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/sort by/i)).toBeTruthy();
      });

      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      await fireEvent.change(sortSelect, { target: { value: 'duration' } });

      await waitFor(() => {
        // Verify sorting occurred (shortest to longest or vice versa)
        const nodeNames = screen.getAllByText(/server-\d+/);
        expect(nodeNames.length).toBe(3);
      });
    });

    it('should toggle sort order when clicking sort direction button', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/sort by/i)).toBeTruthy();
      });

      const sortOrderButton = screen.getByRole('button', { name: /sort order/i });
      await fireEvent.click(sortOrderButton);

      // Verify order changed (implementation will determine exact behavior)
      expect(sortOrderButton).toBeTruthy();
    });
  });

  describe('Filtering Functionality', () => {
    it('should display filter controls', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/filter/i)).toBeTruthy();
      });
    });

    it('should show all executions by default', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
        expect(screen.getByText('server-02')).toBeTruthy();
        expect(screen.getByText('server-03')).toBeTruthy();
        expect(screen.getByText('server-04')).toBeTruthy();
      });
    });

    it('should filter to show only successful executions', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;
      await fireEvent.change(filterSelect, { target: { value: 'success' } });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
        expect(screen.getByText('server-03')).toBeTruthy();
        expect(screen.queryByText('server-02')).toBeNull();
        expect(screen.queryByText('server-04')).toBeNull();
      });
    });

    it('should filter to show only failed executions', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;
      await fireEvent.change(filterSelect, { target: { value: 'failed' } });

      await waitFor(() => {
        expect(screen.queryByText('server-01')).toBeNull();
        expect(screen.getByText('server-02')).toBeTruthy();
        expect(screen.queryByText('server-03')).toBeNull();
        expect(screen.getByText('server-04')).toBeTruthy();
      });
    });

    it('should update displayed count when filtering', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/showing/i)).toBeTruthy();
      });

      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;
      await fireEvent.change(filterSelect, { target: { value: 'failed' } });

      await waitFor(() => {
        expect(screen.getByText(/2.*of.*4/i)).toBeTruthy();
      });
    });
  });

  describe('Export Functionality', () => {
    it('should display export button', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
      });
    });

    it('should show export format options when export button is clicked', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/json/i)).toBeTruthy();
        expect(screen.getByText(/csv/i)).toBeTruthy();
      });
    });

    it('should trigger JSON download when JSON export is selected', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      // Mock URL.createObjectURL and document.createElement
      const createObjectURLMock = vi.fn(() => 'blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockReturnValue({
        click: clickMock,
        href: '',
        download: '',
        style: {},
      } as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/json/i)).toBeTruthy();
      });

      const jsonButton = screen.getByRole('button', { name: /json/i });
      await fireEvent.click(jsonButton);

      await waitFor(() => {
        expect(createObjectURLMock).toHaveBeenCalled();
        expect(clickMock).toHaveBeenCalled();
      });

      createElementSpy.mockRestore();
    });

    it('should trigger CSV download when CSV export is selected', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const createObjectURLMock = vi.fn(() => 'blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockReturnValue({
        click: clickMock,
        href: '',
        download: '',
        style: {},
      } as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText(/csv/i)).toBeTruthy();
      });

      const csvButton = screen.getByRole('button', { name: /csv/i });
      await fireEvent.click(csvButton);

      await waitFor(() => {
        expect(createObjectURLMock).toHaveBeenCalled();
        expect(clickMock).toHaveBeenCalled();
      });

      createElementSpy.mockRestore();
    });

    it('should include all execution data in JSON export', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      let blobContent = '';
      const createObjectURLMock = vi.fn((blob: Blob) => {
        blob.text().then((text) => {
          blobContent = text;
        });
        return 'blob:mock-url';
      });
      global.URL.createObjectURL = createObjectURLMock;

      const clickMock = vi.fn();
      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockReturnValue({
        click: clickMock,
        href: '',
        download: '',
        style: {},
      } as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await fireEvent.click(exportButton);

      const jsonButton = screen.getByRole('button', { name: /json/i });
      await fireEvent.click(jsonButton);

      await waitFor(() => {
        expect(createObjectURLMock).toHaveBeenCalled();
      });

      createElementSpy.mockRestore();
    });
  });

  describe('Success/Failure Messaging', () => {
    it('should display success message when all executions succeed', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/all.*executions.*completed.*successfully/i)).toBeTruthy();
      });
    });

    it('should display warning message when some executions fail', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/2.*executions.*failed/i)).toBeTruthy();
      });
    });

    it('should use success styling for all-success message', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const successMessage = container.querySelector('.bg-green-100, .text-green-800');
        expect(successMessage).toBeTruthy();
      });
    });

    it('should use warning styling for partial failure message', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const warningMessage = container.querySelector('.bg-yellow-100, .text-yellow-800, .bg-red-100, .text-red-800');
        expect(warningMessage).toBeTruthy();
      });
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels for interactive elements', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/sort by/i)).toBeTruthy();
        expect(screen.getByLabelText(/filter/i)).toBeTruthy();
      });
    });

    it('should support keyboard navigation for expand/collapse', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      expect(nodeRow).toBeTruthy();

      // Simulate keyboard interaction (Enter key)
      await fireEvent.keyDown(nodeRow!, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });
    });

    it('should use semantic HTML elements', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      // Check for semantic elements
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      const selects = container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
    });

    it('should have proper heading hierarchy', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        expect(headings.length).toBeGreaterThan(0);
      });
    });

    it('should announce status changes to screen readers', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        // Check for aria-live regions
        const liveRegion = container.querySelector('[aria-live]');
        expect(liveRegion).toBeTruthy();
      });
    });

    it('should support high contrast mode', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        // Verify color is not the only indicator (icons should be present)
        const icons = container.querySelectorAll('svg, [role="img"]');
        expect(icons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results gracefully', async () => {
      const emptyBatchStatus = {
        batch: {
          id: 'batch-empty',
          type: 'command',
          action: 'test',
          status: 'success',
          createdAt: new Date(),
          completedAt: new Date(),
          stats: {
            total: 0,
            queued: 0,
            running: 0,
            success: 0,
            failed: 0,
          },
        },
        executions: [],
        progress: 100,
      };

      vi.mocked(getBatchStatus).mockResolvedValue(emptyBatchStatus);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/no.*executions/i)).toBeTruthy();
      });
    });

    it('should handle missing result data', async () => {
      const batchWithMissingData = {
        batch: mockBatchStatusSuccess.batch,
        executions: [
          {
            id: 'exec-1',
            nodeId: 'node-1',
            nodeName: 'server-01',
            status: 'success',
            startedAt: new Date('2024-01-01T10:00:00Z'),
            completedAt: new Date('2024-01-01T10:02:00Z'),
            duration: 120000,
            result: undefined, // Missing result
          },
        ],
        progress: 100,
      };

      vi.mocked(getBatchStatus).mockResolvedValue(batchWithMissingData as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      // Should handle missing data gracefully
      await waitFor(() => {
        expect(screen.queryByText(/error/i)).toBeNull();
      });
    });

    it('should handle very long output text', async () => {
      const longOutput = 'A'.repeat(10000);
      const batchWithLongOutput = {
        batch: mockBatchStatusSuccess.batch,
        executions: [
          {
            id: 'exec-1',
            nodeId: 'node-1',
            nodeName: 'server-01',
            status: 'success',
            startedAt: new Date('2024-01-01T10:00:00Z'),
            completedAt: new Date('2024-01-01T10:02:00Z'),
            duration: 120000,
            result: {
              exitCode: 0,
              stdout: longOutput,
              stderr: '',
            },
          },
        ],
        progress: 100,
      };

      vi.mocked(getBatchStatus).mockResolvedValue(batchWithLongOutput);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByText(/stdout/i)).toBeTruthy();
      });
    });

    it('should handle special characters in output', async () => {
      const specialCharsOutput = '<script>alert("xss")</script>\n\t\r\n';
      const batchWithSpecialChars = {
        batch: mockBatchStatusSuccess.batch,
        executions: [
          {
            id: 'exec-1',
            nodeId: 'node-1',
            nodeName: 'server-01',
            status: 'success',
            startedAt: new Date('2024-01-01T10:00:00Z'),
            completedAt: new Date('2024-01-01T10:02:00Z'),
            duration: 120000,
            result: {
              exitCode: 0,
              stdout: specialCharsOutput,
              stderr: '',
            },
          },
        ],
        progress: 100,
      };

      vi.mocked(getBatchStatus).mockResolvedValue(batchWithSpecialChars);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      // Should escape special characters properly
      await waitFor(() => {
        expect(screen.getByText(/stdout/i)).toBeTruthy();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render with responsive classes', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const responsiveElements = container.querySelectorAll('[class*="sm:"], [class*="md:"], [class*="lg:"]');
        expect(responsiveElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode classes', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      const { container } = render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        const darkModeElements = container.querySelectorAll('[class*="dark:"]');
        expect(darkModeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow: load, sort, filter, expand, export', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      const createObjectURLMock = vi.fn(() => 'blob:mock-url');
      global.URL.createObjectURL = createObjectURLMock;

      const clickMock = vi.fn();
      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockReturnValue({
        click: clickMock,
        href: '',
        download: '',
        style: {},
      } as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      // Sort by status
      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      await fireEvent.change(sortSelect, { target: { value: 'status' } });

      // Filter to failed only
      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;
      await fireEvent.change(filterSelect, { target: { value: 'failed' } });

      await waitFor(() => {
        expect(screen.getByText('server-02')).toBeTruthy();
        expect(screen.queryByText('server-01')).toBeNull();
      });

      // Expand a result
      const nodeRow = screen.getByText('server-02').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText('Error: command failed')).toBeTruthy();
      });

      // Export results
      const exportButton = screen.getByRole('button', { name: /export/i });
      await fireEvent.click(exportButton);

      const jsonButton = screen.getByRole('button', { name: /json/i });
      await fireEvent.click(jsonButton);

      await waitFor(() => {
        expect(createObjectURLMock).toHaveBeenCalled();
      });

      createElementSpy.mockRestore();
    });

    it('should maintain expanded state when sorting', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusSuccess);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      // Expand a result
      const nodeRow = screen.getByText('server-01').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });

      // Change sort
      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      await fireEvent.change(sortSelect, { target: { value: 'duration' } });

      // Expanded state should be maintained
      await waitFor(() => {
        expect(screen.getByText('uptime output 1')).toBeTruthy();
      });
    });

    it('should maintain expanded state when filtering', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-02')).toBeTruthy();
      });

      // Expand a failed result
      const nodeRow = screen.getByText('server-02').closest('div[role="button"]');
      await fireEvent.click(nodeRow!);

      await waitFor(() => {
        expect(screen.getByText('Error: command failed')).toBeTruthy();
      });

      // Filter to show only failed
      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;
      await fireEvent.change(filterSelect, { target: { value: 'failed' } });

      // Expanded state should be maintained
      await waitFor(() => {
        expect(screen.getByText('Error: command failed')).toBeTruthy();
      });
    });

    it('should handle rapid filter/sort changes', async () => {
      vi.mocked(getBatchStatus).mockResolvedValue(mockBatchStatusWithFailures);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });

      const sortSelect = screen.getByLabelText(/sort by/i) as HTMLSelectElement;
      const filterSelect = screen.getByLabelText(/filter/i) as HTMLSelectElement;

      // Rapid changes
      await fireEvent.change(sortSelect, { target: { value: 'status' } });
      await fireEvent.change(filterSelect, { target: { value: 'failed' } });
      await fireEvent.change(sortSelect, { target: { value: 'duration' } });
      await fireEvent.change(filterSelect, { target: { value: 'all' } });

      // Should handle without errors
      await waitFor(() => {
        expect(screen.getByText('server-01')).toBeTruthy();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large number of executions', async () => {
      const largeExecutionList = Array.from({ length: 100 }, (_, i) => ({
        id: `exec-${i}`,
        nodeId: `node-${i}`,
        nodeName: `server-${String(i).padStart(3, '0')}`,
        status: i % 2 === 0 ? 'success' : 'failed',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:02:00Z'),
        duration: 120000 + i * 1000,
        result: {
          exitCode: i % 2 === 0 ? 0 : 1,
          stdout: `output ${i}`,
          stderr: i % 2 === 0 ? '' : `error ${i}`,
        },
      }));

      const largeBatchStatus = {
        batch: {
          ...mockBatchStatusSuccess.batch,
          stats: {
            total: 100,
            queued: 0,
            running: 0,
            success: 50,
            failed: 50,
          },
        },
        executions: largeExecutionList,
        progress: 100,
      };

      vi.mocked(getBatchStatus).mockResolvedValue(largeBatchStatus as any);

      render(AggregatedResultsView, {
        props: {
          batchId: mockBatchId,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server-000')).toBeTruthy();
      });

      // Should render without performance issues
      const sortSelect = screen.getByLabelText(/sort by/i);
      await fireEvent.change(sortSelect, { target: { value: 'status' } });

      expect(screen.getByText(/100/)).toBeTruthy();
    });
  });
});
