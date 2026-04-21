import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../../database/DatabaseAdapter";
import {
  CreateJournalEntrySchema,
  TimelineOptionsSchema,
  SearchOptionsSchema,
  GlobalTimelineFiltersSchema,
  type CreateJournalEntry,
  type JournalEntry,
  type TimelineOptions,
  type SearchOptions,
  type GlobalTimelineFilters,
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
   * Accepts a single nodeId or an array of nodeIds to match entries
   * stored under alternative identifiers (e.g. proxmox:node:vmid).
   *
   * Requirements: 22.4
   */
  async getNodeTimeline(
    nodeId: string | string[],
    options?: Partial<TimelineOptions>
  ): Promise<JournalEntry[]> {
    const opts = TimelineOptionsSchema.parse(options ?? {});

    const ids = Array.isArray(nodeId) ? nodeId : [nodeId];
    const idPlaceholders = ids.map(() => "?").join(", ");
    let sql = `SELECT * FROM journal_entries WHERE nodeId IN (${idPlaceholders})`;
    const params: unknown[] = [...ids];

    if (opts.eventType) {
      const types = Array.isArray(opts.eventType) ? opts.eventType : [opts.eventType];
      const placeholders = types.map(() => "?").join(", ");
      sql += ` AND eventType IN (${placeholders})`;
      params.push(...types);
    }

    if (opts.source) {
      const sources = Array.isArray(opts.source) ? opts.source : [opts.source];
      const placeholders = sources.map(() => "?").join(", ");
      sql += ` AND source IN (${placeholders})`;
      params.push(...sources);
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
   * Query journal entries across all nodes with optional filters.
   * Results sorted by timestamp descending with limit/offset pagination.
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  async getGlobalTimeline(
    filters?: Partial<GlobalTimelineFilters>
  ): Promise<JournalEntry[]> {
    const opts = GlobalTimelineFiltersSchema.parse(filters ?? {});

    let sql = `SELECT * FROM journal_entries`;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (opts.nodeIds && opts.nodeIds.length > 0) {
      const placeholders = opts.nodeIds.map(() => "?").join(", ");
      conditions.push(`nodeId IN (${placeholders})`);
      params.push(...opts.nodeIds);
    }

    if (opts.eventType) {
      const types = Array.isArray(opts.eventType) ? opts.eventType : [opts.eventType];
      const placeholders = types.map(() => "?").join(", ");
      conditions.push(`eventType IN (${placeholders})`);
      params.push(...types);
    }

    if (opts.source) {
      const sources = Array.isArray(opts.source) ? opts.source : [opts.source];
      const placeholders = sources.map(() => "?").join(", ");
      conditions.push(`source IN (${placeholders})`);
      params.push(...sources);
    }

    if (opts.startDate) {
      conditions.push(`timestamp >= ?`);
      params.push(opts.startDate);
    }

    if (opts.endDate) {
      conditions.push(`timestamp <= ?`);
      params.push(opts.endDate);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
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
   * Count journal entries matching the provided filters (for pagination).
   *
   * Requirements: 4.4
   */
  async getGlobalEntryCount(
    filters?: Partial<GlobalTimelineFilters>
  ): Promise<number> {
    const opts = GlobalTimelineFiltersSchema.parse(filters ?? {});

    let sql = `SELECT COUNT(*) as count FROM journal_entries`;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (opts.nodeIds && opts.nodeIds.length > 0) {
      const placeholders = opts.nodeIds.map(() => "?").join(", ");
      conditions.push(`nodeId IN (${placeholders})`);
      params.push(...opts.nodeIds);
    }

    if (opts.eventType) {
      const types = Array.isArray(opts.eventType) ? opts.eventType : [opts.eventType];
      const placeholders = types.map(() => "?").join(", ");
      conditions.push(`eventType IN (${placeholders})`);
      params.push(...types);
    }

    if (opts.source) {
      const sources = Array.isArray(opts.source) ? opts.source : [opts.source];
      const placeholders = sources.map(() => "?").join(", ");
      conditions.push(`source IN (${placeholders})`);
      params.push(...sources);
    }

    if (opts.startDate) {
      conditions.push(`timestamp >= ?`);
      params.push(opts.startDate);
    }

    if (opts.endDate) {
      conditions.push(`timestamp <= ?`);
      params.push(opts.endDate);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const rows = await this.db.query<{ count: number }>(sql, params);
    return rows[0]?.count ?? 0;
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
      eventType: typeof e.eventType === "string" ? (e.eventType as JournalEntry["eventType"]) : "unknown",
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
