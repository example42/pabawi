import type { DatabaseAdapter } from "./DatabaseAdapter";

export interface AdapterFactoryConfig {
  /** Filesystem path for the SQLite database (used when dbType is "sqlite"). */
  databasePath: string;
  /** Which database backend to create. Defaults to "sqlite" when omitted. */
  dbType?: "sqlite" | "postgres";
  /** PostgreSQL connection URL. Required when dbType is "postgres". */
  databaseUrl?: string;
}

/**
 * Create the appropriate DatabaseAdapter from validated configuration.
 *
 * Configuration is resolved and validated by ConfigService/Zod and passed in
 * explicitly — this factory never reads `process.env` directly.
 *
 * - dbType "sqlite" (or omitted) → SQLiteAdapter
 * - dbType "postgres"            → PostgresAdapter (requires databaseUrl)
 */
export async function createDatabaseAdapter(
  config: AdapterFactoryConfig,
): Promise<DatabaseAdapter> {
  const dbType = config.dbType ?? "sqlite";

  if (dbType === "postgres") {
    if (!config.databaseUrl) {
      throw new Error(
        "DATABASE_URL is required when DB_TYPE is 'postgres'",
      );
    }
    const { PostgresAdapter } = await import("./PostgresAdapter");
    return new PostgresAdapter(config.databaseUrl);
  }

  const { SQLiteAdapter } = await import("./SQLiteAdapter");
  return new SQLiteAdapter(config.databasePath);
}
