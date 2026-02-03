/**
 * Database Abstraction Layer - Core Interfaces
 *
 * Part of v1.0.0 Modular Plugin Architecture (Step 1.5)
 *
 * This module defines the standard interface for database adapters,
 * enabling support for multiple database engines (SQLite, PostgreSQL, MySQL)
 * without changing application code.
 */

/**
 * Supported database dialects
 */
export type DatabaseDialect = "sqlite" | "postgresql" | "mysql";

/**
 * Database migration definition
 */
export interface Migration {
  /** Unique migration version number */
  version: number;
  /** Human-readable migration name */
  name: string;
  /** SQL to apply the migration */
  up: string;
  /** SQL to revert the migration */
  down: string;
}

/**
 * Result of a write operation (INSERT, UPDATE, DELETE)
 */
export interface ExecuteResult {
  /** Number of rows affected */
  changes: number;
  /** Last inserted row ID (if applicable) */
  lastID?: number | bigint;
}

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /** Database engine type */
  type: DatabaseDialect;

  // SQLite-specific options
  /** Path to SQLite database file */
  path?: string;

  // PostgreSQL/MySQL-specific options
  /** Database server hostname */
  host?: string;
  /** Database server port */
  port?: number;
  /** Database name */
  database?: string;
  /** Database username */
  username?: string;
  /** Database password */
  password?: string;
  /** Enable SSL/TLS connection */
  ssl?: boolean;

  // Connection pool options (PostgreSQL/MySQL)
  /** Minimum connections in pool */
  poolMin?: number;
  /** Maximum connections in pool */
  poolMax?: number;

  // Common options
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Enable verbose logging */
  debug?: boolean;
}

/**
 * Health check result for database connection
 */
export interface DatabaseHealthCheckResult {
  /** Whether the database is healthy */
  healthy: boolean;
  /** Status message */
  message: string;
  /** Additional details */
  details?: {
    /** Current database version from migrations */
    version?: number;
    /** Connection latency in milliseconds */
    latencyMs?: number;
    /** Database engine version */
    engineVersion?: string;
  };
}

/**
 * Standard database adapter interface
 *
 * All database adapters must implement this interface to ensure
 * consistent behavior across different database engines.
 */
export interface DatabaseAdapter {
  // ========== Connection Management ==========

  /**
   * Establish connection to the database
   * @throws Error if connection fails
   */
  connect(): Promise<void>;

  /**
   * Close the database connection
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected to the database
   */
  isConnected(): boolean;

  /**
   * Perform a health check on the database connection
   */
  healthCheck(): Promise<DatabaseHealthCheckResult>;

  // ========== Transaction Support ==========

  /**
   * Begin a new transaction
   * @throws Error if already in a transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit the current transaction
   * @throws Error if not in a transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the current transaction
   * @throws Error if not in a transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if currently in a transaction
   */
  inTransaction(): boolean;

  // ========== Query Execution ==========

  /**
   * Execute a SELECT query and return all matching rows
   * @param sql - SQL query string with optional parameter placeholders
   * @param params - Array of parameter values
   * @returns Array of row objects
   */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>;

  /**
   * Execute a SELECT query and return the first matching row
   * @param sql - SQL query string with optional parameter placeholders
   * @param params - Array of parameter values
   * @returns Single row object or null if not found
   */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null>;

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   * @param sql - SQL statement with optional parameter placeholders
   * @param params - Array of parameter values
   * @returns Result with affected row count and last inserted ID
   */
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;

  /**
   * Execute multiple SQL statements (for schema initialization)
   * @param sql - SQL statements (may be semicolon-separated)
   * @throws Error if any statement fails
   */
  exec(sql: string): Promise<void>;

  // ========== Schema Management ==========

  /**
   * Run pending database migrations
   * @param migrations - Array of migration definitions
   */
  migrate(migrations: Migration[]): Promise<void>;

  /**
   * Get the current schema version from migrations
   * @returns Current version number, or 0 if no migrations applied
   */
  getCurrentVersion(): Promise<number>;

  /**
   * Initialize the database schema from SQL file content
   * @param schemaSql - SQL schema definition
   */
  initializeSchema(schemaSql: string): Promise<void>;

  // ========== Utility Methods ==========

  /**
   * Safely escape a value for use in SQL (when parameterization isn't possible)
   * @param value - Value to escape
   * @returns Escaped string safe for SQL
   */
  escape(value: unknown): string;

  /**
   * Get the database dialect for this adapter
   */
  getDialect(): DatabaseDialect;

  /**
   * Get the raw database connection (for advanced use cases)
   * Use with caution - this bypasses the abstraction layer
   */
  getRawConnection(): unknown;
}

/**
 * Factory function type for creating database adapters
 */
export type DatabaseAdapterFactory = (
  config: DatabaseConfig
) => DatabaseAdapter;

/**
 * Database adapter constructor interface
 */
export type DatabaseAdapterConstructor = new (config: DatabaseConfig) => DatabaseAdapter;
