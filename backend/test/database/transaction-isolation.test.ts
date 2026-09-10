import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} transaction ownership`, () => {
    let db: DatabaseAdapter;
    const table = `ownership_${randomUUID().replaceAll('-', '')}`;
    beforeEach(async () => {
      db = dialect === 'sqlite' ? new SQLiteAdapter(':memory:') : new PostgresAdapter(process.env.TEST_DATABASE_URL!);
      await db.initialize();
      await db.execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, label TEXT)`);
    });
    afterEach(async () => {
      await db.execute(`DROP TABLE ${table}`);
      await db.close();
    });

    it('keeps an unrelated successful write out of a failing transaction', async () => {
      const entered = deferred();
      const release = deferred();
      const transaction = db.withTransaction(async () => {
        await db.execute(`INSERT INTO ${table} VALUES (1, 'rollback')`);
        entered.resolve();
        await release.promise;
        throw new Error('rollback');
      });
      const failure = expect(transaction).rejects.toThrow('rollback');
      await entered.promise;
      const unrelated = db.execute(`INSERT INTO ${table} VALUES (2, 'survives')`);
      if (dialect === 'postgres') await unrelated;
      release.resolve();
      await Promise.all([failure, unrelated]);
      expect(await db.query(`SELECT id FROM ${table}`)).toEqual([{ id: 2 }]);
    });

    it('owns overlapping transactions independently and releases all connections', async () => {
      const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, id) => db.withTransaction(async () => {
        await db.execute(`INSERT INTO ${table} VALUES (?, 'value')`, [id]);
        if (id % 2 === 0) throw new Error('rollback');
      })));
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(5);
      expect(await db.query(`SELECT id FROM ${table} ORDER BY id`)).toEqual([1, 3, 5, 7, 9].map(id => ({ id })));
    });

    it('excludes unrelated work for the full maintenance callback, outside transactions too', async () => {
      const entered = deferred();
      const release = deferred();
      let ordinaryFinished = false;
      const migration = db.withExclusiveConnection(async () => {
        entered.resolve();
        await release.promise;
        expect(ordinaryFinished).toBe(false);
        await db.withTransaction(async () => { await db.execute(`INSERT INTO ${table} VALUES (1, 'migration')`); });
      });
      await entered.promise;
      const ordinary = db.execute(`INSERT INTO ${table} VALUES (2, 'ordinary')`).then(() => { ordinaryFinished = true; });
      await new Promise(resolve => setImmediate(resolve));
      expect(ordinaryFinished).toBe(false);
      release.resolve();
      await Promise.all([migration, ordinary]);
      expect(await db.query(`SELECT id FROM ${table} ORDER BY id`)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('rejects overlapping transactions inside one exclusive connection reservation', async () => {
      await db.withExclusiveConnection(async () => {
        const entered = deferred();
        const release = deferred();
        const first = db.withTransaction(async () => {
          entered.resolve();
          await release.promise;
          await db.execute(`INSERT INTO ${table} VALUES (1, 'owned')`);
        });
        await entered.promise;
        await expect(db.withTransaction(async () => undefined)).rejects.toThrow('Nested transactions');
        release.resolve();
        await first;
      });
      expect(await db.query(`SELECT id FROM ${table}`)).toEqual([{ id: 1 }]);
    });

    it('rejects detached work inherited from an ended transaction', async () => {
      const release = deferred();
      let late!: Promise<unknown>;
      await db.withTransaction(async () => {
        late = release.promise.then(() => db.execute(`INSERT INTO ${table} VALUES (1, 'late')`));
      });
      const failure = expect(late).rejects.toThrow('scope has ended');
      release.resolve();
      await failure;
      expect(await db.query(`SELECT * FROM ${table}`)).toEqual([]);
    });
  });
}
