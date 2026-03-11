import sqlite3 from "sqlite3";
import { dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { MigrationRunner } from "./MigrationRunner";

/**
 * Database service for SQLite initialization and connection management
 */
export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  /**
   * Initialize the database connection and create schema
   */
  public async initialize(): Promise<void> {
    try {
      // Ensure database directory exists
      const dbDir = dirname(this.databasePath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection
      this.db = await this.createConnection();

      // Initialize schema
      await this.initializeSchema();
    } catch (error) {
      throw new Error(
        `Database initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Create SQLite database connection with optimized settings
   */
  private createConnection(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.databasePath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to database: ${err.message}`));
        } else {
          // Enable WAL mode for better concurrency
          db.run('PRAGMA journal_mode = WAL;', (walErr) => {
            if (walErr) {
              console.warn('Failed to enable WAL mode:', walErr.message);
            }
          });

          // Set performance optimizations
          db.run('PRAGMA synchronous = NORMAL;'); // Balance between safety and speed
          db.run('PRAGMA cache_size = -64000;'); // 64MB cache
          db.run('PRAGMA temp_store = MEMORY;'); // Use memory for temp tables
          db.run('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped I/O

          // Enable foreign keys
          db.run('PRAGMA foreign_keys = ON;', (fkErr) => {
            if (fkErr) {
              reject(new Error(`Failed to enable foreign keys: ${fkErr.message}`));
            } else {
              resolve(db);
            }
          });
        }
      });
    });
  }

  /**
   * Initialize database schema using migration-first approach
   *
   * Schema Management Policy:
   * - ALL schema definitions are in numbered migrations (migrations/*.sql)
   * - Migration 000: Initial schema (executions, revoked_tokens)
   * - Migration 001: RBAC tables (users, roles, permissions, groups)
   * - Migration 002+: All subsequent schema changes
   * - Future changes: Always create a new numbered migration
   * - Never modify existing migrations after they've been applied
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error("Database connection not established");
    }

    try {
      // Run all migrations (including initial schema)
      await this.runMigrations();
    } catch (error) {
      throw new Error(
        `Schema initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Run database migrations using the migration runner
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error("Database connection not established");
    }

    try {
      const migrationRunner = new MigrationRunner(this.db);
      const appliedCount = await migrationRunner.runPendingMigrations();

      if (appliedCount > 0) {
        console.warn(`Applied ${String(appliedCount)} database migration(s)`);
      }
    } catch (error) {
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get database connection
   */
  public getConnection(): sqlite3.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Prepare a SQL statement for reuse (improves performance for repeated queries)
   * @param sql SQL statement with placeholders
   * @returns Prepared statement
   */
  public prepareStatement(sql: string): sqlite3.Statement {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db.prepare(sql);
  }

  /**
   * Execute a prepared statement
   * @param statement Prepared statement
   * @param params Parameters for the statement
   * @returns Promise that resolves when execution completes
   */
  public executePrepared(
    statement: sqlite3.Statement,
    params: unknown[] = []
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      statement.run(params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Finalize a prepared statement to free resources
   * @param statement Prepared statement to finalize
   */
  public finalizeStatement(statement: sqlite3.Statement): Promise<void> {
    return new Promise((resolve, reject) => {
      statement.finalize((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    const dbToClose = this.db;
    return new Promise((resolve, reject) => {
      dbToClose.close((err) => {
        if (err) {
          reject(new Error(`Failed to close database: ${err.message}`));
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Get migration status (applied and pending migrations)
   */
  public async getMigrationStatus(): Promise<{
    applied: { id: string; name: string; appliedAt: string }[];
    pending: { id: string; filename: string }[];
  }> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }

    const migrationRunner = new MigrationRunner(this.db);
    return await migrationRunner.getStatus();
  }
}
