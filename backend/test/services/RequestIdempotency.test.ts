/**
 * Durable request idempotency (A14 / I05).
 *
 * The contract: a submission carrying a key is decided once. A replay returns
 * the decided response and performs no work; a key reused for a different
 * request is refused rather than answered with someone else's outcome; and a
 * rolled-back admission takes its key with it, because the key and the work it
 * admits live in the same transaction.
 *
 * Both dialects are exercised. The PostgreSQL variants are skipped unless
 * TEST_DATABASE_URL points at a throwaway server; each run isolates itself in
 * its own schema.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { DatabaseService } from '../../src/database/DatabaseService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import { ExecutionQueue } from '../../src/services/ExecutionQueue';
import { BatchExecutionService } from '../../src/services/BatchExecutionService';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import {
  IdempotencyConflictError,
  IdempotencyKeyError,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  RequestIdempotencyService,
} from '../../src/services/RequestIdempotencyService';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Fails one statement of a multi-statement admission, leaving the rest alone. */
function failingOn(adapter: DatabaseAdapter, pattern: RegExp, message: string): DatabaseAdapter {
  return {
    query: (sql, params) => adapter.query(sql, params),
    queryOne: (sql, params) => adapter.queryOne(sql, params),
    execute: (sql, params) => pattern.test(sql)
      ? Promise.reject(new Error(message))
      : adapter.execute(sql, params),
    withExclusiveConnection: (fn) => adapter.withExclusiveConnection(fn),
    withTransaction: (fn) => adapter.withTransaction(fn),
    initialize: () => adapter.initialize(),
    close: () => adapter.close(),
    isConnected: () => adapter.isConnected(),
    getDialect: () => adapter.getDialect(),
  };
}

const databaseUrl = process.env.TEST_DATABASE_URL;

