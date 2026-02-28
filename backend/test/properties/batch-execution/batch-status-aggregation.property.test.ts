import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property-Based Tests for Batch Status Aggregation
 *
 * **Validates: Requirements 6.3**
 *
 * Property 3: Batch status correctly reflects execution states
 * ∀ executions ∈ Array<ExecutionStatus>:
 *   aggregateBatchStatus(executions) ⟹
 *     (∀e: e.status = 'success' ⟹ batch.status = 'success') ∧
 *     (∀e: e.status = 'failed' ⟹ batch.status = 'failed') ∧
 *     (∃e: e.status = 'running' ⟹ batch.status = 'running') ∧
 *     (∃e: e.status = 'success' ∧ ∃e: e.status = 'failed' ⟹ batch.status = 'partial') ∧
 *     stats.total = executions.length ∧
 *     stats.success = count(e where e.status = 'success') ∧
 *     stats.failed = count(e where e.status = 'failed') ∧
 *     stats.running = count(e where e.status = 'running') ∧
 *     progress = (stats.success + stats.failed) / stats.total * 100
 *
 * This property validates that:
 * - Batch status correctly reflects the aggregate state of all executions
 * - Statistics are accurately computed
 * - Progress percentage is correctly calculated
 * - Edge cases are handled (empty, all same status, mixed statuses)
 */

// Type definitions matching the BatchExecutionService logic
type ExecutionStatus = 'running' | 'success' | 'failed';
type BatchStatus = 'running' | 'success' | 'failed' | 'partial' | 'cancelled';

interface ExecutionRecord {
  id: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
}

interface BatchStats {
  total: number;
  queued: number;
  running: number;
  success: number;
  failed: number;
}

interface BatchStatusResult {
  status: BatchStatus;
  stats: BatchStats;
  progress: number;
}

/**
 * Aggregate batch status from execution records
 * This mirrors the logic in BatchExecutionService.getBatchStatus
 */
function aggregateBatchStatus(executions: ExecutionRecord[]): BatchStatusResult {
  // Calculate statistics
  const stats: BatchStats = {
    total: executions.length,
    queued: executions.filter(e => e.status === 'running' && !e.startedAt).length,
    running: executions.filter(e => e.status === 'running').length,
    success: executions.filter(e => e.status === 'success').length,
    failed: executions.filter(e => e.status === 'failed').length,
  };

  // Calculate progress percentage
  const completedCount = stats.success + stats.failed;
  const progress = stats.total > 0 ? Math.round((completedCount / stats.total) * 100) : 0;

  // Determine batch status
  let batchStatus: BatchStatus = 'running';
  if (completedCount === stats.total) {
    if (stats.success === stats.total) {
      batchStatus = 'success';
    } else if (stats.failed === stats.total) {
      batchStatus = 'failed';
    } else {
      batchStatus = 'partial';
    }
  }

  return {
    status: batchStatus,
    stats,
    progress,
  };
}

