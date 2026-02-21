import sqlite3 from "sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Migration metadata
 */
interface Migration {
  id: string;
  name: string;
  appliedAt: string;
}

/**
 * Migration file information
 */
interface MigrationFile {
  id: string;
  filename: string;
  path: string;
}

/**
 * Database migration runner
 * Tracks which migrations have been applied and runs pending migrations in order
 */
export class MigrationRunner {
  private db: sqlite3.Database;
  private migrationsDir: string;

  constructor(db: sqlite3.Database, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir || join(__dirname, "migrations");
  }

  /**
   * Initialize the migrations table to track applied migrations
   */
  private async initializeMigrationsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        appliedAt TEXT NOT NULL
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.run(createTableSQL, (err) => {
        if (err) {
          reject(new Error(`Failed to create migrations table: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get list of applied migrations from database
   */
  private async getAppliedMigrations(): Promise<Migration[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT id, name, appliedAt FROM migrations ORDER BY id",
        (err, rows: Migration[]) => {
          if (err) {
            reject(new Error(`Failed to fetch applied migrations: ${err.message}`));
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Get list of migration files from migrations directory
   */
  private getMigrationFiles(): MigrationFile[] {
    try {
      const files = readdirSync(this.migrationsDir);

      return files
        .filter(file => file.endsWith(".sql"))
        .map(filename => {
          // Extract migration ID from filename (e.g., "001_initial_rbac.sql" -> "001")
          const match = filename.match(/^(\d+)_(.+)\.sql$/);
          if (!match) {
            throw new Error(`Invalid migration filename format: ${filename}. Expected format: NNN_name.sql`);
          }

          return {
            id: match[1],
            filename,
            path: join(this.migrationsDir, filename)
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Migrations directory doesn't exist, return empty array
        return [];
      }
      throw error;
    }
  }

  /**
   * Get pending migrations that haven't been applied yet
   */
  private async getPendingMigrations(): Promise<MigrationFile[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    const allMigrations = this.getMigrationFiles();

    return allMigrations.filter(migration => !appliedIds.has(migration.id));
  }

  /**
   * Execute a single migration file
   */
  private async executeMigration(migration: MigrationFile): Promise<void> {
    try {
      // Read migration file
      const sql = readFileSync(migration.path, "utf-8");

      // Split into statements (handle multi-statement migrations)
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => {
          // Filter out empty statements and comment-only statements
          if (s.length === 0) return false;
          // Remove single-line comments and check if anything remains
          const withoutComments = s.split('\n')
            .map(line => line.replace(/--.*$/, '').trim())
            .filter(line => line.length > 0)
            .join('\n');
          return withoutComments.length > 0;
        });

      // Execute each statement
      for (const statement of statements) {
        await this.execStatement(statement);
      }

      // Record migration as applied
      await this.recordMigration(migration);

    } catch (error) {
      throw new Error(
        `Failed to execute migration ${migration.filename}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Execute a single SQL statement
   */
  private execStatement(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
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
   * Record a migration as applied in the migrations table
   */
  private async recordMigration(migration: MigrationFile): Promise<void> {
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)",
        [migration.id, migration.filename, now],
        (err) => {
          if (err) {
            reject(new Error(`Failed to record migration: ${err.message}`));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Run all pending migrations
   * Returns the number of migrations applied
   */
  public async runPendingMigrations(): Promise<number> {
    try {
      // Initialize migrations table if it doesn't exist
      await this.initializeMigrationsTable();

      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        return 0;
      }

      // Execute each pending migration in order
      for (const migration of pendingMigrations) {
        console.log(`Applying migration: ${migration.filename}`);
        await this.executeMigration(migration);
        console.log(`✓ Migration ${migration.filename} applied successfully`);
      }

      return pendingMigrations.length;

    } catch (error) {
      throw new Error(
        `Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get migration status (applied and pending)
   */
  public async getStatus(): Promise<{
    applied: Migration[];
    pending: MigrationFile[];
  }> {
    await this.initializeMigrationsTable();

    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();

    return { applied, pending };
  }
}
