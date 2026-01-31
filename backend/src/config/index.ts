/**
 * Configuration module exports
 *
 * Provides centralized configuration management with support for:
 * - Environment variables
 * - .env files
 * - YAML configuration files
 * - Zod schema validation
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

export {
  AppConfigSchema,
  DatabaseConfigSchema,
  WhitelistConfigSchema,
  PackageTaskConfigSchema,
  StreamingConfigSchema,
  CacheConfigSchema,
  UIConfigSchema,
  ExecutionQueueConfigSchema,
  SSLConfigSchema,
  PuppetDBConfigSchema,
  PuppetserverConfigSchema,
  HieraConfigSchema,
  IntegrationsConfigSchema,
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
  SSLConfig,
  PuppetDBConfig,
  PuppetserverConfig,
  HieraConfig,
  IntegrationsConfig,
} from "./schema";
