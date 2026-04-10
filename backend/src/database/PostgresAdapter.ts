import pg from "pg";
import type { DatabaseAdapter } from "./DatabaseAdapter";
import { DatabaseQueryError, DatabaseConnectionError } from "./errors";

/**
 * PostgresAdapter implementing DatabaseAdapter using the pg package.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private _databaseUrl: string;
  private _pool: pg.Pool | null = null;
  private _txClient: pg.PoolClient | null = null;
  private _connected = false;

  constructor(databaseUrl: string) {
    this._databaseUrl = databaseUrl;
  }

  async initialize(): Promise<void> {
    this._pool = new pg.Pool({
      connectionString: this._databaseUrl,
      connectionTimeoutMillis: 3000,
    });

    // Create a client with a timeout to detect unreachable servers quickly
    let client: pg.PoolClient | undefined;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Connection timed out"));
      }, 3000);
    });

    try {
      client = await Promise.race([this._pool.connect(), timeout]);
      await client.query("SELECT 1");
      this._connected = true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown connection error";
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      await this._pool.end().catch(() => {});
      this._pool = null;
      throw new DatabaseConnectionError(
        `Failed to connect to PostgreSQL: ${message}`,
        this._databaseUrl,
      );
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async close(): Promise<void> {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }
    this._txClient = null;
    this._connected = false;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const client = this._txClient ?? this._pool;
    if (!client) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Query failed";
      throw new DatabaseQueryError(message, sql, params);
    }
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const client = this._txClient ?? this._pool;
    if (!client) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }
    try {
      const result = await client.query(sql, params);
      return (result.rows[0] as T) ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Query failed";
      throw new DatabaseQueryError(message, sql, params);
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const client = this._txClient ?? this._pool;
    if (!client) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }
    try {
      const result = await client.query(sql, params);
      return { changes: result.rowCount ?? 0 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Query failed";
      throw new DatabaseQueryError(message, sql, params);
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this._pool) {
      throw new DatabaseQueryError("Database not connected", "BEGIN", []);
    }
    if (this._txClient) {
      throw new Error("Nested transactions are not supported");
    }
    this._txClient = await this._pool.connect();
    try {
      await this._txClient.query("BEGIN");
    } catch (err: unknown) {
      this._txClient.release();
      this._txClient = null;
      throw err;
    }
  }

  async commit(): Promise<void> {
    if (!this._txClient) {
      throw new Error("No active transaction to commit");
    }
    try {
      await this._txClient.query("COMMIT");
    } finally {
      this._txClient.release();
      this._txClient = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this._txClient) {
      throw new Error("No active transaction to rollback");
    }
    try {
      await this._txClient.query("ROLLBACK");
    } finally {
      this._txClient.release();
      this._txClient = null;
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this._pool) {
      throw new DatabaseQueryError(
        "Database not connected",
        "BEGIN TRANSACTION",
        [],
      );
    }
    if (this._txClient) {
      throw new DatabaseQueryError(
        "Nested transactions are not supported",
        "BEGIN TRANSACTION",
        [],
      );
    }
    const client = await this._pool.connect();
    this._txClient = client;
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      this._txClient = null;
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  getDialect(): "sqlite" | "postgres" {
    return "postgres";
  }

  getPlaceholder(index: number): string {
    if (!Number.isInteger(index) || index < 1) {
      throw new Error(
        `Invalid placeholder index ${String(index)} for Postgres; parameter positions are 1-based.`,
      );
    }
    return "$" + String(index);
  }
}
