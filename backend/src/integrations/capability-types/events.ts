/**
 * Events Capability Interface
 *
 * Standardized interface for event management capabilities.
 * Plugins implementing event capabilities should conform to these interfaces.
 *
 * @module integrations/capability-types/events
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for events.list parameters
 */
export const EventsListParamsSchema = z.object({
  nodeId: z.string().min(1).describe("Node identifier"),
  limit: z.number().positive().optional().describe("Maximum number of events to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
  startTime: z.string().optional().describe("Filter events after this timestamp (ISO 8601)"),
  endTime: z.string().optional().describe("Filter events before this timestamp (ISO 8601)"),
  eventType: z.string().optional().describe("Filter by event type"),
  status: z.enum(["success", "failure", "noop", "skipped"]).optional().describe("Filter by event status"),
});

/**
 * Schema for events.stream parameters
 */
export const EventsStreamParamsSchema = z.object({
  nodeId: z.string().optional().describe("Filter by node identifier"),
  eventTypes: z.array(z.string()).optional().describe("Filter by event types"),
});

/**
 * Schema for events.query parameters
 */
export const EventsQueryParamsSchema = z.object({
  filters: z.record(z.unknown()).describe("Query filters as key-value pairs"),
  limit: z.number().positive().optional().describe("Maximum number of events to return"),
  offset: z.number().nonnegative().optional().describe("Offset for pagination"),
  orderBy: z.string().optional().describe("Field to order results by"),
  orderDirection: z.enum(["asc", "desc"]).optional().describe("Order direction"),
});

// =============================================================================
// TypeScript Types (inferred from schemas)
// =============================================================================

export type EventsListParams = z.infer<typeof EventsListParamsSchema>;
export type EventsStreamParams = z.infer<typeof EventsStreamParamsSchema>;
export type EventsQueryParams = z.infer<typeof EventsQueryParamsSchema>;

// =============================================================================
// Event Data Types
// =============================================================================

/**
 * Event status enumeration
 */
export type EventStatus = "success" | "failure" | "noop" | "skipped";

/**
 * Event data structure
 */
export interface Event {
  /** Unique event identifier */
  id: string;
  /** Node identifier this event is for */
  nodeId: string;
  /** Node name */
  nodeName?: string;
  /** Event timestamp */
  timestamp: string;
  /** Event type (e.g., 'resource_change', 'run_start', 'run_end') */
  eventType: string;
  /** Event status */
  status: EventStatus;
  /** Resource type (if applicable) */
  resourceType?: string;
  /** Resource title/name (if applicable) */
  resourceTitle?: string;
  /** Event message */
  message?: string;
  /** Property that changed (if applicable) */
  property?: string;
  /** Old value (if applicable) */
  oldValue?: unknown;
  /** New value (if applicable) */
  newValue?: unknown;
  /** Report ID this event belongs to */
  reportId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Paginated event list result
 */
export interface EventListResult {
  /** Array of events */
  events: Event[];
  /** Total count of events matching query */
  total: number;
  /** Current offset */
  offset: number;
  /** Limit used */
  limit: number;
}

/**
 * Callback function for streaming events
 */
export type EventStreamCallback = (event: Event) => void;

// =============================================================================
// Capability Interfaces
// =============================================================================

/**
 * Events capability interface
 *
 * Provides standardized methods for event management:
 * - events.list: List events for a node
 * - events.stream: Stream live events
 * - events.query: Query events with filters
 *
 * @example
 * ```typescript
 * class PuppetDBPlugin extends BasePlugin implements EventsCapability {
 *   async eventsList(params: EventsListParams): Promise<EventListResult> {
 *     // Implementation
 *   }
 *
 *   async eventsStream(params: EventsStreamParams, callback: EventStreamCallback): Promise<void> {
 *     // Implementation
 *   }
 *
 *   async eventsQuery(params: EventsQueryParams): Promise<EventListResult> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface EventsCapability {
  /**
   * List events for a node
   *
   * @param params - List parameters with nodeId and optional filters
   * @returns Paginated event list result
   */
  eventsList(params: EventsListParams): Promise<EventListResult>;

  /**
   * Stream live events
   * Provides real-time event notifications
   *
   * @param params - Stream parameters with optional filters
   * @param callback - Callback function for each event
   */
  eventsStream(params: EventsStreamParams, callback: EventStreamCallback): Promise<void>;

  /**
   * Query events with advanced filters
   *
   * @param params - Query parameters with filters
   * @returns Paginated event list result
   */
  eventsQuery(params: EventsQueryParams): Promise<EventListResult>;
}

/**
 * Type guard to check if a plugin implements EventsCapability
 */
export function hasEventsCapability(
  plugin: unknown,
): plugin is EventsCapability {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "eventsList" in plugin &&
    typeof (plugin as Record<string, unknown>).eventsList === "function" &&
    "eventsStream" in plugin &&
    typeof (plugin as Record<string, unknown>).eventsStream === "function" &&
    "eventsQuery" in plugin &&
    typeof (plugin as Record<string, unknown>).eventsQuery === "function"
  );
}
