import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../../database/DatabaseAdapter";
import {
  CreateJournalEntrySchema,
  TimelineOptionsSchema,
  SearchOptionsSchema,
  type CreateJournalEntry,
  type JournalEntry,
  type TimelineOptions,
  type SearchOptions,
} from "./types";

/**
 * Minimal interface for live sources that provide node event data.
 * Compatible with InformationSourcePlugin without requiring the full import.
 */
export interface LiveSource {
  getNodeData(nodeId: string, dataType: string): Promise<unknown>;
  isInitialized(): boolean;
}

/**
 * JournalService — Records and retrieves a unified timeline of events
 * for inventory nodes. Supports provisioning events, lifecycle actions,
 * execution results, and manual notes.
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4, 23.1, 23.2, 23.3, 23.4, 23.5, 24.1, 24.2, 24.3
 */
export class JournalService {
  private db: DatabaseAdapter;
  private liveSources: Map<string, LiveSource>;

  constructor(db: DatabaseAdapter, liveSources?: Map<string, LiveSource>) {
    this.db = db;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.liveSources = liveSources ?? new Map();
  }

  /**
   * Record a journal event. Validates the entry with CreateJournalEntrySchema,
   * generates id/timestamp/isLive, and inserts into journal_entries.
   *
   * Requirements: 22.1, 22.2, 22.3, 22.4
   */
  async recordEvent(entry: CreateJournalEntry): Promise<string> {
    const validated = CreateJournalEntrySchema.parse(entry);

    const id = randomUUID();
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const detailsJson = JSON.stringify(validated.details ?? {});

    const sql = `
      INSERT INTO journal_entries (
        id, nodeId, nodeUri, eventType, source,
        "action", summary, details, userId, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      validated.nodeId,
      validated.nodeUri,
      validated.eventType,
      validated.source,
      validated.action,
      validated.summary,
      detailsJson,
      validated.userId ?? null,
      timestamp,
    ];

    await this.db.execute(sql, params);
    return id;
  }

  /**
   * Add a manual note to a node's journal.
   * Creates an entry with eventType "note" and source "user".
   *
   * Requirements: 24.1, 24.2
   */
  async addNote(
    nodeId: string,
    userId: string,
    content: string
  ): Promise<string> {
    return this.recordEvent({
      nodeId,
      nodeUri: `user:${nodeId}`,
      eventType: "note",
      source: "user",
      action: "add_note",
      summary: content,
      details: {},
      userId,
    });
  }

  /**
   * Get the timeline of journal entries for a specific node,
   * sorted by timestamp descending with pagination.
   *
   * Requirements: 22.4
   */
  async getNodeTimeline(
    nodeId: string,
    options?: Partial<TimelineOptions>
  ): Promise<JournalEntry[]> {
    const opts = TimelineOptionsSchema.parse(options ?? {});

    let sql = `SELECT * FROM journal_entries WHERE nodeId = ?`;
    const params: unknown[] = [nodeId];

    if (opts.eventType) {
      sql += ` AND eventType = ?`;
      params.push(opts.eventType);
    }

    if (opts.source) {
      sql += ` AND source = ?`;
      params.push(opts.source);
    }

    if (opts.startDate) {
      sql += ` AND timestamp >= ?`;
      params.push(opts.startDate);
    }

    if (opts.endDate) {
      sql += ` AND timestamp <= ?`;
      params.push(opts.endDate);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit, opts.offset);

    const rows = await this.db.query<JournalEntry & { details: string }>(sql, params);

    return rows.map((row) => ({
      ...row,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
      details: typeof row.details === "string" ? JSON.parse(row.details) : row.details ?? {},
      isLive: false,
    }));
  }

  /**
   * Search journal entries across summary and details fields using LIKE.
   *
   * Requirements: 24.3
   */
  async searchEntries(
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<JournalEntry[]> {
    const opts = SearchOptionsSchema.parse(options ?? {});
    const pattern = `%${query}%`;

    const sql = `
      SELECT * FROM journal_entries
      WHERE summary LIKE ? OR details LIKE ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const params = [pattern, pattern, opts.limit, opts.offset];

    const rows = await this.db.query<JournalEntry & { details: string }>(sql, params);

    return rows.map((row) => ({
      ...row,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
      details: typeof row.details === "string" ? JSON.parse(row.details) : row.details ?? {},
      isLive: false,
    }));
  }

  /**
   * Aggregate a unified timeline merging DB-stored events with live-source events.
   * Fetches in parallel, marks isLive flags, sorts by timestamp descending,
   * and applies limit/offset pagination. Failed live sources are gracefully skipped.
   *
   * Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
   */
  async aggregateTimeline(
    nodeId: string,
    options?: Partial<TimelineOptions>
  ): Promise<JournalEntry[]> {
    const opts = TimelineOptionsSchema.parse(options ?? {});

    // Step 1 & 2: Fetch DB events and live events in parallel
    const [dbEntries, liveEntries] = await Promise.all([
      this.getNodeTimeline(nodeId, { ...opts, limit: 200, offset: 0 }),
      this.fetchLiveEntries(nodeId),
    ]);

    // Step 3: Merge — DB entries already have isLive=false, live entries have isLive=true
    const allEntries = [...dbEntries, ...liveEntries];

    // Step 4: Sort by timestamp descending
    allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Step 5: Apply pagination
    return allEntries.slice(opts.offset, opts.offset + opts.limit);
  }

  /**
   * Fetch events from all live sources in parallel, gracefully skipping failures.
   */
  private async fetchLiveEntries(nodeId: string): Promise<JournalEntry[]> {
    if (this.liveSources.size === 0) return [];

    const livePromises = Array.from(this.liveSources.entries()).map(
      async ([sourceName, source]): Promise<JournalEntry[]> => {
        try {
          if (!source.isInitialized()) return [];
          const events = await source.getNodeData(nodeId, "events");
          if (!Array.isArray(events)) return [];
          return events.map((e) => this.transformToJournalEntry(e, sourceName));
        } catch {
          // Graceful degradation: skip failed sources (Req 23.4)
          return [];
        }
      }
    );

    const results = await Promise.all(livePromises);
    return results.flat();
  }

  /**
   * Transform a raw live-source event into a JournalEntry with isLive=true.
   */
  private transformToJournalEntry(
    event: unknown,
    sourceName: string
  ): JournalEntry {
    const e = (event ?? {}) as Record<string, unknown>;
    return {
      id: (typeof e.id === "string" ? e.id : null) ?? randomUUID(),
      nodeId: typeof e.nodeId === "string" ? e.nodeId : "",
      nodeUri: typeof e.nodeUri === "string" ? e.nodeUri : `${sourceName}:unknown`,
      eventType: typeof e.eventType === "string" ? (e.eventType as JournalEntry["eventType"]) : "info",
      source: sourceName as JournalEntry["source"],
      action: typeof e.action === "string" ? e.action : "unknown",
      summary: typeof e.summary === "string" ? e.summary : "Live event",
      details: typeof e.details === "object" && e.details !== null ? (e.details as Record<string, unknown>) : {},
      userId: typeof e.userId === "string" ? e.userId : undefined,
      timestamp: typeof e.timestamp === "string" ? e.timestamp : new Date().toISOString(),
      isLive: true,
    };
  }
}
