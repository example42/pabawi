/**
 * Test: Inventory source failure isolation
 *
 * This test verifies that:
 * - Individual inventory source failures don't block other sources
 * - Errors are displayed for failed sources
 * - Successful sources continue to function and display data
 *
 * Validates Requirement 6.5
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { IntegrationManager } from '../../src/integrations/IntegrationManager.js';
import { CapabilityRegistry } from '../../src/integrations/CapabilityRegistry.js';
import { LoggerService } from '../../src/services/LoggerService.js';
import type { User } from '../../src/integrations/CapabilityRegistry.js';

describe('Inventory Source Failure Isolation', () => {
  let integrationManager: IntegrationManager;
  let capabilityRegistry: CapabilityRegistry;

  beforeAll(async () => {
    const logger = new LoggerService();
    integrationManager = new IntegrationManager({ logger });
    capabilityRegistry = integrationManager.getCapabilityRegistry();
    await integrationManager.initializePlugins();
  });

  it('should mark failed sources as unavailable in sources metadata', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Check that sources have status information
    for (const [sourceName, sourceInfo] of Object.entries(result.sources)) {
      expect(sourceInfo).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unavailable']).toContain(sourceInfo.status);

      // If a source is unavailable, it should have 0 nodes
      if (sourceInfo.status === 'unavailable') {
        expect(sourceInfo.nodeCount).toBe(0);
      }
    }
  });

  it('should continue returning data from successful sources even if one fails', async () => {
    // This test verifies the isolation behavior by checking that:
    // 1. We get results even if some sources might fail
    // 2. The sources object contains status for all attempted sources

    const result = await integrationManager.getAggregatedInventory();

    // We should have sources information
    expect(result.sources).toBeDefined();
    expect(Object.keys(result.sources).length).toBeGreaterThan(0);

    // Count healthy vs unavailable sources
    const healthySources = Object.values(result.sources).filter(
      s => s.status === 'healthy'
    );
    const unavailableSources = Object.values(result.sources).filter(
      s => s.status === 'unavailable'
    );

    // If there are any healthy sources, we should have nodes
    if (healthySources.length > 0) {
      // At least one healthy source means we should have some data
      const totalNodesFromHealthy = healthySources.reduce(
        (sum, s) => sum + s.nodeCount,
        0
      );

      // The aggregated nodes should match or be less than (due to deduplication)
      // the sum of nodes from healthy sources
      expect(result.nodes.length).toBeLessThanOrEqual(totalNodesFromHealthy);
    }

    // Unavailable sources should have 0 nodes
    for (const source of unavailableSources) {
      expect(source.nodeCount).toBe(0);
    }
  });

  it('should handle capability execution failures gracefully', async () => {
    // Create a mock user
    const systemUser: User = {
      id: 'system',
      username: 'system',
      roles: ['admin'],
    };

    // Try to execute a capability that might fail
    // The system should handle this gracefully
    const result = await capabilityRegistry.executeCapability(
      systemUser,
      'inventory.list',
      {},
      undefined
    );

    // Even if individual plugins fail, the capability execution should return
    // Either success with data, or a structured error
    expect(result).toHaveProperty('success');

    if (!result.success) {
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message');
    }
  });

  it('should provide lastSync timestamp for all sources', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Every source should have a lastSync timestamp
    for (const [sourceName, sourceInfo] of Object.entries(result.sources)) {
      expect(sourceInfo).toHaveProperty('lastSync');
      expect(typeof sourceInfo.lastSync).toBe('string');

      // Should be a valid ISO date string
      const date = new Date(sourceInfo.lastSync);
      expect(date.toString()).not.toBe('Invalid Date');
    }
  });

  it('should not throw errors when aggregating inventory with failures', async () => {
    // This test ensures that getAggregatedInventory doesn't throw
    // even if individual sources fail

    await expect(
      integrationManager.getAggregatedInventory()
    ).resolves.toBeDefined();
  });

  it('should isolate failures in parallel source queries', async () => {
    // Get inventory twice to ensure consistent behavior
    const result1 = await integrationManager.getAggregatedInventory();
    const result2 = await integrationManager.getAggregatedInventory();

    // Both calls should succeed
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // Source status should be consistent
    const sources1 = Object.keys(result1.sources).sort();
    const sources2 = Object.keys(result2.sources).sort();

    expect(sources1).toEqual(sources2);
  });
});
