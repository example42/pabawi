import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';

const databaseUrl = process.env.TEST_DATABASE_URL;
for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !databaseUrl)(`${dialect}: batch lifecycle upgrade`, () => {
    it('preserves populated history and accepts the new lifecycle states after migration', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pabawi-a13-migration-'));
      const migrations = join(__dirname, '../../src/database/migrations');
      for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && file < '029')) {
        copyFileSync(join(migrations, file), join(dir, file));
      }
      const schema = `migration_${randomUUID().replaceAll('-', '')}`;
      let control: PostgresAdapter | undefined;
      const url = new URL(databaseUrl ?? 'postgres://localhost/test');
      url.searchParams.set('options', `-csearch_path=${schema}`);
      if (dialect === 'postgres') {
        control = new PostgresAdapter(databaseUrl!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
      }
      const db = dialect === 'sqlite' ? new SQLiteAdapter(join(dir, 'history.sqlite')) : new PostgresAdapter(url.toString());
      await db.initialize();
      try {
        await new MigrationRunner(db, dir).runPendingMigrations();
        await db.execute(`INSERT INTO batch_executions (id, type, action, target_nodes, target_groups, status,
          created_at, user_id, execution_ids, stats_total, stats_queued, stats_running, stats_success, stats_failed)
          VALUES ('batch', 'command', 'uptime', '["node"]', '[]', 'success', '2026-09-10T10:00:00Z',
          'actor', '["child"]', 1, 0, 0, 1, 0)`);
        await db.execute(`INSERT INTO executions (id, type, target_nodes, action, status, started_at, completed_at,
          results, stdout, stderr, execution_tool, batch_id, batch_position, original_execution_id, re_execution_count)
          VALUES ('child', 'command', '["node"]', 'uptime', 'success', '2026-09-10T10:00:00Z',
          '2026-09-10T10:01:00Z', '[]', 'preserved output', 'preserved error', 'ssh', 'batch', 0, 'original', 2)`);
        const original = await db.queryOne<Record<string, unknown>>("SELECT * FROM executions WHERE id = 'child'");
        const batch = await db.queryOne<Record<string, unknown>>("SELECT * FROM batch_executions WHERE id = 'batch'");
        const runner = new MigrationRunner(db, migrations);
        // Every migration from 029 onwards has to leave the populated history below intact.
        expect(await runner.runPendingMigrations()).toBe(2);
        expect(await db.queryOne("SELECT * FROM executions WHERE id = 'child'")).toMatchObject({
          ...original, created_at: original!.started_at, user_id: 'actor', cancellation_requested_at: null,
        });
        expect(await db.queryOne("SELECT * FROM batch_executions WHERE id = 'batch'")).toMatchObject({
          ...batch, stats_cancelled: 0, stats_interrupted: 0,
        });
        const repository = new ExecutionRepository(db);
        for (const status of ['queued', 'cancelled', 'interrupted'] as const) {
          const id = await repository.create({ type: 'command', action: 'uptime', targetNodes: ['node'], status, results: [] });
          expect(await repository.findById(id)).toMatchObject({ status, startedAt: undefined });
        }
        expect(await runner.runPendingMigrations()).toBe(0);
      } finally {
        await db.close();
        if (control) { await control.execute(`DROP SCHEMA ${schema} CASCADE`); await control.close(); }
      }
    });
  });
}
