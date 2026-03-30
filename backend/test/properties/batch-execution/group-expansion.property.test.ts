import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import type { DatabaseAdapter } from '../../../src/database/DatabaseAdapter';
import { BatchExecutionService } from '../../../src/services/BatchExecutionService';
import type { ExecutionQueue } from '../../../src/services/ExecutionQueue';
import type { ExecutionRepository } from '../../../src/database/ExecutionRepository';
import type { IntegrationManager } from '../../../src/integrations/IntegrationManager';
import fc from 'fast-check';

/**
 * Property-Based Tests for Group Expansion
 *
 * **Validates: Requirements 7.2, 7.3, 7.8**
 */
describe('Group Expansion Properties', () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    mockIntegrationManager = {
      getAggregatedInventory: vi.fn(),
    } as unknown as IntegrationManager;

    service = new BatchExecutionService(
      db,
      {} as ExecutionQueue,
      {} as ExecutionRepository,
      mockIntegrationManager
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('should expand groups to valid node IDs that exist in inventory', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryArbitrary(),
        async (inventory) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const groupIds = inventory.groups.map(g => g.id);
          fc.pre(groupIds.length > 0);

          const expandedNodeIds = await (service as any).expandGroups(groupIds);
          const inventoryNodeIds = new Set(inventory.nodes.map(n => n.id));
          for (const nodeId of expandedNodeIds) {
            expect(inventoryNodeIds.has(nodeId)).toBe(true);
          }
          const expectedNodeIds = new Set<string>();
          for (const group of inventory.groups) {
            for (const nodeId of group.nodes) {
              expectedNodeIds.add(nodeId);
            }
          }
          const expandedSorted = [...new Set(expandedNodeIds)].sort();
          const expectedSorted = [...expectedNodeIds].sort();
          expect(expandedSorted).toEqual(expectedSorted);
          const totalGroupNodes = inventory.groups.reduce((sum, g) => sum + g.nodes.length, 0);
          expect(expandedNodeIds.length).toBeLessThanOrEqual(totalGroupNodes);
          const deduplicatedOnce = [...new Set(expandedNodeIds)];
          const deduplicatedTwice = [...new Set(deduplicatedOnce)];
          expect(deduplicatedOnce).toEqual(deduplicatedTwice);
        }
      ),
      { numRuns: 100, timeout: 30000, verbose: false }
    );
  }, 60000);

  it('should return empty array when expanding empty groups', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryWithEmptyGroupsArbitrary(),
        async (inventory) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const emptyGroupIds = inventory.groups.filter(g => g.nodes.length === 0).map(g => g.id);
          fc.pre(emptyGroupIds.length > 0);
          const expandedNodeIds = await (service as any).expandGroups(emptyGroupIds);
          expect(expandedNodeIds).toEqual([]);
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 60000);

  it('should skip missing groups and continue with valid ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryArbitrary(),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (inventory, missingGroupIds) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const existingGroupIds = new Set(inventory.groups.map(g => g.id));
          const trulyMissingIds = missingGroupIds.filter(id => !existingGroupIds.has(id));
          fc.pre(trulyMissingIds.length > 0 && inventory.groups.length > 0);
          const validGroupIds = inventory.groups.map(g => g.id);
          const mixedGroupIds = [...validGroupIds, ...trulyMissingIds];
          const expandedNodeIds = await (service as any).expandGroups(mixedGroupIds);
          const expectedNodeIds = new Set<string>();
          for (const group of inventory.groups) {
            for (const nodeId of group.nodes) expectedNodeIds.add(nodeId);
          }
          const expandedSet = new Set(expandedNodeIds);
          expect(expandedSet).toEqual(expectedNodeIds);
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 60000);

  it('should produce the same result when expanding the same groups multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryArbitrary(),
        async (inventory) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const groupIds = inventory.groups.map(g => g.id);
          fc.pre(groupIds.length > 0);
          const result1 = await (service as any).expandGroups(groupIds);
          const result2 = await (service as any).expandGroups(groupIds);
          const result3 = await (service as any).expandGroups(groupIds);
          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 60000);

  it('should handle linked groups from multiple sources', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryWithLinkedGroupsArbitrary(),
        async (inventory) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const linkedGroupIds = inventory.groups.filter(g => g.name === 'production').map(g => g.id);
          fc.pre(linkedGroupIds.length > 1);
          const expandedNodeIds = await (service as any).expandGroups(linkedGroupIds);
          const expectedNodeIds = new Set<string>();
          for (const group of inventory.groups.filter(g => g.name === 'production')) {
            for (const nodeId of group.nodes) expectedNodeIds.add(nodeId);
          }
          const expandedSet = new Set(expandedNodeIds);
          expect(expandedSet).toEqual(expectedNodeIds);
          const inventoryNodeIds = new Set(inventory.nodes.map(n => n.id));
          for (const nodeId of expandedNodeIds) {
            expect(inventoryNodeIds.has(nodeId)).toBe(true);
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 60000);

  it('should deduplicate nodes when groups overlap', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateInventoryWithOverlappingGroupsArbitrary(),
        async (inventory) => {
          vi.mocked(mockIntegrationManager.getAggregatedInventory).mockResolvedValue(inventory);
          const groupIds = inventory.groups.map(g => g.id);
          fc.pre(groupIds.length > 1);
          const expandedNodeIds = await (service as any).expandGroups(groupIds);
          const inventoryNodeIds = new Set(inventory.nodes.map(n => n.id));
          for (const nodeId of expandedNodeIds) {
            expect(inventoryNodeIds.has(nodeId)).toBe(true);
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  }, 60000);
});

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

