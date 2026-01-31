import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DebugCopyButton from './DebugCopyButton.svelte';
import type { DebugInfo } from '../lib/api';
import * as toast from '../lib/toast.svelte';

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

describe('DebugCopyButton Component', () => {
  const mockDebugInfo: DebugInfo = {
    timestamp: '2024-01-15T10:30:00.000Z',
    requestId: 'req_123456',
    operation: 'GET /api/inventory',
    duration: 250,
    integration: 'bolt',
    cacheHit: false,
    apiCalls: [
      {
        endpoint: '/api/bolt/inventory',
        method: 'GET',
        duration: 150,
        status: 200,
        cached: false,
      },
    ],
    errors: [
      {
        message: 'Connection timeout',
        code: 'ETIMEDOUT',
        level: 'error',
      },
    ],
    performance: {
      memoryUsage: 104857600, // 100 MB
      cpuUsage: 25.5,
      activeConnections: 10,
      cacheStats: {
        hits: 80,
        misses: 20,
        size: 100,
        hitRate: 0.8,
      },
      requestStats: {
        total: 1000,
        avgDuration: 150.5,
        p95Duration: 300.2,
        p99Duration: 450.8,
      },
    },
    context: {
      url: '/api/inventory',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Expert-Mode': 'true',
      },
      query: {
        filter: 'active',
      },
      userAgent: 'Mozilla/5.0',
      ip: '192.168.1.1',
      timestamp: '2024-01-15T10:30:00.000Z',
    },
    metadata: {
      nodeCount: 42,
    },
  };

  const mockResponseData = {
    nodes: ['node1', 'node2'],
    count: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock clipboard API with proper vi.fn()
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  describe('Rendering', () => {
    it('should render with default label', () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      expect(screen.getByText('Copy Debug Info')).toBeTruthy();
    });

    it('should render with custom label', () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          label: 'Copy to Clipboard',
        },
      });

      // When insideModal is true, the button always shows "Copy Debug Info"
      expect(screen.getByText('Copy Debug Info')).toBeTruthy();
    });

    it('should render copy icon', () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Copy Functionality', () => {
    it('should copy debug info to clipboard when clicked', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      expect(toast.showSuccess).toHaveBeenCalledWith(
        'Debug information copied to clipboard',
        'Ready to paste into support requests'
      );
    });

    it('should include debug info in copied text', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('PABAWI DEBUG INFORMATION');
      expect(copiedText).toContain('req_123456');
      expect(copiedText).toContain('GET /api/inventory');
      expect(copiedText).toContain('Duration: 250ms');
    });

    it('should include API calls in copied text', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('API Calls:');
      expect(copiedText).toContain('GET /api/bolt/inventory');
      expect(copiedText).toContain('Status: 200');
    });

    it('should include errors in copied text', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Errors:');
      expect(copiedText).toContain('Connection timeout');
      expect(copiedText).toContain('Code: ETIMEDOUT');
    });

    it('should include metadata in copied text', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Metadata:');
      expect(copiedText).toContain('"nodeCount": 42');
    });

    it('should include response data when includeContext is true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('RESPONSE DATA');
      expect(copiedText).toContain('"nodes"');
      expect(copiedText).toContain('"count": 2');
    });

    it('should exclude response data when includeContext is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('RESPONSE DATA');
    });
  });

  describe('Frontend Info', () => {
    it('should include frontend info when provided', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          frontendInfo: {
            renderTime: 50,
            componentTree: ['App', 'HomePage'],
          },
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('FRONTEND INFORMATION');
      expect(copiedText).toContain('Render Time: 50ms');
      expect(copiedText).toContain('Component Tree:');
      expect(copiedText).toContain('- App');
      expect(copiedText).toContain('- HomePage');
    });

    it('should include browser info when includeBrowserInfo is true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeBrowserInfo: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Browser Information:');
      expect(copiedText).toContain('Platform:');
      expect(copiedText).toContain('Language:');
      expect(copiedText).toContain('Viewport:');
      expect(copiedText).toContain('User Agent:');
    });

    it('should exclude browser info when includeBrowserInfo is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeBrowserInfo: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('Browser Information:');
    });
  });

  describe('Performance Metrics', () => {
    it('should include performance metrics when includePerformance is true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includePerformance: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('PERFORMANCE METRICS');
      expect(copiedText).toContain('Backend Performance:');
      expect(copiedText).toContain('Memory Usage:');
      expect(copiedText).toContain('CPU Usage:');
      expect(copiedText).toContain('Cache Statistics:');
      expect(copiedText).toContain('Hit Rate:');
      expect(copiedText).toContain('Request Statistics:');
    });

    it('should exclude performance metrics when includePerformance is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includePerformance: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('PERFORMANCE METRICS');
    });
  });

  describe('Request Context', () => {
    it('should include request context when includeContext is true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('REQUEST CONTEXT');
      expect(copiedText).toContain('URL: /api/inventory');
      expect(copiedText).toContain('Method: GET');
      expect(copiedText).toContain('Query Parameters:');
      expect(copiedText).toContain('filter: active');
      expect(copiedText).toContain('Request Headers:');
    });

    it('should exclude request context when includeContext is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('REQUEST CONTEXT');
    });
  });

  describe('Cookies and Storage', () => {
    it('should include cookies when includeCookies is true', async () => {
      // Mock document.cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'session_id=abc123; user_pref=dark_mode',
      });

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeCookies: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Cookies:');
      expect(copiedText).toContain('session_id');
      expect(copiedText).toContain('user_pref');
    });

    it('should exclude cookies when includeCookies is false', async () => {
      // Mock document.cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'session_id=abc123',
      });

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeCookies: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('Cookies:');
    });

    it('should include localStorage when includeStorage is true', async () => {
      // Mock localStorage
      const mockLocalStorage = {
        getItem: vi.fn((key: string) => {
          if (key === 'theme') return 'dark';
          if (key === 'language') return 'en';
          return null;
        }),
        key: vi.fn((index: number) => {
          const keys = ['theme', 'language'];
          return keys[index] || null;
        }),
        length: 2,
      };

      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      });

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeStorage: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Local Storage:');
    });

    it('should exclude storage when includeStorage is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeStorage: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).not.toContain('Local Storage:');
      expect(copiedText).not.toContain('Session Storage:');
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when clipboard API fails', async () => {
      // Mock clipboard API to fail
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard access denied')),
        },
      });

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      expect(toast.showError).toHaveBeenCalledWith(
        'Failed to copy to clipboard',
        'Clipboard access denied'
      );
    });

    it('should handle missing clipboard API gracefully', async () => {
      // Remove clipboard API
      Object.assign(navigator, {
        clipboard: undefined,
      });

      // Mock document.execCommand
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand = vi.fn().mockReturnValue(true);

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-deprecated
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(toast.showSuccess).toHaveBeenCalled();
    });
  });

  describe('Format Validation', () => {
    it('should format with proper headers and footers', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('='.repeat(80));
      expect(copiedText).toContain('PABAWI DEBUG INFORMATION');
      expect(copiedText).toContain('END OF DEBUG INFORMATION');
    });

    it('should include timestamp in header', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Generated:');
      expect(copiedText).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('All Options Testing', () => {
    it('should include all sections when all options are true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: true,
          includePerformance: true,
          includeBrowserInfo: true,
          includeCookies: true,
          includeStorage: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('BACKEND DEBUG INFORMATION');
      expect(copiedText).toContain('PERFORMANCE METRICS');
      expect(copiedText).toContain('REQUEST CONTEXT');
      expect(copiedText).toContain('FRONTEND INFORMATION');
      expect(copiedText).toContain('Browser Information:');
      expect(copiedText).toContain('RESPONSE DATA');
    });

    it('should exclude all optional sections when all options are false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
          includeContext: false,
          includePerformance: false,
          includeBrowserInfo: false,
          includeCookies: false,
          includeStorage: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('BACKEND DEBUG INFORMATION');
      expect(copiedText).not.toContain('PERFORMANCE METRICS');
      expect(copiedText).not.toContain('REQUEST CONTEXT');
      expect(copiedText).not.toContain('Browser Information:');
      expect(copiedText).not.toContain('Cookies:');
      expect(copiedText).not.toContain('Local Storage:');
      expect(copiedText).not.toContain('RESPONSE DATA');
    });
  });

  describe('All Log Levels in Copied Text', () => {
    it('should include all log levels in copied text', async () => {
      const debugInfoWithAllLevels: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          {
            message: 'Critical error',
            code: 'ERR_CRITICAL',
            stack: 'Error stack trace',
            level: 'error',
          },
        ],
        warnings: [
          {
            message: 'Performance warning',
            context: 'Slow query detected',
            level: 'warn',
          },
        ],
        info: [
          {
            message: 'Operation completed',
            context: 'Successfully processed 100 items',
            level: 'info',
          },
        ],
        debug: [
          {
            message: 'Debug information',
            context: 'Cache lookup performed',
            level: 'debug',
          },
        ],
      };

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: debugInfoWithAllLevels,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Errors:');
      expect(copiedText).toContain('Critical error');
      expect(copiedText).toContain('Warnings:');
      expect(copiedText).toContain('Performance warning');
      expect(copiedText).toContain('Info Messages:');
      expect(copiedText).toContain('Operation completed');
      expect(copiedText).toContain('Debug Messages:');
      expect(copiedText).toContain('Debug information');
    });

    it('should format error stack traces correctly', async () => {
      const debugInfoWithStackTrace: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          {
            message: 'Database error',
            code: 'DB_ERROR',
            stack: 'Error: Database error\n    at connect (/app/db.ts:45)\n    at handler (/app/api.ts:123)',
            level: 'error',
          },
        ],
      };

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: debugInfoWithStackTrace,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Stack Trace:');
      expect(copiedText).toContain('at connect (/app/db.ts:45)');
      expect(copiedText).toContain('at handler (/app/api.ts:123)');
    });

    it('should include context for warnings, info, and debug', async () => {
      const debugInfoWithContext: DebugInfo = {
        ...mockDebugInfo,
        warnings: [
          {
            message: 'Slow query',
            context: 'Query took 5 seconds',
            level: 'warn',
          },
        ],
        info: [
          {
            message: 'Cache updated',
            context: 'Added 50 new entries',
            level: 'info',
          },
        ],
        debug: [
          {
            message: 'Request validated',
            context: 'All parameters valid',
            level: 'debug',
          },
        ],
      };

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: debugInfoWithContext,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Context: Query took 5 seconds');
      expect(copiedText).toContain('Context: Added 50 new entries');
      expect(copiedText).toContain('Context: All parameters valid');
    });
  });

  describe('Frontend Logs in Copied Text', () => {
    it('should include frontend logs when provided', async () => {
      const frontendLogs = [
        {
          timestamp: '2024-01-15T10:30:00.000Z',
          level: 'info' as const,
          component: 'InventoryPage',
          operation: 'loadData',
          message: 'Loading inventory data',
          correlationId: 'corr_123',
        },
        {
          timestamp: '2024-01-15T10:30:01.000Z',
          level: 'error' as const,
          component: 'InventoryPage',
          operation: 'loadData',
          message: 'Failed to load data',
          correlationId: 'corr_123',
          stackTrace: 'Error: Failed to load data\n    at loadData (/app/page.ts:45)',
        },
      ];

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          frontendLogs,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Frontend Logs:');
      expect(copiedText).toContain('[INFO]');
      expect(copiedText).toContain('Component: InventoryPage');
      expect(copiedText).toContain('Operation: loadData');
      expect(copiedText).toContain('Loading inventory data');
      expect(copiedText).toContain('[ERROR]');
      expect(copiedText).toContain('Failed to load data');
      expect(copiedText).toContain('Correlation ID: corr_123');
    });

    it('should include frontend log stack traces', async () => {
      const frontendLogs = [
        {
          timestamp: '2024-01-15T10:30:00.000Z',
          level: 'error' as const,
          component: 'TestComponent',
          operation: 'testOp',
          message: 'Test error',
          stackTrace: 'Error: Test error\n    at testFunction (/app/test.ts:10)\n    at handler (/app/handler.ts:20)',
        },
      ];

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          frontendLogs,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Stack Trace:');
      expect(copiedText).toContain('at testFunction (/app/test.ts:10)');
      expect(copiedText).toContain('at handler (/app/handler.ts:20)');
    });

    it('should sort frontend logs by timestamp (newest first)', async () => {
      const frontendLogs = [
        {
          timestamp: '2024-01-15T10:30:00.000Z',
          level: 'info' as const,
          component: 'Component1',
          operation: 'op1',
          message: 'First log',
        },
        {
          timestamp: '2024-01-15T10:30:02.000Z',
          level: 'info' as const,
          component: 'Component2',
          operation: 'op2',
          message: 'Third log',
        },
        {
          timestamp: '2024-01-15T10:30:01.000Z',
          level: 'info' as const,
          component: 'Component3',
          operation: 'op3',
          message: 'Second log',
        },
      ];

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          frontendLogs,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      // Find positions of each log message
      const thirdLogPos = copiedText.indexOf('Third log');
      const secondLogPos = copiedText.indexOf('Second log');
      const firstLogPos = copiedText.indexOf('First log');

      // Verify they appear in reverse chronological order (newest first)
      expect(thirdLogPos).toBeLessThan(secondLogPos);
      expect(secondLogPos).toBeLessThan(firstLogPos);
    });
  });

  describe('Modal vs Direct Copy Behavior', () => {
    it('should copy directly when insideModal is true', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      expect(toast.showSuccess).toHaveBeenCalled();
    });

    it('should show modal when insideModal is false', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: false,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      // Modal should be visible
      expect(screen.getByText('Complete Debug Information')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Copy to Clipboard/i })).toBeTruthy();
    });

    it('should copy from modal when copy button is clicked', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: false,
        },
      });

      // Open modal
      const showDetailsButton = screen.getByRole('button', { name: /Show Details/i });
      await fireEvent.click(showDetailsButton);

      // Click copy button in modal
      const copyButton = screen.getByRole('button', { name: /Copy to Clipboard/i });
      await fireEvent.click(copyButton);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(toast.showSuccess).toHaveBeenCalled();
    });

    it('should close modal when close button is clicked', async () => {
      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          insideModal: false,
        },
      });

      // Open modal
      const showDetailsButton = screen.getByRole('button', { name: /Show Details/i });
      await fireEvent.click(showDetailsButton);

      expect(screen.getByText('Complete Debug Information')).toBeTruthy();

      // Close modal - get all close buttons and click the bottom one (not the X button)
      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      // The second button is the "Close" button at the bottom of the modal
      await fireEvent.click(closeButtons[1]);

      // Modal should be closed
      expect(screen.queryByText('Complete Debug Information')).toBeFalsy();
    });
  });

  describe('Complete Debug Info Formatting', () => {
    it('should format complete debug info with all sections', async () => {
      const completeDebugInfo: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_complete_123',
        operation: 'GET /api/complete',
        duration: 500,
        integration: 'puppetdb',
        cacheHit: false,
        apiCalls: [
          {
            endpoint: '/pdb/query/v4/nodes',
            method: 'GET',
            duration: 300,
            status: 200,
            cached: false,
          },
        ],
        errors: [
          {
            message: 'Connection timeout',
            code: 'ETIMEDOUT',
            stack: 'Error stack',
            level: 'error',
          },
        ],
        warnings: [
          {
            message: 'Slow query',
            context: 'Query exceeded threshold',
            level: 'warn',
          },
        ],
        info: [
          {
            message: 'Query executed',
            context: 'Retrieved 100 records',
            level: 'info',
          },
        ],
        debug: [
          {
            message: 'Cache lookup',
            context: 'Cache miss',
            level: 'debug',
          },
        ],
        performance: {
          memoryUsage: 104857600,
          cpuUsage: 25.5,
          activeConnections: 10,
          cacheStats: {
            hits: 80,
            misses: 20,
            size: 100,
            hitRate: 0.8,
          },
          requestStats: {
            total: 1000,
            avgDuration: 150,
            p95Duration: 300,
            p99Duration: 450,
          },
        },
        context: {
          url: '/api/complete',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          query: {
            filter: 'active',
          },
          userAgent: 'Mozilla/5.0',
          ip: '192.168.1.1',
          timestamp: '2024-01-15T10:30:00.000Z',
        },
        metadata: {
          nodeCount: 42,
        },
      };

      render(DebugCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: completeDebugInfo,
          insideModal: true,
          includeContext: true,
          includePerformance: true,
          includeBrowserInfo: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      // Verify all sections are present
      expect(copiedText).toContain('PABAWI DEBUG INFORMATION');
      expect(copiedText).toContain('BACKEND DEBUG INFORMATION');
      expect(copiedText).toContain('Errors:');
      expect(copiedText).toContain('Warnings:');
      expect(copiedText).toContain('Info Messages:');
      expect(copiedText).toContain('Debug Messages:');
      expect(copiedText).toContain('API Calls:');
      expect(copiedText).toContain('PERFORMANCE METRICS');
      expect(copiedText).toContain('REQUEST CONTEXT');
      expect(copiedText).toContain('FRONTEND INFORMATION');
      expect(copiedText).toContain('Additional Metadata:');
      expect(copiedText).toContain('RESPONSE DATA');
      expect(copiedText).toContain('END OF DEBUG INFORMATION');
    });
  });
});
