/**
 * LogBufferService
 *
 * In-memory ring buffer that captures structured log entries for the
 * admin Logs UI. Retains up to `maxEntries` (default 2000) most recent
 * log lines across all levels.
 */

export interface LogEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Log level */
  level: 'error' | 'warn' | 'info' | 'debug';
  /** Formatted message (without timestamp/level prefix) */
  message: string;
  /** Source component */
  component?: string;
  /** Integration name */
  integration?: string;
  /** Operation name */
  operation?: string;
  /** Additional structured metadata */
  metadata?: Record<string, unknown>;
}

export interface LogBufferQuery {
  /** Filter by level (inclusive — e.g. "warn" returns error + warn) */
  level?: 'error' | 'warn' | 'info' | 'debug';
  /** Filter by component name (case-insensitive substring match) */
  component?: string;
  /** Filter by integration name */
  integration?: string;
  /** Return only entries after this ISO timestamp */
  since?: string;
  /** Maximum entries to return (default 200) */
  limit?: number;
}

const LEVEL_PRIORITY: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export class LogBufferService {
  private readonly buffer: LogEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Append a log entry to the ring buffer.
   * Oldest entries are evicted when capacity is exceeded.
   */
  push(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }
  }

  /**
   * Query buffered log entries with optional filtering.
   * Returns newest-first.
   */
  query(opts: LogBufferQuery = {}): LogEntry[] {
    const limit = opts.limit ?? 200;
    const maxLevel = opts.level ? LEVEL_PRIORITY[opts.level] : 3;
    const sinceTs = opts.since ? new Date(opts.since).getTime() : 0;
    const componentFilter = opts.component?.toLowerCase();
    const integrationFilter = opts.integration?.toLowerCase();

    const results: LogEntry[] = [];

    // Iterate backwards (newest first) for efficiency
    for (let i = this.buffer.length - 1; i >= 0 && results.length < limit; i--) {
      const entry = this.buffer[i];

      // Level filter
      if (LEVEL_PRIORITY[entry.level] > maxLevel) continue;

      // Since filter
      if (sinceTs > 0 && new Date(entry.timestamp).getTime() <= sinceTs) continue;

      // Component filter
      if (componentFilter && !entry.component?.toLowerCase().includes(componentFilter)) continue;

      // Integration filter
      if (integrationFilter && !entry.integration?.toLowerCase().includes(integrationFilter)) continue;

      results.push(entry);
    }

    return results;
  }

  /**
   * Total number of entries currently buffered.
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Clear all buffered entries.
   */
  clear(): void {
    this.buffer.length = 0;
  }
}
