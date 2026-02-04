/**
 * Configuration module exports
 *
 * Provides centralized configuration management with support for:
 * - Environment variables
 * - .env files
 * - YAML configuration files
 * - Zod schema validation
 * - Schema registry for plugin configurations
 */

export { ConfigService } from "./ConfigService";
export type { YamlConfig } from "./ConfigService";

export {
  YamlConfigLoader,
  DEFAULT_CONFIG_PATHS,
  getYamlConfigLoader,
  resetYamlConfigLoader,
} from "./YamlConfigLoader";
export type {
  ConfigFilePaths,
  YamlLoadResult,
} from "./YamlConfigLoader";

// Schema Registry
export {
  SchemaRegistry,
  getSchemaRegistry,
  resetSchemaRegistry,
  registerCoreSchema,
  registerPluginSchema,
} from "./SchemaRegistry";
export type {
  SchemaMetadata,
  SchemaCategory,
  RegisteredSchema,
  SchemaValidationResult,
  SchemaValidationError,
  SchemaRegistrationOptions,
  SchemaRegistryStats,
} from "./SchemaRegistry";

// Core application schemas
export {
  AppConfigSchema,
  DatabaseConfigSchema,
  WhitelistConfigSchema,
  PackageTaskConfigSchema,
  StreamingConfigSchema,
  CacheConfigSchema,
  UIConfigSchema,
  ExecutionQueueConfigSchema,
  PluginConfigSchema,
  PluginsConfigSchema,
} from "./schema";

export type {
  AppConfig,
  DatabaseConfig,
  WhitelistConfig,
  PackageTaskConfig,
  StreamingConfig,
  CacheConfig,
  UIConfig,
  ExecutionQueueConfig,
  PluginConfig,
  PluginsConfig,
} from "./schema";

// YAML configuration schemas
export {
  // Integrations YAML schemas
  IntegrationsYamlSchema,
  YamlIntegrationsSchema,
  YamlBoltIntegrationSchema,
  YamlPuppetDBIntegrationSchema,
  YamlPuppetserverIntegrationSchema,
  YamlHieraIntegrationSchema,
  YamlExternalPluginSchema,
  YamlWidgetConfigSchema,
  YamlFrontendConfigSchema,
  YamlCommandWhitelistSchema,
  // RBAC YAML schemas
  RbacYamlSchema,
  YamlAuthConfigSchema,
  YamlJWTConfigSchema,
  YamlSessionConfigSchema,
  YamlPasswordPolicySchema,
  YamlRoleSchema,
  YamlPermissionSchema,
  YamlPermissionConditionSchema,
  YamlGroupSchema,
  YamlUserSchema,
  PermissionActionSchema,
  WidgetSlotSchema,
  DefaultPermissionsSchema,
  // Database YAML schemas
  DatabaseYamlSchema,
  YamlMigrationConfigSchema,
  YamlBackupConfigSchema,
  // Combined schema
  PabawiYamlConfigSchema,
  // Validation helpers
  validateIntegrationsYaml,
  validateRbacYaml,
  validateDatabaseYaml,
  validatePabawiConfig,
  // Schema registration
  registerYamlConfigSchemas,
} from "./YamlConfigSchemas";

export type {
  // Integrations YAML types
  IntegrationsYaml,
  YamlIntegrations,
  YamlBoltIntegration,
  YamlPuppetDBIntegration,
  YamlPuppetserverIntegration,
  YamlHieraIntegration,
  YamlExternalPlugin,
  YamlWidgetConfig,
  YamlFrontendConfig,
  YamlCommandWhitelist,
  YamlBoltConfig,
  YamlPuppetDBConfig,
  YamlPuppetserverConfig,
  YamlHieraConfig,
  YamlSSLConfig,
  WidgetSlot,
  DefaultPermissions,
  // RBAC YAML types
  RbacYaml,
  YamlAuthConfig,
  YamlJWTConfig,
  YamlSessionConfig,
  YamlPasswordPolicy,
  YamlRole,
  YamlPermission,
  YamlPermissionCondition,
  YamlGroup,
  YamlUser,
  PermissionAction,
  // Database YAML types
  DatabaseYaml,
  YamlMigrationConfig,
  YamlBackupConfig,
  // Combined type
  PabawiYamlConfig,
} from "./YamlConfigSchemas";
