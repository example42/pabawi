import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const migrationsDir = join(__dirname, "../../src/database/migrations");

/**
 * Apply migrations from 000 up to (but not including) the given stopBefore id.
 */
async function applyMigrationsUpTo(db: DatabaseAdapter, stopBeforeId: string): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql") && !f.includes(".sqlite.") && !f.includes(".postgres."))
    .sort();

  for (const file of files) {
    const id = file.split("_")[0];
    if (id >= stopBeforeId) break;

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => {
        if (s.length === 0) return false;
        const withoutComments = s
          .split("\n")
          .map(line => line.replace(/--.*$/, "").trim())
          .filter(line => line.length > 0)
          .join("\n");
        return withoutComments.length > 0;
      });
    for (const statement of statements) {
      await db.execute(statement);
    }
  }
}

async function applyMigration006(db: DatabaseAdapter): Promise<void> {
  const sql = readFileSync(
    join(migrationsDir, "006_add_batch_executions.sql"),
    "utf-8"
  );
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => {
      if (s.length === 0) return false;
      const withoutComments = s
        .split("\n")
        .map(line => line.replace(/--.*$/, "").trim())
        .filter(line => line.length > 0)
        .join("\n");
      return withoutComments.length > 0;
    });
  for (const statement of statements) {
    await db.execute(statement);
  }
}

describe("Migration 006: Add batch executions", () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await applyMigrationsUpTo(db, "006");
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create batch_executions table with correct schema", async () => {
    await applyMigration006(db);

    const tableInfo = await db.query<{ name: string }>("PRAGMA table_info(batch_executions)");
    expect(tableInfo.length).toBeGreaterThan(0);

    const columnNames = tableInfo.map(col => col.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("action");
    expect(columnNames).toContain("parameters");
    expect(columnNames).toContain("target_nodes");
    expect(columnNames).toContain("target_groups");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("started_at");
    expect(columnNames).toContain("completed_at");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("execution_ids");
    expect(columnNames).toContain("stats_total");
    expect(columnNames).toContain("stats_queued");
    expect(columnNames).toContain("stats_running");
    expect(columnNames).toContain("stats_success");
    expect(columnNames).toContain("stats_failed");
  });

  it("should create indexes for batch_executions table", async () => {
    await applyMigration006(db);

    const indexes = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='batch_executions'"
    );
    const indexNames = indexes.map(idx => idx.name);
    expect(indexNames).toContain("idx_batch_executions_created");
    expect(indexNames).toContain("idx_batch_executions_status");
    expect(indexNames).toContain("idx_batch_executions_user");
  });

  it("should add batch_id and batch_position columns to executions table", async () => {
    await applyMigration006(db);

    const tableInfo = await db.query<{ name: string }>("PRAGMA table_info(executions)");
    const columnNames = tableInfo.map(col => col.name);
    expect(columnNames).toContain("batch_id");
    expect(columnNames).toContain("batch_position");
  });

  it("should create index for batch queries on executions table", async () => {
    await applyMigration006(db);

    const indexes = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='executions'"
    );
    const indexNames = indexes.map(idx => idx.name);
    expect(indexNames).toContain("idx_executions_batch");
  });

  it("should preserve existing data when migrating executions table", async () => {
    // Insert test data before migration
    await db.execute(
      `INSERT INTO executions (id, type, target_nodes, action, status, started_at, results)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["test-exec-1", "command", '["node1"]', "uptime", "success", "2024-01-01T00:00:00Z", "[]"]
    );

    await applyMigration006(db);

    const rows = await db.query<Record<string, unknown>>(
      "SELECT * FROM executions WHERE id = ?",
      ["test-exec-1"]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("test-exec-1");
    expect(rows[0].type).toBe("command");
    expect(rows[0].action).toBe("uptime");
    expect(rows[0].batch_id).toBeNull();
    expect(rows[0].batch_position).toBeNull();
  });

  it("should allow inserting batch execution records", async () => {
    await applyMigration006(db);

    await db.execute(
      `INSERT INTO batch_executions (
        id, type, action, target_nodes, target_groups, status,
        created_at, user_id, execution_ids,
        stats_total, stats_queued, stats_running, stats_success, stats_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "batch-1", "command", "uptime", '["node1", "node2"]', '["group1"]',
        "running", "2024-01-01T00:00:00Z", "user1", '["exec1", "exec2"]',
        2, 2, 0, 0, 0
      ]
    );

    const rows = await db.query<Record<string, unknown>>(
      "SELECT * FROM batch_executions WHERE id = ?",
      ["batch-1"]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("batch-1");
    expect(rows[0].type).toBe("command");
    expect(rows[0].status).toBe("running");
  });

  it("should enforce CHECK constraints on batch_executions", async () => {
    await applyMigration006(db);

    await expect(
      db.execute(
        `INSERT INTO batch_executions (
          id, type, action, target_nodes, target_groups, status,
          created_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "batch-invalid", "invalid_type", "uptime", "[]", "[]",
          "running", "2024-01-01T00:00:00Z", "user1", "[]",
          0, 0, 0, 0, 0
        ]
      )
    ).rejects.toThrow();
  });
});
