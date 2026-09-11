/**
 * Storage-ownership regressions for execution records (A12).
 *
 * The adapter-level ownership rules are covered by
 * `transaction-isolation.test.ts`. These tests cover the storage operations
 * built on top of them: a multi-statement write against the execution tables
 * must either apply completely or not at all, and two overlapping writers
 * must not overwrite each other's result.
 *
 * The Postgres variants are skipped unless TEST_DATABASE_URL points at a
 * throwaway server; each run isolates itself in its own schema.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import type { ExecutionRecord } from '../../src/database/ExecutionRepository';
import { BatchExecutionService } from '../../src/services/BatchExecutionService';
import type { ExecutionQueue } from '../../src/services/ExecutionQueue';
import type { IntegrationManager } from '../../src/integrations/IntegrationManager';

const databaseUrl = process.env.TEST_DATABASE_URL;

/**
 * Wraps an adapter so that one statement of a multi-statement operation
 * fails, leaving every other statement untouched. Transaction control stays
 * on the underlying adapter, so the rollback it performs is the real one.
 */
function failingOn(
  adapter: DatabaseAdapter,
  pattern: RegExp,
  message: string,
): DatabaseAdapter {
  return {
    query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return adapter.query<T>(sql, params);
    },
    queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      return adapter.queryOne<T>(sql, params);
    },
    execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
      if (pattern.test(sql)) {
        return Promise.reject(new Error(message));
      }
      return adapter.execute(sql, params);
    },
    withExclusiveConnection<T>(fn: () => Promise<T>): Promise<T> {
      return adapter.withExclusiveConnection(fn);
    },
    withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      return adapter.withTransaction(fn);
    },
    initialize: () => adapter.initialize(),
    close: () => adapter.close(),
    isConnected: () => adapter.isConnected(),
    getDialect: () => adapter.getDialect(),
  };
}

function sampleExecution(): Omit<ExecutionRecord, 'id'> {
  return {
    type: 'command',
    targetNodes: ['node1'],
    action: 'uptime',
    status: 'running',
    startedAt: '2026-09-11T10:00:00Z',
    results: [],
    executionTool: 'bolt',
  };
}

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: execution storage ownership`, () => {
    let db: DatabaseAdapter;
    let control: PostgresAdapter | null = null;
    let schema = '';
    let repository: ExecutionRepository;

    beforeEach(async () => {
      if (dialect === 'postgres' && databaseUrl) {
        schema = `exec_own_${randomUUID().replaceAll('-', '')}`;
        control = new PostgresAdapter(databaseUrl);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-csearch_path=${schema}`);
        db = new PostgresAdapter(url.toString());
      } else {
        db = new SQLiteAdapter(':memory:');
      }
      await db.initialize();
      await new MigrationRunner(db).runPendingMigrations();
      repository = new ExecutionRepository(db);
    });

    afterEach(async () => {
      await db.close();
      if (control) {
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        control = null;
      }
    });

    it('counts both re-executions when two requests target the same original', async () => {
      const originalId = await repository.create(sampleExecution());

      const [first, second] = await Promise.all([
        repository.createReExecution(originalId, sampleExecution()),
        repository.createReExecution(originalId, sampleExecution()),
      ]);

      expect(first).not.toBe(second);
      const original = await repository.findById(originalId);
      expect(original?.reExecutionCount).toBe(2);
      expect(await repository.findReExecutions(originalId)).toHaveLength(2);
    });

    it('discards the new execution when the original counter cannot be incremented', async () => {
      const originalId = await repository.create(sampleExecution());
      const failing = new ExecutionRepository(
        failingOn(db, /UPDATE executions/, 'counter write failed'),
      );

      await expect(
        failing.createReExecution(originalId, sampleExecution()),
      ).rejects.toThrow('counter write failed');

      const original = await repository.findById(originalId);
      expect(original?.reExecutionCount).toBe(0);
      expect(await repository.findReExecutions(originalId)).toHaveLength(0);
    });

    it('rejects a re-execution of an original that does not exist', async () => {
      await expect(
        repository.createReExecution('missing', sampleExecution()),
      ).rejects.toThrow('Original execution not found');
      expect(await repository.findAll()).toHaveLength(0);
    });

    it('leaves a batch entirely uncancelled when the batch status write fails', async () => {
      const batchId = randomUUID();
      const executionIds = [randomUUID(), randomUUID()];
      await db.execute(
        `INSERT INTO batch_executions (
          id, type, "action", parameters, target_nodes, target_groups, status,
          created_at, started_at, completed_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId, 'command', 'uptime', null, JSON.stringify(['node1', 'node2']),
          JSON.stringify([]), 'running', '2026-09-11T10:00:00Z', '2026-09-11T10:00:00Z',
          null, 'user', JSON.stringify(executionIds), 2, 0, 2, 0, 0,
        ],
      );
      for (const [position, id] of executionIds.entries()) {
        await db.execute(
          `INSERT INTO executions (
            id, type, target_nodes, "action", status, started_at, results,
            execution_tool, batch_id, batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, 'command', JSON.stringify([`node${String(position + 1)}`]), 'uptime',
            'running', '2026-09-11T10:00:00Z', JSON.stringify([]), 'bolt', batchId, position,
          ],
        );
      }

      const service = new BatchExecutionService(
        failingOn(db, /UPDATE batch_executions/, 'batch write failed'),
        {} as ExecutionQueue,
        {} as ExecutionRepository,
        {} as IntegrationManager,
      );

      await expect(service.cancelBatch(batchId)).rejects.toThrow('batch write failed');

      const children = await db.query<{ status: string; error: string | null }>(
        'SELECT status, error FROM executions WHERE batch_id = ?',
        [batchId],
      );
      expect(children).toHaveLength(2);
      expect(children.every(child => child.status === 'running' && child.error === null)).toBe(true);
      const batch = await db.queryOne<{ status: string }>(
        'SELECT status FROM batch_executions WHERE id = ?',
        [batchId],
      );
      expect(batch?.status).toBe('running');
    });
  });
}
