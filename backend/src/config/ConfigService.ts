import { config as loadDotenv } from "dotenv";
import {
  AppConfigSchema,
  type AppConfig,
  type WhitelistConfig,
} from "./schema";
import { z } from "zod";

/**
 * Configuration service to load and validate application settings
 * from environment variables and .env file
 */
export class ConfigService {
  private config: AppConfig;

  constructor() {
    // Load .env file only if not in test environment
    if (process.env.NODE_ENV !== "test") {
      loadDotenv();
    }

    // Parse and validate configuration
    this.config = this.loadConfiguration();
  }

  /**
   * Parse integrations configuration from environment variables
   */
  private parseIntegrationsConfig(): {
    puppetdb?: {
      enabled: boolean;
      serverUrl: string;
      port?: number;
      token?: string;
      ssl?: {
        enabled: boolean;
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
      };
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
      cache?: {
        ttl?: number;
      };
      circuitBreaker?: {
        threshold?: number;
        timeout?: number;
        resetTimeout?: number;
      };
    };
    puppetserver?: {
      enabled: boolean;
      serverUrl: string;
      port?: number;
      token?: string;
      ssl?: {
        enabled: boolean;
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
      };
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
      inactivityThreshold?: number;
      cache?: {
        ttl?: number;
      };
      circuitBreaker?: {
        threshold?: number;
        timeout?: number;
        resetTimeout?: number;
      };
    };
    hiera?: {
      enabled: boolean;
      controlRepoPath: string;
      hieraConfigPath?: string;
      environments?: string[];
      factSources?: {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
      };
      catalogCompilation?: {
        enabled?: boolean;
        timeout?: number;
        cacheTTL?: number;
      };
      cache?: {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
      };
      codeAnalysis?: {
        enabled?: boolean;
        lintEnabled?: boolean;
        moduleUpdateCheck?: boolean;
        analysisInterval?: number;
        exclusionPatterns?: string[];
      };
    };
  } {
    const integrations: ReturnType<typeof this.parseIntegrationsConfig> = {};

    // Parse PuppetDB configuration
    if (process.env.PUPPETDB_ENABLED === "true") {
      const serverUrl = process.env.PUPPETDB_SERVER_URL;
      if (!serverUrl) {
        throw new Error(
          "PUPPETDB_SERVER_URL is required when PUPPETDB_ENABLED is true",
        );
      }

      integrations.puppetdb = {
        enabled: true,
        serverUrl,
        port: process.env.PUPPETDB_PORT
          ? parseInt(process.env.PUPPETDB_PORT, 10)
          : undefined,
        token: process.env.PUPPETDB_TOKEN,
        timeout: process.env.PUPPETDB_TIMEOUT
          ? parseInt(process.env.PUPPETDB_TIMEOUT, 10)
          : undefined,
        retryAttempts: process.env.PUPPETDB_RETRY_ATTEMPTS
          ? parseInt(process.env.PUPPETDB_RETRY_ATTEMPTS, 10)
          : undefined,
        retryDelay: process.env.PUPPETDB_RETRY_DELAY
          ? parseInt(process.env.PUPPETDB_RETRY_DELAY, 10)
          : undefined,
      };

      // Parse SSL configuration if any SSL-related env vars are set
      if (
        process.env.PUPPETDB_SSL_ENABLED !== undefined ||
        process.env.PUPPETDB_SSL_CA ||
        process.env.PUPPETDB_SSL_CERT ||
        process.env.PUPPETDB_SSL_KEY ||
        process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED !== undefined
      ) {
        integrations.puppetdb.ssl = {
          enabled: process.env.PUPPETDB_SSL_ENABLED !== "false",
          ca: process.env.PUPPETDB_SSL_CA,
          cert: process.env.PUPPETDB_SSL_CERT,
          key: process.env.PUPPETDB_SSL_KEY,
          rejectUnauthorized:
            process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED !== "false",
        };
      }

      // Parse cache configuration
      if (process.env.PUPPETDB_CACHE_TTL) {
        integrations.puppetdb.cache = {
          ttl: parseInt(process.env.PUPPETDB_CACHE_TTL, 10),
        };
      }

      // Parse circuit breaker configuration
      if (
        process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD ||
        process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT ||
        process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT
      ) {
        integrations.puppetdb.circuitBreaker = {
          threshold: process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD
            ? parseInt(process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD, 10)
            : undefined,
          timeout: process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT
            ? parseInt(process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT, 10)
            : undefined,
          resetTimeout: process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT
            ? parseInt(
                process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT,
                10,
              )
            : undefined,
        };
      }
    }

    // Parse Puppetserver configuration
    if (process.env.PUPPETSERVER_ENABLED === "true") {
      const serverUrl = process.env.PUPPETSERVER_SERVER_URL;
      if (!serverUrl) {
        throw new Error(
          "PUPPETSERVER_SERVER_URL is required when PUPPETSERVER_ENABLED is true",
        );
      }

      integrations.puppetserver = {
        enabled: true,
        serverUrl,
        port: process.env.PUPPETSERVER_PORT
          ? parseInt(process.env.PUPPETSERVER_PORT, 10)
          : undefined,
        token: process.env.PUPPETSERVER_TOKEN,
        timeout: process.env.PUPPETSERVER_TIMEOUT
          ? parseInt(process.env.PUPPETSERVER_TIMEOUT, 10)
          : undefined,
        retryAttempts: process.env.PUPPETSERVER_RETRY_ATTEMPTS
          ? parseInt(process.env.PUPPETSERVER_RETRY_ATTEMPTS, 10)
          : undefined,
        retryDelay: process.env.PUPPETSERVER_RETRY_DELAY
          ? parseInt(process.env.PUPPETSERVER_RETRY_DELAY, 10)
          : undefined,
        inactivityThreshold: process.env.PUPPETSERVER_INACTIVITY_THRESHOLD
          ? parseInt(process.env.PUPPETSERVER_INACTIVITY_THRESHOLD, 10)
          : undefined,
      };

      // Parse SSL configuration if any SSL-related env vars are set
      if (
        process.env.PUPPETSERVER_SSL_ENABLED !== undefined ||
        process.env.PUPPETSERVER_SSL_CA ||
        process.env.PUPPETSERVER_SSL_CERT ||
        process.env.PUPPETSERVER_SSL_KEY ||
        process.env.PUPPETSERVER_SSL_REJECT_UNAUTHORIZED !== undefined
      ) {
        integrations.puppetserver.ssl = {
          enabled: process.env.PUPPETSERVER_SSL_ENABLED !== "false",
          ca: process.env.PUPPETSERVER_SSL_CA,
          cert: process.env.PUPPETSERVER_SSL_CERT,
          key: process.env.PUPPETSERVER_SSL_KEY,
          rejectUnauthorized:
            process.env.PUPPETSERVER_SSL_REJECT_UNAUTHORIZED !== "false",
        };
      }

      // Parse cache configuration
      if (process.env.PUPPETSERVER_CACHE_TTL) {
        integrations.puppetserver.cache = {
          ttl: parseInt(process.env.PUPPETSERVER_CACHE_TTL, 10),
        };
      }

      // Parse circuit breaker configuration
      if (
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD ||
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT ||
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT
      ) {
        integrations.puppetserver.circuitBreaker = {
          threshold: process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD
            ? parseInt(process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD, 10)
            : undefined,
          timeout: process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT
            ? parseInt(process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT, 10)
            : undefined,
          resetTimeout: process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT
            ? parseInt(
                process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT,
                10,
              )
            : undefined,
        };
      }
    }

    // Parse Hiera configuration
    if (process.env.HIERA_ENABLED === "true") {
      const controlRepoPath = process.env.HIERA_CONTROL_REPO_PATH;
      if (!controlRepoPath) {
        throw new Error(
          "HIERA_CONTROL_REPO_PATH is required when HIERA_ENABLED is true",
        );
      }

      // Parse environments from JSON array
      let environments: string[] | undefined;
      if (process.env.HIERA_ENVIRONMENTS) {
        try {
          const parsed = JSON.parse(process.env.HIERA_ENVIRONMENTS) as unknown;
          if (Array.isArray(parsed)) {
            environments = parsed.filter(
              (item): item is string => typeof item === "string",
            );
          }
        } catch {
          throw new Error(
            "HIERA_ENVIRONMENTS must be a valid JSON array of strings",
          );
        }
      }

      integrations.hiera = {
        enabled: true,
        controlRepoPath,
        hieraConfigPath: process.env.HIERA_CONFIG_PATH,
        environments,
      };

      // Parse fact source configuration
      if (
        process.env.HIERA_FACT_SOURCE_PREFER_PUPPETDB !== undefined ||
        process.env.HIERA_FACT_SOURCE_LOCAL_PATH
      ) {
        integrations.hiera.factSources = {
          preferPuppetDB:
            process.env.HIERA_FACT_SOURCE_PREFER_PUPPETDB !== "false",
          localFactsPath: process.env.HIERA_FACT_SOURCE_LOCAL_PATH,
        };
      }

      // Parse catalog compilation configuration
      if (
        process.env.HIERA_CATALOG_COMPILATION_ENABLED !== undefined ||
        process.env.HIERA_CATALOG_COMPILATION_TIMEOUT ||
        process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL
      ) {
        integrations.hiera.catalogCompilation = {
          enabled: process.env.HIERA_CATALOG_COMPILATION_ENABLED === "true",
          timeout: process.env.HIERA_CATALOG_COMPILATION_TIMEOUT
            ? parseInt(process.env.HIERA_CATALOG_COMPILATION_TIMEOUT, 10)
            : undefined,
          cacheTTL: process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL
            ? parseInt(process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL, 10)
            : undefined,
        };
      }

      // Parse cache configuration
      if (
        process.env.HIERA_CACHE_ENABLED !== undefined ||
        process.env.HIERA_CACHE_TTL ||
        process.env.HIERA_CACHE_MAX_ENTRIES
      ) {
        integrations.hiera.cache = {
          enabled: process.env.HIERA_CACHE_ENABLED !== "false",
          ttl: process.env.HIERA_CACHE_TTL
            ? parseInt(process.env.HIERA_CACHE_TTL, 10)
            : undefined,
          maxEntries: process.env.HIERA_CACHE_MAX_ENTRIES
            ? parseInt(process.env.HIERA_CACHE_MAX_ENTRIES, 10)
            : undefined,
        };
      }

      // Parse code analysis configuration
      if (
        process.env.HIERA_CODE_ANALYSIS_ENABLED !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_LINT_ENABLED !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_INTERVAL ||
        process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS
      ) {
        // Parse exclusion patterns from JSON array
        let exclusionPatterns: string[] | undefined;
        if (process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS) {
          try {
            const parsed = JSON.parse(
              process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS,
            ) as unknown;
            if (Array.isArray(parsed)) {
              exclusionPatterns = parsed.filter(
                (item): item is string => typeof item === "string",
              );
            }
          } catch {
            throw new Error(
              "HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS must be a valid JSON array of strings",
            );
          }
        }

        integrations.hiera.codeAnalysis = {
          enabled: process.env.HIERA_CODE_ANALYSIS_ENABLED !== "false",
          lintEnabled: process.env.HIERA_CODE_ANALYSIS_LINT_ENABLED !== "false",
          moduleUpdateCheck:
            process.env.HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK !== "false",
          analysisInterval: process.env.HIERA_CODE_ANALYSIS_INTERVAL
            ? parseInt(process.env.HIERA_CODE_ANALYSIS_INTERVAL, 10)
            : undefined,
          exclusionPatterns,
        };
      }
    }

    return integrations;
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

      // Parse integrations configuration
      const integrations = this.parseIntegrationsConfig();

      // Build configuration object
      const rawConfig = {
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        host: process.env.HOST,
        boltProjectPath: process.env.BOLT_PROJECT_PATH,
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
        integrations,
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
   * Get Bolt project path
   */
  public getBoltProjectPath(): string {
    return this.config.boltProjectPath;
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
   * Get integrations configuration
   */
  public getIntegrationsConfig(): typeof this.config.integrations {
    return this.config.integrations;
  }

  /**
   * Get PuppetDB configuration if enabled
   */
  public getPuppetDBConfig():
    | (typeof this.config.integrations.puppetdb & { enabled: true })
    | null {
    const puppetdb = this.config.integrations.puppetdb;
    if (puppetdb?.enabled) {
      return puppetdb as typeof puppetdb & { enabled: true };
    }
    return null;
  }

  /**
   * Get Puppetserver configuration if enabled
   */
  public getPuppetserverConfig():
    | (typeof this.config.integrations.puppetserver & { enabled: true })
    | null {
    const puppetserver = this.config.integrations.puppetserver;
    if (puppetserver?.enabled) {
      return puppetserver as typeof puppetserver & { enabled: true };
    }
    return null;
  }

  /**
   * Get Hiera configuration if enabled
   */
  public getHieraConfig():
    | (typeof this.config.integrations.hiera & { enabled: true })
    | null {
    const hiera = this.config.integrations.hiera;
    if (hiera?.enabled) {
      return hiera as typeof hiera & { enabled: true };
    }
    return null;
  }
}
