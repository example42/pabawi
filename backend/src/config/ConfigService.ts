import { config as loadDotenv } from 'dotenv';
import { AppConfigSchema, type AppConfig, type WhitelistConfig } from './schema';
import { z } from 'zod';

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
        const whitelistJson = process.env.COMMAND_WHITELIST || '[]';
        const parsedWhitelist = JSON.parse(whitelistJson);
        commandWhitelist = {
          allowAll: process.env.COMMAND_WHITELIST_ALLOW_ALL === 'true',
          whitelist: Array.isArray(parsedWhitelist) ? parsedWhitelist : [],
          matchMode: (process.env.COMMAND_WHITELIST_MATCH_MODE as 'exact' | 'prefix') || 'exact',
        };
      } catch (error) {
        throw new Error(`Failed to parse COMMAND_WHITELIST: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Build configuration object
      const rawConfig = {
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        boltProjectPath: process.env.BOLT_PROJECT_PATH,
        commandWhitelist,
        executionTimeout: process.env.EXECUTION_TIMEOUT ? parseInt(process.env.EXECUTION_TIMEOUT, 10) : undefined,
        logLevel: process.env.LOG_LEVEL,
        databasePath: process.env.DATABASE_PATH,
      };

      // Validate with Zod schema
      return AppConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
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
}
