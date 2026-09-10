import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { MigrationRunner } from "../../src/database/MigrationRunner";

/**
 * Regression test for finding I01: migration 017 rebuilt the `users` table with
 * foreign keys enabled, so `DROP TABLE users` fired ON DELETE CASCADE on
 * user_roles / user_groups / revoked_tokens / federated_identities and
 * ON DELETE SET NULL on audit_logs / journal_entries. User rows were copied
 * across; every authorization relationship and federation link was destroyed.
 *
 * The fixture is populated at migration 016 (the last migration before the
 * rebuild) and then upgraded with the real migration files, which is the shape
 * of an actual deployment upgrade.
 */

const MIGRATIONS_DIR = join(__dirname, "../../src/database/migrations");

/** A copy of the real migration directory holding only ids <= maxId. */
function migrationsUpTo(maxId: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pabawi-migrations-"));
  for (const filename of readdirSync(MIGRATIONS_DIR)) {
    const match = /^(\d+)_/.exec(filename);
    if (!match || match[1] > maxId) continue;
    copyFileSync(join(MIGRATIONS_DIR, filename), join(dir, filename));
  }
  return dir;
}

async function count(db: SQLiteAdapter, sql: string): Promise<number> {
  const rows = await db.query<{ c: number }>(sql);
  return rows[0].c;
}

describe("I01: migration 017 preserves user relationships", () => {
  let db: SQLiteAdapter;
  let partialDir: string;

  beforeEach(async () => {
    partialDir = migrationsUpTo("016");
    db = new SQLiteAdapter(join(partialDir, "live.db"));
    await db.initialize();
    await new MigrationRunner(db, partialDir).runPendingMigrations();

    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
       VALUES ('u1', 'alice', 'alice@example.test', 'hash', 'Alice', 'Example', 1, 0, ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ('u1', 'role-admin-001', ?)`,
      [now],
    );
    await db.execute(
      `INSERT INTO groups (id, name, description, created_at, updated_at) VALUES ('g1', 'Ops', 'Ops group', ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO user_groups (user_id, group_id, assigned_at) VALUES ('u1', 'g1', ?)`,
      [now],
    );
    await db.execute(
      `INSERT INTO revoked_tokens (token, user_id, revoked_at, expires_at) VALUES ('tok1', 'u1', ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO federated_identities (id, user_id, provider, subject, issuer, created_at, updated_at)
       VALUES ('f1', 'u1', 'entra-id', 'subject-1', 'https://issuer.test', ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO audit_logs (id, timestamp, event_type, "action", user_id, result)
       VALUES ('a1', ?, 'auth', 'login_success', 'u1', 'success')`,
      [now],
    );
    await db.execute(
      `INSERT INTO journal_entries (id, node_id, node_uri, event_type, source, "action", summary, user_id, timestamp)
       VALUES ('j1', 'n1', 'ssh://n1', 'note', 'user', 'note', 'A note', 'u1', ?)`,
      [now],
    );
  });

  afterEach(async () => {
    await db.close();
    rmSync(partialDir, { recursive: true, force: true });
  });

  it("rolls back a failed rebuild and restores enforcement", async () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "017_nullable_password_hash.sqlite.sql"), "utf8");
    writeFileSync(join(partialDir, "017_nullable_password_hash.sqlite.sql"), `${sql}\nINSERT INTO missing_table VALUES (1);`);
    await expect(new MigrationRunner(db, partialDir).runPendingMigrations()).rejects.toThrow("missing_table");
    expect(await count(db, "SELECT COUNT(*) c FROM user_roles")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM federated_identities")).toBe(1);
    expect(await db.query("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
    expect(await count(db, "SELECT COUNT(*) c FROM migrations WHERE id = '017'")).toBe(0);
    await new MigrationRunner(db, MIGRATIONS_DIR).runPendingMigrations();
    expect(await count(db, "SELECT COUNT(*) c FROM user_roles")).toBe(1);
  });

  it("rejects orphaned relationships before committing a rebuild", async () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, "017_nullable_password_hash.sqlite.sql"), "utf8");
    writeFileSync(join(partialDir, "017_nullable_password_hash.sqlite.sql"), `${sql}\nDELETE FROM users WHERE id = 'u1';`);
    await expect(new MigrationRunner(db, partialDir).runPendingMigrations()).rejects.toThrow("foreign_key_check");
    expect(await count(db, "SELECT COUNT(*) c FROM users")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM user_roles")).toBe(1);
    expect(await db.query("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
    expect(await count(db, "SELECT COUNT(*) c FROM migrations WHERE id = '017'")).toBe(0);
  });

  it("restores authorization state from a consistent file backup", async () => {
    const backupPath = join(partialDir, "backup.db");
    await db.execute("VACUUM INTO ?", [backupPath]);
    const restored = new SQLiteAdapter(backupPath);
    await restored.initialize();
    try {
      await new MigrationRunner(restored, MIGRATIONS_DIR).runPendingMigrations();
      expect(await count(restored, "SELECT COUNT(*) c FROM user_roles WHERE user_id = 'u1' AND role_id = 'role-admin-001'")).toBe(1);
      expect(await count(restored, "SELECT COUNT(*) c FROM user_groups WHERE user_id = 'u1' AND group_id = 'g1'")).toBe(1);
      expect(await count(restored, "SELECT COUNT(*) c FROM federated_identities WHERE user_id = 'u1'")).toBe(1);
      expect(await restored.query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(await restored.query("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await restored.close();
    }
  });

  it("keeps every user relationship across the upgrade", async () => {
    await new MigrationRunner(db, MIGRATIONS_DIR).runPendingMigrations();

    expect(await count(db, "SELECT COUNT(*) c FROM users")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM user_roles")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM user_groups")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM revoked_tokens")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) c FROM federated_identities")).toBe(1);
    expect(
      await count(db, "SELECT COUNT(*) c FROM audit_logs WHERE user_id IS NOT NULL"),
    ).toBe(1);
    expect(
      await count(db, "SELECT COUNT(*) c FROM journal_entries WHERE user_id IS NOT NULL"),
    ).toBe(1);
  });

  it("leaves the database referentially intact and foreign keys enforced", async () => {
    await new MigrationRunner(db, MIGRATIONS_DIR).runPendingMigrations();

    expect(await db.query("PRAGMA foreign_key_check")).toEqual([]);
    expect(await db.query("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);

    // Enforcement is genuinely back on, not just reported as on.
    const now = new Date().toISOString();
    await db.execute("DELETE FROM users WHERE id = 'u1'");
    expect(await count(db, "SELECT COUNT(*) c FROM user_roles")).toBe(0);
    await expect(
      db.execute(
        `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ('ghost', 'role-admin-001', ?)`,
        [now],
      ),
    ).rejects.toThrow();
  });

  it("makes password_hash nullable so federated accounts can be created", async () => {
    await new MigrationRunner(db, MIGRATIONS_DIR).runPendingMigrations();

    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
       VALUES ('u2', 'bob', 'bob@example.test', NULL, 'Bob', 'Example', 1, 0, ?, ?)`,
      [now, now],
    );

    expect(
      await count(db, "SELECT COUNT(*) c FROM users WHERE password_hash IS NULL"),
    ).toBe(1);
  });
});
