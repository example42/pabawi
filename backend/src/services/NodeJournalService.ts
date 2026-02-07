/**
 * Node Journal Service
 *
 * Provides a centralized journal for logging node-related events and changes.
 * Supports execution logs, package installations, provisioning operations,
 * and manual entries. Integrates with the execution framework to provide
 * complete audit trails for all node activities.
 */

import { LoggerService } from './LoggerService.js';
import type { DatabaseAdapter } from '../database/interfaces/DatabaseInterface.js';

/**
 * Journal entry types
 */
export type JournalEntryType =
  | 'execution'      // Command/task execution
  | 'package'        // Package installation/removal
  | 'provisioning'   // Infrastructure provisioning
  | 'event'          // Plugin-generated events
  | 'manual';        // Manual entries from UI

/**
 * Journal entry interface
 */
export interface JournalEntry {
  id?: string;
  nodeId: string;
  entryType: JournalEntryType;
  timestamp: string;
  user?: string;
  action: string;
  details: Record<string, unknown>;
  executionId?: string;
  status?: 'success' | 'failed' | 'partial';
  plugin?: string;
}

/**
 * Query options for journal entries
 */
export interface JournalQuery {
  nodeId?: string;
  entryTypes?: JournalEntryType[];
  startDate?: string;
  endDate?: string;
  user?: string;
  status?: 'success' | 'failed' | 'partial';
  plugin?: string;
  limit?: number;
  offset?: number;
}

/**
 * Node Journal Service
 *
 * Provides:
 * - Journal entry creation for all node activities
 * - Per-node journal queries
 * - Support for multiple entry types
 * - Integration with execution framework
 * - Manual entry support from UI
 */
export class NodeJournalService {
  private readonly logger: LoggerService;
  private readonly db: DatabaseAdapter;
  private readonly tableName = 'node_journal';

  constructor(db: DatabaseAdapter) {
    this.logger = new LoggerService();
    this.db = db;
  }

  /**
   * Initialize the journal service
   * Creates the journal table if it doesn't exist
   */
  public async initialize(): Promise<void> {
    try {
      await this.createTableIfNotExists();
      this.logger.info('Node Journal Service initialized', {
        component: 'NodeJournalService',
        operation: 'initialize',
      });
    } catch (error) {
      this.logger.error('Failed to initialize Node Journal Service', {
        component: 'NodeJournalService',
        operation: 'initialize',
      }, error as Error);
      throw error;
    }
  }

  /**
   * Create the journal table if it doesn't exist
   */
  private async createTableIfNotExists(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        user TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        execution_id TEXT,
        status TEXT,
        plugin TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_node_journal_node_id ON ${this.tableName}(node_id);
      CREATE INDEX IF NOT EXISTS idx_node_journal_timestamp ON ${this.tableName}(timestamp);
      CREATE INDEX IF NOT EXISTS idx_node_journal_entry_type ON ${this.tableName}(entry_type);
      CREATE INDEX IF NOT EXISTS idx_node_journal_execution_id ON ${this.tableName}(execution_id);
    `;

    await this.db.exec(createTableSQL);
  }

  /**
   * Write a journal entry
   *
   * @param entry - Journal entry to write
   * @returns Entry ID
   */
  public async writeEntry(entry: Omit<JournalEntry, 'id'>): Promise<string> {
    const id = this.generateId();

    const sql = `
      INSERT INTO ${this.tableName} (
        id, node_id, entry_type, timestamp, user, action,
        details, execution_id, status, plugin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      entry.nodeId,
      entry.entryType,
      entry.timestamp,
      entry.user || null,
      entry.action,
      JSON.stringify(entry.details),
      entry.executionId || null,
      entry.status || null,
      entry.plugin || null,
    ];

    try {
      await this.db.execute(sql, params);

      this.logger.debug('Journal entry written', {
        component: 'NodeJournalService',
        operation: 'writeEntry',
        metadata: {
          id,
          nodeId: entry.nodeId,
          entryType: entry.entryType,
          action: entry.action,
        },
      });

      return id;
    } catch (error) {
      this.logger.error('Failed to write journal entry', {
        component: 'NodeJournalService',
        operation: 'writeEntry',
        metadata: { nodeId: entry.nodeId, entryType: entry.entryType },
      }, error as Error);
      throw error;
    }
  }

