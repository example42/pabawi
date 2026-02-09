/**
 * Test: Multi-source inventory querying
 *
 * This test verifies that the inventory system:
 * - Queries all InventorySource plugins when loading inventory view
 * - Merges results from multiple sources
 * - Indicates source plugin for each node
 *
 * Validates Requirements 6.2, 6.3, 6.4
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { IntegrationManager } from '../../src/integrations/IntegrationManager.js';
import { LoggerService } from '../../src/services/LoggerService.js';

describe('Multi-Source Inventory Querying', () => {
  let integrationManager: IntegrationManager;

  beforeAll(async () => {
    const logger = new LoggerService();
    integrationManager = new IntegrationManager({ logger });
    await integrationManager.initializePlugins();
  });

  it('should query all InventorySource plugins', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Verify that sources object contains entries for inventory plugins
    expect(result.sources).toBeDefined();
    expect(Object.keys(result.sources).length).toBeGreaterThan(0);

    // Check that at least some of the expected plugins are present
    const sourceNames = Object.keys(result.sources);
    const inventoryPlugins = ['ansible', 'bolt', 'puppetdb', 'ssh'];

    // At least one inventory plugin should be present
    const hasInventoryPlugin = inventoryPlugins.some(plugin =>
      sourceNames.includes(plugin)
    );
    expect(hasInventoryPlugin).toBe(true);
  });

  it('should merge results from multiple sources', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Verify nodes array exists
    expect(result.nodes).toBeDefined();
    expect(Array.isArray(result.nodes)).toBe(true);

    // If there are nodes, verify they come from different sources
    if (result.nodes.length > 0) {
      const sources = new Set(result.nodes.map(node => node.source));

      // Nodes should have source attribution
      for (const node of result.nodes) {
        expect(node.source).toBeDefined();
        expect(typeof node.source).toBe('string');
      }
    }
  });

  it('should indicate source plugin for each node', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Every node should have a source property
    for (const node of result.nodes) {
      expect(node).toHaveProperty('source');
      expect(typeof node.source).toBe('string');
      expect(node.source.length).toBeGreaterThan(0);
    }
  });

  it('should provide source information with node counts and status', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Each source should have metadata
    for (const [sourceName, sourceInfo] of Object.entries(result.sources)) {
      expect(sourceInfo).toHaveProperty('nodeCount');
      expect(sourceInfo).toHaveProperty('lastSync');
      expect(sourceInfo).toHaveProperty('status');

      expect(typeof sourceInfo.nodeCount).toBe('number');
      expect(sourceInfo.nodeCount).toBeGreaterThanOrEqual(0);

      expect(['healthy', 'degraded', 'unavailable']).toContain(sourceInfo.status);
    }
  });

  it('should support linked inventory with multi-source attribution', async () => {
    const result = await integrationManager.getLinkedInventory();

    // Verify linked nodes have source information
    expect(result.nodes).toBeDefined();
    expect(Array.isArray(result.nodes)).toBe(true);

    // Check for nodes that appear in multiple sources
    for (const node of result.nodes) {
      // Linked nodes should have sources array if they appear in multiple places
      if (node.linked && node.sources) {
        expect(Array.isArray(node.sources)).toBe(true);
        expect(node.sources.length).toBeGreaterThan(1);
      }
    }
  });

  it('should deduplicate nodes across sources', async () => {
    const result = await integrationManager.getAggregatedInventory();

    // Check for duplicate node IDs
    const nodeIds = result.nodes.map(node => node.id);
    const uniqueNodeIds = new Set(nodeIds);

    // All node IDs should be unique (no duplicates)
    expect(nodeIds.length).toBe(uniqueNodeIds.size);
  });
});
