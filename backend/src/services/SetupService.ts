import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import { LoggerService } from "./LoggerService";

const logger = new LoggerService();

/**
 * Setup configuration interface
 */
export interface SetupConfig {
  allowSelfRegistration: boolean;
  defaultNewUserRole: string | null; // Role ID or null for no default role
}

/**
 * Setup status interface
 */
export interface SetupStatus {
  isComplete: boolean;
  hasAdminUser: boolean;
  config: SetupConfig | null;
}

/**
 * Service for managing initial setup and configuration
 */
export class SetupService {
  private db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  /**
   * Check if initial setup is complete
   * Setup is complete if at least one admin user exists
   */
  public async isSetupComplete(): Promise<boolean> {
    try {
      const row = await this.db.queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE isAdmin = 1"
      );
      return (row?.count ?? 0) > 0;
    } catch (err) {
      logger.error("Failed to check setup status", {
        component: "SetupService",
        operation: "isSetupComplete",
      }, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Get setup status including configuration
   */
  public async getSetupStatus(): Promise<SetupStatus> {
    const hasAdminUser = await this.isSetupComplete();
    const config = await this.getConfig();

    return {
      isComplete: hasAdminUser,
      hasAdminUser,
      config,
    };
  }

  /**
   * Get setup configuration
   */
  public async getConfig(): Promise<SetupConfig> {
    const allowSelfRegistration = await this.getConfigValue("allow_self_registration", "true");
    const defaultNewUserRole = await this.getConfigValue("default_new_user_role", "role-viewer-001");

    return {
      allowSelfRegistration: allowSelfRegistration === "true",
      defaultNewUserRole: defaultNewUserRole || null,
    };
  }

  /**
   * Save setup configuration
   */
  public async saveConfig(config: SetupConfig): Promise<void> {
    await this.setConfigValue("allow_self_registration", config.allowSelfRegistration ? "true" : "false");
    await this.setConfigValue("default_new_user_role", config.defaultNewUserRole ?? "");

    logger.info("Setup configuration saved", {
      component: "SetupService",
      operation: "saveConfig",
      metadata: { config },
    });
  }

  /**
   * Get a configuration value from the database
   */
  private async getConfigValue(key: string, defaultValue: string): Promise<string> {
    try {
      const row = await this.db.queryOne<{ value: string }>(
        "SELECT value FROM config WHERE key = ?",
        [key]
      );
      return row?.value ?? defaultValue;
    } catch (err) {
      logger.error("Failed to get config value", {
        component: "SetupService",
        operation: "getConfigValue",
        metadata: { key },
      }, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Set a configuration value in the database
   */
  private async setConfigValue(key: string, value: string): Promise<void> {
    try {
      await this.db.execute(
        `INSERT INTO config (key, value, updatedAt)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = datetime('now')`,
        [key, value, value]
      );
    } catch (err) {
      logger.error("Failed to set config value", {
        component: "SetupService",
        operation: "setConfigValue",
        metadata: { key },
      }, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Check if self-registration is allowed
   */
  public async isSelfRegistrationAllowed(): Promise<boolean> {
    const config = await this.getConfig();
    return config.allowSelfRegistration;
  }

  /**
   * Get the default role for new users
   */
  public async getDefaultNewUserRole(): Promise<string | null> {
    const config = await this.getConfig();
    return config.defaultNewUserRole;
  }
}
