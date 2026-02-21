import sqlite3 from "sqlite3";
import { readFileSync } from "fs";
import { dirname, join } from "path";
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
          db.run('PRAGMA page_size = 4096;'); // Optimal page size

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
   * Initialize database schema from SQL file
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error("Database connection not established");
    }

    try {
      // Read and execute main schema file
      const schemaPath = join(__dirname, "schema.sql");
      const schema = readFileSync(schemaPath, "utf-8");

      // Split schema into statements
      const statements = schema
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Execute each statement separately to handle migration errors gracefully
      for (const statement of statements) {
        try {
          await this.exec(statement);
        } catch (error) {
          // Ignore "duplicate column" errors from ALTER TABLE (migration already applied)
          const errorMessage = error instanceof Error ? error.message : "";
          if (!errorMessage.includes("duplicate column")) {
            throw error;
          }
          // Migration already applied, continue
        }
      }

      // Read and execute RBAC schema file
      const rbacSchemaPath = join(__dirname, "rbac-schema.sql");
      if (existsSync(rbacSchemaPath)) {
        const rbacSchema = readFileSync(rbacSchemaPath, "utf-8");

        // Split RBAC schema into statements
        const rbacStatements = rbacSchema
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Execute each RBAC statement
        for (const statement of rbacStatements) {
          try {
            await this.exec(statement);
          } catch (error) {
            // Ignore "duplicate column" errors from ALTER TABLE (migration already applied)
            const errorMessage = error instanceof Error ? error.message : "";
            if (!errorMessage.includes("duplicate column")) {
              throw error;
            }
            // Migration already applied, continue
          }
        }
      }

      // Run migrations
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
        console.log(`Applied ${appliedCount} database migration(s)`);
      }
    } catch (error) {
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Execute SQL statement
   */
  private exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database connection not established"));
        return;
      }

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
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
    params: any[] = []
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
      statement.finalize((err) => {
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
    applied: Array<{ id: string; name: string; appliedAt: string }>;
    pending: Array<{ id: string; filename: string }>;
  }> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }

    const migrationRunner = new MigrationRunner(this.db);
    return await migrationRunner.getStatus();
  }
}
