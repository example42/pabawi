/**
 * Database Service
 *
 * Updated for v1.0.0 Modular Plugin Architecture (Step 1.5)
 *
 * This service provides a high-level interface for database operations,
 * delegating to the appropriate database adapter based on configuration.
 * Supports SQLite with future extensibility for PostgreSQL, MySQL, etc.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  DatabaseAdapter,
  DatabaseConfig,
  DatabaseDialect,
  DatabaseHealthCheckResult,
  ExecuteResult,
  Migration,
} from "./interfaces/DatabaseInterface.js";
import { DatabaseFactory } from "./DatabaseFactory.js";

/**
 * Unified database service for Pabawi
 *
 * Wraps the database adapter to provide:
 * - Schema initialization from SQL files
 * - Migration support
 * - Health checks
 * - Backward compatibility with existing code
 *
 * @example
 * ```typescript
 * // SQLite (current default)
 * const db = new DatabaseService({ type: 'sqlite', path: './data/executions.db' });
 * await db.initialize();
 *
 * // Query execution
 * const rows = await db.query('SELECT * FROM executions WHERE status = ?', ['running']);
 *
 * // Future: PostgreSQL
 * const pgDb = new DatabaseService({
 *   type: 'postgresql',
 *   host: 'localhost',
 *   database: 'pabawi'
 * });
 * ```
 */
export class DatabaseService {
  private adapter: DatabaseAdapter;
  private config: DatabaseConfig;
  private initialized = false;

  /**
   * Create a new DatabaseService
   *
   * @param config - Database configuration object or legacy path string
   */
  constructor(config: DatabaseConfig | string) {
    // Support legacy constructor with just path string
    if (typeof config === "string") {
      this.config = {
        type: "sqlite",
        path: config,
      };
    } else {
      this.config = config;
    }

    this.adapter = DatabaseFactory.create(this.config);
  }

  /**
   * Initialize the database connection and schema
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Connect to database
      await this.adapter.connect();

      // Initialize schema from SQL file
      await this.initializeSchema();

      // Run migrations
      await this.runMigrations();

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Database initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Initialize database schema from SQL file
   */
  private async initializeSchema(): Promise<void> {
    try {
      const schemaPath = join(__dirname, "schema.sql");

      if (!existsSync(schemaPath)) {
        console.warn(
          "[DatabaseService] No schema.sql file found, skipping schema initialization",
        );
        return;
      }

      const schema = readFileSync(schemaPath, "utf-8");
      await this.adapter.initializeSchema(schema);
    } catch (error) {
      throw new Error(
        `Schema initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Run database migrations from SQL file
   */
  private async runMigrations(): Promise<void> {
    try {
      const migrationsPath = join(__dirname, "migrations.sql");

      if (!existsSync(migrationsPath)) {
        return; // No migrations to run
      }

      const migrationsContent = readFileSync(migrationsPath, "utf-8");

      // Parse migrations from SQL file
      // Format: -- Migration N: name
      //         SQL statements...
      const migrationBlocks = migrationsContent.split(/-- Migration (\d+):/);
      const migrations: Migration[] = [];

      for (let i = 1; i < migrationBlocks.length; i += 2) {
        const version = parseInt(migrationBlocks[i], 10);
        const content = migrationBlocks[i + 1];

        if (content) {
          const lines = content.trim().split("\n");
          const nameLine = lines[0]?.trim() || `Migration ${version}`;
          const sql = lines.slice(1).join("\n").trim();

          if (sql) {
            migrations.push({
              version,
              name: nameLine,
              up: sql,
              down: "", // Down migrations not currently used
            });
          }
        }
      }

      // If no structured migrations found, run legacy migration style
      if (migrations.length === 0) {
        const statements = migrationsContent
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith("--"));

        for (const statement of statements) {
          try {
            await this.exec(statement);
          } catch (error) {
            // Ignore "duplicate column" errors (migration already applied)
            const errorMessage = error instanceof Error ? error.message : "";
            if (!errorMessage.includes("duplicate column")) {
              throw error;
            }
          }
        }
      } else {
        await this.adapter.migrate(migrations);
      }
    } catch (error) {
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // ========== Query Methods (delegated to adapter) ==========

  /**
   * Execute a SELECT query and return all matching rows
   */
  public async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    this.ensureInitialized();
    return this.adapter.query<T>(sql, params);
  }

  /**
   * Execute a SELECT query and return the first matching row
   */
  public async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null> {
    this.ensureInitialized();
    return this.adapter.queryOne<T>(sql, params);
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   */
  public async execute(
    sql: string,
    params?: unknown[],
  ): Promise<ExecuteResult> {
    this.ensureInitialized();
    return this.adapter.execute(sql, params);
  }

  /**
   * Execute multiple SQL statements
   */
  public async exec(sql: string): Promise<void> {
    this.ensureInitialized();
    return this.adapter.exec(sql);
  }

  // ========== Transaction Support ==========

  /**
   * Begin a new transaction
   */
  public async beginTransaction(): Promise<void> {
    this.ensureInitialized();
    return this.adapter.beginTransaction();
  }

  /**
   * Commit the current transaction
   */
  public async commit(): Promise<void> {
    this.ensureInitialized();
    return this.adapter.commit();
  }

  /**
   * Rollback the current transaction
   */
  public async rollback(): Promise<void> {
    this.ensureInitialized();
    return this.adapter.rollback();
  }

  /**
   * Execute a function within a transaction
   * Automatically commits on success, rolls back on error
   */
  public async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await fn();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  // ========== Connection & Utility Methods ==========

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await this.adapter.disconnect();
    this.initialized = false;
  }

  /**
   * Perform a health check on the database
   */
  public async healthCheck(): Promise<DatabaseHealthCheckResult> {
    return this.adapter.healthCheck();
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current database dialect
   */
  public getDialect(): DatabaseDialect {
    return this.adapter.getDialect();
  }

  /**
   * Get the raw database connection
   *
   * @deprecated Use the abstraction layer methods instead.
   * This is provided for backward compatibility with ExecutionRepository.
   */
  public getConnection(): unknown {
    this.ensureInitialized();
    return this.adapter.getRawConnection();
  }

  /**
   * Get the database adapter directly
   *
   * Useful for advanced operations not covered by the service layer.
   */
  public getAdapter(): DatabaseAdapter {
    return this.adapter;
  }

  // ========== Private Helper Methods ==========

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
  }
}
