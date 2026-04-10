import { createDatabaseAdapter } from "./AdapterFactory";
import type { DatabaseAdapter } from "./DatabaseAdapter";
import { MigrationRunner } from "./MigrationRunner";
import { dirname } from "path";
import { mkdirSync, existsSync } from "fs";

/**
 * Database service for initialization and connection management
 */
export class DatabaseService {
  private adapter: DatabaseAdapter | null = null;
  private databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  /**
   * Initialize the database connection and create schema
   */
  public async initialize(): Promise<void> {
    try {
      // Create adapter via factory
      this.adapter = await createDatabaseAdapter({ databasePath: this.databasePath });

      // Ensure the database directory exists only for SQLite (not for Postgres
      // where DATABASE_PATH is a connection string, not a filesystem path).
      if (this.adapter.getDialect() === "sqlite") {
        const dbDir = dirname(this.databasePath);
        if (!existsSync(dbDir)) {
          mkdirSync(dbDir, { recursive: true });
        }
      }

      await this.adapter.initialize();

      // Initialize schema
      await this.runMigrations();
    } catch (error) {
      throw new Error(
        `Database initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Run database migrations using the migration runner
   */
  private async runMigrations(): Promise<void> {
    if (!this.adapter) {
      throw new Error("Database connection not established");
    }

    try {
      const migrationRunner = new MigrationRunner(this.adapter);
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
   * Get database adapter
   */
  public getAdapter(): DatabaseAdapter {
    if (!this.adapter) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.adapter;
  }

  /**
   * Get database connection (backward-compatible alias for getAdapter)
   * @deprecated Use getAdapter() instead
   */
  public getConnection(): DatabaseAdapter {
    return this.getAdapter();
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = null;
    }
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.adapter !== null;
  }

  /**
   * Get migration status (applied and pending migrations)
   */
  public async getMigrationStatus(): Promise<{
    applied: { id: string; name: string; appliedAt: string }[];
    pending: { id: string; filename: string }[];
  }> {
    if (!this.adapter) {
      throw new Error("Database not initialized. Call initialize() first.");
    }

    const migrationRunner = new MigrationRunner(this.adapter);
    return await migrationRunner.getStatus();
  }
}
