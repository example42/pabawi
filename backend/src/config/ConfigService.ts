import { config as loadDotenv } from "dotenv";
import {
  AppConfigSchema,
  type AppConfig,
  type WhitelistConfig,
} from "./schema";
import { z } from "zod";
import {
  YamlConfigLoader,
  DEFAULT_CONFIG_PATHS,
} from "./YamlConfigLoader";

/**
 * YAML configuration file structure
 */
interface ExternalPluginConfig {
  path?: string;
  package?: string;
  enabled?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
}

interface YamlPluginsConfig {
  plugins?: Record<string, {
    enabled?: boolean;
    priority?: number;
    config?: Record<string, unknown>;
  }>;
  externalPlugins?: ExternalPluginConfig[];
}

interface YamlPermissionConfig {
  capability: string;
  action: "allow" | "deny";
  description?: string;
  conditions?: Record<string, unknown>;
}

interface YamlRoleConfig {
  name: string;
  description?: string;
  priority?: number;
  isSystem?: boolean;
  permissions?: YamlPermissionConfig[];
}

interface YamlGroupConfig {
  name: string;
  description?: string;
  roles?: string[];
}

interface YamlUserConfig {
  username: string;
  email?: string;
  password?: string;
  displayName?: string;
  roles?: string[];
  groups?: string[];
  active?: boolean;
}

interface YamlRbacConfig {
  auth?: {
    enabled?: boolean;
    jwt?: {
      secret?: string;
      accessTokenExpiry?: number;
      refreshTokenExpiry?: number;
      issuer?: string;
    };
    session?: {
      maxActiveSessions?: number;
      inactivityTimeout?: number;
    };
    password?: {
      minLength?: number;
      requireUppercase?: boolean;
      requireLowercase?: boolean;
      requireNumbers?: boolean;
      requireSpecialChars?: boolean;
    };
  };
  roles?: YamlRoleConfig[];
  groups?: YamlGroupConfig[];
  users?: YamlUserConfig[];
}

interface YamlDatabaseConfig {
  database?: {
    type?: "sqlite" | "postgresql" | "mysql";
    path?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    poolMin?: number;
    poolMax?: number;
    connectionTimeout?: number;
    debug?: boolean;
  };
  migrations?: {
    autoRun?: boolean;
    directory?: string;
    lockTimeout?: number;
  };
}

/**
 * Combined YAML configuration
 */
export interface YamlConfig {
  plugins: YamlPluginsConfig;
  rbac: YamlRbacConfig;
  database: YamlDatabaseConfig;
}

/**
 * Configuration service to load and validate application settings
 * from environment variables, .env file, and YAML configuration files.
 *
 * Configuration Precedence (highest to lowest):
 * 1. CLI arguments (when applicable)
 * 2. Environment variables
 * 3. YAML configuration files
 * 4. Default values in schemas
 */
export class ConfigService {
  private config: AppConfig;
  private yamlConfig: YamlConfig | null = null;
  private yamlLoader: YamlConfigLoader;

  constructor(basePath?: string) {
    // Load .env file only if not in test environment
    if (process.env.NODE_ENV !== "test") {
      loadDotenv();
    }

    // Initialize YAML loader
    this.yamlLoader = new YamlConfigLoader(basePath);

    // Load YAML configuration files
    this.loadYamlConfigs();

    // Parse and validate configuration
    this.config = this.loadConfiguration();
  }

  /**
   * Load YAML configuration files from standard locations
   */
  private loadYamlConfigs(): void {
    // Load plugins config (formerly integrations)
    const pluginsResult = this.yamlLoader.loadFirst<YamlPluginsConfig>(
      ...DEFAULT_CONFIG_PATHS.integrations, // Keep same path for backward compatibility
    );

    // Load RBAC config
    const rbacResult = this.yamlLoader.loadFirst<YamlRbacConfig>(
      ...DEFAULT_CONFIG_PATHS.rbac,
    );

    // Load database config
    const databaseResult = this.yamlLoader.loadFirst<YamlDatabaseConfig>(
      ...DEFAULT_CONFIG_PATHS.database,
    );

    this.yamlConfig = {
      plugins: pluginsResult.success && pluginsResult.data
        ? pluginsResult.data
        : {},
      rbac: rbacResult.success && rbacResult.data ? rbacResult.data : {},
      database: databaseResult.success && databaseResult.data
        ? databaseResult.data
        : {},
    };
  }

