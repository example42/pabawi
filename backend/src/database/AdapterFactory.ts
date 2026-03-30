import type { DatabaseAdapter } from "./DatabaseAdapter";

export interface AdapterFactoryConfig {
  databasePath: string;
}

/**
 * Create the appropriate DatabaseAdapter based on environment configuration.
 *
 * - DB_TYPE="sqlite" or unset → SQLiteAdapter
 * - DB_TYPE="postgres"         → PostgresAdapter (requires DATABASE_URL)
 */
export async function createDatabaseAdapter(config: AdapterFactoryConfig): Promise<DatabaseAdapter> {
  const dbType = process.env.DB_TYPE ?? "sqlite";

  if (dbType === "postgres") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is required when DB_TYPE is 'postgres'"
      );
    }
    const { PostgresAdapter } = await import("./PostgresAdapter");
    return new PostgresAdapter(databaseUrl);
  }

  const { SQLiteAdapter } = await import("./SQLiteAdapter");
  return new SQLiteAdapter(config.databasePath);
}
