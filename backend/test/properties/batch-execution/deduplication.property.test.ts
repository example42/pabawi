import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import type { DatabaseAdapter } from '../../../src/database/DatabaseAdapter';
import { BatchExecutionService } from '../../../src/services/BatchExecutionService';
import type { ExecutionQueue } from '../../../src/services/ExecutionQueue';
import type { ExecutionRepository } from '../../../src/database/ExecutionRepository';
import type { IntegrationManager } from '../../../src/integrations/IntegrationManager';
import fc from 'fast-check';

/**
 * Property-Based Tests for Node Deduplication
 *
 * **Validates: Requirements 7.5**
 */
describe('Node Deduplication Properties', () => {
  let db: DatabaseAdapter;
  let service: BatchExecutionService;

  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    service = new BatchExecutionService(
      db,
      {} as ExecutionQueue,
      {} as ExecutionRepository,
      {} as IntegrationManager
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('should be idempotent - applying deduplication multiple times produces same result', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 0, maxLength: 100 }),
        (nodeIds) => {
          const deduplicatedOnce = (service as any).deduplicateNodes(nodeIds);
          const deduplicatedTwice = (service as any).deduplicateNodes(deduplicatedOnce);
          const deduplicatedThrice = (service as any).deduplicateNodes(deduplicatedTwice);
          expect(deduplicatedOnce).toEqual(deduplicatedTwice);
          expect(deduplicatedTwice).toEqual(deduplicatedThrice);
          const uniqueSet = new Set(deduplicatedOnce);
          expect(deduplicatedOnce.length).toBe(uniqueSet.size);
          const originalUnique = new Set(nodeIds);
          const resultSet = new Set(deduplicatedOnce);
          expect(resultSet).toEqual(originalUnique);
          expect(deduplicatedOnce.length).toBeLessThanOrEqual(nodeIds.length);
        }
      ),
      { numRuns: 1000, verbose: false }
    );
  });

  it('should preserve all unique node IDs without data loss', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 1, maxLength: 100 }),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);
          const originalUnique = new Set(nodeIds);
          const resultSet = new Set(deduplicated);
          expect(resultSet.size).toBe(originalUnique.size);
          for (const nodeId of originalUnique) {
            expect(resultSet.has(nodeId)).toBe(true);
          }
        }
      ),
      { numRuns: 500, verbose: false }
    );
  });

  it('should handle empty arrays correctly', () => {
    const result = (service as any).deduplicateNodes([]);
    expect(result).toEqual([]);
    expect(result.length).toBe(0);
    const resultAgain = (service as any).deduplicateNodes(result);
    expect(resultAgain).toEqual([]);
  });

  it('should handle single element arrays correctly', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
        (nodeId) => {
          const result = (service as any).deduplicateNodes([nodeId]);
          expect(result).toEqual([nodeId]);
          expect(result.length).toBe(1);
          const resultAgain = (service as any).deduplicateNodes(result);
          expect(resultAgain).toEqual([nodeId]);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it('should reduce array of all duplicates to single element', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
        fc.integer({ min: 1, max: 50 }),
        (nodeId, count) => {
          const nodeIds = Array(count).fill(nodeId);
          const result = (service as any).deduplicateNodes(nodeIds);
          expect(result).toEqual([nodeId]);
          expect(result.length).toBe(1);
          const resultAgain = (service as any).deduplicateNodes(result);
          expect(resultAgain).toEqual([nodeId]);
        }
      ),
      { numRuns: 200, verbose: false }
    );
  });

  it('should preserve order of first occurrence of each node', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 2, maxLength: 50 }),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);
          const seen = new Set<string>();
          const expectedOrder: string[] = [];
          for (const nodeId of nodeIds) {
            if (!seen.has(nodeId)) {
              seen.add(nodeId);
              expectedOrder.push(nodeId);
            }
          }
          expect(deduplicated).toEqual(expectedOrder);
        }
      ),
      { numRuns: 500, verbose: false }
    );
  });

  it('should handle arrays with high duplicate ratios efficiently', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }).map(s => `node-${s}`), { minLength: 1, maxLength: 10 })
          .chain(arr => { const unique = [...new Set(arr)]; return fc.constant(unique); }),
        fc.integer({ min: 50, max: 200 }),
        (uniqueNodeIds, totalCount) => {
          fc.pre(uniqueNodeIds.length > 0);
          const nodeIds: string[] = [];
          for (let i = 0; i < totalCount; i++) {
            nodeIds.push(uniqueNodeIds[i % uniqueNodeIds.length]);
          }
          const deduplicated = (service as any).deduplicateNodes(nodeIds);
          const uniqueSet = new Set(uniqueNodeIds);
          const resultSet = new Set(deduplicated);
          expect(resultSet).toEqual(uniqueSet);
          expect(deduplicated.length).toBe(uniqueSet.size);
          const deduplicatedAgain = (service as any).deduplicateNodes(deduplicated);
          expect(deduplicatedAgain).toEqual(deduplicated);
        }
      ),
      { numRuns: 200, verbose: false }
    );
  });

  it('should return identical array when no duplicates exist', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 0, maxLength: 50 })
          .chain(arr => { const unique = [...new Set(arr)]; return fc.constant(unique); }),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);
          expect(deduplicated).toEqual(nodeIds);
          expect(deduplicated.length).toBe(nodeIds.length);
          const deduplicatedAgain = (service as any).deduplicateNodes(deduplicated);
          expect(deduplicatedAgain).toEqual(nodeIds);
        }
      ),
      { numRuns: 300, verbose: false }
    );
  });

  it('should produce same result regardless of input order when combined', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 1, maxLength: 30 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 1, maxLength: 30 }),
        (nodeIds1, nodeIds2) => {
          const combined1 = (service as any).deduplicateNodes([...nodeIds1, ...nodeIds2]);
          const combined2 = (service as any).deduplicateNodes([...nodeIds2, ...nodeIds1]);
          const set1 = new Set(combined1);
          const set2 = new Set(combined2);
          expect(set1).toEqual(set2);
          expect(combined1.length).toBe(combined2.length);
        }
      ),
      { numRuns: 300, verbose: false }
    );
  });

  it('should produce result with size between 0 and input length', async () => {
    await fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`), { minLength: 0, maxLength: 100 }),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);
          expect(deduplicated.length).toBeGreaterThanOrEqual(0);
          expect(deduplicated.length).toBeLessThanOrEqual(nodeIds.length);
          if (nodeIds.length === 0) expect(deduplicated.length).toBe(0);
          if (nodeIds.length > 0) expect(deduplicated.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 500, verbose: false }
    );
  });
});
