/**
 * SQLite Database Adapter
 *
 * Part of v1.0.0 Modular Plugin Architecture (Step 1.5)
 *
 * Implements the DatabaseAdapter interface for SQLite databases
 * using the sqlite3 package with async/Promise wrappers.
 */

import sqlite3 from "sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import type {
  DatabaseAdapter,
  DatabaseConfig,
  DatabaseDialect,
  DatabaseHealthCheckResult,
  ExecuteResult,
  Migration,
} from "../interfaces/DatabaseInterface.js";

/**
 * SQLite adapter implementing the DatabaseAdapter interface
 */
export class SQLiteAdapter implements DatabaseAdapter {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private _inTransaction = false;

  constructor(config: DatabaseConfig) {
    if (!config.path) {
      throw new Error("SQLite adapter requires 'path' configuration option");
    }
    this.config = config;
  }

  // ========== Connection Management ==========

  async connect(): Promise<void> {
    if (this.db) {
      return; // Already connected
    }

    const dbPath = this.config.path!;

    // Ensure database directory exists
    const dbDir = dirname(dbPath);
    if (dbDir !== "." && !existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(
            new Error(`SQLite connection failed: ${err.message}`)
          );
        } else {
          this.db = db;

          // Enable foreign keys and WAL mode for better performance
          this.db.run("PRAGMA foreign_keys = ON", (fkErr) => {
            if (fkErr) {
              console.warn("Failed to enable foreign keys:", fkErr.message);
            }
          });

          this.db.run("PRAGMA journal_mode = WAL", (walErr) => {
            if (walErr) {
              console.warn("Failed to enable WAL mode:", walErr.message);
            }
          });

          if (this.config.debug) {
            console.log(`[SQLiteAdapter] Connected to: ${dbPath}`);
          }

          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.db) {
      return;
    }

    const dbToClose = this.db;
    return new Promise((resolve, reject) => {
      dbToClose.close((err) => {
        if (err) {
          reject(new Error(`SQLite disconnect failed: ${err.message}`));
        } else {
          this.db = null;
          this._inTransaction = false;
          if (this.config.debug) {
            console.log("[SQLiteAdapter] Disconnected");
          }
          resolve();
        }
      });
    });
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  async healthCheck(): Promise<DatabaseHealthCheckResult> {
    if (!this.db) {
      return {
        healthy: false,
        message: "Database not connected",
      };
    }

    const startTime = Date.now();

    try {
      // Execute a simple query to check connection
      await this.queryOne<{ version: string }>("SELECT sqlite_version() as version");

      const latencyMs = Date.now() - startTime;
      const version = await this.getCurrentVersion();

      return {
        healthy: true,
        message: "SQLite connection healthy",
        details: {
          version,
          latencyMs,
          engineVersion: `SQLite`,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  // ========== Transaction Support ==========

  async beginTransaction(): Promise<void> {
    if (this._inTransaction) {
      throw new Error("Already in a transaction");
    }
    await this.exec("BEGIN TRANSACTION");
    this._inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this._inTransaction) {
      throw new Error("Not in a transaction");
    }
    await this.exec("COMMIT");
    this._inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this._inTransaction) {
      throw new Error("Not in a transaction");
    }
    await this.exec("ROLLBACK");
    this._inTransaction = false;
  }

  inTransaction(): boolean {
    return this._inTransaction;
  }

  // ========== Query Execution ==========

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Query failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`Query failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve((row as T) ?? null);
        }
      });
    });
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function (err) {
        if (err) {
          reject(new Error(`Execute failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve({
            changes: this.changes,
            lastID: this.lastID,
          });
        }
      });
    });
  }

  async exec(sql: string): Promise<void> {
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.db!.exec(sql, (err) => {
        if (err) {
          reject(new Error(`Exec failed: ${err.message}\nSQL: ${sql}`));
        } else {
          resolve();
        }
      });
    });
  }

  // ========== Schema Management ==========

  async migrate(migrations: Migration[]): Promise<void> {
    this.ensureConnected();

    // Ensure migrations table exists
    await this.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const currentVersion = await this.getCurrentVersion();

    // Sort migrations by version
    const pendingMigrations = migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of pendingMigrations) {
      if (this.config.debug) {
        console.log(
          `[SQLiteAdapter] Applying migration ${migration.version}: ${migration.name}`
        );
      }

      await this.beginTransaction();
      try {
        // Execute the migration
        await this.exec(migration.up);

        // Record the migration
        await this.execute(
          "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
          [migration.version, migration.name]
        );

        await this.commit();
      } catch (error) {
        await this.rollback();
        throw new Error(
          `Migration ${migration.version} failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  async getCurrentVersion(): Promise<number> {
    this.ensureConnected();

    try {
      // Check if migrations table exists
      const tableExists = await this.queryOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      );

      if (!tableExists) {
        return 0;
      }

      const result = await this.queryOne<{ version: number }>(
        "SELECT MAX(version) as version FROM schema_migrations"
      );

      return result?.version ?? 0;
    } catch {
      return 0;
    }
  }

  async initializeSchema(schemaSql: string): Promise<void> {
    this.ensureConnected();

    // Split schema into statements and filter out empty ones
    // Note: We need to handle multi-line statements with leading comments
    const statements = schemaSql
      .split(";")
      .map((s) => {
        // Remove leading comment lines but keep the actual SQL
        const lines = s.split("\n");
        const nonCommentLines = lines.filter((line) => {
          const trimmed = line.trim();
          // Keep non-empty lines that don't start with --
          // Also keep empty lines that are part of multi-line statements
          return trimmed.length > 0 && !trimmed.startsWith("--");
        });
        return nonCommentLines.join("\n").trim();
      })
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        await this.exec(statement);
      } catch (error) {
        // Ignore "duplicate column" errors from ALTER TABLE (migration already applied)
        // Ignore "table already exists" errors
        const errorMessage = error instanceof Error ? error.message : "";
        if (
          !errorMessage.includes("duplicate column") &&
          !errorMessage.includes("already exists")
        ) {
          throw error;
        }
        // Migration/schema already applied, continue
      }
    }
  }

  // ========== Utility Methods ==========

  escape(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    // String: escape single quotes by doubling them
    const str = String(value);
    return `'${str.replace(/'/g, "''")}'`;
  }

  getDialect(): DatabaseDialect {
    return "sqlite";
  }

  getRawConnection(): sqlite3.Database {
    this.ensureConnected();
    return this.db!;
  }

  // ========== Private Helper Methods ==========

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error("Database not connected. Call connect() first.");
    }
  }
}
