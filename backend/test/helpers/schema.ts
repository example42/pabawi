import { MigrationRunner } from "../../src/database/MigrationRunner";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import { join } from "path";

/**
 * Run the real migration suite against a test DB.
 *
 * Centralising schema setup here avoids duplicating DDL across test files.
 * Per .kiro/steering/database-conventions.md, migration files are the only
 * source of schema truth — including in tests. This function runs the same
 * migrations the production server runs at startup, so any column rename or
 * table change in the DB is automatically picked up by every test that uses
 * this helper.
 *
 * @param db - A connected DatabaseAdapter (typically an in-memory SQLite).
 */
export async function initializeTestSchema(db: DatabaseAdapter): Promise<void> {
  // The runner defaults its migrations dir relative to its compiled location.
  // Tests run from source via tsx/vitest, so we point at the source dir
  // explicitly so the path is stable regardless of cwd.
  const migrationsDir = join(__dirname, "../../src/database/migrations");
  const runner = new MigrationRunner(db, migrationsDir);
  await runner.runPendingMigrations();
}
