/**
 * Execution Logger Service
 *
 * Provides structured logging for executions with integration to existing LoggerService,
 * execution history storage, and performance metrics collection.
 * Plugins can opt-in to use this service for logging execution activities.
 */

import { LoggerService } from './LoggerService.js';
import { ExecutionRepository, type ExecutionRecord, type NodeResult } from '../database/ExecutionRepository.js';
import type { DatabaseAdapter } from '../database/interfaces/DatabaseInterface.js';
import { NodeJournalService, type JournalEntry } from './NodeJournalService.js';

/**
 * Execution log entry for structured logging
 */
export interface ExecutionLog {
  id: string;
  type: 'command' | 'task' | 'facts' | 'package' | 'provisioning';
  user: string;
  targets: string[];
  action: string;
  parameters?: Record<string, unknown>;
  status: 'running' | 'success' | 'failed' | 'partial';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  results: NodeResult[];
  error?: string;
  debugInfo?: Record<string, unknown>;
}

/**
 * Performance metrics for executions
 */
export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  targetCount: number;
  errorRate: number;
}

/**
 * Query options for execution history
 */
export interface ExecutionHistoryQuery {
  timeRange?: { start: string; end: string };
  user?: string;
  target?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

/**
 * Execution Logger Service
 *
 * Provides:
 * - Structured logging for all execution types
 * - Integration with existing LoggerService
 * - Execution history storage via ExecutionRepository
 * - Performance metrics collection and calculation
 * - Query interface for execution history
 */
export class ExecutionLogger {
  private readonly logger: LoggerService;
  private readonly repository: ExecutionRepository;
  private readonly nodeJournal: NodeJournalService;
  private readonly debug: boolean;
  private readonly journalEnabled: boolean;

  /**
   * Create a new ExecutionLogger instance
   *
   * @param db - Database adapter instance
   * @param options - Configuration options
   */
  constructor(
    db: DatabaseAdapter,
    options: { debug?: boolean; journalEnabled?: boolean } = {}
  ) {
    this.logger = new LoggerService();
    this.repository = new ExecutionRepository(db);
    this.nodeJournal = new NodeJournalService(db);
    this.debug = options.debug ?? false;
    this.journalEnabled = options.journalEnabled ?? true;
  }

  /**
   * Log execution start
   *
   * Creates a new execution record in the database and logs to LoggerService.
   *
   * @param execution - Partial execution log (without id, status, results)
   * @returns Execution ID
   */
  public async logExecutionStart(
    execution: Omit<ExecutionLog, 'id' | 'status' | 'results'>
  ): Promise<string> {
    const executionRecord: Omit<ExecutionRecord, 'id'> = {
      type: execution.type as ExecutionRecord['type'],
      targetNodes: execution.targets,
      action: execution.action,
      parameters: execution.parameters,
      status: 'running',
      startedAt: execution.startedAt,
      results: [],
    };

    const id = await this.repository.create(executionRecord);

    // Log to LoggerService
    this.logger.info(
      `Execution started: ${execution.action}`,
      {
        component: 'ExecutionLogger',
        operation: 'logExecutionStart',
        metadata: {
          executionId: id,
          type: execution.type,
          user: execution.user,
          targets: execution.targets,
          action: execution.action,
        },
      }
    );

    if (this.debug) {
      this.logger.debug(
        `Execution details: ${JSON.stringify(execution.parameters)}`,
        {
          component: 'ExecutionLogger',
          operation: 'logExecutionStart',
          metadata: { executionId: id },
        }
      );
    }

    return id;
  }

  /**
   * Log execution completion
   *
   * Updates the execution record with completion status and results.
   * Writes journal entries for each affected node.
   *
   * @param executionId - Execution ID
   * @param result - Execution result with status and node results
   */
  public async logExecutionComplete(
    executionId: string,
    result: {
      status: 'success' | 'failed' | 'partial';
      completedAt: string;
      results: NodeResult[];
      error?: string;
      debugInfo?: Record<string, unknown>;
    }
  ): Promise<void> {
    const execution = await this.repository.findById(executionId);
    if (!execution) {
      this.logger.warn(
        `Execution not found: ${executionId}`,
        {
          component: 'ExecutionLogger',
          operation: 'logExecutionComplete',
        }
      );
      return;
    }

    const duration = new Date(result.completedAt).getTime() - new Date(execution.startedAt).getTime();

    await this.repository.update(executionId, {
      status: result.status,
      completedAt: result.completedAt,
      results: result.results,
      error: result.error,
      stdout: result.debugInfo?.stdout as string | undefined,
      stderr: result.debugInfo?.stderr as string | undefined,
    });

    // Write journal entries for each node
    if (this.journalEnabled) {
      await this.writeJournalEntries(executionId, execution, result.results);
    }

    // Log to LoggerService
    const logLevel = result.status === 'success' ? 'info' : 'warn';
    this.logger[logLevel](
      `Execution completed: ${execution.action} - ${result.status}`,
      {
        component: 'ExecutionLogger',
        operation: 'logExecutionComplete',
        metadata: {
          executionId,
          status: result.status,
          duration,
          successCount: result.results.filter(r => r.status === 'success').length,
          failedCount: result.results.filter(r => r.status === 'failed').length,
        },
      }
    );

    if (this.debug && result.debugInfo) {
      this.logger.debug(
        `Execution debug info: ${JSON.stringify(result.debugInfo)}`,
        {
          component: 'ExecutionLogger',
          operation: 'logExecutionComplete',
          metadata: { executionId },
        }
      );
    }
  }

