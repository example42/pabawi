import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sqlite3 from "sqlite3";
import { MigrationRunner } from "../../src/database/MigrationRunner";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

describe("MigrationRunner", () => {
  let db: sqlite3.Database;
  let testMigrationsDir: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = new sqlite3.Database(":memory:");

    // Create temporary migrations directory
    testMigrationsDir = join(__dirname, "test-migrations");
    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
    mkdirSync(testMigrationsDir, { recursive: true });
  });

  afterEach(async () => {
    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clean up test migrations directory
    if (existsSync(testMigrationsDir)) {
      rmSync(testMigrationsDir, { recursive: true });
    }
  });

  it("should initialize migrations table", async () => {
    const runner = new MigrationRunner(db, testMigrationsDir);
    await runner.runPendingMigrations();

    // Check that migrations table exists
    const result = await new Promise<{ count: number }>((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='migrations'",
        (err, row: { count: number }) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(result.count).toBe(1);
  });

  it("should run pending migrations in order", async () => {
    // Create test migration files
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

    // Verify migrations were recorded
    const migrations = await new Promise<Array<{ id: string; name: string }>>(
      (resolve, reject) => {
        db.all(
          "SELECT id, name FROM migrations ORDER BY id",
          (err, rows: Array<{ id: string; name: string }>) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      }
    );

    expect(migrations).toHaveLength(2);
    expect(migrations[0].id).toBe("001");
    expect(migrations[0].name).toBe("001_create_users.sql");
    expect(migrations[1].id).toBe("002");
    expect(migrations[1].name).toBe("002_add_email.sql");

    // Verify table was created and column added
    const tableInfo = await new Promise<Array<{ name: string }>>(
      (resolve, reject) => {
        db.all(
          "PRAGMA table_info(users)",
          (err, rows: Array<{ name: string }>) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      }
    );

    const columnNames = tableInfo.map((col) => col.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("email");
  });

  it("should not re-run already applied migrations", async () => {
    // Create test migration
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    // Run migrations first time
    const firstRun = await runner.runPendingMigrations();
    expect(firstRun).toBe(1);

    // Run migrations second time
    const secondRun = await runner.runPendingMigrations();
    expect(secondRun).toBe(0);
  });

  it("should handle multi-statement migrations", async () => {
    // Create migration with multiple statements
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

    // Verify all tables were created
    const tables = await new Promise<Array<{ name: string }>>(
      (resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')",
          (err, rows: Array<{ name: string }>) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      }
    );

    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("should get migration status", async () => {
    // Create test migrations
    writeFileSync(
      join(testMigrationsDir, "001_create_users.sql"),
      "CREATE TABLE users (id TEXT PRIMARY KEY)"
    );
    writeFileSync(
      join(testMigrationsDir, "002_create_posts.sql"),
      "CREATE TABLE posts (id TEXT PRIMARY KEY)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    // Apply first migration only
    await runner.runPendingMigrations();

    // Add a new migration file
    writeFileSync(
      join(testMigrationsDir, "003_create_comments.sql"),
      "CREATE TABLE comments (id TEXT PRIMARY KEY)"
    );

    // Get status
    const status = await runner.getStatus();

    expect(status.applied).toHaveLength(2);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0].id).toBe("003");
  });

  it("should handle empty migrations directory", async () => {
    const runner = new MigrationRunner(db, testMigrationsDir);
    const appliedCount = await runner.runPendingMigrations();

    expect(appliedCount).toBe(0);
  });

  it("should reject invalid migration filename format", async () => {
    // Create migration with invalid filename
    writeFileSync(
      join(testMigrationsDir, "invalid_migration.sql"),
      "CREATE TABLE test (id TEXT)"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    await expect(runner.runPendingMigrations()).rejects.toThrow(
      "Invalid migration filename format"
    );
  });

  it("should handle migration failure gracefully", async () => {
    // Create migration with invalid SQL
    writeFileSync(
      join(testMigrationsDir, "001_invalid.sql"),
      "INVALID SQL STATEMENT"
    );

    const runner = new MigrationRunner(db, testMigrationsDir);

    await expect(runner.runPendingMigrations()).rejects.toThrow();

    // Verify migration was not recorded as applied
    const migrations = await new Promise<Array<{ id: string }>>(
      (resolve, reject) => {
        db.all(
          "SELECT id FROM migrations",
          (err, rows: Array<{ id: string }>) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      }
    );

    expect(migrations).toHaveLength(0);
  });

  it("should ignore SQL comments in migrations", async () => {
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

    // Verify table was created
    const result = await new Promise<{ count: number }>((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='users'",
        (err, row: { count: number }) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(result.count).toBe(1);
  });
});
