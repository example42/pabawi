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
});
