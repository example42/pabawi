import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { DatabaseService } from '../../src/database/DatabaseService';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import { ExecutionQueue } from '../../src/services/ExecutionQueue';
import { BatchExecutionService } from '../../src/services/BatchExecutionService';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const databaseUrl = process.env.TEST_DATABASE_URL;
for (const dialect of ['sqlite', 'postgres'] as const) {
describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: durable batch lifecycle`, () => {
  let control: PostgresAdapter | undefined;
  let schema: string;
  let database: DatabaseService;
  let repository: ExecutionRepository;
  let queue: ExecutionQueue;
  let manager: IntegrationManager;
  let service: BatchExecutionService;
  let gate: ReturnType<typeof deferred>;

  beforeEach(async () => {
    if (dialect === 'postgres' && databaseUrl) {
      control = new PostgresAdapter(databaseUrl);
      await control.initialize();
      schema = `batch_${randomUUID().replaceAll('-', '')}`;
      await control.execute(`CREATE SCHEMA ${schema}`);
      const url = new URL(databaseUrl);
      url.searchParams.set('options', `-csearch_path=${schema}`);
      database = new DatabaseService(':memory:', 'postgres', url.toString());
    } else {
      database = new DatabaseService(':memory:');
    }
    await database.initialize();
    repository = new ExecutionRepository(database.getAdapter());
    queue = new ExecutionQueue(1, 2);
    manager = new IntegrationManager();
    vi.spyOn(manager, 'getAggregatedInventory').mockResolvedValue({
      nodes: ['one', 'two', 'three', 'four'].map(id => ({ id, name: id, uri: id, source: 'bolt', sources: ['bolt'], linked: false, sourceData: {} })),
      groups: [], sources: {},
    });
    gate = deferred();
    vi.spyOn(manager, 'executeAction').mockImplementation(async (_tool, action) => {
      await gate.promise;
      return { id: 'provider', type: 'command', targetNodes: [String(action.target)], action: action.action,
        status: 'success', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), results: [] };
    });
    service = new BatchExecutionService(database.getAdapter(), queue, repository, manager);
  });

  afterEach(async () => {
    gate.resolve();
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    await new Promise(resolve => setTimeout(resolve, 20));
    await database.close();
    if (control) { await control.execute(`DROP SCHEMA ${schema} CASCADE`); await control.close(); control = undefined; }
    vi.restoreAllMocks();
  });

  const request = (targetNodeIds = ['one', 'two']) => ({ targetNodeIds, type: 'command' as const, action: 'uptime' });

  it('returns a durable ID with queued children before blocked work completes', async () => {
    let admitted = false;
    const creation = service.createBatch(request(), 'actor').then(result => { admitted = true; return result; });
    try {
      await vi.waitFor(() => expect(admitted).toBe(true), { timeout: 300 });
      const result = await creation;
      const status = await service.getBatchStatus(result.batchId);
      expect(status.batch.stats.running).toBe(1);
      expect(status.batch.stats.queued).toBe(1);
      expect(status.executions.find(execution => execution.status === 'queued')?.startedAt).toBeUndefined();
      expect(await repository.findAll()).toHaveLength(2);
    } finally {
      gate.resolve();
      await creation;
    }
  });

  it('rejects an oversized batch before inserting records or contacting a provider', async () => {
    gate.resolve();
    await expect(service.createBatch(request(['one', 'two', 'three', 'four']), 'actor')).rejects.toThrow(/queue.*full/i);
    expect(manager.executeAction).not.toHaveBeenCalled();
    expect(await repository.findAll()).toHaveLength(0);
  });

  it('rolls back all children and reservations if parent persistence fails', async () => {
    const db = database.getAdapter();
    const execute = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation((sql, params) => {
      if (/INSERT INTO batch_executions/.test(sql)) throw new Error('injected parent failure');
      return execute(sql, params);
    });
    gate.resolve();
    await expect(service.createBatch(request(), 'actor')).rejects.toThrow('injected parent failure');
    expect(manager.executeAction).not.toHaveBeenCalled();
    expect(await repository.findAll()).toHaveLength(0);
    expect(queue.getStatus()).toMatchObject({ queued: 0, running: 0 });
  });

  it('cancels queued work without claiming running work has stopped or losing cancellation at completion', async () => {
    const creation = service.createBatch(request(), 'actor');
    // The timeout makes the pre-fix blocking admission fail without hanging teardown.
    const result = await Promise.race([creation, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('admission blocked')), 300))]);
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(1));
    const cancelled = await service.cancelBatch(result.batchId);
    expect(cancelled).toMatchObject({ cancelledCount: 1, runningCount: 1 });
    const pending = await service.getBatchStatus(result.batchId);
    expect(pending.batch.status).toBe('running');
    expect(pending.batch.cancellationRequestedAt).toBeDefined();
    gate.resolve();
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    const completed = await service.getBatchStatus(result.batchId);
    expect(manager.executeAction).toHaveBeenCalledTimes(1);
    expect(completed.batch.status).toBe('cancelled');
    expect(completed.batch.cancellationRequestedAt).toBeDefined();
    expect(completed.executions.map(execution => execution.status)).toEqual(['success', 'cancelled']);
    expect(completed.progress).toBe(100);
  });

  it('rejects concurrent over-admission without partial records', async () => {
    const outcomes = await Promise.allSettled([service.createBatch(request(), 'first'), service.createBatch(request(), 'second')]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    expect(await repository.findAll()).toHaveLength(2);
  });

  it('waits for an admission in progress before reconciling shutdown', async () => {
    const persisted = deferred();
    const finishAdmission = deferred();
    const create = repository.create.bind(repository);
    vi.spyOn(repository, 'create').mockImplementation(async (record, id) => {
      const result = await create(record, id);
      persisted.resolve();
      await finishAdmission.promise;
      return result;
    });
    const admission = service.createBatch(request(), 'actor');
    await persisted.promise;
    service.stopAdmission();
    let reconciled = false;
    const recovery = service.reconcileInterrupted().then(count => { reconciled = true; return count; });
    try {
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(reconciled).toBe(false);
    } finally {
      finishAdmission.resolve();
    }
    const result = await admission;
    expect(await recovery).toBe(2);
    expect((await service.getBatchStatus(result.batchId)).executions.map(row => row.status)).toEqual(['cancelled', 'cancelled']);
    expect(manager.executeAction).not.toHaveBeenCalled();
    await expect(service.createBatch(request(), 'actor')).rejects.toThrow('admission is stopped');
  });

  it('retains a single-child cancellation while other queued targets can still be cancelled', async () => {
    const result = await service.createBatch(request(['one', 'two', 'three']), 'actor');
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(1));
    await service.cancelExecution(result.executionIds[1], result.batchId);
    const filtered = await service.getBatchStatus(result.batchId, 'cancelled');
    expect(filtered.executions).toHaveLength(1);
    expect(filtered.batch.stats).toMatchObject({ total: 3, running: 1, queued: 1, cancelled: 1 });
    expect(filtered.progress).toBe(33);
    expect(await service.cancelBatch(result.batchId)).toEqual({ cancelledCount: 1, runningCount: 1 });
    gate.resolve();
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    expect(manager.executeAction).toHaveBeenCalledTimes(1);
  });

  it.each(['failed', 'partial'] as const)('preserves a provider %s result', async status => {
    vi.mocked(manager.executeAction).mockResolvedValue({
      id: 'provider', type: 'command', targetNodes: ['one'], action: 'uptime',
      status, startedAt: new Date().toISOString(), results: [], error: 'provider failure',
    });
    const result = await service.createBatch(request(['one']), 'actor');
    await vi.waitFor(async () => expect((await service.getBatchStatus(result.batchId)).batch.status).toBe(status));
    expect((await repository.findById(result.executionIds[0]))?.error).toBe('provider failure');
  });

  it('records an unknown outcome when dispatch throws', async () => {
    vi.mocked(manager.executeAction).mockRejectedValue(new Error('connection lost after dispatch'));
    const result = await service.createBatch(request(['one']), 'actor');
    await vi.waitFor(async () => expect((await service.getBatchStatus(result.batchId)).batch.status).toBe('interrupted'));
    expect((await repository.findById(result.executionIds[0]))?.error).toContain('connection lost');
  });

  it('rolls back the parent and earlier children when a later child fails', async () => {
    const create = repository.create.bind(repository);
    let writes = 0;
    vi.spyOn(repository, 'create').mockImplementation((record, id) => {
      if (++writes === 2) throw new Error('injected second child failure');
      return create(record, id);
    });
    await expect(service.createBatch(request(), 'actor')).rejects.toThrow('second child failure');
    expect(await repository.findAll()).toHaveLength(0);
    expect(await database.getAdapter().query('SELECT id FROM batch_executions')).toHaveLength(0);
    expect(queue.getStatus()).toMatchObject({ running: 0, queued: 0 });
    expect(manager.executeAction).not.toHaveBeenCalled();
  });

  it('does not dispatch cancelled entries even when queue slots are released during cancellation', async () => {
    const result = await service.createBatch(request(), 'actor');
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(1));
    const cancellation = service.cancelBatch(result.batchId);
    gate.resolve();
    await cancellation;
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    expect(manager.executeAction).toHaveBeenCalledTimes(1);
    expect((await service.getBatchStatus(result.batchId)).executions[1].status).toBe('cancelled');
  });

  it('preserves cancellation rollback without removing queued work on a failed transaction', async () => {
    const result = await service.createBatch(request(), 'actor');
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(1));
    const db = database.getAdapter();
    const execute = db.execute.bind(db);
    const failure = vi.spyOn(db, 'execute').mockImplementation((sql, params) => {
      if (/UPDATE batch_executions SET cancellation_requested_at/.test(sql)) throw new Error('cancellation persistence failed');
      return execute(sql, params);
    });
    await expect(service.cancelBatch(result.batchId)).rejects.toThrow('cancellation persistence failed');
    failure.mockRestore();
    expect(queue.getStatus().queued).toBe(1);
    expect((await service.getBatchStatus(result.batchId)).executions.map(row => row.status)).toEqual(['running', 'queued']);
    gate.resolve();
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(2));
  });

  it('reconciles persisted interrupted work after reopening without automatic replay', async () => {
    const path = join(tmpdir(), `pabawi-batch-restart-${randomUUID()}.sqlite`);
    if (dialect === 'sqlite') {
      await database.close();
      database = new DatabaseService(path);
      await database.initialize();
      repository = new ExecutionRepository(database.getAdapter());
      service = new BatchExecutionService(database.getAdapter(), queue, repository, manager);
    }
    const result = await service.createBatch(request(), 'actor');
    await vi.waitFor(() => expect(manager.executeAction).toHaveBeenCalledTimes(1));
    service.stopAdmission();
    gate.resolve();
    await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
    await database.close();
    const url = new URL(databaseUrl ?? 'postgres://localhost/test');
    url.searchParams.set('options', `-csearch_path=${schema}`);
    database = new DatabaseService(path, dialect, dialect === 'postgres' ? url.toString() : undefined);
    await database.initialize();
    repository = new ExecutionRepository(database.getAdapter());
    service = new BatchExecutionService(database.getAdapter(), new ExecutionQueue(1, 2), repository, manager);
    expect(await service.reconcileInterrupted()).toBe(2);
    const status = await service.getBatchStatus(result.batchId);
    expect(status.executions.map(row => row.status)).toEqual(['interrupted', 'cancelled']);
    expect(status.batch.status).toBe('interrupted');
    expect(status.progress).toBe(100);
    expect(status.executions[0].error).toContain('provider outcome is unknown');
    expect(await service.reconcileInterrupted()).toBe(0);
    expect(manager.executeAction).toHaveBeenCalledTimes(1);
  });
});

}
