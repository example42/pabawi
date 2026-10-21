import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../../src/database/DatabaseService';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

const migrations = join(__dirname, '../../src/database/migrations');
const secret = 'upgrade-rehearsal-signing-secret-key'; // pragma: allowlist secret
const password = 'RestoreFixture123!'; // pragma: allowlist secret
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function command(args: string[], input?: Buffer): Promise<Buffer> {
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', value => output.push(value));
  child.stderr.on('data', value => errors.push(value));
  child.stdin.end(input);
  let failure: Error | undefined;
  child.on('error', error => { failure = error; });
  const status = await new Promise<number>(resolveExit => child.on('close', code => { resolveExit(code ?? 1); }));
  const log = join(homedir(), '.agents/logs/pabawi.jsonl');
  mkdirSync(join(homedir(), '.agents/logs'), { recursive: true });
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  appendFileSync(log, JSON.stringify({
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), agent: 'codex', actor: 'agent', cwd: process.cwd(),
    cmd: ['docker', ...args].map(quote).join(' '), reason: 'rehearse isolated PostgreSQL backup and restoration',
    result: status === 0 ? 'ok' : 'fail', note: 'exit ' + status,
  }) + '\n');
  if (failure || status !== 0) throw failure ?? new Error(Buffer.concat(errors).toString());
  return Buffer.concat(output);
}

async function seed(db: DatabaseAdapter, partial: string) {
  await new MigrationRunner(db, partial).runPendingMigrations();
  const hash = await new AuthenticationService(db, secret).hashPassword(password);
  for (const id of ['local', 'enrolled']) {
    await db.execute("INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at, session_version) VALUES (?, ?, ?, ?, '', '', 1, 0, 'now', 'now', 'pre-upgrade-version')",
      [id, id, id + '@example.test', hash]);
    await db.execute("INSERT INTO user_roles VALUES (?, 'role-viewer-001', 'now')", [id]);
  }
  await db.execute("INSERT INTO federated_identities (id, user_id, provider, subject, issuer, created_at, updated_at) VALUES ('identity', 'enrolled', 'entra-id', 'subject', 'issuer', 'now', 'now')");
  await db.execute("INSERT INTO federated_user_roles VALUES ('enrolled', 'role-operator-001')");
  await db.execute("INSERT INTO groups VALUES ('group', 'Operators', '', 'now', 'now')");
  await db.execute("INSERT INTO user_groups VALUES ('enrolled', 'group', 'now')");
  await db.execute('INSERT INTO audit_logs (id, timestamp, event_type, "action", user_id, result) ' +
    "VALUES ('audit', 'now', 'auth', 'login_success', 'enrolled', 'success')");
}

async function snapshot(db: DatabaseAdapter) {
  const tables = ['migrations', 'users', 'federated_identities', 'federated_user_roles', 'user_roles', 'user_groups', 'groups', 'audit_logs'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [
    table, await db.query('SELECT * FROM ' + table + ' ORDER BY 1, 2'),
  ])));
}

