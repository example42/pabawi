/**
 * Tests for provisioning API methods
 * Validates Requirements: 2.1, 3.3, 4.3, 6.4, 7.3, 8.3, 10.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProvisioningIntegrations,
  createProxmoxVM,
  createProxmoxLXC,
  executeNodeAction,
  destroyNode,
  testProxmoxConnection,
} from './api';
import type {
  ProxmoxVMParams,
  ProxmoxLXCParams,
  ProvisioningResult,
  ListIntegrationsResponse,
} from './types/provisioning';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Provisioning API Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProvisioningIntegrations', () => {
    it('should fetch available provisioning integrations', async () => {
      const mockResponse: ListIntegrationsResponse = {
        integrations: [
          {
            name: 'proxmox',
            displayName: 'Proxmox VE',
            type: 'virtualization',
            status: 'connected',
            capabilities: [],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getProvisioningIntegrations();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integrations/provisioning',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should retry on failure with 2 retries and 1000ms delay', async () => {
      // First call fails with 503
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: { message: 'Service unavailable' } }),
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ integrations: [] }),
      });

      await getProvisioningIntegrations();

      // Should have made 2 calls (initial + 1 retry)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('createProxmoxVM', () => {
    it('should create a Proxmox VM with correct parameters', async () => {
      const vmParams: ProxmoxVMParams = {
        vmid: 100,
        name: 'test-vm',
        node: 'pve1',
        cores: 2,
        memory: 2048,
      };

      const mockResult: ProvisioningResult = {
        success: true,
        taskId: 'task-123',
        vmid: 100,
        message: 'VM created successfully',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await createProxmoxVM(vmParams);

      expect(result).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integrations/proxmox/provision/vm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(vmParams),
        })
      );
    });

    it('should not retry on failure (user-initiated operation)', async () => {
      const vmParams: ProxmoxVMParams = {
        vmid: 100,
        name: 'test-vm',
        node: 'pve1',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      });

      await expect(createProxmoxVM(vmParams)).rejects.toThrow();

      // Should only make 1 call (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createProxmoxLXC', () => {
    it('should create a Proxmox LXC container with correct parameters', async () => {
      const lxcParams: ProxmoxLXCParams = {
        vmid: 200,
        hostname: 'test-lxc',
        node: 'pve1',
        ostemplate: 'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst',
        cores: 1,
        memory: 512,
      };

      const mockResult: ProvisioningResult = {
        success: true,
        taskId: 'task-456',
        vmid: 200,
        message: 'LXC created successfully',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await createProxmoxLXC(lxcParams);

      expect(result).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integrations/proxmox/provision/lxc',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(lxcParams),
        })
      );
    });

    it('should not retry on failure (user-initiated operation)', async () => {
      const lxcParams: ProxmoxLXCParams = {
        vmid: 200,
        hostname: 'test-lxc',
        node: 'pve1',
        ostemplate: 'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'Invalid parameters' } }),
      });

      await expect(createProxmoxLXC(lxcParams)).rejects.toThrow();

      // Should only make 1 call (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeNodeAction', () => {
    it('should execute a lifecycle action on a node', async () => {
      const nodeId = 'node-123';
      const action = 'start';

      const mockResult: ProvisioningResult = {
        success: true,
        taskId: 'task-789',
        message: 'Action executed successfully',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await executeNodeAction(nodeId, action);

      expect(result).toEqual({ success: true, message: 'Action executed successfully', nodeId });
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/integrations/proxmox/action`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ nodeId, action, parameters: undefined }),
        })
      );
    });

    it('should include optional parameters when provided', async () => {
      const nodeId = 'node-123';
      const action = 'reboot';
      const parameters = { timeout: 30 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Rebooting' }),
      });

      await executeNodeAction(nodeId, action, parameters);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/integrations/proxmox/action`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ nodeId, action, parameters }),
        })
      );
    });

    it('should not retry on failure (user-initiated operation)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      });

      await expect(executeNodeAction('node-123', 'start')).rejects.toThrow();

      // Should only make 1 call (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroyNode', () => {
    it('should destroy a node', async () => {
      const nodeId = 'proxmox:pve1:123';

      const mockResult: ProvisioningResult = {
        success: true,
        taskId: 'task-999',
        message: 'Node destroyed successfully',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await destroyNode(nodeId);

      expect(result).toEqual({ success: true, message: 'Node destroyed successfully', nodeId });
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/integrations/proxmox/provision/123?node=pve1`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should not retry on failure (user-initiated operation)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: 'Node not found' } }),
      });

      await expect(destroyNode('proxmox:pve1:123')).rejects.toThrow();

      // Should only make 1 call (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('testProxmoxConnection', () => {
    it('should test Proxmox connection', async () => {
      const mockResponse = {
        success: true,
        message: 'Connection successful',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await testProxmoxConnection();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/integrations/proxmox/test',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle connection test failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Connection failed' } }),
      });

      await expect(testProxmoxConnection()).rejects.toThrow();
    });

    it('should not retry on failure (user-initiated operation)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: { message: 'Service unavailable' } }),
      });

      await expect(testProxmoxConnection()).rejects.toThrow();

      // Should only make 1 call (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Property-Based Tests
   *
   * These tests use fast-check to verify universal properties across all inputs
   */
  describe('Property-Based Tests', () => {
    /**
     * Feature: proxmox-frontend-ui, Property 4: Action Execution Triggers API Call
     *
     * Validates: Requirements 6.4
     *
     * For any lifecycle action button that is clicked, the frontend should send an API request
     * to the integration endpoint with the correct action name and node identifier.
     */
    it('Feature: proxmox-frontend-ui, Property 4: Action Execution Triggers API Call', async () => {
      const fc = await import('fast-check');
      const { lifecycleActionArbitrary } = await import('../__tests__/generators');

      await fc.assert(
        fc.asyncProperty(
          lifecycleActionArbitrary(),
          fc.uuid(),
          fc.option(fc.record({
            timeout: fc.integer({ min: 1, max: 300 }),
            force: fc.boolean(),
          })),
          async (action, nodeId, parameters) => {
            // Setup: Mock successful API response
            const mockResult: ProvisioningResult = {
              success: true,
              taskId: fc.sample(fc.uuid(), 1)[0],
              message: `Action ${action.name} executed successfully`,
            };

            mockFetch.mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve(mockResult),
            });

            // Execute: Call the API method
            await executeNodeAction(nodeId, action.name, parameters ?? undefined);

            // Verify: API was called with correct endpoint and parameters
            expect(mockFetch).toHaveBeenCalledWith(
              `/api/integrations/proxmox/action`,
              expect.objectContaining({
                method: 'POST',
                headers: expect.any(Headers),
                body: JSON.stringify({
                  nodeId,
                  action: action.name,
                  parameters: parameters ?? undefined,
                }),
              })
            );

            // Cleanup for next iteration
            mockFetch.mockClear();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
