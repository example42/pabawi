import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DebugPanel from './DebugPanel.svelte';
import type { DebugInfo } from '../lib/api';

describe('DebugPanel Component', () => {
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
      {
        endpoint: '/api/puppetdb/nodes',
        method: 'GET',
        duration: 100,
        status: 200,
        cached: true,
      },
    ],
    errors: [
      {
        message: 'Connection timeout',
        code: 'ETIMEDOUT',
        stack: 'Error: Connection timeout\n    at fetch (/app/api.ts:123)',
        level: 'error',
      },
    ],
    metadata: {
      nodeCount: 42,
      filterApplied: true,
    },
  };

  beforeEach(() => {
    // Reset any state if needed
  });

  describe('Rendering', () => {
    it('should render collapsed by default', () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      expect(screen.getByText('Expert Mode Debug Information')).toBeTruthy();
      expect(screen.getByText(/GET \/api\/inventory/)).toBeTruthy();
      expect(screen.getByText(/250ms/)).toBeTruthy();
    });

    it('should expand when header is clicked', async () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Check that expanded content is visible
      expect(screen.getByText('Timestamp')).toBeTruthy();
      expect(screen.getByText('Request ID')).toBeTruthy();
      expect(screen.getByText('req_123456')).toBeTruthy();
    });
  });

  describe('Basic Information Display', () => {
    it('should display timestamp correctly', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Timestamp')).toBeTruthy();
    });

    it('should display request ID', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('req_123456')).toBeTruthy();
    });

    it('should display integration when provided', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Integration')).toBeTruthy();
      expect(screen.getByText('bolt')).toBeTruthy();
    });

    it('should display cache status', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Cache Status')).toBeTruthy();
      expect(screen.getByText('MISS')).toBeTruthy();
    });
  });

  describe('API Calls Section', () => {
    it('should display API calls count', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('API Calls (2)')).toBeTruthy();
    });

    it('should expand API calls section when clicked', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const apiCallsButton = screen.getByRole('button', { name: /API Calls/i });
      await fireEvent.click(apiCallsButton);

      expect(screen.getByText('/api/bolt/inventory')).toBeTruthy();
      expect(screen.getByText('/api/puppetdb/nodes')).toBeTruthy();
    });

    it('should display API call details', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const apiCallsButton = screen.getByRole('button', { name: /API Calls/i });
      await fireEvent.click(apiCallsButton);

      expect(screen.getAllByText('Status: 200').length).toBeGreaterThan(0);
      expect(screen.getByText('Cached')).toBeTruthy();
    });
  });

  describe('Errors Section', () => {
    it('should display errors count', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Errors (1)')).toBeTruthy();
    });

    it('should expand errors section when clicked', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const errorsButton = screen.getByRole('button', { name: /Errors/i });
      await fireEvent.click(errorsButton);

      expect(screen.getByText('Connection timeout')).toBeTruthy();
      expect(screen.getByText('Code: ETIMEDOUT')).toBeTruthy();
    });
  });

  describe('Metadata Section', () => {
    it('should display metadata section', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Metadata')).toBeTruthy();
    });

    it('should expand metadata section when clicked', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const metadataButton = screen.getByRole('button', { name: /Metadata/i });
      await fireEvent.click(metadataButton);

      // Check that JSON is displayed
      const metadataContent = screen.getByText(/"nodeCount": 42/);
      expect(metadataContent).toBeTruthy();
    });
  });

  describe('Frontend Info Section', () => {
    it('should display frontend info when provided', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          frontendInfo: {
            renderTime: 50,
            componentTree: ['App', 'HomePage', 'InventoryList'],
          },
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Frontend Information')).toBeTruthy();
    });

    it('should display render time', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          frontendInfo: {
            renderTime: 50,
          },
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const frontendButton = screen.getByRole('button', { name: /Frontend Information/i });
      await fireEvent.click(frontendButton);

      expect(screen.getByText('Render Time')).toBeTruthy();
      expect(screen.getByText('50ms')).toBeTruthy();
    });

    it('should display component tree', async () => {

      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          frontendInfo: {
            componentTree: ['App', 'HomePage', 'InventoryList'],
          },
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const frontendButton = screen.getByRole('button', { name: /Frontend Information/i });
      await fireEvent.click(frontendButton);

      expect(screen.getByText('Component Tree')).toBeTruthy();
      expect(screen.getByText('App')).toBeTruthy();
      expect(screen.getByText('HomePage')).toBeTruthy();
      expect(screen.getByText('InventoryList')).toBeTruthy();
    });
  });

  describe('Duration Formatting', () => {
    it('should format milliseconds correctly', () => {
      render(DebugPanel, {
        props: {
          debugInfo: {
            ...mockDebugInfo,
            duration: 250,
          },
        },
      });

      expect(screen.getByText(/250ms/)).toBeTruthy();
    });

    it('should format seconds correctly', () => {
      render(DebugPanel, {
        props: {
          debugInfo: {
            ...mockDebugInfo,
            duration: 2500,
          },
        },
      });

      expect(screen.getByText(/2\.50s/)).toBeTruthy();
    });
  });

  describe('Optional Fields', () => {
    it('should handle missing integration field', async () => {

      const debugInfoWithoutIntegration: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_123456',
        operation: 'GET /api/inventory',
        duration: 250,
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithoutIntegration,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Integration field should not be present
      expect(screen.queryByText('Integration')).toBeFalsy();
    });

    it('should handle missing API calls', async () => {

      const debugInfoWithoutApiCalls: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_123456',
        operation: 'GET /api/inventory',
        duration: 250,
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithoutApiCalls,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // API Calls section should not be present
      expect(screen.queryByText(/API Calls/)).toBeFalsy();
    });

    it('should handle missing errors', async () => {

      const debugInfoWithoutErrors: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_123456',
        operation: 'GET /api/inventory',
        duration: 250,
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithoutErrors,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Errors section should not be present
      expect(screen.queryByText(/Errors/)).toBeFalsy();
    });

    it('should handle missing metadata', async () => {

      const debugInfoWithoutMetadata: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_123456',
        operation: 'GET /api/inventory',
        duration: 250,
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithoutMetadata,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Metadata section should not be present
      expect(screen.queryByText('Metadata')).toBeFalsy();
    });
  });

  describe('Compact Mode', () => {
    it('should render compact mode with error/warning/info counts', () => {
      const debugInfoWithMessages: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          { message: 'Error 1', level: 'error' },
          { message: 'Error 2', level: 'error' },
        ],
        warnings: [
          { message: 'Warning 1', level: 'warn' },
        ],
        info: [
          { message: 'Info 1', level: 'info' },
          { message: 'Info 2', level: 'info' },
          { message: 'Info 3', level: 'info' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithMessages,
          compact: true,
        },
      });

      expect(screen.getByText('2 Errors')).toBeTruthy();
      expect(screen.getByText('1 Warning')).toBeTruthy();
      expect(screen.getByText('3 Info')).toBeTruthy();
    });

    it('should show "No issues" when no errors/warnings/info', () => {
      const cleanDebugInfo: DebugInfo = {
        timestamp: '2024-01-15T10:30:00.000Z',
        requestId: 'req_123456',
        operation: 'GET /api/inventory',
        duration: 250,
      };

      render(DebugPanel, {
        props: {
          debugInfo: cleanDebugInfo,
          compact: true,
        },
      });

      expect(screen.getByText('No issues')).toBeTruthy();
    });

    it('should have "Show Details" button in compact mode', () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          compact: true,
        },
      });

      expect(screen.getByText('Show Details')).toBeTruthy();
    });

    it('should display first 2 errors in compact mode', () => {
      const debugInfoWithManyErrors: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          { message: 'Error 1', level: 'error' },
          { message: 'Error 2', level: 'error' },
          { message: 'Error 3', level: 'error' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithManyErrors,
          compact: true,
        },
      });

      expect(screen.getByText('Error 1')).toBeTruthy();
      expect(screen.getByText('Error 2')).toBeTruthy();
      expect(screen.getByText('+1 more errors')).toBeTruthy();
    });
  });

  describe('New Message Types', () => {
    it('should display warnings section', async () => {
      const debugInfoWithWarnings: DebugInfo = {
        ...mockDebugInfo,
        warnings: [
          { message: 'Warning message', context: 'Test context', level: 'warn' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithWarnings,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Warnings (1)')).toBeTruthy();
    });

    it('should display info section', async () => {
      const debugInfoWithInfo: DebugInfo = {
        ...mockDebugInfo,
        info: [
          { message: 'Info message', level: 'info' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Info (1)')).toBeTruthy();
    });

    it('should display debug section', async () => {
      const debugInfoWithDebug: DebugInfo = {
        ...mockDebugInfo,
        debug: [
          { message: 'Debug message', level: 'debug' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithDebug,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Debug (1)')).toBeTruthy();
    });
  });

  describe('Color Consistency', () => {
    it('should display errors in red color scheme', async () => {
      const debugInfoWithErrors: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          { message: 'Test error', level: 'error' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithErrors,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Check the h4 element inside the button for color classes
      const errorsHeading = screen.getByText(/^Errors \(1\)$/i);
      expect(errorsHeading.className).toContain('text-red');
    });

    it('should display warnings in yellow color scheme', async () => {
      const debugInfoWithWarnings: DebugInfo = {
        ...mockDebugInfo,
        warnings: [
          { message: 'Test warning', level: 'warn' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithWarnings,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Check the h4 element inside the button for color classes
      const warningsHeading = screen.getByText(/^Warnings \(1\)$/i);
      expect(warningsHeading.className).toContain('text-yellow');
    });

    it('should display info in blue color scheme', async () => {
      const debugInfoWithInfo: DebugInfo = {
        ...mockDebugInfo,
        info: [
          { message: 'Test info', level: 'info' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Check the h4 element inside the button for color classes
      const infoHeading = screen.getByText(/^Info \(1\)$/i);
      expect(infoHeading.className).toContain('text-blue');
    });

    it('should display debug in gray color scheme', async () => {
      const debugInfoWithDebug: DebugInfo = {
        ...mockDebugInfo,
        debug: [
          { message: 'Test debug', level: 'debug' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithDebug,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Check the h4 element inside the button for color classes
      const debugHeading = screen.getByText(/^Debug \(1\)$/i);
      expect(debugHeading.className).toContain('text-gray');
    });

    it('should maintain color consistency in compact mode', () => {
      const debugInfoWithMessages: DebugInfo = {
        ...mockDebugInfo,
        errors: [{ message: 'Error', level: 'error' }],
        warnings: [{ message: 'Warning', level: 'warn' }],
        info: [{ message: 'Info', level: 'info' }],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithMessages,
          compact: true,
        },
      });

      const errorBadge = screen.getByText('1 Error');
      const warningBadge = screen.getByText('1 Warning');
      const infoBadge = screen.getByText('1 Info');

      expect(errorBadge.className).toContain('bg-red');
      expect(warningBadge.className).toContain('bg-yellow');
      expect(infoBadge.className).toContain('bg-blue');
    });
  });

  describe('Performance Metrics Display', () => {
    it('should display performance metrics section', async () => {
      const debugInfoWithPerformance: DebugInfo = {
        ...mockDebugInfo,
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
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithPerformance,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Performance Metrics')).toBeTruthy();
    });

    it('should format memory usage correctly', async () => {
      const debugInfoWithPerformance: DebugInfo = {
        ...mockDebugInfo,
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
            avgDuration: 150,
            p95Duration: 300,
            p99Duration: 450,
          },
        },
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithPerformance,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const performanceButton = screen.getByRole('button', { name: /Performance Metrics/i });
      await fireEvent.click(performanceButton);

      expect(screen.getByText('Memory Usage')).toBeTruthy();
      expect(screen.getByText('100.00 MB')).toBeTruthy();
    });

    it('should display CPU usage as percentage', async () => {
      const debugInfoWithPerformance: DebugInfo = {
        ...mockDebugInfo,
        performance: {
          memoryUsage: 104857600,
          cpuUsage: 42.75,
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
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithPerformance,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const performanceButton = screen.getByRole('button', { name: /Performance Metrics/i });
      await fireEvent.click(performanceButton);

      expect(screen.getByText('CPU Usage')).toBeTruthy();
      expect(screen.getByText('42.75%')).toBeTruthy();
    });

    it('should display cache statistics', async () => {
      const debugInfoWithPerformance: DebugInfo = {
        ...mockDebugInfo,
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
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithPerformance,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const performanceButton = screen.getByRole('button', { name: /Performance Metrics/i });
      await fireEvent.click(performanceButton);

      expect(screen.getByText('Cache Hit Rate')).toBeTruthy();
      expect(screen.getByText('80.0%')).toBeTruthy();
      expect(screen.getByText('Cache Size')).toBeTruthy();
      expect(screen.getByText('100 items')).toBeTruthy();
    });

    it('should display request statistics', async () => {
      const debugInfoWithPerformance: DebugInfo = {
        ...mockDebugInfo,
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
            avgDuration: 150.5,
            p95Duration: 300.2,
            p99Duration: 450.8,
          },
        },
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithPerformance,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const performanceButton = screen.getByRole('button', { name: /Performance Metrics/i });
      await fireEvent.click(performanceButton);

      expect(screen.getByText('Avg Request Duration')).toBeTruthy();
      expect(screen.getByText('151ms')).toBeTruthy();
    });
  });

  describe('Request Context Display', () => {
    it('should display request context section', async () => {
      const debugInfoWithContext: DebugInfo = {
        ...mockDebugInfo,
        context: {
          url: '/api/test',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          query: {
            page: '1',
          },
          userAgent: 'Mozilla/5.0',
          ip: '192.168.1.1',
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithContext,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Request Context')).toBeTruthy();
    });

    it('should display URL and method', async () => {
      const debugInfoWithContext: DebugInfo = {
        ...mockDebugInfo,
        context: {
          url: '/api/nodes?filter=active',
          method: 'POST',
          headers: {},
          query: {},
          userAgent: 'Test Agent',
          ip: '10.0.0.1',
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithContext,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const contextButton = screen.getByRole('button', { name: /Request Context/i });
      await fireEvent.click(contextButton);

      expect(screen.getByText('URL')).toBeTruthy();
      expect(screen.getByText('/api/nodes?filter=active')).toBeTruthy();
      expect(screen.getByText('Method')).toBeTruthy();
      expect(screen.getByText('POST')).toBeTruthy();
    });

    it('should display user agent and IP', async () => {
      const debugInfoWithContext: DebugInfo = {
        ...mockDebugInfo,
        context: {
          url: '/api/test',
          method: 'GET',
          headers: {},
          query: {},
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          ip: '203.0.113.42',
          timestamp: '2024-01-15T10:30:00.000Z',
        },
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithContext,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const contextButton = screen.getByRole('button', { name: /Request Context/i });
      await fireEvent.click(contextButton);

      expect(screen.getByText('User Agent')).toBeTruthy();
      expect(screen.getByText('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBeTruthy();
      expect(screen.getByText('IP Address')).toBeTruthy();
      expect(screen.getByText('203.0.113.42')).toBeTruthy();
    });
  });

  describe('Timeline View', () => {
    it('should display timeline view section', async () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText(/Timeline View/)).toBeTruthy();
    });

    it('should show timeline entry count', async () => {
      const debugInfoWithLogs: DebugInfo = {
        ...mockDebugInfo,
        errors: [{ message: 'Error 1', level: 'error' }],
        warnings: [{ message: 'Warning 1', level: 'warn' }],
        info: [{ message: 'Info 1', level: 'info' }],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithLogs,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Should show count of all log entries (3 backend logs)
      expect(screen.getByText(/Timeline View \(3 entries\)/)).toBeTruthy();
    });

    it('should display timeline filter buttons', async () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const timelineButton = screen.getByRole('button', { name: /Timeline View/i });
      await fireEvent.click(timelineButton);

      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Errors' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Warnings' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Info' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Debug' })).toBeTruthy();
    });

    it('should display search input in timeline', async () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      const timelineButton = screen.getByRole('button', { name: /Timeline View/i });
      await fireEvent.click(timelineButton);

      const searchInput = screen.getByPlaceholderText('Search logs...');
      expect(searchInput).toBeTruthy();
    });
  });

  describe('Compact vs Full Mode', () => {
    it('should render differently in compact mode', () => {
      const { container: compactContainer } = render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          compact: true,
        },
      });

      const { container: fullContainer } = render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          compact: false,
        },
      });

      expect(compactContainer.innerHTML).not.toBe(fullContainer.innerHTML);
    });

    it('should not show expandable sections in compact mode', () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          compact: true,
        },
      });

      // Should not have expandable header button
      expect(screen.queryByRole('button', { name: /Expert Mode Debug Information/i })).toBeFalsy();
    });

    it('should show expandable sections in full mode', () => {
      render(DebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
          compact: false,
        },
      });

      // Should have expandable header button
      expect(screen.getByRole('button', { name: /Expert Mode Debug Information/i })).toBeTruthy();
    });

    it('should limit displayed messages in compact mode', () => {
      const debugInfoWithManyMessages: DebugInfo = {
        ...mockDebugInfo,
        errors: [
          { message: 'Error 1', level: 'error' },
          { message: 'Error 2', level: 'error' },
          { message: 'Error 3', level: 'error' },
          { message: 'Error 4', level: 'error' },
        ],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithManyMessages,
          compact: true,
        },
      });

      // Should show first 2 errors
      expect(screen.getByText('Error 1')).toBeTruthy();
      expect(screen.getByText('Error 2')).toBeTruthy();
      // Should show "+2 more errors" message
      expect(screen.getByText('+2 more errors')).toBeTruthy();
      // Should not show Error 3 and Error 4 directly
      expect(screen.queryByText('Error 3')).toBeFalsy();
      expect(screen.queryByText('Error 4')).toBeFalsy();
    });
  });

  describe('All Log Levels Display', () => {
    it('should display all log levels when present', async () => {
      const debugInfoWithAllLevels: DebugInfo = {
        ...mockDebugInfo,
        errors: [{ message: 'Error message', level: 'error' }],
        warnings: [{ message: 'Warning message', level: 'warn' }],
        info: [{ message: 'Info message', level: 'info' }],
        debug: [{ message: 'Debug message', level: 'debug' }],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithAllLevels,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Errors (1)')).toBeTruthy();
      expect(screen.getByText('Warnings (1)')).toBeTruthy();
      expect(screen.getByText('Info (1)')).toBeTruthy();
      expect(screen.getByText('Debug (1)')).toBeTruthy();
    });

    it('should expand and show all log level contents', async () => {
      const debugInfoWithAllLevels: DebugInfo = {
        ...mockDebugInfo,
        errors: [{ message: 'Error message', level: 'error' }],
        warnings: [{ message: 'Warning message', level: 'warn' }],
        info: [{ message: 'Info message', level: 'info' }],
        debug: [{ message: 'Debug message', level: 'debug' }],
      };

      render(DebugPanel, {
        props: {
          debugInfo: debugInfoWithAllLevels,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      // Expand each section - use more specific queries
      const errorsButton = screen.getByRole('button', { name: /^Errors \(1\)$/i });
      await fireEvent.click(errorsButton);
      expect(screen.getByText('Error message')).toBeTruthy();

      const warningsButton = screen.getByRole('button', { name: /^Warnings \(1\)$/i });
      await fireEvent.click(warningsButton);
      expect(screen.getByText('Warning message')).toBeTruthy();

      const infoButton = screen.getByRole('button', { name: /^Info \(1\)$/i });
      await fireEvent.click(infoButton);
      expect(screen.getByText('Info message')).toBeTruthy();

      const debugButton = screen.getByRole('button', { name: /^Debug \(1\)$/i });
      await fireEvent.click(debugButton);
      expect(screen.getByText('Debug message')).toBeTruthy();
    });
  });
});
