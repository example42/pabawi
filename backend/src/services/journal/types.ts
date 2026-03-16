import { z } from "zod";

/**
 * Journal Service Types and Zod Schemas
 *
 * Type definitions and validation schemas for the nodes journal system.
 * The journal records provisioning events, lifecycle actions, execution results,
 * and manual notes for inventory nodes.
 *
 * Requirements: 25.1, 25.2, 25.3, 26.1, 26.2, 26.3, 26.4
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Valid journal event types.
 * Requirements: 26.3
 */
export const JournalEventTypeSchema = z.enum([
  "provision",
  "destroy",
  "start",
  "stop",
  "reboot",
  "suspend",
  "resume",
  "command_execution",
  "task_execution",
  "puppet_run",
  "package_install",
  "config_change",
  "note",
  "error",
  "warning",
  "info",
]);

export type JournalEventType = z.infer<typeof JournalEventTypeSchema>;

/**
 * Valid journal source identifiers. Uses integration-level names
 * consistent with the single-plugin architecture.
 * Requirements: 25.1, 25.2, 25.3
 */
export const JournalSourceSchema = z.enum([
  "proxmox",
  "aws",
  "bolt",
  "ansible",
  "ssh",
  "puppetdb",
  "user",
  "system",
]);

export type JournalSource = z.infer<typeof JournalSourceSchema>;

// ============================================================================
// Journal Entry Schemas
// ============================================================================

/**
 * Full journal entry as stored in the database and returned by queries.
 * Requirements: 26.1
 */
export const JournalEntrySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  nodeUri: z.string().min(1),
  eventType: JournalEventTypeSchema,
  source: JournalSourceSchema,
  action: z.string().min(1),
  summary: z.string().min(1),
  details: z.record(z.unknown()).default({}),
  userId: z.string().nullable().optional(),
  timestamp: z.string().datetime({ message: "Timestamp must be ISO 8601 format" }),
  isLive: z.boolean(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/**
 * Schema for creating a new journal entry. The id, timestamp, and isLive
 * fields are auto-generated and not provided by the caller.
 * Requirements: 22.1, 22.2, 22.3, 22.4
 */
export const CreateJournalEntrySchema = z.object({
  nodeId: z.string().min(1),
  nodeUri: z.string().min(1),
  eventType: JournalEventTypeSchema,
  source: JournalSourceSchema,
  action: z.string().min(1),
  summary: z.string().min(1),
  details: z.record(z.unknown()).optional().default({}),
  userId: z.string().nullable().optional(),
});

export type CreateJournalEntry = z.infer<typeof CreateJournalEntrySchema>;

// ============================================================================
// Query Option Schemas
// ============================================================================

/**
 * Options for timeline and aggregation queries.
 */
export const TimelineOptionsSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: JournalEventTypeSchema.optional(),
  source: JournalSourceSchema.optional(),
});

export type TimelineOptions = z.infer<typeof TimelineOptionsSchema>;

/**
 * Options for searching journal entries.
 */
export const SearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
