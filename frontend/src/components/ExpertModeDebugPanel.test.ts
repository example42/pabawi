import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExpertModeDebugPanel from './ExpertModeDebugPanel.svelte';
import type { DebugInfo } from '../lib/api';

describe('ExpertModeDebugPanel Component', () => {
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
      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      expect(screen.getByText('Expert Mode Debug Information')).toBeTruthy();
      expect(screen.getByText(/GET \/api\/inventory/)).toBeTruthy();
      expect(screen.getByText(/250ms/)).toBeTruthy();
    });

    it('should expand when header is clicked', async () => {
      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Timestamp')).toBeTruthy();
    });

    it('should display request ID', async () => {

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('req_123456')).toBeTruthy();
    });

    it('should display integration when provided', async () => {

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('API Calls (2)')).toBeTruthy();
    });

    it('should expand API calls section when clicked', async () => {

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Errors (1)')).toBeTruthy();
    });

    it('should expand errors section when clicked', async () => {

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: mockDebugInfo,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Metadata')).toBeTruthy();
    });

    it('should expand metadata section when clicked', async () => {

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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
      render(ExpertModeDebugPanel, {
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
      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: cleanDebugInfo,
          compact: true,
        },
      });

      expect(screen.getByText('No issues')).toBeTruthy();
    });

    it('should have "Show Details" button in compact mode', () => {
      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
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

      render(ExpertModeDebugPanel, {
        props: {
          debugInfo: debugInfoWithDebug,
        },
      });

      const header = screen.getByRole('button', { name: /Expert Mode Debug Information/i });
      await fireEvent.click(header);

      expect(screen.getByText('Debug (1)')).toBeTruthy();
    });
  });
});
