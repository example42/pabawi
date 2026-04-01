import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { DatabaseAdapter } from "./DatabaseAdapter";

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
 * Tracks which migrations have been applied and runs pending migrations in order.
 * Supports dialect-specific files (NNN_name.sqlite.sql, NNN_name.postgres.sql)
 * and shared files (NNN_name.sql).
 */
export class MigrationRunner {
  private db: DatabaseAdapter;
  private migrationsDir: string;

  constructor(db: DatabaseAdapter, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir ?? join(__dirname, "migrations");
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
    await this.db.execute(createTableSQL);
  }

  /**
   * Get list of applied migrations from database
   */
  private async getAppliedMigrations(): Promise<Migration[]> {
    return this.db.query<Migration>(
      "SELECT id, name, appliedAt FROM migrations ORDER BY id"
    );
  }

  /**
   * Get list of migration files from migrations directory, filtered by dialect.
   *
   * Supports three filename patterns:
   *   - NNN_name.sql          — shared (works for both dialects)
   *   - NNN_name.sqlite.sql   — SQLite-specific
   *   - NNN_name.postgres.sql — PostgreSQL-specific
   *
   * If both a shared file and a dialect-specific file exist for the same ID,
   * the dialect-specific file takes precedence.
   */
  private getMigrationFiles(): MigrationFile[] {
    const dialect = this.db.getDialect();

    try {
      const files = readdirSync(this.migrationsDir);

      // Regex matches: NNN_name.sql, NNN_name.sqlite.sql, NNN_name.postgres.sql
      const migrationRegex = /^(\d+)_(.+?)(?:\.(sqlite|postgres))?\.sql$/;

      // Collect candidates grouped by migration ID
      const candidatesByID = new Map<
        string,
        { shared?: MigrationFile; dialectSpecific?: MigrationFile }
      >();

      for (const filename of files) {
        if (!filename.endsWith(".sql")) continue;

        const match = migrationRegex.exec(filename);
        if (!match) {
          throw new Error(
            `Invalid migration filename format: ${filename}. Expected format: NNN_name.sql, NNN_name.sqlite.sql, or NNN_name.postgres.sql`
          );
        }

        const id = match[1];
        const fileDialect = match[3] as "sqlite" | "postgres" | undefined;

        const migrationFile: MigrationFile = {
          id,
          filename,
          path: join(this.migrationsDir, filename),
        };

        if (!candidatesByID.has(id)) {
          candidatesByID.set(id, {});
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entry = candidatesByID.get(id)!;

        if (fileDialect === undefined) {
          // Shared file
          entry.shared = migrationFile;
        } else if (fileDialect === dialect) {
          // Dialect-specific file matching the active dialect
          entry.dialectSpecific = migrationFile;
        }
        // Files for the OTHER dialect are silently ignored
      }

      // For each ID, prefer dialect-specific over shared
      const result: MigrationFile[] = [];
      for (const [, entry] of candidatesByID) {
        const chosen = entry.dialectSpecific ?? entry.shared;
        if (chosen) {
          result.push(chosen);
        }
      }

      return result.sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));
    const allMigrations = this.getMigrationFiles();
    return allMigrations.filter((migration) => !appliedIds.has(migration.id));
  }

  /**
   * Execute a single migration file
   */
  private async executeMigration(migration: MigrationFile): Promise<void> {
    try {
      const sql = readFileSync(migration.path, "utf-8");

      // Split into statements (handle multi-statement migrations)
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => {
          if (s.length === 0) return false;
          // Remove single-line comments and check if anything remains
          const withoutComments = s
            .split("\n")
            .map((line) => line.replace(/--.*$/, "").trim())
            .filter((line) => line.length > 0)
            .join("\n");
          return withoutComments.length > 0;
        });

      // Execute each statement individually via the adapter
      for (const statement of statements) {
        await this.db.execute(statement);
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
   * Record a migration as applied in the migrations table
   */
  private async recordMigration(migration: MigrationFile): Promise<void> {
    const now = new Date().toISOString();
    const p1 = this.db.getPlaceholder(1);
    const p2 = this.db.getPlaceholder(2);
    const p3 = this.db.getPlaceholder(3);
    await this.db.execute(
      `INSERT INTO migrations (id, name, appliedAt) VALUES (${p1}, ${p2}, ${p3})`,
      [migration.id, migration.filename, now]
    );
  }

  /**
   * Run all pending migrations
   * Returns the number of migrations applied
   */
  public async runPendingMigrations(): Promise<number> {
    try {
      await this.initializeMigrationsTable();

      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        return 0;
      }

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
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
