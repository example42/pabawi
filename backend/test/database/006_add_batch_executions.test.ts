import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sqlite3 from "sqlite3";
import { MigrationRunner } from "../../src/database/MigrationRunner";
import { readFileSync } from "fs";
import { join } from "path";

describe("Migration 006: Add batch executions", () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(":memory:");

    // Apply base schema first (executions table)
    const baseSchema = readFileSync(
      join(__dirname, "../../src/database/schema.sql"),
      "utf-8"
    );
    await new Promise<void>((resolve, reject) => {
      db.exec(baseSchema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  it("should create batch_executions table with correct schema", async () => {
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify batch_executions table exists
    const tableInfo = await new Promise<any[]>((resolve, reject) => {
      db.all("PRAGMA table_info(batch_executions)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(tableInfo.length).toBeGreaterThan(0);

    // Verify required columns exist
    const columnNames = tableInfo.map((col: any) => col.name);
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
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify indexes exist
    const indexes = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='batch_executions'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const indexNames = indexes.map((idx: any) => idx.name);
    expect(indexNames).toContain("idx_batch_executions_created");
    expect(indexNames).toContain("idx_batch_executions_status");
    expect(indexNames).toContain("idx_batch_executions_user");
  });

  it("should add batch_id and batch_position columns to executions table", async () => {
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify executions table has new columns
    const tableInfo = await new Promise<any[]>((resolve, reject) => {
      db.all("PRAGMA table_info(executions)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const columnNames = tableInfo.map((col: any) => col.name);
    expect(columnNames).toContain("batch_id");
    expect(columnNames).toContain("batch_position");
  });

  it("should create index for batch queries on executions table", async () => {
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify batch index exists
    const indexes = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='executions'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const indexNames = indexes.map((idx: any) => idx.name);
    expect(indexNames).toContain("idx_executions_batch");
  });

  it("should preserve existing data when migrating executions table", async () => {
    // Insert test data before migration
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO executions (
          id, type, target_nodes, action, status, started_at, results
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "test-exec-1",
          "command",
          '["node1"]',
          "uptime",
          "success",
          "2024-01-01T00:00:00Z",
          "[]"
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Apply migration
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify data was preserved
    const rows = await new Promise<any[]>((resolve, reject) => {
      db.all("SELECT * FROM executions WHERE id = ?", ["test-exec-1"], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("test-exec-1");
    expect(rows[0].type).toBe("command");
    expect(rows[0].action).toBe("uptime");
    expect(rows[0].batch_id).toBeNull();
    expect(rows[0].batch_position).toBeNull();
  });

  it("should allow inserting batch execution records", async () => {
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Insert a batch execution
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, target_nodes, target_groups, status,
          created_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "batch-1",
          "command",
          "uptime",
          '["node1", "node2"]',
          '["group1"]',
          "running",
          "2024-01-01T00:00:00Z",
          "user1",
          '["exec1", "exec2"]',
          2,
          2,
          0,
          0,
          0
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Verify insertion
    const rows = await new Promise<any[]>((resolve, reject) => {
      db.all("SELECT * FROM batch_executions WHERE id = ?", ["batch-1"], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("batch-1");
    expect(rows[0].type).toBe("command");
    expect(rows[0].status).toBe("running");
  });

  it("should enforce CHECK constraints on batch_executions", async () => {
    const migrationSQL = readFileSync(
      join(__dirname, "../../src/database/migrations/006_add_batch_executions.sql"),
      "utf-8"
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(migrationSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Try to insert invalid type
    const insertInvalidType = new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO batch_executions (
          id, type, action, target_nodes, target_groups, status,
          created_at, user_id, execution_ids,
          stats_total, stats_queued, stats_running, stats_success, stats_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "batch-invalid",
          "invalid_type",
          "uptime",
          "[]",
          "[]",
          "running",
          "2024-01-01T00:00:00Z",
          "user1",
          "[]",
          0, 0, 0, 0, 0
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await expect(insertInvalidType).rejects.toThrow();
  });
});
