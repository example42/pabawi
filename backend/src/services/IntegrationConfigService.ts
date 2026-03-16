import { randomUUID, randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import {
  CreateIntegrationConfigSchema,
  type IntegrationConfigRecord,
  type IntegrationConfigRow,
} from "./IntegrationConfigService.types";

/**
 * Regex patterns for detecting sensitive config field names.
 * Matches field names containing token, password, secret, or key (case-insensitive).
 * Requirements: 18.4, 20.1
 */
const SENSITIVE_FIELD_PATTERN = /token|password|secret|key/i;

/**
 * Encrypted field envelope stored as a JSON string in the config column.
 * The presence of all four properties distinguishes encrypted values from plaintext.
 */
interface EncryptedEnvelope {
  iv: string;
  salt: string;
  encrypted: string;
  tag: string;
}

/**
 * IntegrationConfigService — CRUD operations for per-user integration configs
 * with AES-256-GCM encryption of sensitive fields at rest.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 19.1, 19.2, 19.3, 19.4, 20.1, 20.2, 20.3, 20.4
 */
export class IntegrationConfigService {
  private db: DatabaseAdapter;
  private secret: string;
  private envConfigProvider?: (integrationName: string) => Record<string, unknown>;

  constructor(
    db: DatabaseAdapter,
    secret: string,
    envConfigProvider?: (integrationName: string) => Record<string, unknown>,
  ) {
    this.db = db;
    this.secret = secret;
    this.envConfigProvider = envConfigProvider;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Save (upsert) an integration config for a user.
   * Validates against the CreateIntegrationConfig Zod schema, encrypts sensitive
   * fields, then inserts or updates the record.
   * Requirements: 18.1, 18.2, 18.3, 18.4
   */
  async saveConfig(
    userId: string,
    integrationName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    // Validate input
    CreateIntegrationConfigSchema.parse({ userId, integrationName, config });

    const now = new Date().toISOString();
    const id = randomUUID();
    const encryptedConfig = this.encryptSensitiveFields(config);
    const configJson = JSON.stringify(encryptedConfig);

    await this.db.execute(
      `INSERT INTO integration_configs (id, userId, integrationName, config, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(userId, integrationName) DO UPDATE SET
         config = excluded.config,
         updatedAt = excluded.updatedAt`,
      [id, userId, integrationName, configJson, now, now],
    );
  }

  /**
   * Retrieve a single config record, decrypting sensitive fields.
   * Requirements: 18.1, 18.5
   */
  async getConfig(
    userId: string,
    integrationName: string,
  ): Promise<IntegrationConfigRecord | null> {
    const row = await this.db.queryOne<IntegrationConfigRow>(
      `SELECT * FROM integration_configs WHERE userId = ? AND integrationName = ?`,
      [userId, integrationName],
    );
    if (!row) return null;
    return this.rowToRecord(row);
  }

  /**
   * Delete a config record.
   * Requirements: 18.1
   */
  async deleteConfig(userId: string, integrationName: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM integration_configs WHERE userId = ? AND integrationName = ?`,
      [userId, integrationName],
    );
  }

  /**
   * List all configs for a user, decrypting sensitive fields.
   * Requirements: 18.1
   */
  async listConfigs(userId: string): Promise<IntegrationConfigRecord[]> {
    const rows = await this.db.query<IntegrationConfigRow>(
      `SELECT * FROM integration_configs WHERE userId = ?`,
      [userId],
    );
    return rows.map((r) => this.rowToRecord(r));
  }

  /**
   * Retrieve all active configs (decrypted). Used at startup to merge with .env.
   * Requirements: 18.1
   */
  async getActiveConfigs(): Promise<IntegrationConfigRecord[]> {
    const rows = await this.db.query<IntegrationConfigRow>(
      `SELECT * FROM integration_configs WHERE isActive = 1`,
    );
    return rows.map((r) => this.rowToRecord(r));
  }

  /**
   * Get the effective (merged) config for an integration.
   * .env values serve as the base; DB values override for non-null keys (shallow merge).
   * Requirements: 19.1, 19.2, 19.3, 19.4
   */
  async getEffectiveConfig(
    integrationName: string,
  ): Promise<Record<string, unknown>> {
    const envConfig = this.envConfigProvider
      ? this.envConfigProvider(integrationName)
      : null;

    // Find the first active DB config for this integration
    const row = await this.db.queryOne<IntegrationConfigRow>(
      `SELECT * FROM integration_configs WHERE integrationName = ? AND isActive = 1 LIMIT 1`,
      [integrationName],
    );
    const dbConfig = row ? this.rowToRecord(row).config : null;

    if (!envConfig && !dbConfig) return {};
    if (!dbConfig) return { ...envConfig! };
    if (!envConfig) return { ...dbConfig };

    // Shallow merge: env as base, DB overrides for non-null keys
    const result: Record<string, unknown> = { ...envConfig };
    for (const [key, value] of Object.entries(dbConfig)) {
      if (value !== null && value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Re-encrypt all stored configs atomically: decrypt with oldKey, re-encrypt with newKey.
   * Requirements: 20.4
   */
  async rotateEncryptionKey(oldKey: string, newKey: string): Promise<void> {
    await this.db.withTransaction(async () => {
      const rows = await this.db.query<IntegrationConfigRow>(
        `SELECT * FROM integration_configs`,
      );

      for (const row of rows) {
        const rawConfig: Record<string, unknown> = JSON.parse(row.config);

        // Decrypt sensitive fields with the old key
        const decrypted = this.decryptSensitiveFieldsWithKey(rawConfig, oldKey);

        // Re-encrypt sensitive fields with the new key
        const reEncrypted = this.encryptSensitiveFieldsWithKey(decrypted, newKey);

        const now = new Date().toISOString();
        await this.db.execute(
          `UPDATE integration_configs SET config = ?, updatedAt = ? WHERE id = ?`,
          [JSON.stringify(reEncrypted), now, row.id],
        );
      }
    });

    // Update the service's internal secret to the new key
    this.secret = newKey;
  }

  // ---------------------------------------------------------------------------
  // Row transformation
  // ---------------------------------------------------------------------------

  private rowToRecord(row: IntegrationConfigRow): IntegrationConfigRecord {
    const rawConfig: Record<string, unknown> = JSON.parse(row.config);
    const decryptedConfig = this.decryptSensitiveFields(rawConfig);
    return {
      id: row.id,
      userId: row.userId,
      integrationName: row.integrationName,
      config: decryptedConfig,
      isActive: row.isActive === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Encryption helpers
  // ---------------------------------------------------------------------------

  /**
   * Determine whether a field name is sensitive.
   */
  private isSensitiveField(fieldName: string): boolean {
    return SENSITIVE_FIELD_PATTERN.test(fieldName);
  }

  /**
   * Encrypt a single string value using AES-256-GCM.
   * Returns a JSON-encoded EncryptedEnvelope string.
   * Requirements: 20.1, 20.2
   */
  private encryptValue(value: string, keyOverride?: string): string {
    const secret = keyOverride ?? this.secret;
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const derivedKey = scryptSync(secret, salt, 32);

    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();

    const envelope: EncryptedEnvelope = {
      iv: iv.toString("hex"),
      salt: salt.toString("hex"),
      encrypted,
      tag: tag.toString("hex"),
    };
    return JSON.stringify(envelope);
  }

  /**
   * Decrypt a value previously encrypted by encryptValue.
   * Requirements: 20.3
   */
  private decryptValue(envelopeStr: string, keyOverride?: string): string {
    const secret = keyOverride ?? this.secret;
    const envelope: EncryptedEnvelope = JSON.parse(envelopeStr);
    const salt = Buffer.from(envelope.salt, "hex");
    const iv = Buffer.from(envelope.iv, "hex");
    const tag = Buffer.from(envelope.tag, "hex");
    const derivedKey = scryptSync(secret, salt, 32);

    const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(envelope.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Check whether a value looks like an EncryptedEnvelope JSON string.
   */
  private isEncryptedEnvelope(value: unknown): boolean {
    if (typeof value !== "string") return false;
    try {
      const parsed = JSON.parse(value);
      return (
        typeof parsed === "object" &&
        parsed !== null &&
        "iv" in parsed &&
        "salt" in parsed &&
        "encrypted" in parsed &&
        "tag" in parsed
      );
    } catch {
      return false;
    }
  }

  /**
   * Iterate over config keys and encrypt values of sensitive fields.
   */
  private encryptSensitiveFields(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (this.isSensitiveField(key) && value != null) {
        result[key] = this.encryptValue(String(value));
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Iterate over config keys and decrypt values that are encrypted envelopes.
   */
  private decryptSensitiveFields(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (this.isEncryptedEnvelope(value)) {
        result[key] = this.decryptValue(value as string);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Encrypt sensitive fields using a specific key (for key rotation).
   */
  private encryptSensitiveFieldsWithKey(
    config: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, value] of Object.entries(config)) {
      if (this.isSensitiveField(k) && value != null) {
        result[k] = this.encryptValue(String(value), key);
      } else {
        result[k] = value;
      }
    }
    return result;
  }

  /**
   * Decrypt sensitive fields using a specific key (for key rotation).
   */
  private decryptSensitiveFieldsWithKey(
    config: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, value] of Object.entries(config)) {
      if (this.isEncryptedEnvelope(value)) {
        result[k] = this.decryptValue(value as string, key);
      } else {
        result[k] = value;
      }
    }
    return result;
  }
}
