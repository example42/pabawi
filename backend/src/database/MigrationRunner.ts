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
 *
 * Tracks which migrations have been applied and runs pending migrations in
 * order. Supports dialect-specific files (NNN_name.sqlite.sql,
 * NNN_name.postgres.sql) and shared files (NNN_name.sql).
 *
 * Each migration is executed inside a transaction so a partial failure
 * leaves the schema unchanged. Migration files MUST NOT contain explicit
 * BEGIN/COMMIT — the runner provides the transaction.
 *
 * Note on the meta-table column name: the `migrations` table uses
 * `applied_at` (snake_case, per .kiro/steering/database-conventions.md).
 * Older deployments created the column as `appliedAt`; PostgreSQL silently
 * lowercased it to `appliedat`. `initializeMigrationsTable` renames the
 * legacy column on first run so the rest of this class only ever deals
 * with `applied_at`.
 */
export class MigrationRunner {
  private db: DatabaseAdapter;
  private migrationsDir: string;

  constructor(db: DatabaseAdapter, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir ?? join(__dirname, "migrations");
  }

  /**
   * Initialize the migrations table to track applied migrations.
   *
   * Fresh installs get the snake_case `applied_at` column directly. On
   * pre-existing installs the timestamp column is still named `appliedAt`
   * (SQLite preserves case) or `appliedat` (PostgreSQL lowercased it at
   * CREATE time). This method normalises the column name before any
   * migration runs so the rest of the runner can assume `applied_at`.
   */
  private async initializeMigrationsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `;
    await this.db.execute(createTableSQL);
    await this.normaliseMigrationsTableColumn();
  }

  /**
   * Rename legacy `appliedAt` / `appliedat` to `applied_at` if needed.
   *
   * Idempotent. Safe to call on fresh installs (no-op) and on legacy
   * installs (one-time rename). This must run before any subsequent
   * INSERT INTO migrations because the runner writes via the snake_case
   * column.
   */
  private async normaliseMigrationsTableColumn(): Promise<void> {
    const dialect = this.db.getDialect();

    if (dialect === "sqlite") {
      const cols = await this.db.query<{ name: string }>(
        "PRAGMA table_info(migrations)"
      );
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("applied_at") && names.has("appliedAt")) {
        await this.db.execute(
          "ALTER TABLE migrations RENAME COLUMN appliedAt TO applied_at"
        );
      }
      return;
    }

    // PostgreSQL
    const pgCols = await this.db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'migrations'`
    );
    const pgNames = new Set(pgCols.map((c) => c.column_name));
    if (!pgNames.has("applied_at") && pgNames.has("appliedat")) {
      await this.db.execute(
        "ALTER TABLE migrations RENAME COLUMN appliedat TO applied_at"
      );
    }
  }

  /**
   * Get the list of applied migration IDs.
   *
   * Only the `id` column is read so this query works regardless of the
   * timestamp column's spelling on legacy installs.
   */
  private async getAppliedMigrationIds(): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      "SELECT id FROM migrations ORDER BY id"
    );
    return rows.map((r) => r.id);
  }

  /**
   * Get full applied-migration records (used by getStatus only).
   *
   * Aliases the snake_case column to camelCase per the database convention
   * (see .kiro/steering/database-conventions.md). This is only safe to call
   * after migration 014 has aligned the column name.
   */
  private async getAppliedMigrations(): Promise<Migration[]> {
    return this.db.query<Migration>(
      `SELECT id, name, applied_at AS "appliedAt" FROM migrations ORDER BY id`
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
        const entry = candidatesByID.get(id) ?? {};

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
    const appliedIds = new Set(await this.getAppliedMigrationIds());
    const allMigrations = this.getMigrationFiles();
    return allMigrations.filter((migration) => !appliedIds.has(migration.id));
  }

  /**
   * Execute a single migration file inside a transaction.
   *
   * If any statement in the migration fails, the entire migration is rolled
   * back and the migrations table is not updated, so the migration will be
   * retried on the next run.
   */
  private async executeMigration(migration: MigrationFile): Promise<void> {
    const sql = readFileSync(migration.path, "utf-8");
    const dialect = this.db.getDialect();

    await this.db.beginTransaction();
    try {
      if (dialect === "postgres") {
        // Execute the entire migration as a single statement so that
        // dollar-quoted bodies (e.g. PL/pgSQL functions) are never split on
        // the semicolons they contain.
        await this.db.execute(sql);
      } else {
        // SQLite: split on `;` and execute each statement individually because
        // the sqlite3 driver does not support multi-statement strings. Strip
        // single-line comments BEFORE splitting so a `;` inside a comment is
        // not mistaken for a statement terminator.
        const withoutComments = sql
          .split("\n")
          .map((line) => line.replace(/--.*$/, ""))
          .join("\n");

        const statements = withoutComments
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await this.db.execute(statement);
        }
      }

      await this.recordMigration(migration);
      await this.db.commit();
    } catch (error) {
      try {
        await this.db.rollback();
      } catch {
        // If rollback itself fails (e.g. connection lost), surface the
        // original error rather than the rollback failure.
      }
      throw new Error(
        `Failed to execute migration ${migration.filename}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Record a migration as applied in the migrations table.
   *
   * Uses positional binding so the column ordering matches the snake_case
   * schema. Migration 014 ensures the column is named `applied_at` before
   * any INSERT happens in this session.
   */
  private async recordMigration(migration: MigrationFile): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)",
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