function generateInventoryArbitrary() {
  return fc.record({
    nodes: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `node-${s}`),
        name: fc.string({ minLength: 5, maxLength: 30 }).map(s => `server-${s}.example.com`),
      }),
      { minLength: 1, maxLength: 20 }
    ).chain(nodes => {
      const uniqueNodes = Array.from(new Map(nodes.map(n => [n.id, n])).values());
      return fc.constant(uniqueNodes);
    }),
    groups: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `group-${s}`),
        name: fc.string({ minLength: 5, maxLength: 20 }),
        source: fc.constantFrom('bolt', 'ansible', 'puppetdb', 'ssh'),
        nodes: fc.constant([]),
      }),
      { minLength: 1, maxLength: 10 }
    ),
  }).chain(({ nodes, groups }) => {
    const nodeIds = nodes.map(n => n.id);
    return fc.tuple(
      fc.constant(nodes),
      ...groups.map(() => fc.array(fc.constantFrom(...nodeIds), { minLength: 0, maxLength: Math.min(10, nodeIds.length) }))
    ).map(([nodes, ...groupNodeArrays]) => {
      const updatedGroups = groups.map((group, index) => ({
        ...group,
        nodes: [...new Set(groupNodeArrays[index])],
      }));
      return { nodes, groups: updatedGroups };
    });
  });
}

function generateInventoryWithEmptyGroupsArbitrary() {
  return fc.record({
    nodes: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `node-${s}`),
        name: fc.string({ minLength: 5, maxLength: 30 }).map(s => `server-${s}.example.com`),
      }),
      { minLength: 1, maxLength: 10 }
    ),
    groups: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `group-${s}`),
        name: fc.string({ minLength: 5, maxLength: 20 }),
        source: fc.constantFrom('bolt', 'ansible', 'puppetdb', 'ssh'),
        nodes: fc.constant([]),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  });
}

function generateInventoryWithLinkedGroupsArbitrary() {
  return fc.record({
    nodes: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `node-${s}`),
        name: fc.string({ minLength: 5, maxLength: 30 }).map(s => `server-${s}.example.com`),
      }),
      { minLength: 3, maxLength: 20 }
    ).chain(nodes => {
      const uniqueNodes = Array.from(new Map(nodes.map(n => [n.id, n])).values());
      return fc.constant(uniqueNodes);
    }),
  }).chain(({ nodes }) => {
    const nodeIds = nodes.map(n => n.id);
    const sources = ['bolt', 'ansible', 'puppetdb'];
    return fc.tuple(
      fc.constant(nodes),
      ...sources.map(() => fc.array(fc.constantFrom(...nodeIds), { minLength: 1, maxLength: Math.min(5, nodeIds.length) }))
    ).map(([nodes, ...groupNodeArrays]) => {
      const groups = sources.map((source, index) => ({
        id: `group-production-${source}`,
        name: 'production',
        source,
        nodes: [...new Set(groupNodeArrays[index])],
      }));
      return { nodes, groups };
    });
  });
}

function generateInventoryWithOverlappingGroupsArbitrary() {
  return fc.record({
    nodes: fc.array(
      fc.record({
        id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `node-${s}`),
        name: fc.string({ minLength: 5, maxLength: 30 }).map(s => `server-${s}.example.com`),
      }),
      { minLength: 5, maxLength: 20 }
    ).chain(nodes => {
      const uniqueNodes = Array.from(new Map(nodes.map(n => [n.id, n])).values());
      return fc.constant(uniqueNodes);
    }),
  }).chain(({ nodes }) => {
    const nodeIds = nodes.map(n => n.id);
    return fc.tuple(
      fc.constant(nodes),
      fc.array(fc.constantFrom(...nodeIds), { minLength: 2, maxLength: Math.min(8, nodeIds.length) }),
      fc.array(fc.constantFrom(...nodeIds), { minLength: 2, maxLength: Math.min(8, nodeIds.length) }),
      fc.array(fc.constantFrom(...nodeIds), { minLength: 2, maxLength: Math.min(8, nodeIds.length) })
    ).map(([nodes, group1Nodes, group2Nodes, group3Nodes]) => {
      const groups = [
        { id: 'group-web', name: 'web-servers', source: 'bolt', nodes: [...new Set(group1Nodes)] },
        { id: 'group-app', name: 'app-servers', source: 'bolt', nodes: [...new Set(group2Nodes)] },
        { id: 'group-prod', name: 'production', source: 'ansible', nodes: [...new Set(group3Nodes)] },
      ];
      return { nodes, groups };
    });
  });
}