  /**
   * Log execution error
   *
   * Updates the execution record with error status and logs the error.
   *
   * @param executionId - Execution ID
   * @param error - Error object
   */
  public async logExecutionError(
    executionId: string,
    error: Error
  ): Promise<void> {
    const execution = await this.repository.findById(executionId);
    if (!execution) {
      this.logger.warn(
        `Execution not found: ${executionId}`,
        {
          component: 'ExecutionLogger',
          operation: 'logExecutionError',
        }
      );
      return;
    }

    await this.repository.update(executionId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error.message,
    });

    // Log to LoggerService with stack trace
    this.logger.error(
      `Execution failed: ${execution.action}`,
      {
        component: 'ExecutionLogger',
        operation: 'logExecutionError',
        metadata: {
          executionId,
          action: execution.action,
          errorMessage: error.message,
        },
      },
      error
    );
  }

  /**
   * Get execution history with optional filters
   *
   * @param query - Query options for filtering and pagination
   * @returns Array of execution records
   */
  public async getExecutionHistory(
    query: ExecutionHistoryQuery = {}
  ): Promise<ExecutionRecord[]> {
    const filters: any = {};

    if (query.status) {
      filters.status = query.status;
    }

    if (query.type) {
      filters.type = query.type;
    }

    if (query.target) {
      filters.targetNode = query.target;
    }

    if (query.timeRange) {
      filters.startDate = query.timeRange.start;
      filters.endDate = query.timeRange.end;
    }

    const pagination = {
      page: query.offset ? Math.floor(query.offset / (query.limit || 50)) + 1 : 1,
      pageSize: query.limit || 50,
    };

    const result = await this.repository.findAll(filters, pagination);

    if (this.debug) {
      this.logger.debug(
        `Retrieved execution history: ${result.length} records`,
        {
          component: 'ExecutionLogger',
          operation: 'getExecutionHistory',
          metadata: { filters, pagination },
        }
      );
    }

    return result;
  }

