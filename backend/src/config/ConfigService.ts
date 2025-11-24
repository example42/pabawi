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
    // Load .env file
    loadDotenv();

    // Parse and validate configuration
    this.config = this.loadConfiguration();
  }

  /**
   * Load configuration from environment variables with validation
   */
  private loadConfiguration(): AppConfig {
    try {
      // Parse command whitelist from JSON string
      let commandWhitelist: WhitelistConfig;
      try {
        const whitelistJson = process.env.COMMAND_WHITELIST ?? "[]";
        const parsedWhitelist = JSON.parse(whitelistJson) as unknown;
        const whitelistArray: string[] = Array.isArray(parsedWhitelist)
          ? parsedWhitelist.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        const matchMode = process.env.COMMAND_WHITELIST_MATCH_MODE;
        commandWhitelist = {
          allowAll: process.env.COMMAND_WHITELIST_ALLOW_ALL === "true",
          whitelist: whitelistArray,
          matchMode:
            matchMode === "exact" || matchMode === "prefix"
              ? matchMode
              : "exact",
        };
      } catch (error) {
        throw new Error(
          `Failed to parse COMMAND_WHITELIST: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Parse package tasks from JSON string if provided
      let packageTasks: unknown;
      if (process.env.PACKAGE_TASKS) {
        try {
          packageTasks = JSON.parse(process.env.PACKAGE_TASKS) as unknown;
        } catch (error) {
          throw new Error(
            `Failed to parse PACKAGE_TASKS: ${error instanceof Error ? error.message : "Unknown error"}`,
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

      // Build configuration object
      const rawConfig = {
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        host: process.env.HOST,
        boltProjectPath: process.env.BOLT_PROJECT_PATH,
        commandWhitelist,
        executionTimeout: process.env.EXECUTION_TIMEOUT
          ? parseInt(process.env.EXECUTION_TIMEOUT, 10)
          : undefined,
        logLevel: process.env.LOG_LEVEL,
        databasePath: process.env.DATABASE_PATH,
        packageTasks,
        streaming,
        cache,
        executionQueue,
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
}
