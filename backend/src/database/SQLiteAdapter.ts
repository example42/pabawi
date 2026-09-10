import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseAccessLock } from "./DatabaseAccessLock";
import sqlite3 from "sqlite3";
import { dirname } from "path";
import { mkdirSync } from "fs";
import type { DatabaseAdapter } from "./DatabaseAdapter";
import { DatabaseQueryError, DatabaseConnectionError } from "./errors";

/**
 * SQLiteAdapter implementing DatabaseAdapter using the sqlite3 package.
 */
export class SQLiteAdapter implements DatabaseAdapter {
  private _databasePath: string;
  private _db: sqlite3.Database | null = null;
  private _connected = false;
  private readonly access = new DatabaseAccessLock();
  private readonly scope = new AsyncLocalStorage<{ active: boolean; transaction: boolean }>();

  constructor(databasePath: string) {
    this._databasePath = databasePath;
  }

  async initialize(): Promise<void> {
    if (this._databasePath !== ":memory:") {
      const dir = dirname(this._databasePath);
      mkdirSync(dir, { recursive: true });
    }

    return new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(this._databasePath, (err) => {
        if (err) {
          reject(
            new DatabaseConnectionError(
              `Failed to open SQLite database: ${err.message}`,
              this._databasePath,
            ),
          );
          return;
        }

        // Restore the performance-related PRAGMAs that were set in the previous
        // implementation so that switching to the adapter layer does not regress
        // performance under load.
        const pragmas: { sql: string; description: string }[] = [
          { sql: "PRAGMA journal_mode = WAL;", description: "enable WAL mode" },
          { sql: "PRAGMA synchronous = NORMAL;", description: "set synchronous mode" },
          { sql: "PRAGMA cache_size = -20000;", description: "set cache size (20 MB)" },
          { sql: "PRAGMA temp_store = MEMORY;", description: "set temp store to memory" },
          { sql: "PRAGMA mmap_size = 268435456;", description: "set mmap size (256 MB)" },
          { sql: "PRAGMA foreign_keys = ON;", description: "enable foreign keys" },
        ];

        const applyPragma = (index: number): void => {
          if (index >= pragmas.length) {
            this._db = db;
            this._connected = true;
            resolve();
            return;
          }

          const pragma = pragmas[index];
          db.run(pragma.sql, (pragmaErr) => {
            if (pragmaErr) {
              reject(
                new DatabaseConnectionError(
                  `Failed to ${pragma.description}: ${pragmaErr.message}`,
                  this._databasePath,
                ),
              );
              return;
            }
            applyPragma(index + 1);
          });
        };

        applyPragma(0);
      });
    });
  }

  async close(): Promise<void> {
    return this.withExclusiveConnection(async () => {
      if (!this._db) {
        return;
      }

      const db = this._db;
      return new Promise<void>((resolve, reject) => {
        db.close((err) => {
          if (err) {
            reject(
              new DatabaseConnectionError(
                `Failed to close SQLite database: ${err.message}`,
                this._databasePath,
              ),
            );
            return;
          }
          this._db = null;
          this._connected = false;
          resolve();
        });
      });
    });
  }

  query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this._db) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }

    const db = this._db;
    return this.withExclusiveConnection(() => new Promise<T[]>((resolve, reject) => {
      db.all(sql, params ?? [], (err, rows) => {
        if (err) {
          reject(new DatabaseQueryError(err.message, sql, params));
          return;
        }
        resolve((rows as T[] | undefined) ?? ([] as T[]));
      });
    }));
  }

  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    if (!this._db) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }

    const db = this._db;
    return this.withExclusiveConnection(() => new Promise<T | null>((resolve, reject) => {
      db.get(sql, params ?? [], (err, row) => {
        if (err) {
          reject(new DatabaseQueryError(err.message, sql, params));
          return;
        }
        resolve((row as T) ?? null);
      });
    }));
  }

  execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    if (!this._db) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }

    const db = this._db;
    return this.withExclusiveConnection(() => new Promise<{ changes: number }>((resolve, reject) => {
      db.run(sql, params ?? [], function (err) {
        if (err) {
          reject(new DatabaseQueryError(err.message, sql, params));
          return;
        }
        resolve({ changes: this.changes });
      });
    }));
  }

  async withExclusiveConnection<T>(fn: () => Promise<T>): Promise<T> {
    const owner = this.scope.getStore();
    if (owner) {
      if (!owner.active) throw new DatabaseQueryError("Database scope has ended", "", []);
      return fn();
    }
    return this.access.run(true, async () => {
      const context = { active: true, transaction: false };
      try {
        return await this.scope.run(context, fn);
      } finally {
        context.active = false;
      }
    });
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.withExclusiveConnection(async () => {
      const parent = this.scope.getStore();
      if (!parent || parent.transaction) throw new DatabaseQueryError("Nested transactions are not supported", "BEGIN", []);
      parent.transaction = true;
      const context = { active: true, transaction: true };
      try {
        await this.execute("BEGIN IMMEDIATE");
      } catch (error) {
        parent.transaction = false;
        throw error;
      }
      try {
        const result = await this.scope.run(context, fn);
        context.active = false;
        await this.execute("COMMIT");
        return result;
      } catch (error) {
        await this.execute("ROLLBACK").catch(async () => { await this.close(); });
        throw error;
      } finally {
        context.active = false;
        parent.transaction = false;
      }
    });
  }

  isConnected(): boolean {
    return this._connected;
  }

  getDialect(): "sqlite" | "postgres" {
    return "sqlite";
  }
}
