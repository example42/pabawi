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
    if (process.env.NODE_ENV !== 'test') {
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
    };
    prometheus?: {
      enabled: boolean;
      serverUrl: string;
      timeout?: number;
      basicAuth?: {
        username: string;
        password: string;
      };
      bearerToken?: string;
      grafanaUrl?: string;
      nodeExporterJobName?: string;
    };
    ansible?: {
      enabled: boolean;
      url: string;
      token?: string;
      username?: string;
      password?: string;
      timeout?: number;
      verifySsl?: boolean;
      organizationId?: number;
    };
    terraform?: {
      enabled: boolean;
      url: string;
      token: string;
      organization?: string;
      timeout?: number;
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
    }

    // Parse Prometheus configuration
    if (process.env.PROMETHEUS_ENABLED === "true") {
      const serverUrl = process.env.PROMETHEUS_URL;
      if (!serverUrl) {
        throw new Error(
          "PROMETHEUS_URL is required when PROMETHEUS_ENABLED is true",
        );
      }

      integrations.prometheus = {
        enabled: true,
        serverUrl,
        timeout: process.env.PROMETHEUS_TIMEOUT
          ? parseInt(process.env.PROMETHEUS_TIMEOUT, 10)
          : undefined,
        grafanaUrl: process.env.PROMETHEUS_GRAFANA_URL,
        nodeExporterJobName: process.env.PROMETHEUS_NODE_EXPORTER_JOB,
      };

      // Parse basic auth if configured
      if (process.env.PROMETHEUS_BASIC_AUTH_USER && process.env.PROMETHEUS_BASIC_AUTH_PASSWORD) {
        integrations.prometheus.basicAuth = {
          username: process.env.PROMETHEUS_BASIC_AUTH_USER,
          password: process.env.PROMETHEUS_BASIC_AUTH_PASSWORD,
        };
      }

      // Parse bearer token if configured
      if (process.env.PROMETHEUS_BEARER_TOKEN) {
        integrations.prometheus.bearerToken = process.env.PROMETHEUS_BEARER_TOKEN;
      }
    }

    // Parse Ansible AWX/Tower configuration
    if (process.env.ANSIBLE_ENABLED === "true") {
      const url = process.env.ANSIBLE_URL;
      if (!url) {
        throw new Error(
          "ANSIBLE_URL is required when ANSIBLE_ENABLED is true",
        );
      }

      integrations.ansible = {
        enabled: true,
        url,
        token: process.env.ANSIBLE_TOKEN,
        username: process.env.ANSIBLE_USERNAME,
        password: process.env.ANSIBLE_PASSWORD,
        timeout: process.env.ANSIBLE_TIMEOUT
          ? parseInt(process.env.ANSIBLE_TIMEOUT, 10)
          : undefined,
        verifySsl: process.env.ANSIBLE_VERIFY_SSL !== "false",
        organizationId: process.env.ANSIBLE_ORGANIZATION_ID
          ? parseInt(process.env.ANSIBLE_ORGANIZATION_ID, 10)
          : undefined,
      };
    }

    // Parse Terraform Cloud/Enterprise configuration
    if (process.env.TERRAFORM_ENABLED === "true") {
      const url = process.env.TERRAFORM_URL || "https://app.terraform.io";
      const token = process.env.TERRAFORM_TOKEN;
      if (!token) {
        throw new Error(
          "TERRAFORM_TOKEN is required when TERRAFORM_ENABLED is true",
        );
      }

      integrations.terraform = {
        enabled: true,
        url,
        token,
        organization: process.env.TERRAFORM_ORGANIZATION,
        timeout: process.env.TERRAFORM_TIMEOUT
          ? parseInt(process.env.TERRAFORM_TIMEOUT, 10)
          : undefined,
      };
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

      // Parse integrations configuration
      const integrations = this.parseIntegrationsConfig();

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
}
