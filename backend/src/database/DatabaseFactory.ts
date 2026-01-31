/**
 * Database Factory
 *
 * Part of v1.0.0 Modular Plugin Architecture (Step 1.5)
 *
 * Factory class for creating database adapters based on configuration.
 * Provides a single entry point for database adapter instantiation.
 */

import type {
  DatabaseAdapter,
  DatabaseConfig,
  DatabaseAdapterConstructor,
} from "./interfaces/DatabaseInterface.js";
import { SQLiteAdapter } from "./adapters/SQLiteAdapter.js";

/**
 * Registry of supported database adapters
 */
const ADAPTER_REGISTRY: Record<string, DatabaseAdapterConstructor> = {
  sqlite: SQLiteAdapter,
  // Future adapters:
  // postgresql: PostgreSQLAdapter,
  // mysql: MySQLAdapter,
};

/**
 * Database Factory for creating adapter instances
 *
 * @example
 * ```typescript
 * // Create SQLite adapter
 * const adapter = DatabaseFactory.create({
 *   type: 'sqlite',
 *   path: './data/executions.db'
 * });
 *
 * // Future: Create PostgreSQL adapter
 * const pgAdapter = DatabaseFactory.create({
 *   type: 'postgresql',
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'pabawi',
 *   username: 'user',
 *   password: 'pass' pragma: allowlist secret
 * });
 * ```
 */
export class DatabaseFactory {
  /**
   * Create a database adapter based on configuration
   *
   * @param config - Database configuration
   * @returns Database adapter instance
   * @throws Error if database type is not supported
   */
  static create(config: DatabaseConfig): DatabaseAdapter {
    const AdapterClass = ADAPTER_REGISTRY[config.type];

    if (!AdapterClass) {
      const supportedTypes = Object.keys(ADAPTER_REGISTRY).join(", ");
      throw new Error(
        `Unsupported database type: '${config.type}'. ` +
          `Supported types: ${supportedTypes}`
      );
    }

    return new AdapterClass(config);
  }

  /**
   * Check if a database type is supported
   *
   * @param type - Database type to check
   * @returns True if the type is supported
   */
  static isSupported(type: string): boolean {
    return type in ADAPTER_REGISTRY;
  }

  /**
   * Get list of supported database types
   *
   * @returns Array of supported database type names
   */
  static getSupportedTypes(): string[] {
    return Object.keys(ADAPTER_REGISTRY);
  }

  /**
   * Register a custom database adapter
   *
   * This allows plugins to add support for additional database engines.
   *
   * @param type - Database type identifier
   * @param adapterClass - Adapter constructor class
   *
   * @example
   * ```typescript
   * // Plugin registers a custom adapter
   * DatabaseFactory.registerAdapter('mongodb', MongoDBAdapter);
   * ```
   */
  static registerAdapter(
    type: string,
    adapterClass: DatabaseAdapterConstructor
  ): void {
    if (ADAPTER_REGISTRY[type]) {
      console.warn(
        `[DatabaseFactory] Overwriting existing adapter for type: ${type}`
      );
    }
    ADAPTER_REGISTRY[type] = adapterClass;
  }

  /**
   * Create default configuration for a database type
   *
   * @param type - Database type
   * @returns Default configuration object
   */
  static getDefaultConfig(type: "sqlite"): Required<Pick<DatabaseConfig, "type" | "path">>;
  static getDefaultConfig(type: "postgresql"): Required<Pick<DatabaseConfig, "type" | "host" | "port" | "database">>;
  static getDefaultConfig(type: string): DatabaseConfig {
    switch (type) {
      case "sqlite":
        return {
          type: "sqlite",
          path: "./data/executions.db",
        };
      case "postgresql":
        return {
          type: "postgresql",
          host: "localhost",
          port: 5432,
          database: "pabawi",
          poolMin: 2,
          poolMax: 10,
        };
      case "mysql":
        return {
          type: "mysql",
          host: "localhost",
          port: 3306,
          database: "pabawi",
          poolMin: 2,
          poolMax: 10,
        };
      default:
        throw new Error(`Unknown database type: ${type}`);
    }
  }
}
