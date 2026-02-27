import { z } from "zod";

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
 * SSL configuration schema for secure connections
 */
export const SSLConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ca: z.string().optional(),
  cert: z.string().optional(),
  key: z.string().optional(),
  rejectUnauthorized: z.boolean().default(true),
});

export type SSLConfig = z.infer<typeof SSLConfigSchema>;

/**
 * PuppetDB cache configuration schema
 */
export const PuppetDBCacheConfigSchema = z.object({
  ttl: z.number().int().positive().default(300000), // 5 minutes default
});

export type PuppetDBCacheConfig = z.infer<typeof PuppetDBCacheConfigSchema>;

/**
 * PuppetDB circuit breaker configuration schema
 */
export const PuppetDBCircuitBreakerConfigSchema = z.object({
  threshold: z.number().int().positive().default(5),
  timeout: z.number().int().positive().default(60000), // 60 seconds
  resetTimeout: z.number().int().positive().default(30000), // 30 seconds
});

export type PuppetDBCircuitBreakerConfig = z.infer<
  typeof PuppetDBCircuitBreakerConfigSchema
>;

/**
 * PuppetDB integration configuration schema
 */
export const PuppetDBConfigSchema = z.object({
  enabled: z.boolean().default(false),
  serverUrl: z.string().url(),
  port: z.number().int().positive().optional(),
  token: z.string().optional(),
  ssl: SSLConfigSchema.optional(),
  timeout: z.number().int().positive().default(30000), // 30 seconds
  retryAttempts: z.number().int().nonnegative().default(3),
  retryDelay: z.number().int().positive().default(1000), // 1 second
  cache: PuppetDBCacheConfigSchema.optional(),
  circuitBreaker: PuppetDBCircuitBreakerConfigSchema.optional(),
});

export type PuppetDBConfig = z.infer<typeof PuppetDBConfigSchema>;

/**
 * Integration configuration schema
 */
export const IntegrationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  name: z.string(),
  type: z.enum(["execution", "information", "both"]),
  config: z.record(z.unknown()),
  priority: z.number().int().nonnegative().optional(),
});

export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

/**
 * Puppetserver cache configuration schema
 */
export const PuppetserverCacheConfigSchema = z.object({
  ttl: z.number().int().positive().default(300000), // 5 minutes default
});

export type PuppetserverCacheConfig = z.infer<
  typeof PuppetserverCacheConfigSchema
>;

/**
 * Puppetserver circuit breaker configuration schema
 */
export const PuppetserverCircuitBreakerConfigSchema = z.object({
  threshold: z.number().int().positive().default(5),
  timeout: z.number().int().positive().default(60000), // 60 seconds
  resetTimeout: z.number().int().positive().default(30000), // 30 seconds
});

export type PuppetserverCircuitBreakerConfig = z.infer<
  typeof PuppetserverCircuitBreakerConfigSchema
>;

/**
 * Puppetserver integration configuration schema
 */
export const PuppetserverConfigSchema = z.object({
  enabled: z.boolean().default(false),
  serverUrl: z.string().url(),
  port: z.number().int().positive().max(65535).optional(),
  token: z.string().optional(),
  ssl: SSLConfigSchema.optional(),
  timeout: z.number().int().positive().default(30000), // 30 seconds
  retryAttempts: z.number().int().nonnegative().default(3),
  retryDelay: z.number().int().positive().default(1000), // 1 second
  inactivityThreshold: z.number().int().positive().default(3600), // 1 hour in seconds
  cache: PuppetserverCacheConfigSchema.optional(),
  circuitBreaker: PuppetserverCircuitBreakerConfigSchema.optional(),
});

export type PuppetserverConfig = z.infer<typeof PuppetserverConfigSchema>;

/**
 * Ansible integration configuration schema
 */
export const AnsibleConfigSchema = z.object({
  enabled: z.boolean().default(false),
  projectPath: z.string().default(process.cwd()),
  inventoryPath: z.string().default("inventory/hosts"),
  timeout: z.number().int().positive().default(300000),
});

export type AnsibleConfig = z.infer<typeof AnsibleConfigSchema>;

/**
 * Hiera fact source configuration schema
 */
export const HieraFactSourceConfigSchema = z.object({
  preferPuppetDB: z.boolean().default(true),
  localFactsPath: z.string().optional(),
});

export type HieraFactSourceConfig = z.infer<typeof HieraFactSourceConfigSchema>;

/**
 * Hiera catalog compilation configuration schema
 */
export const HieraCatalogCompilationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  timeout: z.number().int().positive().default(60000), // 60 seconds
  cacheTTL: z.number().int().positive().default(300000), // 5 minutes
});

export type HieraCatalogCompilationConfig = z.infer<
  typeof HieraCatalogCompilationConfigSchema
>;

/**
 * Hiera cache configuration schema
 */
export const HieraCacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttl: z.number().int().positive().default(300000), // 5 minutes
  maxEntries: z.number().int().positive().default(10000),
});

export type HieraCacheConfig = z.infer<typeof HieraCacheConfigSchema>;

/**
 * Hiera code analysis configuration schema
 */
export const HieraCodeAnalysisConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lintEnabled: z.boolean().default(true),
  moduleUpdateCheck: z.boolean().default(true),
  analysisInterval: z.number().int().positive().default(3600000), // 1 hour
  exclusionPatterns: z.array(z.string()).default([]),
});

export type HieraCodeAnalysisConfig = z.infer<
  typeof HieraCodeAnalysisConfigSchema
>;

/**
 * Hiera integration configuration schema
 */
export const HieraConfigSchema = z.object({
  enabled: z.boolean().default(false),
  controlRepoPath: z.string(),
  hieraConfigPath: z.string().default("hiera.yaml"),
  environments: z.array(z.string()).default(["production"]),
  factSources: HieraFactSourceConfigSchema.default({
    preferPuppetDB: true,
  }),
  catalogCompilation: HieraCatalogCompilationConfigSchema.default({
    enabled: false,
    timeout: 60000,
    cacheTTL: 300000,
  }),
  cache: HieraCacheConfigSchema.default({
    enabled: true,
    ttl: 300000,
    maxEntries: 10000,
  }),
  codeAnalysis: HieraCodeAnalysisConfigSchema.default({
    enabled: true,
    lintEnabled: true,
    moduleUpdateCheck: true,
    analysisInterval: 3600000,
    exclusionPatterns: [],
  }),
});

export type HieraConfig = z.infer<typeof HieraConfigSchema>;

/**
 * Integrations configuration schema
 */
export const IntegrationsConfigSchema = z.object({
  ansible: AnsibleConfigSchema.optional(),
  puppetdb: PuppetDBConfigSchema.optional(),
  puppetserver: PuppetserverConfigSchema.optional(),
  hiera: HieraConfigSchema.optional(),
});

export type IntegrationsConfig = z.infer<typeof IntegrationsConfigSchema>;

/**
 * Application configuration schema with Zod validation
 */
export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("localhost"),
  boltProjectPath: z.string().default(process.cwd()),
  commandWhitelist: WhitelistConfigSchema,
  executionTimeout: z.number().int().positive().default(300000), // 5 minutes
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  databasePath: z.string().default("./data/executions.db"),
  corsAllowedOrigins: z.array(z.string()).default(["http://localhost:5173", "http://localhost:3000"]),
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
  integrations: IntegrationsConfigSchema.default({}),
  ui: UIConfigSchema.default({ showHomePageRunChart: true }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
