import { z } from "zod";

/**
 * Database configuration schema (v1.0.0)
 *
 * Supports multiple database types with future extensibility.
 * Currently implemented: SQLite
 * Future: PostgreSQL, MySQL
 */
export const DatabaseConfigSchema = z.object({
  type: z.enum(["sqlite", "postgresql", "mysql"]).default("sqlite"),
  // SQLite options
  path: z.string().optional(),
  // PostgreSQL/MySQL options
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  // Connection pool options
  poolMin: z.number().int().nonnegative().default(2),
  poolMax: z.number().int().positive().default(10),
  // Common options
  connectionTimeout: z.number().int().positive().default(30000),
  debug: z.boolean().default(false),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Command whitelist configuration schema
 */
export const WhitelistConfigSchema = z.object({
  allowAll: z.boolean().default(false),
  whitelist: z.array(z.string()).default([]),
  matchMode: z.enum(["exact", "prefix"]).default("exact"),
});

export type WhitelistConfig = z.infer<typeof WhitelistConfigSchema>;

/**
 * Package installation task configuration
 */
export const PackageTaskConfigSchema = z.object({
  name: z.string(),
  label: z.string(),
  parameterMapping: z.object({
    packageName: z.string(), // Maps to 'app' for tp::install, 'name' for package
    ensure: z.string().optional(), // Maps to 'ensure' for tp::install, 'action' for package
    version: z.string().optional(),
    settings: z.string().optional(),
  }),
});

export type PackageTaskConfig = z.infer<typeof PackageTaskConfigSchema>;

/**
 * Streaming configuration schema
 */
export const StreamingConfigSchema = z.object({
  bufferMs: z.number().int().positive().default(100), // 100ms buffer
  maxOutputSize: z.number().int().positive().default(10485760), // 10MB default
  maxLineLength: z.number().int().positive().default(10000), // 10k characters per line
});

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;

/**
 * Cache configuration schema
 */
export const CacheConfigSchema = z.object({
  inventoryTtl: z.number().int().positive().default(30000), // 30 seconds default
  factsTtl: z.number().int().positive().default(300000), // 5 minutes default
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;

/**
 * UI configuration schema
 */
export const UIConfigSchema = z.object({
  showHomePageRunChart: z.boolean().default(true), // Show aggregated run chart on home page
});

export type UIConfig = z.infer<typeof UIConfigSchema>;

/**
 * Execution queue configuration schema
 */
export const ExecutionQueueConfigSchema = z.object({
  concurrentLimit: z.number().int().positive().default(5), // 5 concurrent executions default
  maxQueueSize: z.number().int().positive().default(50), // 50 queued executions max
});

export type ExecutionQueueConfig = z.infer<typeof ExecutionQueueConfigSchema>;

/**
 * Generic plugin configuration schema (v1.0.0)
 *
 * Plugins are now loaded dynamically from plugin directories.
 * Plugin-specific configuration is handled by each plugin's configSchema.
 */
export const PluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.number().int().nonnegative().default(10),
  config: z.record(z.unknown()).default({}),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Plugins configuration schema (v1.0.0)
 *
 * Maps plugin names to their configuration.
 * Example: { "bolt": { enabled: true, config: { ... } } }
 */
export const PluginsConfigSchema = z.record(PluginConfigSchema).default({});

export type PluginsConfig = z.infer<typeof PluginsConfigSchema>;

/**
 * Application configuration schema with Zod validation (v1.0.0)
 */
export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("localhost"),
  commandWhitelist: WhitelistConfigSchema,
  executionTimeout: z.number().int().positive().default(300000), // 5 minutes
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  // Legacy simple path option (for backward compatibility)
  databasePath: z.string().default("./data/executions.db"),
  // New database configuration (v1.0.0)
  database: DatabaseConfigSchema.optional(),
  packageTasks: z.array(PackageTaskConfigSchema).default([
    {
      name: "package",
      label: "Package (built-in)",
      parameterMapping: {
        packageName: "name",
        ensure: "action",
        version: "version",
      },
    },
  ]),
  streaming: StreamingConfigSchema,
  cache: CacheConfigSchema,
  executionQueue: ExecutionQueueConfigSchema,
  // Generic plugin configuration (v1.0.0)
  plugins: PluginsConfigSchema,
  ui: UIConfigSchema.default({ showHomePageRunChart: true }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
