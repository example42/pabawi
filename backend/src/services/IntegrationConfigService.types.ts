import { z } from "zod";

/**
 * Integration Config Service Types and Zod Schemas
 *
 * Type definitions and validation schemas for the integration configuration
 * storage system. Configs are stored per-user with sensitive fields encrypted
 * at rest using AES-256-GCM.
 *
 * Requirements: 32.1, 32.2, 32.3, 32.4
 */

// ============================================================================
// Integration Config Record Schemas
// ============================================================================

/**
 * Full integration config record as stored in the database and returned by queries.
 * The `config` field contains a JSON object; sensitive fields are decrypted before
 * being returned to callers.
 * Requirements: 32.1
 */
export const IntegrationConfigRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  integrationName: z.string().min(1),
  config: z.record(z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntegrationConfigRecord = z.infer<typeof IntegrationConfigRecordSchema>;

/**
 * Schema for creating or updating an integration config.
 * The id, createdAt, updatedAt, and isActive fields are managed internally.
 * Requirements: 32.1, 32.2
 */
export const CreateIntegrationConfigSchema = z.object({
  userId: z.string().min(1),
  integrationName: z.string().min(1),
  config: z.record(z.unknown()),
});

export type CreateIntegrationConfig = z.infer<typeof CreateIntegrationConfigSchema>;

/**
 * Raw database row shape before transformation.
 * The `isActive` column is stored as INTEGER (0/1) in SQLite and needs
 * conversion to boolean, and `config` is stored as a JSON string.
 */
export const IntegrationConfigRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  integrationName: z.string(),
  config: z.string(),
  isActive: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntegrationConfigRow = z.infer<typeof IntegrationConfigRowSchema>;
