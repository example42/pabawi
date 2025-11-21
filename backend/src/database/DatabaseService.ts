import sqlite3 from "sqlite3";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";

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
   * Create SQLite database connection
   */
  private createConnection(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.databasePath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to database: ${err.message}`));
        } else {
          resolve(db);
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
      // Read schema file
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

      // Run migrations
      await this.runMigrations();
    } catch (error) {
      throw new Error(
        `Schema initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error("Database connection not established");
    }

    try {
      const migrationsPath = join(__dirname, "migrations.sql");

      // Check if migrations file exists
      if (!existsSync(migrationsPath)) {
        return; // No migrations to run
      }

      const migrations = readFileSync(migrationsPath, "utf-8");

      // Split migrations into statements
      const statements = migrations
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Execute each migration statement
      for (const statement of statements) {
        try {
          await this.exec(statement);
        } catch (error) {
          // Ignore "duplicate column" errors (migration already applied)
          const errorMessage = error instanceof Error ? error.message : "";
          if (!errorMessage.includes("duplicate column name")) {
            throw error;
          }
          // Migration already applied, continue
        }
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
}
