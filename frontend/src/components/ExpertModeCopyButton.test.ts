import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExpertModeCopyButton from './ExpertModeCopyButton.svelte';
import type { DebugInfo } from '../lib/api';
import * as toast from '../lib/toast.svelte';

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

describe('ExpertModeCopyButton Component', () => {
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

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('Rendering', () => {
    it('should render with default label', () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
        },
      });

      expect(screen.getByText('Copy Debug Info')).toBeTruthy();
    });

    it('should render with custom label', () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          label: 'Copy to Clipboard',
        },
      });

      expect(screen.getByText('Copy to Clipboard')).toBeTruthy();
    });

    it('should render copy icon', () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
        },
      });

      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Copy Functionality', () => {
    it('should copy debug info to clipboard when clicked', async () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Metadata:');
      expect(copiedText).toContain('"nodeCount": 42');
    });

    it('should include response data when includeContext is true', async () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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

      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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

      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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

      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
          includeStorage: true,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Local Storage:');
    });

    it('should exclude storage when includeStorage is false', async () => {
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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

      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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

      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
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
      render(ExpertModeCopyButton, {
        props: {
          data: mockResponseData,
          debugInfo: mockDebugInfo,
        },
      });

      const button = screen.getByRole('button');
      await fireEvent.click(button);

      const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

      expect(copiedText).toContain('Generated:');
      expect(copiedText).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
