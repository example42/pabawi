import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import type { DatabaseAdapter } from "./DatabaseAdapter";

/**
 * Opt-in marker a SQLite migration puts on its own comment line to have the
 * runner suspend foreign-key enforcement for the duration of the migration.
 * Reserved for table rebuilds; `PRAGMA foreign_key_check` still has to pass
 * before the transaction commits.
 */
const SQLITE_FOREIGN_KEYS_OFF_DIRECTIVE = /^\s*--\s*pabawi:sqlite-foreign-keys-off\s*$/m;

/**
 * Migration metadata
 */
interface Migration {
  id: string;
  name: string;
  appliedAt: string;
  checksum: string | null;
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
 * leaves the schema unchanged. Migration files must not contain transaction
 * control statements; the runner provides the transaction. SQLite trigger
 * migrations separate complete statements with standalone
 * `-- pabawi:statement-breakpoint` lines to preserve their BEGIN/END bodies.
 *
 * A SQLite migration that rebuilds a table other tables reference (the only
 * way to change a column constraint in SQLite) can declare
 * `-- pabawi:sqlite-foreign-keys-off` on its own line. See
 * SQLITE_FOREIGN_KEYS_OFF_DIRECTIVE below for what the runner then does and
 * why the pragma cannot simply live in the migration file.
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
        applied_at TEXT NOT NULL,
        checksum TEXT
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
      if (!names.has("checksum")) {
        await this.db.execute("ALTER TABLE migrations ADD COLUMN checksum TEXT");
      }
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
        WHERE table_name = 'migrations' AND table_schema = current_schema()`
    );
    const pgNames = new Set(pgCols.map((c) => c.column_name));
    if (!pgNames.has("checksum")) {
      await this.db.execute("ALTER TABLE migrations ADD COLUMN checksum TEXT");
    }
    if (!pgNames.has("applied_at") && pgNames.has("appliedat")) {
      await this.db.execute(
        "ALTER TABLE migrations RENAME COLUMN appliedat TO applied_at"
      );
    }
  }

  /**
   * Get applied migration records for status and content verification.
   *
   * Aliases the snake_case column to camelCase per the database convention
   * (see .kiro/steering/database-conventions.md). The tracking table is normalized before this query runs.
   */
  private async getAppliedMigrations(): Promise<Migration[]> {
    return this.db.query<Migration>(
      `SELECT id, name, applied_at AS "appliedAt", checksum FROM migrations ORDER BY id`
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
   * the dialect-specific file takes precedence. Different logical names or
   * numeric ID spellings for the same ID are rejected across all dialects.
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
        { id: string; name: string; shared?: MigrationFile; dialectSpecific?: MigrationFile }
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
        const name = match[2];
        const fileDialect = match[3] as "sqlite" | "postgres" | undefined;

        const migrationFile: MigrationFile = {
          id,
          filename,
          path: join(this.migrationsDir, filename),
        };

        const numericId = BigInt(id).toString();
        const entry = candidatesByID.get(numericId) ?? { id, name };
        candidatesByID.set(numericId, entry);
        if (entry.id !== id || entry.name !== name) {
          throw new Error(`Conflicting migration identity for ID ${id}: ${entry.name} and ${name}`);
        }

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

      return result.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
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
    const allMigrations = this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const filesById = new Map(allMigrations.map(file => [file.id, file]));
    for (const record of applied) {
      // Legacy records have no trustworthy content digest. Never backfill one
      // from today's files and claim that it describes the SQL originally run.
      if (record.checksum === null) continue;
      const file = filesById.get(record.id);
      if (file?.filename !== record.name ||
          createHash("sha256").update(readFileSync(file.path, "utf8")).digest("hex") !== record.checksum) {
        throw new Error(`Migration drift detected for ${record.id} (${record.name}). Restore the original migration file before continuing.`);
      }
    }
    const appliedIds = new Set(applied.map(record => record.id));
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

    // SQLite drops the rows of every referencing table when a parent table is
    // dropped (the implicit DELETE fires ON DELETE CASCADE / SET NULL), which
    // is what a "rebuild the table to change a column constraint" migration
    // does. SQLite's documented procedure is to turn foreign keys off around
    // the rebuild, and `PRAGMA foreign_keys` is a no-op inside a transaction,
    // so only the runner can do it: the toggle has to bracket the BEGIN.
    const suspendForeignKeys =
      dialect === "sqlite" && SQLITE_FOREIGN_KEYS_OFF_DIRECTIVE.test(sql);

    if (suspendForeignKeys) {
      await this.db.execute("PRAGMA foreign_keys = OFF");
    }

    // `executeMigrationStatements` only ever throws a wrapped Error, but
    // normalize anyway so the failure can be re-thrown after the pragma is
    // restored rather than from inside a finally block.
    let migrationError: Error | null = null;
    try {
      await this.executeMigrationStatements(migration, sql, dialect, suspendForeignKeys);
    } catch (error) {
      migrationError = error instanceof Error ? error : new Error(String(error));
    }

    // Restore enforcement whether the migration committed or rolled back.
    if (suspendForeignKeys && !(await this.restoreForeignKeyEnforcement())) {
      throw new Error(
        `Failed to re-enable foreign key enforcement after ${migration.filename}. ` +
          `Refusing to continue with an unenforced schema.` +
          (migrationError ? ` The migration also failed: ${migrationError.message}` : ""),
      );
    }

    if (migrationError) {
      throw migrationError;
    }
  }

  /**
   * Turn SQLite foreign key enforcement back on and confirm it took effect.
   *
   * `PRAGMA foreign_keys` is silently ignored inside a transaction, so the
   * value is read back: continuing to serve requests with enforcement off
   * would let the next write create exactly the orphan rows the bracket around
   * a table rebuild exists to prevent.
   */
  private async restoreForeignKeyEnforcement(): Promise<boolean> {
    try {
      await this.db.execute("PRAGMA foreign_keys = ON");
      const [state] = await this.db.query<{ foreign_keys: number }>(
        "PRAGMA foreign_keys",
      );
      return state.foreign_keys === 1;
    } catch {
      return false;
    }
  }

  /**
   * Run one migration's statements inside a transaction and record it.
   */
  private async executeMigrationStatements(
    migration: MigrationFile,
    sql: string,
    dialect: "sqlite" | "postgres",
    verifyForeignKeys: boolean,
  ): Promise<void> {
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

        // Explicit boundaries preserve trigger bodies containing semicolons.
        const statements = (/^-- pabawi:statement-breakpoint$/m.test(sql)
          ? sql.split(/^-- pabawi:statement-breakpoint$/m)
          : withoutComments.split(";"))
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await this.db.execute(statement);
        }
      }

      if (verifyForeignKeys) {
        // Enforcement was off for the rebuild, so prove the result is still
        // referentially intact before committing. `foreign_key_check` runs
        // inside the transaction, so a violation rolls the migration back.
        const violations = await this.db.query<Record<string, unknown>>(
          "PRAGMA foreign_key_check",
        );
        if (violations.length > 0) {
          throw new Error(
            `foreign_key_check reported ${String(violations.length)} violation(s) after the rebuild: ${JSON.stringify(violations.slice(0, 5))}`,
          );
        }
      }

      await this.recordMigration(migration, sql);
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
  private async recordMigration(migration: MigrationFile, sql: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      "INSERT INTO migrations (id, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
      [migration.id, migration.filename, now, createHash("sha256").update(sql).digest("hex")]
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