  /**
   * Get the loaded YAML configuration
   */
  public getYamlConfig(): YamlConfig | null {
    return this.yamlConfig;
  }

  /**
   * Get RBAC configuration from YAML
   */
  public getRbacConfig(): YamlRbacConfig {
    return this.yamlConfig?.rbac ?? {};
  }

  /**
   * Check if a YAML config file was loaded
   */
  public hasYamlConfig(type: "plugins" | "rbac" | "database"): boolean {
    if (!this.yamlConfig) return false;
    const config = this.yamlConfig[type];
    return typeof config === "object" && Object.keys(config).length > 0;
  }

  /**
   * Reload YAML configuration files
   */
  public reloadYamlConfigs(): void {
    this.loadYamlConfigs();
    this.config = this.loadConfiguration();
  }

  /**
   * Parse generic plugins configuration from environment variables
   *
   * Environment variables for plugins follow the pattern:
   * PLUGIN_{PLUGIN_NAME}_{CONFIG_KEY}
   *
   * Example: PLUGIN_BOLT_ENABLED=true
   */
  private parsePluginsConfig(): Record<string, {
    enabled?: boolean;
    priority?: number;
    config?: Record<string, unknown>;
  }> {
    const plugins: Record<string, {
      enabled?: boolean;
      priority?: number;
      config?: Record<string, unknown>;
    }> = {};

    // Parse environment variables for plugin configuration
    // This is a generic approach that allows any plugin to be configured via env vars
    // Format: PLUGIN_{PLUGIN_NAME}_ENABLED, PLUGIN_{PLUGIN_NAME}_PRIORITY, etc.

    // For now, we'll keep this simple and let plugins handle their own config
    // The YAML config will be the primary way to configure plugins

    return plugins;
  }