  /**
   * Write multiple journal entries (for multi-node executions)
   *
   * @param entries - Array of journal entries
   * @returns Array of entry IDs
   */
  public async writeEntries(entries: Omit<JournalEntry, 'id'>[]): Promise<string[]> {
    const ids: string[] = [];

    for (const entry of entries) {
      const id = await this.writeEntry(entry);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get journal entries for a node
   *
   * @param nodeId - Node identifier
   * @param options - Query options
   * @returns Array of journal entries
   */
  public async getNodeJournal(
    nodeId: string,
    options: Omit<JournalQuery, 'nodeId'> = {}
  ): Promise<JournalEntry[]> {
    const conditions: string[] = ['node_id = ?'];
    const params: any[] = [nodeId];

    if (options.entryTypes && options.entryTypes.length > 0) {
      const placeholders = options.entryTypes.map(() => '?').join(',');
      conditions.push(`entry_type IN (${placeholders})`);
      params.push(...options.entryTypes);
    }

    if (options.startDate) {
      conditions.push('timestamp >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('timestamp <= ?');
      params.push(options.endDate);
    }

    if (options.user) {
      conditions.push('user = ?');
      params.push(options.user);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.plugin) {
      conditions.push('plugin = ?');
      params.push(options.plugin);
    }

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    try {
      const rows = await this.db.query(sql, params);
      return rows.map(row => this.mapRowToEntry(row));
    } catch (error) {
      this.logger.error('Failed to get node journal', {
        component: 'NodeJournalService',
        operation: 'getNodeJournal',
        metadata: { nodeId },
      }, error as Error);
      throw error;
    }
  }

  /**
   * Query journal entries across all nodes
   *
   * @param query - Query options
   * @returns Array of journal entries
   */
  public async queryEntries(query: JournalQuery = {}): Promise<JournalEntry[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (query.nodeId) {
      conditions.push('node_id = ?');
      params.push(query.nodeId);
    }

    if (query.entryTypes && query.entryTypes.length > 0) {
      const placeholders = query.entryTypes.map(() => '?').join(',');
      conditions.push(`entry_type IN (${placeholders})`);
      params.push(...query.entryTypes);
    }

    if (query.startDate) {
      conditions.push('timestamp >= ?');
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push('timestamp <= ?');
      params.push(query.endDate);
    }

    if (query.user) {
      conditions.push('user = ?');
      params.push(query.user);
    }

    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    if (query.plugin) {
      conditions.push('plugin = ?');
      params.push(query.plugin);
    }

    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    try {
      const rows = await this.db.query(sql, params);
      return rows.map(row => this.mapRowToEntry(row));
    } catch (error) {
      this.logger.error('Failed to query journal entries', {
        component: 'NodeJournalService',
        operation: 'queryEntries',
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get journal entries by execution ID
   *
   * @param executionId - Execution identifier
   * @returns Array of journal entries
   */
  public async getEntriesByExecution(executionId: string): Promise<JournalEntry[]> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE execution_id = ?
      ORDER BY timestamp DESC
    `;

    try {
      const rows = await this.db.query(sql, [executionId]);
      return rows.map(row => this.mapRowToEntry(row));
    } catch (error) {
      this.logger.error('Failed to get entries by execution', {
        component: 'NodeJournalService',
        operation: 'getEntriesByExecution',
        metadata: { executionId },
      }, error as Error);
      throw error;
    }
  }

  /**
   * Delete old journal entries (for retention policy)
   *
   * @param beforeDate - Delete entries before this date
   * @returns Number of deleted entries
   */
  public async deleteOldEntries(beforeDate: string): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;

    try {
      const result = await this.db.execute(sql, [beforeDate]);

      this.logger.info('Deleted old journal entries', {
        component: 'NodeJournalService',
        operation: 'deleteOldEntries',
        metadata: { beforeDate, deletedCount: result.changes },
      });

      return result.changes || 0;
    } catch (error) {
      this.logger.error('Failed to delete old entries', {
        component: 'NodeJournalService',
        operation: 'deleteOldEntries',
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get journal statistics for a node
   *
   * @param nodeId - Node identifier
   * @returns Statistics object
   */
  public async getNodeStatistics(nodeId: string): Promise<{
    totalEntries: number;
    byType: Record<JournalEntryType, number>;
    byStatus: Record<string, number>;
    lastActivity?: string;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        entry_type,
        status,
        MAX(timestamp) as last_activity
      FROM ${this.tableName}
      WHERE node_id = ?
      GROUP BY entry_type, status
    `;

    try {
      const rows = await this.db.query(sql, [nodeId]);

      const stats = {
        totalEntries: 0,
        byType: {} as Record<JournalEntryType, number>,
        byStatus: {} as Record<string, number>,
        lastActivity: undefined as string | undefined,
      };

      for (const row of rows) {
        const total = row.total as number;
        const entryType = row.entry_type as JournalEntryType;
        const status = row.status as string | null;
        const lastActivity = row.last_activity as string;

        stats.totalEntries += total;
        stats.byType[entryType] = (stats.byType[entryType] || 0) + total;

        if (status) {
          stats.byStatus[status] = (stats.byStatus[status] || 0) + total;
        }

        if (!stats.lastActivity || lastActivity > stats.lastActivity) {
          stats.lastActivity = lastActivity;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get node statistics', {
        component: 'NodeJournalService',
        operation: 'getNodeStatistics',
        metadata: { nodeId },
      }, error as Error);
      throw error;
    }
  }

  /**
   * Map database row to JournalEntry
   */
  private mapRowToEntry(row: any): JournalEntry {
    return {
      id: row.id,
      nodeId: row.node_id,
      entryType: row.entry_type as JournalEntryType,
      timestamp: row.timestamp,
      user: row.user,
      action: row.action,
      details: JSON.parse(row.details),
      executionId: row.execution_id,
      status: row.status,
      plugin: row.plugin,
    };
  }

  /**
   * Generate a unique ID for journal entries
   */
  private generateId(): string {
    return `journal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
