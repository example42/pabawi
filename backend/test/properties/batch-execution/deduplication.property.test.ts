import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { BatchExecutionService } from '../../../src/services/BatchExecutionService';
import type { ExecutionQueue } from '../../../src/services/ExecutionQueue';
import type { ExecutionRepository } from '../../../src/database/ExecutionRepository';
import type { IntegrationManager } from '../../../src/integrations/IntegrationManager';
import fc from 'fast-check';

/**
 * Property-Based Tests for Node Deduplication
 *
 * **Validates: Requirements 7.5**
 *
 * Property 2: Node deduplication is idempotent
 * ∀ nodeIds ∈ Array<string>:
 *   deduplicateNodes(nodeIds) = deduplicateNodes(deduplicateNodes(nodeIds))
 *
 * This property validates that:
 * - Applying deduplication multiple times produces the same result
 * - The result contains no duplicates
 * - All original node IDs are preserved (no data loss)
 * - Edge cases work correctly (empty arrays, single elements, all duplicates)
 */
describe('Node Deduplication Properties', () => {
  let db: sqlite3.Database;
  let service: BatchExecutionService;
  let mockExecutionQueue: ExecutionQueue;
  let mockExecutionRepository: ExecutionRepository;
  let mockIntegrationManager: IntegrationManager;

  beforeEach(() => {
    db = new sqlite3.Database(':memory:');
    mockExecutionQueue = {} as ExecutionQueue;
    mockExecutionRepository = {} as ExecutionRepository;
    mockIntegrationManager = {} as IntegrationManager;

    service = new BatchExecutionService(
      db,
      mockExecutionQueue,
      mockExecutionRepository,
      mockIntegrationManager
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Property 2: Node deduplication is idempotent
   *
   * **Validates: Requirements 7.5**
   *
   * This property test verifies that:
   * 1. Applying deduplication multiple times produces the same result
   * 2. The result contains no duplicates
   * 3. All original node IDs are preserved (no data loss)
   * 4. Order is preserved for first occurrence of each node
   */
  it('should be idempotent - applying deduplication multiple times produces same result', async () => {
    await fc.assert(
      fc.property(
        // Generate random arrays of node IDs with potential duplicates
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 0, maxLength: 100 }
        ),
        (nodeIds) => {
          // Apply deduplication once
          const deduplicatedOnce = (service as any).deduplicateNodes(nodeIds);

          // Apply deduplication twice
          const deduplicatedTwice = (service as any).deduplicateNodes(deduplicatedOnce);

          // Apply deduplication three times
          const deduplicatedThrice = (service as any).deduplicateNodes(deduplicatedTwice);

          // Property 1: Idempotency - all results should be identical
          expect(deduplicatedOnce).toEqual(deduplicatedTwice);
          expect(deduplicatedTwice).toEqual(deduplicatedThrice);

          // Property 2: No duplicates in result
          const uniqueSet = new Set(deduplicatedOnce);
          expect(deduplicatedOnce.length).toBe(uniqueSet.size);

          // Property 3: All original unique node IDs are preserved
          const originalUnique = new Set(nodeIds);
          const resultSet = new Set(deduplicatedOnce);
          expect(resultSet).toEqual(originalUnique);

          // Property 4: Result length should not exceed original length
          expect(deduplicatedOnce.length).toBeLessThanOrEqual(nodeIds.length);
        }
      ),
      {
        numRuns: 1000,
        verbose: false
      }
    );
  });

  /**
   * Property: Deduplication preserves all unique elements
   *
   * **Validates: Requirements 7.5**
   */
  it('should preserve all unique node IDs without data loss', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 1, maxLength: 100 }
        ),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);

          // Every unique node ID from input should be in output
          const originalUnique = new Set(nodeIds);
          const resultSet = new Set(deduplicated);

          expect(resultSet.size).toBe(originalUnique.size);

          for (const nodeId of originalUnique) {
            expect(resultSet.has(nodeId)).toBe(true);
          }
        }
      ),
      {
        numRuns: 500,
        verbose: false
      }
    );
  });

  /**
   * Property: Empty array handling
   *
   * **Validates: Requirements 7.5**
   */
  it('should handle empty arrays correctly', () => {
    const result = (service as any).deduplicateNodes([]);

    expect(result).toEqual([]);
    expect(result.length).toBe(0);

    // Applying again should still be empty
    const resultAgain = (service as any).deduplicateNodes(result);
    expect(resultAgain).toEqual([]);
  });

  /**
   * Property: Single element arrays
   *
   * **Validates: Requirements 7.5**
   */
  it('should handle single element arrays correctly', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
        (nodeId) => {
          const result = (service as any).deduplicateNodes([nodeId]);

          expect(result).toEqual([nodeId]);
          expect(result.length).toBe(1);

          // Idempotency check
          const resultAgain = (service as any).deduplicateNodes(result);
          expect(resultAgain).toEqual([nodeId]);
        }
      ),
      {
        numRuns: 100,
        verbose: false
      }
    );
  });

  /**
   * Property: All duplicates scenario
   *
   * **Validates: Requirements 7.5**
   */
  it('should reduce array of all duplicates to single element', async () => {
    await fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
        fc.integer({ min: 1, max: 50 }),
        (nodeId, count) => {
          // Create array with same node ID repeated
          const nodeIds = Array(count).fill(nodeId);

          const result = (service as any).deduplicateNodes(nodeIds);

          expect(result).toEqual([nodeId]);
          expect(result.length).toBe(1);

          // Idempotency check
          const resultAgain = (service as any).deduplicateNodes(result);
          expect(resultAgain).toEqual([nodeId]);
        }
      ),
      {
        numRuns: 200,
        verbose: false
      }
    );
  });

  /**
   * Property: Order preservation for first occurrence
   *
   * **Validates: Requirements 7.5**
   */
  it('should preserve order of first occurrence of each node', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 2, maxLength: 50 }
        ),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);

          // Build expected order based on first occurrence
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
      {
        numRuns: 500,
        verbose: false
      }
    );
  });

  /**
   * Property: Deduplication with high duplicate ratio
   *
   * **Validates: Requirements 7.5**
   */
  it('should handle arrays with high duplicate ratios efficiently', async () => {
    await fc.assert(
      fc.property(
        // Generate a small set of unique IDs
        fc.array(
          fc.string({ minLength: 1, maxLength: 10 }).map(s => `node-${s}`),
          { minLength: 1, maxLength: 10 }
        ).chain(arr => {
          // Ensure all elements are unique
          const unique = [...new Set(arr)];
          return fc.constant(unique);
        }),
        // Generate many duplicates from that small set
        fc.integer({ min: 50, max: 200 }),
        (uniqueNodeIds, totalCount) => {
          fc.pre(uniqueNodeIds.length > 0);

          // Create array with many duplicates using fc.constantFrom for determinism
          const nodeIds: string[] = [];
          for (let i = 0; i < totalCount; i++) {
            const randomIndex = i % uniqueNodeIds.length;
            nodeIds.push(uniqueNodeIds[randomIndex]);
          }

          const deduplicated = (service as any).deduplicateNodes(nodeIds);

          // Should reduce to unique set
          const uniqueSet = new Set(uniqueNodeIds);
          const resultSet = new Set(deduplicated);

          expect(resultSet).toEqual(uniqueSet);
          expect(deduplicated.length).toBe(uniqueSet.size);

          // Idempotency
          const deduplicatedAgain = (service as any).deduplicateNodes(deduplicated);
          expect(deduplicatedAgain).toEqual(deduplicated);
        }
      ),
      {
        numRuns: 200,
        verbose: false
      }
    );
  });

  /**
   * Property: Deduplication with no duplicates
   *
   * **Validates: Requirements 7.5**
   */
  it('should return identical array when no duplicates exist', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 0, maxLength: 50 }
        ).chain(arr => {
          // Ensure all elements are unique
          const unique = [...new Set(arr)];
          return fc.constant(unique);
        }),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);

          // Should be identical since no duplicates
          expect(deduplicated).toEqual(nodeIds);
          expect(deduplicated.length).toBe(nodeIds.length);

          // Idempotency
          const deduplicatedAgain = (service as any).deduplicateNodes(deduplicated);
          expect(deduplicatedAgain).toEqual(nodeIds);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Deduplication is commutative with concatenation
   *
   * **Validates: Requirements 7.5**
   */
  it('should produce same result regardless of input order when combined', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 1, maxLength: 30 }
        ),
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 1, maxLength: 30 }
        ),
        (nodeIds1, nodeIds2) => {
          // Deduplicate concatenation in both orders
          const combined1 = (service as any).deduplicateNodes([...nodeIds1, ...nodeIds2]);
          const combined2 = (service as any).deduplicateNodes([...nodeIds2, ...nodeIds1]);

          // Both should contain the same unique elements (though order may differ)
          const set1 = new Set(combined1);
          const set2 = new Set(combined2);

          expect(set1).toEqual(set2);
          expect(combined1.length).toBe(combined2.length);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Deduplication result size bounds
   *
   * **Validates: Requirements 7.5**
   */
  it('should produce result with size between 0 and input length', async () => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => `node-${s}`),
          { minLength: 0, maxLength: 100 }
        ),
        (nodeIds) => {
          const deduplicated = (service as any).deduplicateNodes(nodeIds);

          // Result size should be within bounds
          expect(deduplicated.length).toBeGreaterThanOrEqual(0);
          expect(deduplicated.length).toBeLessThanOrEqual(nodeIds.length);

          // If input is empty, output is empty
          if (nodeIds.length === 0) {
            expect(deduplicated.length).toBe(0);
          }

          // If input has elements, output has at least 1 (unless input was empty)
          if (nodeIds.length > 0) {
            expect(deduplicated.length).toBeGreaterThan(0);
          }
        }
      ),
      {
        numRuns: 500,
        verbose: false
      }
    );
  });
});