  /**
   * Load configuration from environment variables with validation
   */
  private loadConfiguration(): AppConfig {
    try {
      // Parse command whitelist from JSON string
      let commandWhitelist: WhitelistConfig;
      try {
        const whitelistJson = process.env.BOLT_COMMAND_WHITELIST ?? "[]";
        const parsedWhitelist = JSON.parse(whitelistJson) as unknown;
        const whitelistArray: string[] = Array.isArray(parsedWhitelist)
          ? parsedWhitelist.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        const matchMode = process.env.BOLT_COMMAND_WHITELIST_MATCH_MODE;
        commandWhitelist = {
          allowAll: process.env.BOLT_COMMAND_WHITELIST_ALLOW_ALL === "true",
          whitelist: whitelistArray,
          matchMode:
            matchMode === "exact" || matchMode === "prefix"
              ? matchMode
              : "exact",
        };
      } catch (error) {
        throw new Error(
          `Failed to parse BOLT_COMMAND_WHITELIST: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Parse package tasks from JSON string if provided
      let packageTasks: unknown;
      if (process.env.BOLT_PACKAGE_TASKS) {
        try {
          packageTasks = JSON.parse(process.env.BOLT_PACKAGE_TASKS) as unknown;
        } catch (error) {
          throw new Error(
            `Failed to parse BOLT_PACKAGE_TASKS: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      // Parse streaming configuration
      const streaming = {
        bufferMs: process.env.STREAMING_BUFFER_MS
          ? parseInt(process.env.STREAMING_BUFFER_MS, 10)
          : undefined,
        maxOutputSize: process.env.STREAMING_MAX_OUTPUT_SIZE
          ? parseInt(process.env.STREAMING_MAX_OUTPUT_SIZE, 10)
          : undefined,
        maxLineLength: process.env.STREAMING_MAX_LINE_LENGTH
          ? parseInt(process.env.STREAMING_MAX_LINE_LENGTH, 10)
          : undefined,
      };

      // Parse cache configuration
      const cache = {
        inventoryTtl: process.env.CACHE_INVENTORY_TTL
          ? parseInt(process.env.CACHE_INVENTORY_TTL, 10)
          : undefined,
        factsTtl: process.env.CACHE_FACTS_TTL
          ? parseInt(process.env.CACHE_FACTS_TTL, 10)
          : undefined,
      };

      // Parse execution queue configuration
      const executionQueue = {
        concurrentLimit: process.env.CONCURRENT_EXECUTION_LIMIT
          ? parseInt(process.env.CONCURRENT_EXECUTION_LIMIT, 10)
          : undefined,
        maxQueueSize: process.env.MAX_QUEUE_SIZE
          ? parseInt(process.env.MAX_QUEUE_SIZE, 10)
          : undefined,
      };

      // Parse generic plugins configuration
      const plugins = this.parsePluginsConfig();

      // Parse UI configuration
      const ui = {
        showHomePageRunChart:
          process.env.UI_SHOW_HOME_PAGE_RUN_CHART !== "false",
      };

      // Build configuration object
      const rawConfig = {
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        host: process.env.HOST,
        commandWhitelist,
        executionTimeout: process.env.BOLT_EXECUTION_TIMEOUT
          ? parseInt(process.env.BOLT_EXECUTION_TIMEOUT, 10)
          : undefined,
        logLevel: process.env.LOG_LEVEL,
        databasePath: process.env.DATABASE_PATH,
        packageTasks,
        streaming,
        cache,
        executionQueue,
        plugins,
        ui,
      };

      // Validate with Zod schema
      return AppConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw new Error(`Configuration validation failed: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Get the complete application configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get a specific configuration value
   */
  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Get port number
   */
  public getPort(): number {
    return this.config.port;
  }

  /**
   * Get host address
   */
  public getHost(): string {
    return this.config.host;
  }

  /**
   * Get command whitelist configuration
   */
  public getCommandWhitelist(): WhitelistConfig {
    return this.config.commandWhitelist;
  }

  /**
   * Get execution timeout in milliseconds
   */
  public getExecutionTimeout(): number {
    return this.config.executionTimeout;
  }

  /**
   * Get log level
   */
  public getLogLevel(): string {
    return this.config.logLevel;
  }

  /**
   * Get database path
   */
  public getDatabasePath(): string {
    return this.config.databasePath;
  }

  /**
   * Get package installation tasks configuration
   */
  public getPackageTasks(): typeof this.config.packageTasks {
    return this.config.packageTasks;
  }

  /**
   * Get streaming configuration
   */
  public getStreamingConfig(): typeof this.config.streaming {
    return this.config.streaming;
  }

  /**
   * Get cache configuration
   */
  public getCacheConfig(): typeof this.config.cache {
    return this.config.cache;
  }

  /**
   * Get execution queue configuration
   */
  public getExecutionQueueConfig(): typeof this.config.executionQueue {
    return this.config.executionQueue;
  }

  /**
   * Get generic plugins configuration (v1.0.0)
   */
  public getPluginsConfig(): typeof this.config.plugins {
    return this.config.plugins;
  }

  /**
   * Get configuration for a specific plugin
   */
  public getPluginConfig(pluginName: string): {
    enabled: boolean;
    priority: number;
    config: Record<string, unknown>;
  } | null {
    const pluginConfig = this.config.plugins[pluginName];
    if (!pluginConfig) {
      return null;
    }
    return {
      enabled: pluginConfig.enabled ?? true,
      priority: pluginConfig.priority ?? 10,
      config: pluginConfig.config ?? {},
    };
  }

  /**
   * Get UI configuration
   */
  public getUIConfig(): typeof this.config.ui {
    return this.config.ui;
  }
}
