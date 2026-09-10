import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationRunner } from "../../src/database/MigrationRunner";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

describe("MigrationRunner", () => {
  let db: SQLiteAdapter;
  let testMigrationsDir: string;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();

    testMigrationsDir = join(__dirname, "test-migrations");
    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
    mkdirSync(testMigrationsDir, { recursive: true });
  });

  afterEach(async () => {
    await db.close();

    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
  });

  it("creates migrations table on first run", async () => {
    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    const result = await db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='migrations'"
    );
    expect(result?.count).toBe(1);
  });

  it("applies pending migrations in order", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)"
    );
    writeFileSync(
      join(testMigrationsDir, "002_add_email.sql"),
      "ALTER TABLE users ADD COLUMN email TEXT"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    const appliedCount = await runner.runPendingMigrations();
    expect(appliedCount).toBe(2);

    const migrations = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM migrations ORDER BY id"
    );
    expect(migrations).toHaveLength(2);
    expect(migrations[0].id).toBe("001");
    expect(migrations[0].name).toBe("001_create_users.sql");
    expect(migrations[1].id).toBe("002");
    expect(migrations[1].name).toBe("002_add_email.sql");

    const tableInfo = await db.query<{ name: string }>(
      "PRAGMA table_info(users)"
    );
    const columnNames = tableInfo.map((col) => col.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("email");
  });

  it("skips already-applied migrations", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    const firstRun = await runner.runPendingMigrations();
    expect(firstRun).toBe(1);

    const secondRun = await runner.runPendingMigrations();
    expect(secondRun).toBe(0);
  });

  it("selects dialect-specific files over shared files", async () => {
    // Shared file
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT DEFAULT 'shared')"
    );
    // SQLite-specific file (should win since our adapter is sqlite)
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sqlite.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT DEFAULT 'sqlite')"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    // Verify the sqlite-specific migration was used
    const migrations = await db.query<{ name: string }>(
      "SELECT name FROM migrations"
    );
    expect(migrations[0].name).toBe("001_create_users.sqlite.sql");

    // Verify the default value proves the sqlite variant ran
    await db.execute("INSERT INTO users (id) VALUES ('test1')");
    const user = await db.queryOne<{ name: string }>(
      "SELECT name FROM users WHERE id = 'test1'"
    );
    expect(user?.name).toBe("sqlite");
  });

  it.each(["001_other.sql", "001_other.sqlite.sql", "001_other.postgres.sql", "1_first.sql"])(
    "rejects conflicting logical identities including inactive dialects: %s",
    async (filename) => {
      writeFileSync(join(testMigrationsDir, "001_first.sql"), "CREATE TABLE first (id TEXT)");
      writeFileSync(join(testMigrationsDir, filename), "CREATE TABLE other (id TEXT)");
      await expect(new MigrationRunner(db, testMigrationsDir).runPendingMigrations()).rejects.toThrow("Conflicting migration identity");
      expect(await db.query("SELECT name FROM sqlite_master WHERE name IN ('first', 'other')")).toEqual([]);
    },
  );

  it("rejects changed applied SQL before running any pending migration", async () => {
    const file = join(testMigrationsDir, "001_first.sql");
    writeFileSync(file, "CREATE TABLE first (id TEXT)");
    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();
    expect(await db.query("SELECT checksum FROM migrations")).toEqual([{ checksum: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    writeFileSync(file, "CREATE TABLE first (id INTEGER)");
    writeFileSync(join(testMigrationsDir, "002_second.sql"), "CREATE TABLE second (id TEXT)");
    await expect(runner.runPendingMigrations()).rejects.toThrow("Migration drift detected");
    await expect(runner.getStatus()).rejects.toThrow("Migration drift detected");
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'second'")).toEqual([]);
  });

  it("allows legacy history without inventing checksums", async () => {
    await db.execute("CREATE TABLE migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)");
    await db.execute("INSERT INTO migrations VALUES ('016', '016_historical.sql', '2026-09-09')");
    writeFileSync(join(testMigrationsDir, "017_next.sql"), "CREATE TABLE next (id TEXT)");
    const runner = new MigrationRunner(db, testMigrationsDir);
    expect(await runner.runPendingMigrations()).toBe(1);
    expect((await runner.getStatus()).applied[0]).toEqual({ id: "016", name: "016_historical.sql", appliedAt: "2026-09-09", checksum: null });
    expect(await runner.runPendingMigrations()).toBe(0);
  });

  it("ignores files for the wrong dialect", async () => {
    // Only a postgres-specific file — should be skipped on sqlite
    writeFileSync(
      join(testMigrationsDir, "001_pg_only.postgres.sql"),
      "CREATE TABLE pg_table (id TEXT PRIMARY KEY)"
    );
    // A shared file for a different migration
    writeFileSync(
      join(testMigrationsDir, "002_shared.sql"),
      "CREATE TABLE shared_table (id TEXT PRIMARY KEY)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    const appliedCount = await runner.runPendingMigrations();

    // Only the shared migration should have been applied
    expect(appliedCount).toBe(1);

    const migrations = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM migrations ORDER BY id"
    );
    expect(migrations).toHaveLength(1);
    expect(migrations[0].id).toBe("002");
    expect(migrations[0].name).toBe("002_shared.sql");

    // pg_table should not exist
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pg_table'"
    );
    expect(tables).toHaveLength(0);
  });

  it("running migrations multiple times is idempotent", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)"
    );
    writeFileSync(
      join(testMigrationsDir, "002_create_posts.sql"),
      "CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    // Run three times
    const first = await runner.runPendingMigrations();
    const second = await runner.runPendingMigrations();
    const third = await runner.runPendingMigrations();

    expect(first).toBe(2);
    expect(second).toBe(0);
    expect(third).toBe(0);

    // Schema state is the same
    const migrations = await db.query<{ id: string }>(
      "SELECT id FROM migrations ORDER BY id"
    );
    expect(migrations).toHaveLength(2);

    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts') ORDER BY name"
    );
    expect(tables).toHaveLength(2);
  });

  it("handles multi-statement migrations", async () => {
    const multiStatementSQL = `
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE posts (id TEXT PRIMARY KEY, userId TEXT);
      CREATE INDEX idx_posts_user ON posts(userId);
    `;
    writeFileSync(
      join(testMigrationsDir, "001_multi_statement.sql"),
      multiStatementSQL
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')"
    );
    expect(tables).toHaveLength(2);
  });

  it("gets migration status", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY)"
    );
    writeFileSync(
      join(testMigrationsDir, "002_create_posts.sql"),
      "CREATE TABLE posts (id TEXT PRIMARY KEY)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    // Add a new migration file after initial run
    writeFileSync(
      join(testMigrationsDir, "003_create_comments.sql"),
      "CREATE TABLE comments (id TEXT PRIMARY KEY)"
    );

    const status = await runner.getStatus();
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0].id).toBe("003");
  });

  it("handles empty migrations directory", async () => {
    const runner = new MigrationRunner(db, testMigrationsDir);
    const appliedCount = await runner.runPendingMigrations();
    expect(appliedCount).toBe(0);
  });

  it("rejects invalid migration filename format", async () => {
    writeFileSync(
      join(testMigrationsDir, "invalid_migration.sql"),
      "CREATE TABLE test (id TEXT)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await expect(runner.runPendingMigrations()).rejects.toThrow(
      "Invalid migration filename format"
    );
  });

  it("handles migration failure gracefully", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_invalid.sql"),
      "INVALID SQL STATEMENT"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await expect(runner.runPendingMigrations()).rejects.toThrow();

    const migrations = await db.query<{ id: string }>(
      "SELECT id FROM migrations"
    );
    expect(migrations).toHaveLength(0);
  });

  it("ignores SQL comments in migrations", async () => {
    const sqlWithComments = `
      -- This is a comment
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        -- Another comment
        name TEXT
      );
      -- Final comment
    `;
    writeFileSync(
      join(testMigrationsDir, "001_with_comments.sql"),
      sqlWithComments
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    const result = await db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(result?.count).toBe(1);
  });

  it("rolls back partial migrations on failure", async () => {
    // Migration creates a table successfully, then fails on the second
    // statement. The first table must NOT exist after rollback.
    writeFileSync(
      join(testMigrationsDir, "001_partial_failure.sql"),
      "CREATE TABLE good_table (id TEXT PRIMARY KEY); INVALID SQL;"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await expect(runner.runPendingMigrations()).rejects.toThrow();

    // The first statement's table must NOT exist — the transaction rolled back
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='good_table'"
    );
    expect(tables).toHaveLength(0);

    // The migrations table must not record this migration
    const migrations = await db.query<{ id: string }>(
      "SELECT id FROM migrations"
    );
    expect(migrations).toHaveLength(0);
  });

  it("retries a failed migration on the next run", async () => {
    writeFileSync(
      join(testMigrationsDir, "001_will_fail.sql"),
      "CREATE TABLE t1 (id TEXT); INVALID SQL;"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await expect(runner.runPendingMigrations()).rejects.toThrow();

    // Replace the broken file with a fixed one
    writeFileSync(
      join(testMigrationsDir, "001_will_fail.sql"),
      "CREATE TABLE t1 (id TEXT)"
    );

    const applied = await runner.runPendingMigrations();
    expect(applied).toBe(1);

    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='t1'"
    );
    expect(tables).toHaveLength(1);
  });

  it("normalises legacy appliedAt column to applied_at on init", async () => {
    // Simulate a legacy install: drop the runner-created table and recreate
    // it with the old camelCase column.
    await db.execute("CREATE TABLE legacy_marker (id TEXT)"); // ensure DB is alive
    await db.execute(
      "CREATE TABLE migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)"
    );
    await db.execute(
      "INSERT INTO migrations (id, name, appliedAt) VALUES ('000', 'legacy.sql', '2024-01-01T00:00:00.000Z')"
    );

    writeFileSync(
      join(testMigrationsDir, "001_after_rename.sql"),
      "CREATE TABLE post_rename (id TEXT PRIMARY KEY)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    // Column must be applied_at now
    const cols = await db.query<{ name: string }>(
      "PRAGMA table_info(migrations)"
    );
    const names = cols.map((c) => c.name);
    expect(names).toContain("applied_at");
    expect(names).not.toContain("appliedAt");

    // Legacy row data must be preserved
    const legacyRow = await db.queryOne<{ id: string; applied_at: string }>(
      "SELECT id, applied_at FROM migrations WHERE id = '000'"
    );
    expect(legacyRow?.id).toBe("000");
    expect(legacyRow?.applied_at).toBe("2024-01-01T00:00:00.000Z");

    // New migration was recorded with the new column
    const newRow = await db.queryOne<{ id: string }>(
      "SELECT id FROM migrations WHERE id = '001'"
    );
    expect(newRow?.id).toBe("001");
  });
});
