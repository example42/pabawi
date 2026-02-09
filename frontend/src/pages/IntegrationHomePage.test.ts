/**
 * Unit tests for IntegrationHomePage health status functionality
 *
 * Tests Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import IntegrationHomePage from './IntegrationHomePage.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
}));

// Mock the router
vi.mock('../lib/router.svelte', () => ({
  router: {
    navigate: vi.fn(),
  },
}));

// Mock the toast
vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(),
}));

// Mock the auth
vi.mock('../lib/auth.svelte', () => ({
  auth: {
    permissions: { allowed: [] },
  },
}));

describe('IntegrationHomePage - Health Status Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should query health status on mount', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: true,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    const mockHealthStatus = {
      plugin: 'test-plugin',
      healthy: true,
      message: 'Plugin is healthy',
      lastCheck: new Date().toISOString(),
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthStatus);
      }
      return Promise.resolve(mockPluginInfo);
    });

    render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/plugins/test-plugin');
      expect(api.get).toHaveBeenCalledWith('/api/v1/plugins/test-plugin/health');
    });
  });

  it('should display healthy status with appropriate styling', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: true,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    const mockHealthStatus = {
      plugin: 'test-plugin',
      healthy: true,
      message: 'Plugin is healthy',
      lastCheck: new Date().toISOString(),
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthStatus);
      }
      return Promise.resolve(mockPluginInfo);
    });

    const { container } = render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    await waitFor(() => {
      const healthBadge = container.querySelector('.bg-green-100');
      expect(healthBadge).toBeTruthy();
      expect(healthBadge?.textContent).toContain('Healthy');
    });
  });

  it('should display offline status with error message', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: false,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    const mockHealthStatus = {
      plugin: 'test-plugin',
      healthy: false,
      message: 'Connection refused',
      lastCheck: new Date().toISOString(),
      failingCapabilities: ['command.execute', 'inventory.list'],
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthStatus);
      }
      return Promise.resolve(mockPluginInfo);
    });

    const { container } = render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    await waitFor(() => {
      const healthBadge = container.querySelector('.bg-red-100');
      expect(healthBadge).toBeTruthy();
      expect(healthBadge?.textContent).toContain('Offline');
    });

    await waitFor(() => {
      const content = container.textContent || '';
      expect(content).toContain('Connection refused');
    });
  });

  it('should display failing capabilities when plugin is offline', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: false,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    const mockHealthStatus = {
      plugin: 'test-plugin',
      healthy: false,
      message: 'Some capabilities are failing',
      lastCheck: new Date().toISOString(),
      failingCapabilities: ['command.execute', 'inventory.list'],
      workingCapabilities: ['info.facts'],
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthStatus);
      }
      return Promise.resolve(mockPluginInfo);
    });

    const { container } = render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    await waitFor(() => {
      const content = container.textContent || '';
      expect(content).toContain('Failing Capabilities');
      expect(content).toContain('command.execute');
      expect(content).toContain('inventory.list');
      expect(content).toContain('Working Capabilities');
      expect(content).toContain('info.facts');
    });
  });

  it('should handle health check errors gracefully', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: true,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(mockPluginInfo);
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load health status:',
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
  });
});

describe('IntegrationHomePage - Reactive Health Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should poll health status every 30 seconds', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: true,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    const mockHealthStatus = {
      plugin: 'test-plugin',
      healthy: true,
      message: 'Plugin is healthy',
      lastCheck: new Date().toISOString(),
    };

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthStatus);
      }
      return Promise.resolve(mockPluginInfo);
    });

    render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    // Wait for initial load
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/plugins/test-plugin/health');
    });

    const initialCallCount = vi.mocked(api.get).mock.calls.filter(
      (call) => call[0].includes('/health')
    ).length;

    // Advance time by 30 seconds
    vi.advanceTimersByTime(30000);

    await waitFor(() => {
      const healthCallCount = vi.mocked(api.get).mock.calls.filter(
        (call) => call[0].includes('/health')
      ).length;
      expect(healthCallCount).toBe(initialCallCount + 1);
    });

    // Advance time by another 30 seconds
    vi.advanceTimersByTime(30000);

    await waitFor(() => {
      const healthCallCount = vi.mocked(api.get).mock.calls.filter(
        (call) => call[0].includes('/health')
      ).length;
      expect(healthCallCount).toBe(initialCallCount + 2);
    });
  });

  it('should update UI when health status changes', async () => {
    const mockPluginInfo = {
      metadata: {
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test Description',
        integrationType: 'RemoteExecution',
      },
      enabled: true,
      healthy: true,
      widgets: [],
      capabilities: [],
      priority: 1,
    };

    let healthyStatus = true;

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          plugin: 'test-plugin',
          healthy: healthyStatus,
          message: healthyStatus ? 'Plugin is healthy' : 'Connection lost',
          lastCheck: new Date().toISOString(),
        });
      }
      return Promise.resolve(mockPluginInfo);
    });

    const { container } = render(IntegrationHomePage, {
      props: {
        params: { integrationName: 'test-plugin' },
      },
    });

    // Wait for initial healthy status
    await waitFor(() => {
      const healthBadge = container.querySelector('.bg-green-100');
      expect(healthBadge).toBeTruthy();
    });

    // Change health status to offline
    healthyStatus = false;

    // Advance time to trigger polling
    vi.advanceTimersByTime(30000);

    // Wait for UI to update to offline status
    await waitFor(() => {
      const healthBadge = container.querySelector('.bg-red-100');
      expect(healthBadge).toBeTruthy();
      expect(healthBadge?.textContent).toContain('Offline');
    });
  });
});
