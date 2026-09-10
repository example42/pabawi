import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseAccessLock } from "./DatabaseAccessLock";
import pg from "pg";
import type { DatabaseAdapter } from "./DatabaseAdapter";
import { DatabaseQueryError, DatabaseConnectionError } from "./errors";
import { rewritePlaceholders } from "./rewritePlaceholders";

/**
 * PostgresAdapter implementing DatabaseAdapter using the pg package.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private _databaseUrl: string;
  private _pool: pg.Pool | null = null;
  private readonly access = new DatabaseAccessLock();
  private readonly scope = new AsyncLocalStorage<{ active: boolean; transaction: boolean; broken: boolean; client: pg.PoolClient }>();
  private _connected = false;

  constructor(databaseUrl: string) {
    this._databaseUrl = databaseUrl;
  }

  async initialize(): Promise<void> {
    this._pool = new pg.Pool({
      connectionString: this._databaseUrl,
      connectionTimeoutMillis: 3000,
    });

    // Create a client with a timeout to detect unreachable servers quickly.
    // The timeout handle is always cleared once the race settles to avoid
    // unhandled rejections from a late-firing timer.  If the timeout wins,
    // we also arrange to release any client that eventually resolves so it
    // does not leak back into the pool.
    let client: pg.PoolClient | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const connectPromise = this._pool.connect();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new Error("Connection timed out"));
      }, 3000);
    });

    // If the timeout wins, release any client that resolves afterwards.
    void connectPromise.then((resolvedClient) => {
      if (timedOut) {
        resolvedClient.release();
      }
    }).catch(() => { /* handled below via the race winner */ });

    try {
      try {
        client = await Promise.race([connectPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      await client.query("SELECT 1");
      this._connected = true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown connection error";
      await this._pool.end().catch(() => { /* intentional no-op */ });
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
    this._connected = false;
  }

  /**
   * Single chokepoint to pg: resolves the active client (transaction or pool),
   * normalises `?` placeholders to `$n`, runs the query and wraps failures.
   *
   * Every statement reaching pg goes through here, so the `?`→`$n` rewrite
   * happens exactly once. The thrown error carries the rewritten SQL — that is
   * what pg actually rejected.
   */
  private async raw(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult> {
    const owner = this.scope.getStore();
    if (owner && !owner.active) throw new DatabaseQueryError("Database scope has ended", sql, params);
    const client = owner?.client ?? this._pool;
    if (!client) {
      throw new DatabaseQueryError("Database not connected", sql, params);
    }
    const text = rewritePlaceholders(sql);
    try {
      return await (owner ? client.query(text, params) : this.access.run(false, () => client.query(text, params)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Query failed";
      throw new DatabaseQueryError(message, text, params);
    }
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.raw(sql, params);
    return result.rows as T[];
  }

  async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const result = await this.raw(sql, params);
    return (result.rows[0] as T) ?? null;
  }

  async execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const result = await this.raw(sql, params);
    return { changes: result.rowCount ?? 0 };
  }

  private async withConnection<T>(exclusive: boolean, fn: () => Promise<T>): Promise<T> {
    const owner = this.scope.getStore();
    if (owner) {
      if (!owner.active) throw new DatabaseQueryError("Database scope has ended", "", []);
      return fn();
    }
    return this.access.run(exclusive, async () => {
      if (!this._pool) throw new DatabaseQueryError("Database not connected", "", []);
      const client = await this._pool.connect();
      const context = { active: true, transaction: false, broken: false, client };
      try {
        return await this.scope.run(context, fn);
      } finally {
        context.active = false;
        client.release(context.broken);
      }
    });
  }

  async withExclusiveConnection<T>(fn: () => Promise<T>): Promise<T> {
    if (this.scope.getStore()) throw new DatabaseQueryError("Exclusive access cannot be nested", "", []);
    return this.withConnection(true, fn);
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.withConnection(false, async () => {
      const owner = this.scope.getStore();
      if (!owner || owner.transaction) throw new DatabaseQueryError("Nested transactions are not supported", "BEGIN", []);
      owner.transaction = true;
      const context = { ...owner, transaction: true };
      try {
        await this.execute("BEGIN");
      } catch (error) {
        owner.transaction = false;
        owner.broken = true;
        throw error;
      }
      try {
        const result = await this.scope.run(context, fn);
        context.active = false;
        await this.execute("COMMIT");
        return result;
      } catch (error) {
        await this.execute("ROLLBACK").catch(() => { owner.broken = true; });
        throw error;
      } finally {
        context.active = false;
        owner.transaction = false;
      }
    });
  }

  isConnected(): boolean {
    return this._connected;
  }

  getDialect(): "sqlite" | "postgres" {
    return "postgres";
  }
}