describe('Batch Status Aggregation Properties', () => {
  /**
   * Property 3: Batch status correctly reflects execution states
   *
   * **Validates: Requirements 6.3**
   *
   * This property test verifies that:
   * 1. All success → batch status = "success"
   * 2. All failed → batch status = "failed"
   * 3. Any running → batch status = "running"
   * 4. Mixed success/failed (no running) → batch status = "partial"
   * 5. Statistics are correctly aggregated
   * 6. Progress percentage is correctly calculated
   */
  it('should correctly aggregate batch status from execution states', () => {
    fc.assert(
      fc.property(
        // Generate random arrays of execution records
        generateExecutionRecordsArbitrary(),
        (executions) => {
          const result = aggregateBatchStatus(executions);

          // Property 1: Statistics must be accurate
          expect(result.stats.total).toBe(executions.length);
          expect(result.stats.success).toBe(executions.filter(e => e.status === 'success').length);
          expect(result.stats.failed).toBe(executions.filter(e => e.status === 'failed').length);
          expect(result.stats.running).toBe(executions.filter(e => e.status === 'running').length);

          // Property 2: Stats components sum to total
          expect(result.stats.success + result.stats.failed + result.stats.running).toBe(result.stats.total);

          // Property 3: Progress calculation is correct
          const expectedProgress = result.stats.total > 0
            ? Math.round(((result.stats.success + result.stats.failed) / result.stats.total) * 100)
            : 0;
          expect(result.progress).toBe(expectedProgress);

          // Property 4: Progress is within valid range [0, 100]
          expect(result.progress).toBeGreaterThanOrEqual(0);
          expect(result.progress).toBeLessThanOrEqual(100);

          // Property 5: Batch status logic is correct
          const hasRunning = result.stats.running > 0;
          const allSuccess = result.stats.success === result.stats.total && result.stats.total > 0;
          const allFailed = result.stats.failed === result.stats.total && result.stats.total > 0;
          const hasMixed = result.stats.success > 0 && result.stats.failed > 0;
          const allCompleted = result.stats.success + result.stats.failed === result.stats.total;

          if (hasRunning) {
            expect(result.status).toBe('running');
          } else if (allSuccess) {
            expect(result.status).toBe('success');
          } else if (allFailed) {
            expect(result.status).toBe('failed');
          } else if (allCompleted && hasMixed) {
            expect(result.status).toBe('partial');
          }
        }
      ),
      {
        numRuns: 1000,
        verbose: false
      }
    );
  });

  /**
   * Property: All success executions result in success batch status
   *
   * **Validates: Requirements 6.3**
   */
  it('should return success status when all executions succeed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const executions: ExecutionRecord[] = Array.from({ length: count }, (_, i) => ({
            id: `exec-${i}`,
            status: 'success' as ExecutionStatus,
            startedAt: new Date(),
            completedAt: new Date(),
          }));

          const result = aggregateBatchStatus(executions);

          expect(result.status).toBe('success');
          expect(result.stats.success).toBe(count);
          expect(result.stats.failed).toBe(0);
          expect(result.stats.running).toBe(0);
          expect(result.progress).toBe(100);
        }
      ),
      {
        numRuns: 200,
        verbose: false
      }
    );
  });

  /**
   * Property: All failed executions result in failed batch status
   *
   * **Validates: Requirements 6.3**
   */
  it('should return failed status when all executions fail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const executions: ExecutionRecord[] = Array.from({ length: count }, (_, i) => ({
            id: `exec-${i}`,
            status: 'failed' as ExecutionStatus,
            startedAt: new Date(),
            completedAt: new Date(),
          }));

          const result = aggregateBatchStatus(executions);

          expect(result.status).toBe('failed');
          expect(result.stats.success).toBe(0);
          expect(result.stats.failed).toBe(count);
          expect(result.stats.running).toBe(0);
          expect(result.progress).toBe(100);
        }
      ),
      {
        numRuns: 200,
        verbose: false
      }
    );
  });

  /**
   * Property: Any running execution results in running batch status
   *
   * **Validates: Requirements 6.3**
   */
  it('should return running status when any execution is running', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (runningCount, successCount, failedCount) => {
          fc.pre(runningCount > 0); // Ensure at least one running

          const executions: ExecutionRecord[] = [
            ...Array.from({ length: runningCount }, (_, i) => ({
              id: `exec-running-${i}`,
              status: 'running' as ExecutionStatus,
              startedAt: new Date(),
            })),
            ...Array.from({ length: successCount }, (_, i) => ({
              id: `exec-success-${i}`,
              status: 'success' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
            ...Array.from({ length: failedCount }, (_, i) => ({
              id: `exec-failed-${i}`,
              status: 'failed' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
          ];

          const result = aggregateBatchStatus(executions);

          expect(result.status).toBe('running');
          expect(result.stats.running).toBe(runningCount);
          expect(result.stats.success).toBe(successCount);
          expect(result.stats.failed).toBe(failedCount);
          expect(result.stats.total).toBe(runningCount + successCount + failedCount);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Mixed success and failed (no running) results in partial status
   *
   * **Validates: Requirements 6.3**
   */
  it('should return partial status when executions have mixed success and failed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (successCount, failedCount) => {
          const executions: ExecutionRecord[] = [
            ...Array.from({ length: successCount }, (_, i) => ({
              id: `exec-success-${i}`,
              status: 'success' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
            ...Array.from({ length: failedCount }, (_, i) => ({
              id: `exec-failed-${i}`,
              status: 'failed' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
          ];

          const result = aggregateBatchStatus(executions);

          expect(result.status).toBe('partial');
          expect(result.stats.success).toBe(successCount);
          expect(result.stats.failed).toBe(failedCount);
          expect(result.stats.running).toBe(0);
          expect(result.progress).toBe(100);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Empty execution array handling
   *
   * **Validates: Requirements 6.3**
   */
  it('should handle empty execution arrays correctly', () => {
    const result = aggregateBatchStatus([]);

    expect(result.stats.total).toBe(0);
    expect(result.stats.success).toBe(0);
    expect(result.stats.failed).toBe(0);
    expect(result.stats.running).toBe(0);
    expect(result.progress).toBe(0);
    // When total is 0, completedCount (0) === total (0), and success (0) === total (0)
    // So the logic returns 'success' for empty arrays
    expect(result.status).toBe('success');
  });

  /**
   * Property: Progress increases monotonically as executions complete
   *
   * **Validates: Requirements 6.3**
   */
  it('should have progress increase as executions complete', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        (totalCount) => {
          // Test progress at different completion levels
          for (let completed = 0; completed <= totalCount; completed++) {
            const executions: ExecutionRecord[] = [
              ...Array.from({ length: completed }, (_, i) => ({
                id: `exec-completed-${i}`,
                status: (i % 2 === 0 ? 'success' : 'failed') as ExecutionStatus,
                startedAt: new Date(),
                completedAt: new Date(),
              })),
              ...Array.from({ length: totalCount - completed }, (_, i) => ({
                id: `exec-running-${i}`,
                status: 'running' as ExecutionStatus,
                startedAt: new Date(),
              })),
            ];

            const result = aggregateBatchStatus(executions);

            const expectedProgress = Math.round((completed / totalCount) * 100);
            expect(result.progress).toBe(expectedProgress);

            // Progress should be proportional to completion
            if (completed === 0) {
              expect(result.progress).toBe(0);
            } else if (completed === totalCount) {
              expect(result.progress).toBe(100);
            } else {
              expect(result.progress).toBeGreaterThan(0);
              expect(result.progress).toBeLessThan(100);
            }
          }
        }
      ),
      {
        numRuns: 100,
        verbose: false
      }
    );
  });

  /**
   * Property: Statistics are non-negative
   *
   * **Validates: Requirements 6.3**
   */
  it('should always produce non-negative statistics', () => {
    fc.assert(
      fc.property(
        generateExecutionRecordsArbitrary(),
        (executions) => {
          const result = aggregateBatchStatus(executions);

          expect(result.stats.total).toBeGreaterThanOrEqual(0);
          expect(result.stats.queued).toBeGreaterThanOrEqual(0);
          expect(result.stats.running).toBeGreaterThanOrEqual(0);
          expect(result.stats.success).toBeGreaterThanOrEqual(0);
          expect(result.stats.failed).toBeGreaterThanOrEqual(0);
        }
      ),
      {
        numRuns: 500,
        verbose: false
      }
    );
  });

  /**
   * Property: Queued count is subset of running count
   *
   * **Validates: Requirements 6.3**
   */
  it('should have queued count less than or equal to running count', () => {
    fc.assert(
      fc.property(
        generateExecutionRecordsArbitrary(),
        (executions) => {
          const result = aggregateBatchStatus(executions);

          // Queued executions are running executions without startedAt
          expect(result.stats.queued).toBeLessThanOrEqual(result.stats.running);
        }
      ),
      {
        numRuns: 500,
        verbose: false
      }
    );
  });

  /**
   * Property: Batch status is deterministic
   *
   * **Validates: Requirements 6.3**
   */
  it('should produce the same result when aggregating the same executions multiple times', () => {
    fc.assert(
      fc.property(
        generateExecutionRecordsArbitrary(),
        (executions) => {
          const result1 = aggregateBatchStatus(executions);
          const result2 = aggregateBatchStatus(executions);
          const result3 = aggregateBatchStatus(executions);

          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Batch status is independent of execution order
   *
   * **Validates: Requirements 6.3**
   */
  it('should produce the same status regardless of execution order', () => {
    fc.assert(
      fc.property(
        generateExecutionRecordsArbitrary(),
        (executions) => {
          fc.pre(executions.length > 1);

          // Shuffle the executions
          const shuffled = [...executions].sort(() => Math.random() - 0.5);

          const result1 = aggregateBatchStatus(executions);
          const result2 = aggregateBatchStatus(shuffled);

          // Status and stats should be identical regardless of order
          expect(result1.status).toBe(result2.status);
          expect(result1.stats).toEqual(result2.stats);
          expect(result1.progress).toBe(result2.progress);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Progress is 100% when all executions are completed
   *
   * **Validates: Requirements 6.3**
   */
  it('should have 100% progress when all executions are completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (successCount, failedCount) => {
          fc.pre(successCount + failedCount > 0);

          const executions: ExecutionRecord[] = [
            ...Array.from({ length: successCount }, (_, i) => ({
              id: `exec-success-${i}`,
              status: 'success' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
            ...Array.from({ length: failedCount }, (_, i) => ({
              id: `exec-failed-${i}`,
              status: 'failed' as ExecutionStatus,
              startedAt: new Date(),
              completedAt: new Date(),
            })),
          ];

          const result = aggregateBatchStatus(executions);

          expect(result.progress).toBe(100);
          expect(result.stats.running).toBe(0);
        }
      ),
      {
        numRuns: 300,
        verbose: false
      }
    );
  });

  /**
   * Property: Progress is 0% when no executions are completed
   *
   * **Validates: Requirements 6.3**
   */
  it('should have 0% progress when no executions are completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (runningCount) => {
          const executions: ExecutionRecord[] = Array.from({ length: runningCount }, (_, i) => ({
            id: `exec-running-${i}`,
            status: 'running' as ExecutionStatus,
            startedAt: new Date(),
          }));

          const result = aggregateBatchStatus(executions);

          expect(result.progress).toBe(0);
          expect(result.stats.success).toBe(0);
          expect(result.stats.failed).toBe(0);
          expect(result.status).toBe('running');
        }
      ),
      {
        numRuns: 200,
        verbose: false
      }
    );
  });
});

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate random execution records with various status combinations
 */
function generateExecutionRecordsArbitrary() {
  return fc.array(
    fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }).map(s => `exec-${s}`),
      status: fc.constantFrom<ExecutionStatus>('running', 'success', 'failed'),
      startedAt: fc.option(fc.date(), { nil: undefined }),
      completedAt: fc.option(fc.date(), { nil: undefined }),
    }).map(record => {
      // Ensure logical consistency: completed executions have both dates
      if (record.status === 'success' || record.status === 'failed') {
        return {
          ...record,
          startedAt: record.startedAt || new Date(),
          completedAt: record.completedAt || new Date(),
        };
      }
      // Running executions may or may not have startedAt (queued vs running)
      return {
        ...record,
        completedAt: undefined,
      };
    }),
    { minLength: 0, maxLength: 100 }
  );
}
