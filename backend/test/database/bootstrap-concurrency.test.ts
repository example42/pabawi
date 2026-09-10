import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { SetupService } from '../../src/services/SetupService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} bootstrap across connections`, () => {
    it('commits exactly one administrator and its configuration, and preserves closure on upgrade', async () => {
      const schema = `bootstrap_${randomUUID().replaceAll('-', '')}`;
      let control: PostgresAdapter | undefined;
      let make: () => DatabaseAdapter;
      if (dialect === 'postgres') {
        control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const url = new URL(process.env.TEST_DATABASE_URL!);
        url.searchParams.set('options', `-c search_path=${schema}`);
        make = () => new PostgresAdapter(url.toString());
      } else {
        const file = join(mkdtempSync(join(tmpdir(), 'pabawi-a09-')), 'bootstrap.db');
        make = () => new SQLiteAdapter(file);
      }
      const adapters = [make(), make()];
      try {
        await adapters[0].initialize();
        await new MigrationRunner(adapters[0]).runPendingMigrations();
        await adapters[1].initialize();
        const failing = new SetupService(adapters[0]);
        const saveConfig = failing.saveConfig.bind(failing);
        vi.spyOn(failing, 'saveConfig').mockImplementationOnce(async config => {
          await saveConfig(config);
          throw new Error('injected configuration failure');
        });
        const users = new UserService(adapters[0], new AuthenticationService(adapters[0], 'bootstrap-test-jwt-credential'));
        await expect(failing.initialize({ allowSelfRegistration: true, defaultNewUserRole: null }, () => users.createUser({
          username: 'interrupted', email: 'interrupted@example.test', password: 'OwnerPass123!',
          firstName: 'Interrupted', lastName: 'Owner', isAdmin: true,
        }))).rejects.toThrow('injected configuration failure');
        expect(await adapters[1].query('SELECT * FROM users')).toHaveLength(0);
        expect(await new SetupService(adapters[1]).isSetupComplete()).toBe(false);
        expect(await new SetupService(adapters[1]).getConfig()).toMatchObject({ allowSelfRegistration: false });
        const results = await Promise.all(adapters.map(async (db, index) => {
          const auth = new AuthenticationService(db, 'bootstrap-test-jwt-credential');
          const users = new UserService(db, auth);
          return new SetupService(db).initialize({ allowSelfRegistration: index === 1,
            defaultNewUserRole: index === 1 ? 'role-viewer-001' : null }, () => users.createUser({
            username: `owner${index}`, email: `owner${index}@example.test`, password: 'OwnerPass123!',
            firstName: 'Owner', lastName: 'Fixture', isAdmin: true,
          }));
        }));
        const winners = results.filter(user => user !== null);
        expect(winners).toHaveLength(1);
        expect(await adapters[0].query('SELECT * FROM users')).toHaveLength(1);
        const secondWon = winners[0]!.username === 'owner1';
        expect(await new SetupService(adapters[1]).getConfig()).toEqual({ allowSelfRegistration: secondWon,
          defaultNewUserRole: secondWon ? 'role-viewer-001' : null });

        // Reproduce an old installation with an inactive administrator and no durable marker.
        await adapters[0].execute("DELETE FROM config WHERE key = 'setup_completed'");
        await adapters[0].execute('UPDATE users SET is_active = 0');
        const runner = new MigrationRunner(adapters[0]);
        const migration = (await runner.getStatus()).applied.find(item => item.id === '028');
        expect(migration).toBeDefined();
        await adapters[0].execute("DELETE FROM migrations WHERE id = '028'");
        await runner.runPendingMigrations();
        await adapters[0].execute('UPDATE users SET is_admin = 0');
        expect(await new SetupService(adapters[1]).getSetupStatus()).toMatchObject({ isComplete: true, hasAdminUser: false });
      } finally {
        for (const db of adapters) await db.close();
        if (control) {
          await control.execute(`DROP SCHEMA ${schema} CASCADE`);
          await control.close();
        }
      }
    });
  });
}
