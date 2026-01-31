/**
 * YAML Configuration Schemas
 *
 * Comprehensive Zod schemas for validating YAML configuration files:
 * - integrations.yaml - Plugin and integration configuration
 * - rbac.yaml - Authentication and authorization settings
 * - database.yaml - Database connection configuration
 *
 * These schemas are designed to match the example YAML files in config/
 * and support environment variable interpolation.
 *
 * @module config/YamlConfigSchemas
 * @version 1.0.0
 */

import { z } from "zod";
import {
  SSLConfigSchema,
  DatabaseConfigSchema,
  PuppetDBCacheConfigSchema,
  PuppetDBCircuitBreakerConfigSchema,
  PuppetserverCacheConfigSchema,
  PuppetserverCircuitBreakerConfigSchema,
  HieraCacheConfigSchema,
  HieraFactSourceConfigSchema,
  HieraCatalogCompilationConfigSchema,
  HieraCodeAnalysisConfigSchema,
} from "./schema";

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Widget slot types for frontend integration
 */
export const WidgetSlotSchema = z.enum([
  "dashboard",
  "node-detail",
  "inventory-panel",
  "standalone-page",
]);

export type WidgetSlot = z.infer<typeof WidgetSlotSchema>;

/**
 * Widget configuration in YAML
 */
export const YamlWidgetConfigSchema = z.object({
  id: z.string().describe("Widget identifier (plugin:widget-name)"),
  enabled: z.boolean().default(true).describe("Whether widget is enabled"),
  defaultSlots: z.array(WidgetSlotSchema).default([]).describe("Default slots for the widget"),
  config: z.record(z.unknown()).optional().describe("Widget-specific configuration"),
});

export type YamlWidgetConfig = z.infer<typeof YamlWidgetConfigSchema>;

/**
 * Frontend configuration for integrations
 */
export const YamlFrontendConfigSchema = z.object({
  widgets: z.array(YamlWidgetConfigSchema).default([]),
});

export type YamlFrontendConfig = z.infer<typeof YamlFrontendConfigSchema>;

/**
 * Default permissions mapping (capability -> roles)
 */
export const DefaultPermissionsSchema = z.record(
  z.string(),
  z.array(z.string())
).describe("Map of capability names to role names that have access");

export type DefaultPermissions = z.infer<typeof DefaultPermissionsSchema>;

// ============================================================================
// Integration Configuration Schemas
// ============================================================================

/**
 * Command whitelist configuration
 */
export const YamlCommandWhitelistSchema = z.object({
  allowAll: z.boolean().default(false).describe("Allow all commands (dangerous in production)"),
  matchMode: z.enum(["exact", "prefix"]).default("exact").describe("How to match commands"),
  commands: z.array(z.string()).optional().describe("List of allowed commands"),
});

export type YamlCommandWhitelist = z.infer<typeof YamlCommandWhitelistSchema>;

/**
 * Bolt integration configuration
 */
export const YamlBoltConfigSchema = z.object({
  projectPath: z.string().default(".").describe("Path to Bolt project directory"),
  timeout: z.number().int().positive().default(300000).describe("Execution timeout in ms"),
  commandWhitelist: YamlCommandWhitelistSchema.optional(),
});

export type YamlBoltConfig = z.infer<typeof YamlBoltConfigSchema>;

/**
 * Bolt integration in YAML
 */
export const YamlBoltIntegrationSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.number().int().default(5),
  frontend: YamlFrontendConfigSchema.optional(),
  defaultPermissions: DefaultPermissionsSchema.optional(),
  config: YamlBoltConfigSchema.optional(),
});

export type YamlBoltIntegration = z.infer<typeof YamlBoltIntegrationSchema>;

/**
 * SSL configuration for YAML (supports string env vars)
 */
export const YamlSSLConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ca: z.string().optional().describe("CA certificate path or content"),
  cert: z.string().optional().describe("Client certificate path or content"),
  key: z.string().optional().describe("Client key path or content"),
  rejectUnauthorized: z.boolean().default(true).describe("Reject unauthorized certificates"),
});

export type YamlSSLConfig = z.infer<typeof YamlSSLConfigSchema>;

/**
 * PuppetDB integration configuration
 */