async function upgradeAndVerify(database: DatabaseService) {
  await database.initialize();
  const db = database.getAdapter();
  const auth = new AuthenticationService(db, secret);
  const users = new UserService(db, auth);
  expect((await new MigrationRunner(db).getStatus()).pending).toEqual([]);
  expect(await db.queryOne("SELECT id FROM migrations WHERE id = '034'")).toEqual({ id: '034' });
  expect(await db.query("SELECT id FROM users WHERE session_version = 'pre-upgrade-version'")).toEqual([]);
  expect(await db.query('SELECT id, user_id, provider, subject, issuer FROM federated_identities'))
    .toEqual([{ id: 'identity', user_id: 'enrolled', provider: 'entra-id', subject: 'subject', issuer: 'issuer' }]);
  expect(await db.query('SELECT user_id, role_id FROM effective_user_roles ORDER BY user_id, role_id')).toEqual([
    { user_id: 'enrolled', role_id: 'role-operator-001' }, { user_id: 'enrolled', role_id: 'role-viewer-001' },
    { user_id: 'local', role_id: 'role-viewer-001' },
  ]);
  expect(await db.query('SELECT user_id, group_id FROM user_groups')).toEqual([{ user_id: 'enrolled', group_id: 'group' }]);
  expect(await db.queryOne("SELECT user_id FROM audit_logs WHERE id = 'audit'")).toEqual({ user_id: 'enrolled' });
  const user = (await users.getUserById('enrolled'))!;
  const legacy = jwt.sign({ userId: user.id, username: user.username, sessionVersion: 'pre-upgrade-version' }, secret, { expiresIn: '1h' });
  await expect(auth.verifyToken(legacy)).rejects.toThrow();
  expect((await auth.refreshToken(legacy)).success).toBe(false);
  const pair = await auth.authenticate('local', password);
  expect(pair.success).toBe(true);
  const entra = await auth.generateTokenPair(user, { provider: 'entra-id', identityId: 'identity' });
  await expect(auth.verifyToken(entra.token)).resolves.toMatchObject({ userId: 'enrolled' });
  expect((await auth.refreshToken(entra.refreshToken)).success).toBe(true);
  const version = (await users.getUserById('local'))!.sessionVersion;
  await database.close();
  await database.initialize();
  const restarted = new AuthenticationService(database.getAdapter(), secret);
  await expect(restarted.verifyToken(pair.token!)).resolves.toMatchObject({ userId: 'local' });
  expect((await new UserService(database.getAdapter(), restarted).getUserById('local'))!.sessionVersion).toBe(version);
  if (db.getDialect() === 'sqlite') {
    expect(await database.getAdapter().query('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(await database.getAdapter().query('PRAGMA foreign_key_check')).toEqual([]);
  }
}

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !(process.env.TEST_DATABASE_URL && process.env.TEST_LDAP_POSTGRES_CONTAINER))(
    dialect + ' LDAP backup, upgrade and restore rehearsal', () => {
      it('backs up populated pre-LDAP state, upgrades once, restores the old snapshot and repeats the upgrade', async () => {
        const dir = mkdtempSync(join(process.env.TEST_LDAP_EVIDENCE_DIR ?? tmpdir(), 'upgrade-recovery-'));
        const partial = join(dir, 'migrations-through-030');
        mkdirSync(partial);
        for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && file.slice(0, 3) <= '030')) {
          copyFileSync(join(migrations, file), join(partial, file));
        }
        const sourcePath = join(dir, 'source.db');
        const backupPath = join(dir, 'pre-upgrade.db');
        let sourceUrl = '';
        let restoreUrl = '';
        let source: DatabaseAdapter;
        if (dialect === 'postgres') {
          const key = randomUUID().replaceAll('-', '');
          const sourceName = 'ldap_recovery_' + key;
          const restoreName = 'ldap_restored_' + key;
          const control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
          await control.initialize();
          await control.execute('CREATE DATABASE ' + sourceName);
          await control.execute('CREATE DATABASE ' + restoreName);
          await control.close();
          const sourceAddress = new URL(process.env.TEST_DATABASE_URL!);
          sourceAddress.pathname = '/' + sourceName;
          sourceAddress.search = '';
          const restoreAddress = new URL(sourceAddress);
          restoreAddress.pathname = '/' + restoreName;
          sourceUrl = sourceAddress.toString();
          restoreUrl = restoreAddress.toString();
          source = new PostgresAdapter(sourceUrl);
        } else {
          source = new SQLiteAdapter(sourcePath);
        }
        await source.initialize();
        cleanups.push(() => source.close());
        if (dialect === 'sqlite') await source.execute('PRAGMA wal_autocheckpoint = 0');
        await seed(source, partial);
        const before = await snapshot(source);
        if (dialect === 'sqlite') {
          expect(statSync(sourcePath + '-wal').size).toBeGreaterThan(0);
          await source.execute('VACUUM INTO ?', [backupPath]);
        } else {
          const dump = await command(['exec', process.env.TEST_LDAP_POSTGRES_CONTAINER!, 'pg_dump', '-U', 'postgres',
            '--format=custom', '--no-owner', '--dbname=' + new URL(sourceUrl).pathname.slice(1)]);
          writeFileSync(join(dir, 'pre-upgrade.dump'), dump);
        }
        await source.close();
        const upgraded = new DatabaseService(sourcePath, dialect, sourceUrl);
        cleanups.push(() => upgraded.close());
        await upgradeAndVerify(upgraded);

        const failureDir = join(dir, 'candidate-migrations');
        mkdirSync(failureDir);
        for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql'))) {
          copyFileSync(join(migrations, file), join(failureDir, file));
        }
        writeFileSync(join(failureDir, '035_rehearsal_failure.sql'), "CREATE TABLE rehearsal_partial (id TEXT);\nINSERT INTO missing_rehearsal_table VALUES (1);");
        await expect(new MigrationRunner(upgraded.getAdapter(), failureDir).runPendingMigrations()).rejects.toThrow();
        expect(await upgraded.getAdapter().queryOne("SELECT id FROM migrations WHERE id = '035'")).toBeNull();
        if (dialect === 'sqlite') {
          expect(await upgraded.getAdapter().queryOne("SELECT name FROM sqlite_master WHERE name = 'rehearsal_partial'")).toBeNull();
        } else {
          expect(await upgraded.getAdapter().queryOne("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rehearsal_partial'")).toBeNull();
          await command(['exec', '-i', process.env.TEST_LDAP_POSTGRES_CONTAINER!, 'pg_restore', '-U', 'postgres',
            '--exit-on-error', '--single-transaction', '--no-owner', '--dbname=' + new URL(restoreUrl).pathname.slice(1)],
          readFileSync(join(dir, 'pre-upgrade.dump')));
        }
        const restoredPath = join(dir, 'restored.db');
        if (dialect === 'sqlite') copyFileSync(backupPath, restoredPath);
        const restored: DatabaseAdapter = dialect === 'sqlite' ? new SQLiteAdapter(restoredPath) : new PostgresAdapter(restoreUrl);
        await restored.initialize();
        cleanups.push(() => restored.close());
        expect(await snapshot(restored)).toEqual(before);
        expect(await restored.queryOne("SELECT id FROM migrations WHERE id = '031'")).toBeNull();
        await restored.close();
        const redeployed = new DatabaseService(restoredPath, dialect, restoreUrl);
        cleanups.push(() => redeployed.close());
        await upgradeAndVerify(redeployed);
        writeFileSync(join(dir, 'result.json'), JSON.stringify({ dialect, passed: true,
          source: dialect === 'sqlite' ? sourcePath : new URL(sourceUrl).pathname.slice(1),
          restored: dialect === 'sqlite' ? restoredPath : new URL(restoreUrl).pathname.slice(1),
          checks: ['populated-030-snapshot', 'committed-WAL-or-pg-dump', 'upgrade-through-034',
            'legacy-reauthentication', 'local-and-Entra-login', 'restart-no-repeated-invalidation',
            'failed-migration-rollback', 'restored-original-snapshot', 'successful-repeat-upgrade'] }, null, 2));
      }, 30000);
    });
}