  /**
   * Get execution by ID
   *
   * @param executionId - Execution ID
   * @returns Execution record or null if not found
   */
  public async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    return this.repository.findById(executionId);
  }

  /**
   * Get execution metrics for a time range
   *
   * Calculates performance metrics including success rate, average duration,
   * target count, and error rate.
   *
   * @param timeRange - Optional time range for metrics calculation
   * @returns Execution metrics
   */
  public async getExecutionMetrics(
    timeRange?: { start: string; end: string }
  ): Promise<ExecutionMetrics> {
    const filters: any = {};

    if (timeRange) {
      filters.startDate = timeRange.start;
      filters.endDate = timeRange.end;
    }

    // Get all executions in the time range
    const executions = await this.repository.findAll(filters, { page: 1, pageSize: 10000 });

    if (executions.length === 0) {
      return {
        totalExecutions: 0,
        successRate: 0,
        averageDuration: 0,
        targetCount: 0,
        errorRate: 0,
      };
    }

    // Calculate metrics
    const successCount = executions.filter((e: ExecutionRecord) => e.status === 'success').length;
    const failedCount = executions.filter((e: ExecutionRecord) => e.status === 'failed').length;
    const totalTargets = executions.reduce((sum: number, e: ExecutionRecord) => sum + e.targetNodes.length, 0);

    // Calculate average duration for completed executions
    const completedExecutions = executions.filter((e: ExecutionRecord) => e.completedAt);
    const totalDuration = completedExecutions.reduce((sum: number, e: ExecutionRecord) => {
      const duration = new Date(e.completedAt as string).getTime() - new Date(e.startedAt).getTime();
      return sum + duration;
    }, 0);
    const averageDuration = completedExecutions.length > 0
      ? totalDuration / completedExecutions.length
      : 0;

    const metrics: ExecutionMetrics = {
      totalExecutions: executions.length,
      successRate: executions.length > 0 ? successCount / executions.length : 0,
      averageDuration,
      targetCount: totalTargets,
      errorRate: executions.length > 0 ? failedCount / executions.length : 0,
    };

    if (this.debug) {
      this.logger.debug(
        `Calculated execution metrics`,
        {
          component: 'ExecutionLogger',
          operation: 'getExecutionMetrics',
          metadata: { ...metrics },
        }
      );
    }

    return metrics;
  }

  /**
   * Get status counts for summary statistics
   *
   * @returns Status counts
   */
  public async getStatusCounts(): Promise<{
    total: number;
    running: number;
    success: number;
    failed: number;
    partial: number;
  }> {
    return this.repository.countByStatus();
  }

  /**
   * Write journal entries for execution results
   *
   * Creates a journal entry for each node affected by the execution.
   *
   * @param executionId - Execution ID
   * @param execution - Execution record
   * @param results - Node results
   */
  private async writeJournalEntries(
    executionId: string,
    execution: ExecutionRecord,
    results: NodeResult[]
  ): Promise<void> {
    try {
      const entries: Omit<JournalEntry, 'id'>[] = results.map(nodeResult => ({
        nodeId: nodeResult.nodeId,
        entryType: this.mapExecutionTypeToJournalType(execution.type),
        timestamp: new Date().toISOString(),
        user: execution.parameters?.user as string | undefined,
        action: execution.action,
        details: {
          executionType: execution.type,
          parameters: execution.parameters,
          output: nodeResult.output,
          duration: nodeResult.duration,
        },
        executionId,
        status: nodeResult.status,
        plugin: execution.parameters?.plugin as string | undefined,
      }));

      await this.nodeJournal.writeEntries(entries);

      if (this.debug) {
        this.logger.debug(
          `Wrote ${entries.length} journal entries for execution ${executionId}`,
          {
            component: 'ExecutionLogger',
            operation: 'writeJournalEntries',
            metadata: { executionId, entryCount: entries.length },
          }
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to write journal entries',
        {
          component: 'ExecutionLogger',
          operation: 'writeJournalEntries',
          metadata: { executionId },
        },
        error as Error
      );
      // Don't throw - journal writing failure shouldn't fail the execution
    }
  }

  /**
   * Map execution type to journal entry type
   */
  private mapExecutionTypeToJournalType(
    executionType: ExecutionRecord['type']
  ): JournalEntry['entryType'] {
    switch (executionType) {
      case 'command':
      case 'task':
      case 'facts':
        return 'execution';
      case 'package':
        return 'package';
      case 'provisioning':
        return 'provisioning';
      default:
        return 'execution';
    }
  }

  /**
   * Write a manual journal entry
   *
   * Allows creating manual journal entries from the UI.
   *
   * @param entry - Manual journal entry
   * @returns Entry ID
   */
  public async writeManualJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'entryType'>
  ): Promise<string> {
    if (!this.journalEnabled) {
      throw new Error('Journal is not enabled');
    }

    return this.nodeJournal.writeEntry({
      ...entry,
      entryType: 'manual',
    });
  }

  /**
   * Write a package installation journal entry
   *
   * @param entry - Package journal entry
   * @returns Entry ID
   */
  public async writePackageJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'entryType'>
  ): Promise<string> {
    if (!this.journalEnabled) {
      throw new Error('Journal is not enabled');
    }

    return this.nodeJournal.writeEntry({
      ...entry,
      entryType: 'package',
    });
  }

  /**
   * Write a provisioning journal entry
   *
   * @param entry - Provisioning journal entry
   * @returns Entry ID
   */
  public async writeProvisioningJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'entryType'>
  ): Promise<string> {
    if (!this.journalEnabled) {
      throw new Error('Journal is not enabled');
    }

    return this.nodeJournal.writeEntry({
      ...entry,
      entryType: 'provisioning',
    });
  }

  /**
   * Write an event journal entry
   *
   * @param entry - Event journal entry
   * @returns Entry ID
   */
  public async writeEventJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'entryType'>
  ): Promise<string> {
    if (!this.journalEnabled) {
      throw new Error('Journal is not enabled');
    }

    return this.nodeJournal.writeEntry({
      ...entry,
      entryType: 'event',
    });
  }

  /**
   * Get node journal
   *
   * @param nodeId - Node identifier
   * @param options - Query options
   * @returns Array of journal entries
   */
  public async getNodeJournal(
    nodeId: string,
    options?: {
      entryTypes?: JournalEntry['entryType'][];
      limit?: number;
    }
  ): Promise<JournalEntry[]> {
    if (!this.journalEnabled) {
      return [];
    }

    return this.nodeJournal.getNodeJournal(nodeId, options);
  }

  /**
   * Get journal entries by execution ID
   *
   * @param executionId - Execution identifier
   * @returns Array of journal entries
   */
  public async getJournalByExecution(executionId: string): Promise<JournalEntry[]> {
    if (!this.journalEnabled) {
      return [];
    }

    return this.nodeJournal.getEntriesByExecution(executionId);
  }

  /**
   * Initialize the journal service
   */
  public async initializeJournal(): Promise<void> {
    if (this.journalEnabled) {
      await this.nodeJournal.initialize();
    }
  }
}