export const YamlPuppetDBConfigSchema = z.object({
  serverUrl: z.string().describe("PuppetDB server URL"),
  port: z.number().int().positive().max(65535).optional().describe("PuppetDB port"),
  token: z.string().optional().describe("Authentication token"),
  timeout: z.number().int().positive().default(30000).describe("Request timeout in ms"),
  retryAttempts: z.number().int().nonnegative().default(3),
  retryDelay: z.number().int().positive().default(1000),
  ssl: YamlSSLConfigSchema.optional(),
  cache: PuppetDBCacheConfigSchema.optional(),
  circuitBreaker: PuppetDBCircuitBreakerConfigSchema.optional(),
});

export type YamlPuppetDBConfig = z.infer<typeof YamlPuppetDBConfigSchema>;

/**
 * PuppetDB integration in YAML
 */
export const YamlPuppetDBIntegrationSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().int().default(10),
  frontend: YamlFrontendConfigSchema.optional(),
  defaultPermissions: DefaultPermissionsSchema.optional(),
  config: YamlPuppetDBConfigSchema.optional(),
});

export type YamlPuppetDBIntegration = z.infer<typeof YamlPuppetDBIntegrationSchema>;

/**
 * Puppetserver integration configuration
 */
export const YamlPuppetserverConfigSchema = z.object({
  serverUrl: z.string().describe("Puppetserver URL"),
  port: z.number().int().positive().max(65535).optional().describe("Puppetserver port"),
  token: z.string().optional().describe("Authentication token"),
  timeout: z.number().int().positive().default(30000).describe("Request timeout in ms"),
  retryAttempts: z.number().int().nonnegative().default(3),
  retryDelay: z.number().int().positive().default(1000),
  inactivityThreshold: z.number().int().positive().default(3600).describe("Inactivity threshold in seconds"),
  ssl: YamlSSLConfigSchema.optional(),
  cache: PuppetserverCacheConfigSchema.optional(),
  circuitBreaker: PuppetserverCircuitBreakerConfigSchema.optional(),
});

export type YamlPuppetserverConfig = z.infer<typeof YamlPuppetserverConfigSchema>;

/**
 * Puppetserver integration in YAML
 */
export const YamlPuppetserverIntegrationSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().int().default(20),
  frontend: YamlFrontendConfigSchema.optional(),
  defaultPermissions: DefaultPermissionsSchema.optional(),
  config: YamlPuppetserverConfigSchema.optional(),
});

export type YamlPuppetserverIntegration = z.infer<typeof YamlPuppetserverIntegrationSchema>;

/**
 * Hiera integration configuration
 */
export const YamlHieraConfigSchema = z.object({
  controlRepoPath: z.string().describe("Path to Puppet control repository"),
  hieraConfigPath: z.string().default("hiera.yaml").describe("Path to hiera.yaml relative to control repo"),
  environments: z.array(z.string()).default(["production"]).describe("Available environments"),
  factSources: HieraFactSourceConfigSchema.optional(),
  catalogCompilation: HieraCatalogCompilationConfigSchema.optional(),
  cache: HieraCacheConfigSchema.optional(),
  codeAnalysis: HieraCodeAnalysisConfigSchema.optional(),
});

export type YamlHieraConfig = z.infer<typeof YamlHieraConfigSchema>;

/**
 * Hiera integration in YAML
 */
export const YamlHieraIntegrationSchema = z.object({
  enabled: z.boolean().default(false),
  priority: z.number().int().default(6),
  frontend: YamlFrontendConfigSchema.optional(),
  defaultPermissions: DefaultPermissionsSchema.optional(),
  config: YamlHieraConfigSchema.optional(),
});

export type YamlHieraIntegration = z.infer<typeof YamlHieraIntegrationSchema>;

/**
 * External plugin configuration
 */
