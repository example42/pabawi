/**
 * Unified database interface abstracting SQLite and PostgreSQL.
 * All services operate against this interface, enabling either backend
 * without code changes.
 */
export interface DatabaseAdapter {
  /** Execute a query and return all matching rows. */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Execute a query and return the first row, or null. */
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /** Execute a statement (INSERT/UPDATE/DELETE) and return the number of affected rows. */
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;

  /** Begin a transaction. */
  beginTransaction(): Promise<void>;

  /** Commit the current transaction. */
  commit(): Promise<void>;

  /** Rollback the current transaction. */
  rollback(): Promise<void>;

  /** Run a callback inside a transaction; commits on success, rolls back on error. */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;

  /** Open the database connection and perform any setup (e.g. WAL mode). */
  initialize(): Promise<void>;

  /** Close the database connection and release resources. */
  close(): Promise<void>;

  /** Returns true if the database connection is open. */
  isConnected(): boolean;

  /** Returns the SQL dialect of this adapter. */
  getDialect(): "sqlite" | "postgres";

  /** Returns the parameter placeholder for the given 1-based index. */
  getPlaceholder(index: number): string;
}