for (const dialect of ['sqlite', 'postgres'] as const) {
describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: durable request idempotency`, () => {
  let control: PostgresAdapter | undefined;
  let schema = '';
  let database: DatabaseService;
  let db: DatabaseAdapter;
  let idempotency: RequestIdempotencyService;

  beforeEach(async () => {
    if (dialect === 'postgres' && databaseUrl) {
      control = new PostgresAdapter(databaseUrl);
      await control.initialize();
      schema = `idem_${randomUUID().replaceAll('-', '')}`;
      await control.execute(`CREATE SCHEMA ${schema}`);
      const url = new URL(databaseUrl);
      url.searchParams.set('options', `-csearch_path=${schema}`);
      database = new DatabaseService(':memory:', 'postgres', url.toString());
    } else {
      database = new DatabaseService(':memory:');
    }
    await database.initialize();
    db = database.getAdapter();
    idempotency = new RequestIdempotencyService(db);
  });

  afterEach(async () => {
    await database.close();
    if (control) {
      await control.execute(`DROP SCHEMA ${schema} CASCADE`);
      await control.close();
      control = undefined;
    }
    vi.restoreAllMocks();
  });

  const scope = 'POST /api/test';
  const submission = (key: string, request: unknown = { action: 'uptime' }) => ({
    userId: 'actor',
    key,
    scope,
    fingerprint: RequestIdempotencyService.fingerprint(scope, request),
  });

  describe('claim and replay', () => {
    it('admits once and replays the decided response afterwards', async () => {
      const admitted: string[] = [];
      const first = await idempotency.run(
        submission('key-1'), { status: 202, body: { id: 'run-1' } },
        async () => { admitted.push('first'); await Promise.resolve(); },
      );
      const second = await idempotency.run(
        submission('key-1'), { status: 202, body: { id: 'run-2' } },
        async () => { admitted.push('second'); await Promise.resolve(); },
      );

      expect(first).toEqual({ claimed: true });
      expect(second).toEqual({ claimed: false, replay: { status: 202, body: { id: 'run-1' } } });
      // The replay must not perform the work, and must answer with the
      // identifiers the first caller was given rather than the new ones.
      expect(admitted).toEqual(['first']);
    });

    it('refuses a key reused for a different request', async () => {
      await idempotency.run(submission('key-1'), { status: 202, body: {} }, () => Promise.resolve());

      await expect(idempotency.run(
        submission('key-1', { action: 'rm -rf /' }), { status: 202, body: {} },
        () => Promise.resolve(),
      )).rejects.toThrow(IdempotencyConflictError);
    });

    it('refuses a key reused on a different route', async () => {
      await idempotency.run(submission('key-1'), { status: 202, body: {} }, () => Promise.resolve());

      await expect(idempotency.run(
        { ...submission('key-1'), scope: 'POST /api/other' }, { status: 202, body: {} },
        () => Promise.resolve(),
      )).rejects.toThrow(IdempotencyConflictError);
    });

    it('keeps keys private to their owner', async () => {
      await idempotency.run(submission('shared'), { status: 202, body: { id: 'mine' } }, () => Promise.resolve());

      const other = await idempotency.run(
        { ...submission('shared'), userId: 'other-actor' },
        { status: 202, body: { id: 'theirs' } },
        () => Promise.resolve(),
      );

      // A key is a client-chosen value: one user must never be able to read or
      // block another user's submission by guessing it.
      expect(other).toEqual({ claimed: true });
    });

    it('releases the key when the admission it guards rolls back', async () => {
      const broken = failingOn(db, /INSERT INTO executions/, 'admission failed');
      const failing = new RequestIdempotencyService(broken);
      const repository = new ExecutionRepository(broken);

      await expect(failing.run(
        submission('key-1'), { status: 202, body: {} },
        () => repository.create({ type: 'command', targetNodes: ['node'], action: 'uptime', status: 'running', results: [] }),
      )).rejects.toThrow('admission failed');

      // Nothing was decided, so the key is free and a resubmission can run.
      const retry = await idempotency.run(submission('key-1'), { status: 202, body: { id: 'run-1' } }, () => Promise.resolve());
      expect(retry).toEqual({ claimed: true });
      expect(await db.query('SELECT * FROM request_idempotency')).toHaveLength(1);
    });

    it('admits a submission without a key but cannot replay it', async () => {
      let admissions = 0;
      const admit = async (): Promise<void> => { admissions += 1; await Promise.resolve(); };

      const first = await idempotency.run({ ...submission('unused'), key: undefined }, { status: 202, body: {} }, admit);
      const second = await idempotency.run({ ...submission('unused'), key: undefined }, { status: 202, body: {} }, admit);

      expect(first).toEqual({ claimed: true });
      expect(second).toEqual({ claimed: true });
      expect(admissions).toBe(2);
      expect(await db.query('SELECT * FROM request_idempotency')).toHaveLength(0);
    });

    it('decides a concurrent duplicate exactly once', async () => {
      let admissions = 0;
      const admit = async (): Promise<void> => { admissions += 1; await Promise.resolve(); };

      const outcomes = await Promise.all([
        idempotency.run(submission('key-1'), { status: 202, body: { id: 'a' } }, admit),
        idempotency.run(submission('key-1'), { status: 202, body: { id: 'b' } }, admit),
      ]);

      expect(admissions).toBe(1);
      expect(outcomes.filter(outcome => outcome.claimed)).toHaveLength(1);
      // The loser is told what the winner was promised, not what it asked for.
      const replayed = outcomes.find(outcome => !outcome.claimed);
      expect(replayed).toMatchObject({ claimed: false, replay: { status: 202 } });
      expect(await db.query('SELECT * FROM request_idempotency')).toHaveLength(1);
    });
  });

  describe('key validation', () => {
    it('accepts a printable key and trims surrounding whitespace', () => {
      expect(RequestIdempotencyService.validateKey('  abc-123  ')).toBe('abc-123');
    });

    it('rejects keys that cannot identify a submission', () => {
      expect(() => RequestIdempotencyService.validateKey('   ')).toThrow(IdempotencyKeyError);
      expect(() => RequestIdempotencyService.validateKey('a b')).toThrow(IdempotencyKeyError);
      expect(() => RequestIdempotencyService.validateKey('a'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)))
        .toThrow(IdempotencyKeyError);
    });
  });

  describe('fingerprinting', () => {
    it('ignores key order but not content', () => {
      const left = RequestIdempotencyService.fingerprint(scope, { a: 1, b: [2, 3] });
      const right = RequestIdempotencyService.fingerprint(scope, { b: [2, 3], a: 1 });
      const reordered = RequestIdempotencyService.fingerprint(scope, { a: 1, b: [3, 2] });

      expect(left).toBe(right);
      expect(reordered).not.toBe(left);
    });

    it('separates identical requests on different routes', () => {
      expect(RequestIdempotencyService.fingerprint('POST /a', { x: 1 }))
        .not.toBe(RequestIdempotencyService.fingerprint('POST /b', { x: 1 }));
    });
  });

  describe('retention', () => {
    it('purges decided submissions past the window and keeps recent ones', async () => {
      await idempotency.run(submission('recent'), { status: 202, body: {} }, () => Promise.resolve());
      await db.execute(
        `INSERT INTO request_idempotency (user_id, idempotency_key, scope, fingerprint, response_status, response_body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['actor', 'stale', scope, 'fingerprint', 202, '{}', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()],
      );

      expect(await idempotency.purgeExpired()).toBe(1);
      const remaining = await db.query<{ idempotency_key: string }>('SELECT idempotency_key FROM request_idempotency');
      expect(remaining.map(row => row.idempotency_key)).toEqual(['recent']);
    });
  });

  describe('batch admission', () => {
    let repository: ExecutionRepository;
    let queue: ExecutionQueue;
    let manager: IntegrationManager;
    let service: BatchExecutionService;
    let gate: ReturnType<typeof deferred>;

    beforeEach(() => {
      repository = new ExecutionRepository(db);
      queue = new ExecutionQueue(1, 8);
      manager = new IntegrationManager();
      vi.spyOn(manager, 'getAggregatedInventory').mockResolvedValue({
        nodes: ['one', 'two'].map(id => ({ id, name: id, uri: id, source: 'bolt', sources: ['bolt'], linked: false, sourceData: {} })),
        groups: [], sources: {},
      });
      gate = deferred();
      vi.spyOn(manager, 'executeAction').mockImplementation(async (_tool, action) => {
        await gate.promise;
        return {
          id: 'provider', type: 'command', targetNodes: [String(action.target)], action: action.action,
          status: 'success', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), results: [],
        };
      });
      service = new BatchExecutionService(db, queue, repository, manager);
    });

    afterEach(async () => {
      gate.resolve();
      await vi.waitFor(() => expect(queue.getStatus().running).toBe(0));
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const batchRequest = { targetNodeIds: ['one', 'two'], type: 'command' as const, action: 'uptime' };
    const batchScope = 'POST /api/executions/batch';
    const batchIdempotency = (key: string, request: unknown = batchRequest) => ({
      service: idempotency,
      key,
      scope: batchScope,
      fingerprint: RequestIdempotencyService.fingerprint(batchScope, request),
      status: 201,
    });

    it('admits one batch when a lost response is resubmitted', async () => {
      const first = await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));
      const replay = await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));

      expect(replay).toEqual(first);
      expect(await db.query('SELECT id FROM batch_executions')).toHaveLength(1);
      expect(await repository.findAll()).toHaveLength(2);
    });

    it('leaks no queue capacity across a replayed submission', async () => {
      const before = queue.getStatus();
      await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));
      await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));
      await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));

      // The replays reserved capacity to admit and must give it back: only the
      // two children of the single admitted batch are outstanding.
      const after = queue.getStatus();
      expect(after.running + after.queued).toBe(before.running + before.queued + 2);
    });

    it('admits two batches when submissions carry no key', async () => {
      const first = await service.createBatch(batchRequest, 'actor');
      const second = await service.createBatch(batchRequest, 'actor');

      expect(second.batchId).not.toBe(first.batchId);
      expect(await db.query('SELECT id FROM batch_executions')).toHaveLength(2);
    });

    it('refuses a key reused for a different batch and admits nothing', async () => {
      await service.createBatch(batchRequest, 'actor', batchIdempotency('key-1'));

      const different = { ...batchRequest, action: 'whoami' };
      await expect(service.createBatch(different, 'actor', batchIdempotency('key-1', different)))
        .rejects.toThrow(IdempotencyConflictError);

      expect(await db.query('SELECT id FROM batch_executions')).toHaveLength(1);
      expect(await repository.findAll()).toHaveLength(2);
    });

    it('decides concurrent duplicate submissions as one batch', async () => {
      const [first, second] = await Promise.all([
        service.createBatch(batchRequest, 'actor', batchIdempotency('key-1')),
        service.createBatch(batchRequest, 'actor', batchIdempotency('key-1')),
      ]);

      expect(second).toEqual(first);
      expect(await db.query('SELECT id FROM batch_executions')).toHaveLength(1);
      expect(await repository.findAll()).toHaveLength(2);
    });
  });
});
}