export const YamlExternalPluginSchema = z.object({
  /** Path to local plugin directory */
  path: z.string().optional(),
  /** npm package name */
  package: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.path || data.package,
  { message: "Either 'path' or 'package' must be specified" }
);

export type YamlExternalPlugin = z.infer<typeof YamlExternalPluginSchema>;

/**
 * All integrations configuration
 */
export const YamlIntegrationsSchema = z.object({
  bolt: YamlBoltIntegrationSchema.optional(),
  puppetdb: YamlPuppetDBIntegrationSchema.optional(),
  puppetserver: YamlPuppetserverIntegrationSchema.optional(),
  hiera: YamlHieraIntegrationSchema.optional(),
});

export type YamlIntegrations = z.infer<typeof YamlIntegrationsSchema>;

/**
 * Complete integrations.yaml schema
 */
export const IntegrationsYamlSchema = z.object({
  integrations: YamlIntegrationsSchema.optional(),
  externalPlugins: z.array(YamlExternalPluginSchema).optional(),
});

export type IntegrationsYaml = z.infer<typeof IntegrationsYamlSchema>;

// ============================================================================
// RBAC Configuration Schemas
// ============================================================================

/**
 * JWT configuration
 */
export const YamlJWTConfigSchema = z.object({
  secret: z.string().describe("JWT signing secret (use env var in production)"),
  accessTokenExpiry: z.number().int().positive().default(3600).describe("Access token expiry in seconds"),
  refreshTokenExpiry: z.number().int().positive().default(604800).describe("Refresh token expiry in seconds"),
  issuer: z.string().default("pabawi").describe("JWT issuer"),
});

export type YamlJWTConfig = z.infer<typeof YamlJWTConfigSchema>;

/**
 * Session configuration
 */
export const YamlSessionConfigSchema = z.object({
  maxActiveSessions: z.number().int().positive().default(5).describe("Maximum concurrent sessions per user"),
  inactivityTimeout: z.number().int().positive().default(1800).describe("Session inactivity timeout in seconds"),
});

export type YamlSessionConfig = z.infer<typeof YamlSessionConfigSchema>;

/**
 * Password policy configuration
 */
export const YamlPasswordPolicySchema = z.object({
  minLength: z.number().int().positive().default(12).describe("Minimum password length"),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumbers: z.boolean().default(true),
  requireSpecialChars: z.boolean().default(true),
});

export type YamlPasswordPolicy = z.infer<typeof YamlPasswordPolicySchema>;

/**
 * Authentication configuration
 */
export const YamlAuthConfigSchema = z.object({
  enabled: z.boolean().default(false).describe("Enable authentication"),
  jwt: YamlJWTConfigSchema.optional(),
  session: YamlSessionConfigSchema.optional(),
  password: YamlPasswordPolicySchema.optional(),
});

export type YamlAuthConfig = z.infer<typeof YamlAuthConfigSchema>;

/**
 * Permission action type
 */
export const PermissionActionSchema = z.enum(["allow", "deny"]);

export type PermissionAction = z.infer<typeof PermissionActionSchema>;

/**
 * Permission condition schema
 */
export const YamlPermissionConditionSchema = z.object({
  /** Node filter expression (e.g., "environment=production") */
  nodeFilter: z.string().optional(),
  /** Time window expression (e.g., "weekdays:09:00-17:00") */
  timeWindow: z.string().optional(),
  /** IP address restrictions (CIDR or exact match) */
  ipRestriction: z.array(z.string()).optional(),
});

export type YamlPermissionCondition = z.infer<typeof YamlPermissionConditionSchema>;

/**
 * Permission definition in YAML
 */
export const YamlPermissionSchema = z.object({
  capability: z.string().describe("Capability pattern (e.g., 'command.execute', 'inventory.*', '*')"),
  action: PermissionActionSchema.describe("Allow or deny this capability"),
  description: z.string().optional().describe("Human-readable description"),
  conditions: YamlPermissionConditionSchema.optional().describe("Conditional restrictions"),
});

export type YamlPermission = z.infer<typeof YamlPermissionSchema>;

/**
 * Role definition in YAML
 */
export const YamlRoleSchema = z.object({
  name: z.string().describe("Unique role name"),
  description: z.string().optional().describe("Role description"),
  priority: z.number().int().default(0).describe("Role priority (higher = evaluated later)"),
  isSystem: z.boolean().default(false).describe("Whether this is a system role (cannot be deleted)"),
  permissions: z.array(YamlPermissionSchema).default([]).describe("Role permissions"),
});

export type YamlRole = z.infer<typeof YamlRoleSchema>;

/**
 * Group definition in YAML
 */
export const YamlGroupSchema = z.object({
  name: z.string().describe("Unique group name"),
  description: z.string().optional().describe("Group description"),
  roles: z.array(z.string()).default([]).describe("Roles assigned to this group"),
});

export type YamlGroup = z.infer<typeof YamlGroupSchema>;

/**
 * User definition in YAML (seed data)
 */
export const YamlUserSchema = z.object({
  username: z.string().describe("Unique username"),
  email: z.string().email().describe("User email address"),
  password: z.string().describe("Initial password (use env var)"),
  displayName: z.string().optional().describe("Display name"),
  roles: z.array(z.string()).optional().describe("Direct role assignments"),
  groups: z.array(z.string()).optional().describe("Group memberships"),
  active: z.boolean().default(true).describe("Whether user is active"),
});

export type YamlUser = z.infer<typeof YamlUserSchema>;

/**
 * Complete rbac.yaml schema
 */
export const RbacYamlSchema = z.object({
  auth: YamlAuthConfigSchema.optional(),
  roles: z.array(YamlRoleSchema).optional().describe("Role definitions"),
  groups: z.array(YamlGroupSchema).optional().describe("Group definitions"),
  users: z.array(YamlUserSchema).optional().describe("Initial user seed data"),
});

export type RbacYaml = z.infer<typeof RbacYamlSchema>;

// ============================================================================
// Database Configuration Schemas
// ============================================================================

/**
 * Migration configuration
 */
export const YamlMigrationConfigSchema = z.object({
  autoRun: z.boolean().default(true).describe("Automatically run migrations on startup"),
  directory: z.string().default("./src/database").describe("Migration files directory"),
  lockTimeout: z.number().int().positive().default(60000).describe("Lock timeout in ms"),
});

export type YamlMigrationConfig = z.infer<typeof YamlMigrationConfigSchema>;

/**
 * Backup configuration
 */
export const YamlBackupConfigSchema = z.object({
  enabled: z.boolean().default(false).describe("Enable automatic backups"),
  schedule: z.string().default("0 2 * * *").describe("Backup schedule (cron expression)"),
  directory: z.string().default("./data/backups").describe("Backup directory"),
  retention: z.number().int().positive().default(7).describe("Number of backups to retain"),
  compress: z.boolean().default(true).describe("Compress backup files"),
});

export type YamlBackupConfig = z.infer<typeof YamlBackupConfigSchema>;

/**
 * Complete database.yaml schema
 */
export const DatabaseYamlSchema = z.object({
  database: DatabaseConfigSchema.optional(),
  migrations: YamlMigrationConfigSchema.optional(),
  backup: YamlBackupConfigSchema.optional(),
});

export type DatabaseYaml = z.infer<typeof DatabaseYamlSchema>;

// ============================================================================
// Combined Configuration Schema
// ============================================================================

/**
 * Complete Pabawi YAML configuration (all files combined)
 */
export const PabawiYamlConfigSchema = z.object({
  // From integrations.yaml
  integrations: YamlIntegrationsSchema.optional(),
  externalPlugins: z.array(YamlExternalPluginSchema).optional(),
  // From rbac.yaml
  auth: YamlAuthConfigSchema.optional(),
  roles: z.array(YamlRoleSchema).optional(),
  groups: z.array(YamlGroupSchema).optional(),
  users: z.array(YamlUserSchema).optional(),
  // From database.yaml
  database: DatabaseConfigSchema.optional(),
  migrations: YamlMigrationConfigSchema.optional(),
  backup: YamlBackupConfigSchema.optional(),
});

export type PabawiYamlConfig = z.infer<typeof PabawiYamlConfigSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate integrations.yaml content
 */
export function validateIntegrationsYaml(
  data: unknown
): z.SafeParseReturnType<unknown, IntegrationsYaml> {
  return IntegrationsYamlSchema.safeParse(data);
}

/**
 * Validate rbac.yaml content
 */
export function validateRbacYaml(
  data: unknown
): z.SafeParseReturnType<unknown, RbacYaml> {
  return RbacYamlSchema.safeParse(data);
}

/**
 * Validate database.yaml content
 */
export function validateDatabaseYaml(
  data: unknown
): z.SafeParseReturnType<unknown, DatabaseYaml> {
  return DatabaseYamlSchema.safeParse(data);
}

/**
 * Validate combined configuration
 */
export function validatePabawiConfig(
  data: unknown
): z.SafeParseReturnType<unknown, PabawiYamlConfig> {
  return PabawiYamlConfigSchema.safeParse(data);
}

// ============================================================================
// Schema Registration
// ============================================================================

import type {
  SchemaCategory} from "./SchemaRegistry";
import {
  registerCoreSchema
} from "./SchemaRegistry";

/**
 * Register all YAML configuration schemas in the registry
 */
export function registerYamlConfigSchemas(): void {
  // Integrations schemas
  registerCoreSchema(IntegrationsYamlSchema, {
    id: "yaml:integrations",
    name: "Integrations YAML",
    description: "Schema for integrations.yaml configuration file",
    version: "1.0.0",
    category: "integration" as SchemaCategory,
    example: {
      integrations: {
        bolt: { enabled: true, priority: 5 },
        puppetdb: { enabled: false },
      },
    },
  });

  registerCoreSchema(YamlBoltIntegrationSchema, {
    id: "yaml:integrations:bolt",
    name: "Bolt Integration YAML",
    description: "Schema for Bolt integration configuration",
    version: "1.0.0",
    category: "integration" as SchemaCategory,
  });

  registerCoreSchema(YamlPuppetDBIntegrationSchema, {
    id: "yaml:integrations:puppetdb",
    name: "PuppetDB Integration YAML",
    description: "Schema for PuppetDB integration configuration",
    version: "1.0.0",
    category: "integration" as SchemaCategory,
  });

  registerCoreSchema(YamlPuppetserverIntegrationSchema, {
    id: "yaml:integrations:puppetserver",
    name: "Puppetserver Integration YAML",
    description: "Schema for Puppetserver integration configuration",
    version: "1.0.0",
    category: "integration" as SchemaCategory,
  });

  registerCoreSchema(YamlHieraIntegrationSchema, {
    id: "yaml:integrations:hiera",
    name: "Hiera Integration YAML",
    description: "Schema for Hiera integration configuration",
    version: "1.0.0",
    category: "integration" as SchemaCategory,
  });

  // RBAC schemas
  registerCoreSchema(RbacYamlSchema, {
    id: "yaml:rbac",
    name: "RBAC YAML",
    description: "Schema for rbac.yaml configuration file",
    version: "1.0.0",
    category: "auth" as SchemaCategory,
    example: {
      auth: { enabled: false },
      roles: [{ name: "admin", priority: 100, permissions: [{ capability: "*", action: "allow" }] }],
    },
  });

  registerCoreSchema(YamlAuthConfigSchema, {
    id: "yaml:rbac:auth",
    name: "Auth Configuration YAML",
    description: "Schema for authentication configuration",
    version: "1.0.0",
    category: "auth" as SchemaCategory,
  });

  registerCoreSchema(YamlRoleSchema, {
    id: "yaml:rbac:role",
    name: "Role Definition YAML",
    description: "Schema for role definition in YAML",
    version: "1.0.0",
    category: "auth" as SchemaCategory,
  });

  registerCoreSchema(YamlPermissionSchema, {
    id: "yaml:rbac:permission",
    name: "Permission Definition YAML",
    description: "Schema for permission definition in YAML",
    version: "1.0.0",
    category: "auth" as SchemaCategory,
  });

  // Database schemas
  registerCoreSchema(DatabaseYamlSchema, {
    id: "yaml:database",
    name: "Database YAML",
    description: "Schema for database.yaml configuration file",
    version: "1.0.0",
    category: "database" as SchemaCategory,
    example: {
      database: { type: "sqlite", path: "./data/pabawi.db" },
      migrations: { autoRun: true },
    },
  });

  // Combined schema
  registerCoreSchema(PabawiYamlConfigSchema, {
    id: "yaml:pabawi",
    name: "Pabawi Combined YAML",
    description: "Combined schema for all YAML configuration",
    version: "1.0.0",
    category: "core" as SchemaCategory,
  });
}
