import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { ExecutionQueue, QueuedExecution } from "./ExecutionQueue";
import type { ExecutionRepository, NodeResult } from "../database/ExecutionRepository";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { RequestIdempotencyService } from "./RequestIdempotencyService";
import { LoggerService } from "./LoggerService";

/**
 * Database row type for batch_executions table
 */
interface BatchExecutionRow {
  id: string;
  type: string;
  action: string;
  parameters: string | null;
  target_nodes: string;
  target_groups: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  user_id: string;
  execution_ids: string;
  stats_total: number;
  stats_queued: number;
  stats_running: number;
  stats_success: number;
  stats_failed: number;
  cancellation_requested_at: string | null;
}

/**
 * Database row type for executions table (batch query)
 */
interface ExecutionRow {
  id: string;
  type: string;
  target_nodes: string;
  action: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  cancellation_requested_at: string | null;
  error: string | null;
  results: string | null;
  stdout: string | null;
  stderr: string | null;
  batch_id: string | null;
  batch_position: number | null;
}

/**
 * Database row type for execution status queries
 */
interface ExecutionStatusRow {
  status: string;
  started_at: string | null;
}

/**
 * Request body for batch execution creation
 */
export interface BatchExecutionRequest {
  /** Array of node IDs to target */
  targetNodeIds?: string[];

  /** Array of group IDs to target */
  targetGroupIds?: string[];

  /** Type of action */
  type: "command" | "task" | "plan";

  /** Action name or command string */
  action: string;

  /** Action parameters */
  parameters?: Record<string, unknown>;

  /** Execution tool (bolt, ansible, ssh) - defaults to bolt if not specified */
  tool?: "bolt" | "ansible" | "ssh";
}

/**
 * Response from batch execution creation
 */
export interface BatchExecutionResponse {
  /** Batch execution ID */
  batchId: string;

  /** Array of created execution IDs */
  executionIds: string[];

  /** Total number of targets */
  targetCount: number;

  /** Expanded node IDs (after group expansion) */
  expandedNodeIds: string[];
}

/**
 * Batch execution record grouping multiple node executions
 */
export interface BatchExecution {
  /** Unique identifier for the batch */
  id: string;

  /** Type of action executed */
  type: "command" | "task" | "plan";

  /** Action name or command string */
  action: string;

  /** Action parameters (JSON) */
  parameters?: Record<string, unknown>;

  /** Array of target node IDs */
  targetNodes: string[];

  /** Array of target group IDs (before expansion) */
  targetGroups: string[];

  /** Overall batch status */
  status: "queued" | "running" | "success" | "failed" | "partial" | "cancelled" | "interrupted";
  cancellationRequestedAt?: Date;

  /** Timestamp when batch was created */
  createdAt: Date;

  /** Timestamp when first execution started */
  startedAt?: Date;

  /** Timestamp when last execution completed */
  completedAt?: Date;

  /** User who initiated the batch */
  userId: string;

  /** Array of individual execution IDs */
  executionIds: string[];

  /** Aggregated statistics */
  stats: {
    total: number;
    queued: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
    interrupted: number;
  };
}

/**
 * Response from batch status query
 */
export interface BatchStatusResponse {
  /** Batch execution details */
  batch: BatchExecution;

  /** Individual execution details */
  executions: {
    id: string;
    nodeId: string;
    nodeName: string;
    status: string;
    cancellationRequestedAt?: Date;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    result?: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
  }[];

  /** Progress percentage (0-100) */
  progress: number;
}

/**
 * Service for managing batch executions across multiple nodes
 *
 * This service handles:
 * - Creating batch execution records
 * - Expanding groups to individual nodes
 * - Enqueueing executions via ExecutionQueue
 * - Aggregating batch status
 * - Cancelling batch executions
 *
 * **Validates: Requirements 5.1, 7.1**
 */
export class BatchLifecycleError extends Error {
  constructor(message: string) { super(message); this.name = "BatchLifecycleError"; }
}

/** Idempotency context for one batch submission, from the route that owns it. */
export interface BatchIdempotency {
  service: RequestIdempotencyService;

  /** Validated client-supplied key. */
  key: string;

  /** Route identity the key is scoped to. */
  scope: string;

  /** Fingerprint of the normalised request. */
  fingerprint: string;

  /** Status the route answers with, stored so every replay matches the first. */
  status: number;
}

export interface BatchCancellation {
  cancelledCount: number;
  runningCount: number;
}

export function summarizeBatch(rows: { status: string }[], cancellationRequestedAt?: string | null): {
  stats: BatchExecution["stats"]; status: BatchExecution["status"]; progress: number;
} {
  const count = (status: string): number => rows.filter(row => row.status === status).length;
  const stats = { total: rows.length, queued: count("queued"), running: count("running"),
    success: count("success"), failed: count("failed") + count("partial"),
    cancelled: count("cancelled"), interrupted: count("interrupted") };
  let status: BatchExecution["status"];
  if (stats.running) status = "running";
  else if (stats.queued) status = "queued";
  else if (stats.interrupted) status = "interrupted";
  else if (cancellationRequestedAt || stats.cancelled) status = "cancelled";
  else if (stats.success === stats.total) status = "success";
  else if (count("failed") === stats.total) status = "failed";
  else status = "partial";
  return { stats, status, progress: stats.total ? Math.round(100 * (stats.total - stats.queued - stats.running) / stats.total) : 0 };
}

export class BatchExecutionService {
  private readonly logger = new LoggerService();
  private readonly pending = new Set<Promise<void>>();
  private readonly admissions = new Set<Promise<unknown>>();
  private stopping = false;

  constructor(
    private db: DatabaseAdapter,
    private executionQueue: ExecutionQueue,
    private executionRepository: ExecutionRepository,
    private integrationManager: IntegrationManager,
  ) {}

  /**
   * Create a batch execution
   *
   * Expands groups to nodes, validates targets, creates batch and individual
   * execution records, and enqueues all executions.
   *
   * When `idempotency` is supplied, the key is claimed in the same transaction
   * as the batch. A replayed submission returns the identifiers the first one
   * was given and dispatches nothing, so a lost response cannot run the action
   * twice. Identifiers are generated before the transaction precisely so the
   * promised response is known when the key is claimed.
   *
   * **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7**
   *
   * @param request - Batch execution request
   * @param userId - User initiating the batch
   * @param idempotency - Key and request fingerprint for a replayable submission
   * @returns Batch execution response with IDs and target count
   * @throws IdempotencyConflictError if the key names a different request
   */
  async createBatch(
    request: BatchExecutionRequest,
    userId: string,
    idempotency?: BatchIdempotency,
  ): Promise<BatchExecutionResponse> {
    const groupNodeIds = await this.expandGroups(request.targetGroupIds ?? []);
    const allNodeIds = this.deduplicateNodes([...(request.targetNodeIds ?? []), ...groupNodeIds]);
    if (allNodeIds.length === 0) throw new BatchLifecycleError("Invalid node IDs: batch has no targets");
    await this.validateNodes(allNodeIds);
    if (this.isStopping()) throw new BatchLifecycleError("Batch admission is stopped");

    const batchId = randomUUID();
    const createdAt = new Date().toISOString();
    const entries: QueuedExecution[] = allNodeIds.map(nodeId => ({
      id: randomUUID(), nodeId, type: request.type, action: request.action, enqueuedAt: new Date(createdAt),
    }));
    const executionIds = entries.map(entry => entry.id);
    const response: BatchExecutionResponse = {
      batchId, executionIds, targetCount: allNodeIds.length, expandedNodeIds: allNodeIds,
    };
    this.executionQueue.reserve(entries);
    const admission = this.db.withTransaction(async () => {
      if (this.isStopping()) throw new BatchLifecycleError("Batch admission is stopped");
      if (idempotency) {
        const outcome = await idempotency.service.claim(
          { userId, key: idempotency.key, scope: idempotency.scope, fingerprint: idempotency.fingerprint },
          { status: idempotency.status, body: response },
        );
        if (!outcome.claimed) return outcome.replay.body as BatchExecutionResponse;
      }
      await this.db.execute(`INSERT INTO batch_executions (
        id, type, action, parameters, target_nodes, target_groups, status, created_at,
        user_id, execution_ids, stats_total, stats_queued, stats_running, stats_success, stats_failed
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, 0, 0, 0)`, [
        batchId, request.type, request.action, request.parameters ? JSON.stringify(request.parameters) : null,
        JSON.stringify(allNodeIds), JSON.stringify(request.targetGroupIds ?? []), createdAt, userId,
        JSON.stringify(executionIds), entries.length, entries.length,
      ]);
      for (const [position, entry] of entries.entries()) {
        await this.executionRepository.create({
          type: request.type, targetNodes: [entry.nodeId], action: request.action, parameters: request.parameters,
          status: "queued", createdAt, results: [], executionTool: request.tool ?? "bolt",
          batchId, batchPosition: position, userId,
        }, entry.id);
      }
      return undefined;
    });
    this.admissions.add(admission);
    let replay: BatchExecutionResponse | undefined;
    try {
      replay = await admission;
    } catch (error) {
      this.executionQueue.releaseReservations(executionIds);
      throw error;
    } finally {
      this.admissions.delete(admission);
    }

    // A replayed submission dispatches nothing and owns no capacity: the
    // original admission already holds both, and releasing the reservations
    // this call made is what keeps a retried submission from leaking slots.
    if (replay) {
      this.executionQueue.releaseReservations(executionIds);
      return replay;
    }

    // Schedule outside the transaction and HTTP admission path. All records now exist.
    setImmediate(() => {
      for (const entry of entries) {
        const work = this.executeAction(batchId, entry, request);
        this.pending.add(work);
        void work.catch((error: unknown) => {
          this.logger.error("Batch worker failed; persisted state requires reconciliation", {
            component: "BatchExecutionService", operation: "executeAction", metadata: { batchId, executionId: entry.id },
          }, error instanceof Error ? error : undefined);
        }).finally(() => this.pending.delete(work));
      }
    });
    return response;
  }

  /**
   * Get batch execution status
   *
   * Fetches batch details and aggregates status from all individual executions.
   * Supports optional status filtering.
   *
   * **Validates: Requirements 6.2, 6.3, 6.4, 6.8**
   *
   * @param batchId - Batch execution ID
   * @param statusFilter - Optional status filter for executions
   * @returns Batch status with aggregated statistics
   * @throws Error if batch ID does not exist
   */
  async getBatchStatus(
    batchId: string,
    statusFilter?: string
  ): Promise<BatchStatusResponse> {
    const logger = new LoggerService();

    const { batchRow, allRows } = await this.db.withTransaction(async () => {
      const batchRow = await this.lockBatch(batchId);
      const allRows = await this.db.query<ExecutionRow>(
        "SELECT * FROM executions WHERE batch_id = ? ORDER BY batch_position ASC", [batchId],
      );
      return { batchRow, allRows };
    });
    const executionRows = statusFilter ? allRows.filter(row => row.status === statusFilter) : allRows;

    // Step 3: Get node names from inventory
    const inventory = await this.integrationManager.getAggregatedInventory();
    const nodeMap = new Map(inventory.nodes.map(n => [n.id, n.name]));

    // Step 4: Map execution rows to response format
    const executions = executionRows.map(row => {
      const nodeId = (JSON.parse(row.target_nodes) as string[])[0]; // Get first node ID
      const nodeName = nodeMap.get(nodeId) ?? nodeId;

      // Parse results if available
      let result: { exitCode?: number; stdout?: string; stderr?: string } | undefined = undefined;
      if (row.results) {
        try {
          const results = JSON.parse(row.results) as NodeResult[];
          if (results.length > 0) {
            const nodeResult = results[0];
            result = {
              exitCode: nodeResult.output?.exitCode,
              stdout: nodeResult.output?.stdout ?? row.stdout ?? undefined,
              stderr: nodeResult.output?.stderr ?? row.stderr ?? undefined,
            };
          }
        } catch {
          logger.warn(`Failed to parse results for execution ${row.id}`);
        }
      }

      // Calculate duration if completed
      let duration: number | undefined;
      if (row.started_at && row.completed_at) {
        const startTime = new Date(row.started_at).getTime();
        const endTime = new Date(row.completed_at).getTime();
        duration = endTime - startTime;
      }

      return {
        id: row.id,
        nodeId,
        nodeName,
        status: row.status,
        cancellationRequestedAt: row.cancellation_requested_at ? new Date(row.cancellation_requested_at) : undefined,
        error: row.error ?? undefined,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        duration,
        result,
      };
    });

    const { stats, status: batchStatus, progress } = summarizeBatch(allRows, batchRow.cancellation_requested_at);

    // Step 8: Build batch execution object
    const batch: BatchExecution = {
      id: batchRow.id,
      type: batchRow.type as "command" | "task" | "plan",
      action: batchRow.action,
      parameters: batchRow.parameters ? JSON.parse(batchRow.parameters) as Record<string, unknown> : undefined,
      targetNodes: JSON.parse(batchRow.target_nodes) as string[],
      targetGroups: JSON.parse(batchRow.target_groups) as string[],
      status: batchStatus,
      cancellationRequestedAt: batchRow.cancellation_requested_at ? new Date(batchRow.cancellation_requested_at) : undefined,
      createdAt: new Date(batchRow.created_at),
      startedAt: batchRow.started_at ? new Date(batchRow.started_at) : undefined,
      completedAt: batchRow.completed_at ? new Date(batchRow.completed_at) : undefined,
      userId: batchRow.user_id,
      executionIds: JSON.parse(batchRow.execution_ids) as string[],
      stats,
    };

    logger.info(
      `Fetched batch status for ${batchId}: ${String(stats.success)}/${String(stats.total)} success, ${String(stats.failed)}/${String(stats.total)} failed, ${String(progress)}% complete`
    );

    return {
      batch,
      executions,
      progress,
    };
  }

  /**
   * Cancel a batch execution
   *
   * Cancels queued executions and records requests for dispatched work.
   *
   * @param batchId - Batch execution ID
   * @returns Count of cancelled executions
   */
  async cancelBatch(batchId: string): Promise<BatchCancellation> {
    return this.cancelTargets(batchId);
  }

  async cancelExecution(executionId: string, batchId: string): Promise<BatchCancellation> {
    return this.cancelTargets(batchId, executionId);
  }

  private async cancelTargets(batchId: string, executionId?: string): Promise<BatchCancellation> {
    const result = await this.db.withTransaction(async () => {
      await this.lockBatch(batchId);
      const rows = await this.db.query<{ id: string; status: string }>(
        `SELECT id, status FROM executions WHERE batch_id = ? AND status IN ('queued', 'running')${executionId ? ' AND id = ?' : ''}`,
        executionId ? [batchId, executionId] : [batchId],
      );
      const now = new Date().toISOString();
      for (const row of rows) {
        if (row.status === "queued") {
          await this.db.execute(`UPDATE executions SET status = 'cancelled', completed_at = ?,
            cancellation_requested_at = COALESCE(cancellation_requested_at, ?), error = 'Cancelled before dispatch'
            WHERE id = ? AND status = 'queued'`, [now, now, row.id]);
        } else {
          await this.db.execute(`UPDATE executions SET cancellation_requested_at = COALESCE(cancellation_requested_at, ?)
            WHERE id = ? AND status = 'running'`, [now, row.id]);
        }
      }
      if (rows.length) {
        await this.db.execute(`UPDATE batch_executions SET cancellation_requested_at = COALESCE(cancellation_requested_at, ?)
          WHERE id = ?`, [now, batchId]);
      }
      await this.updateBatchStatus(batchId);
      return {
        cancelledIds: rows.filter(row => row.status === "queued").map(row => row.id),
        runningCount: rows.filter(row => row.status === "running").length,
      };
    });
    for (const id of result.cancelledIds) this.executionQueue.cancel(id);
    return { cancelledCount: result.cancelledIds.length, runningCount: result.runningCount };
  }

  private async lockBatch(batchId: string): Promise<BatchExecutionRow> {
    const row = await this.db.queryOne<BatchExecutionRow>(
      `SELECT * FROM batch_executions WHERE id = ?${this.db.getDialect() === "postgres" ? " FOR UPDATE" : ""}`, [batchId],
    );
    if (!row) throw new BatchLifecycleError(`Batch execution ${batchId} not found`);
    return row;
  }

  /** Caller holds the parent lock so status and counts commit with child transitions. */
  private async updateBatchStatus(batchId: string): Promise<void> {
    const batch = await this.db.queryOne<BatchExecutionRow>("SELECT * FROM batch_executions WHERE id = ?", [batchId]);
    if (!batch) throw new BatchLifecycleError(`Batch execution ${batchId} not found`);
    const rows = await this.db.query<ExecutionStatusRow>("SELECT status, started_at FROM executions WHERE batch_id = ?", [batchId]);
    const { stats, status } = summarizeBatch(rows, batch.cancellation_requested_at);
    const startedAt = rows.map(row => row.started_at).filter((value): value is string => Boolean(value)).sort().at(0);
    const terminal = stats.running + stats.queued === 0;
    await this.db.execute(`UPDATE batch_executions SET status = ?, started_at = ?, completed_at = ?,
      stats_total = ?, stats_queued = ?, stats_running = ?, stats_success = ?, stats_failed = ?, stats_cancelled = ?, stats_interrupted = ?
      WHERE id = ?`, [status, startedAt ?? null, terminal ? batch.completed_at ?? new Date().toISOString() : null,
      stats.total, stats.queued, stats.running, stats.success, stats.failed, stats.cancelled, stats.interrupted, batchId]);
  }

  private isStopping(): boolean { return this.stopping; }

  stopAdmission(): void {
    this.stopping = true;
    this.executionQueue.clearQueue();
  }

  /** Single-process startup/shutdown reconciliation never replays uncertain provider work. */
  async reconcileInterrupted(): Promise<number> {
    if (this.pending.size && !this.stopping) throw new BatchLifecycleError("Cannot reconcile live batch workers");
    await Promise.allSettled(this.admissions);
    return this.db.withTransaction(async () => {
      const batches = await this.db.query<{ id: string }>("SELECT id FROM batch_executions WHERE status IN ('queued', 'running') OR id IN (SELECT batch_id FROM executions WHERE status IN ('queued', 'running')) ORDER BY id");
      for (const batch of batches) await this.lockBatch(batch.id);
      const now = new Date().toISOString();
      const changed = await this.db.execute(`UPDATE executions SET
        error = CASE WHEN status = 'queued' THEN 'Process stopped before dispatch; execution was not replayed'
          ELSE 'Process stopped after dispatch; provider outcome is unknown. Verify provider state before retrying' END,
        status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'interrupted' END, completed_at = ?
        WHERE batch_id IS NOT NULL AND status IN ('queued', 'running')`, [now]);
      for (const batch of batches) await this.updateBatchStatus(batch.id);
      return changed.changes;
    });
  }

  /**
   * Expand group IDs to node IDs
   *
   * Queries the integration manager to get all nodes in the specified groups.
   * Handles linked groups (groups that exist in multiple sources) and logs
   * warnings for missing groups while continuing to process remaining groups.
   *
   * **Validates: Requirements 7.2, 7.3, 7.4, 7.6**
   *
   * @param groupIds - Array of group IDs to expand
   * @returns Array of node IDs from all groups
   */
  private async expandGroups(groupIds: string[]): Promise<string[]> {
    const logger = new LoggerService();
    const nodeIds: string[] = [];

    for (const groupId of groupIds) {
      try {
        // Fetch aggregated inventory from integration manager
        const inventory =
          await this.integrationManager.getAggregatedInventory();

        // Find the group by ID
        const group = inventory.groups.find((g) => g.id === groupId);

        if (!group) {
          logger.warn(`Group ${groupId} not found in inventory, skipping`);
          continue;
        }

        // Add all node IDs from the group
        // This handles linked groups automatically as the group.nodes array
        // contains all nodes from all sources where the group exists
        nodeIds.push(...group.nodes);

        logger.info(
          `Expanded group ${groupId} (${group.name}) to ${String(group.nodes.length)} nodes`,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to expand group ${groupId}:`, {
          component: "BatchExecutionService",
        }, error instanceof Error ? error : new Error(errorMessage));
        // Continue with other groups instead of failing the entire operation
      }
    }

    return nodeIds;
  }

  /**
   * Deduplicate node IDs
   *
   * Removes duplicate node IDs from the array using a Set.
   *
   * **Validates: Requirements 7.5**
   *
   * @param nodeIds - Array of node IDs potentially with duplicates
   * @returns Deduplicated array of node IDs
   */
  private deduplicateNodes(nodeIds: string[]): string[] {
    return [...new Set(nodeIds)];
  }

  /**
   * Validate target nodes exist
   *
   * Checks that all node IDs exist in the inventory system by fetching
   * the aggregated inventory and verifying each node ID is present.
   *
   * **Validates: Requirements 7.8, 7.10**
   *
   * @param nodeIds - Array of node IDs to validate
   * @throws Error if any node IDs are invalid, listing the invalid IDs
   */
  private async validateNodes(nodeIds: string[]): Promise<void> {
    const logger = new LoggerService();

    // Fetch aggregated inventory from integration manager
    const inventory = await this.integrationManager.getAggregatedInventory();

    // Create a Set of valid node IDs for efficient lookup
    const validNodeIds = new Set(inventory.nodes.map((n) => n.id));

    // Find any invalid node IDs
    const invalidIds = nodeIds.filter((id) => !validNodeIds.has(id));

    if (invalidIds.length > 0) {
      const errorMessage = `Invalid node IDs: ${invalidIds.join(", ")}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    logger.info(`Validated ${String(nodeIds.length)} node IDs successfully`);
  }

  /**
   * Execute action for a single node in a batch
   *
   * This method executes the action asynchronously after acquiring a queue slot.
   * It updates the execution record with results and releases the queue slot when complete.
   *
   * @param executionId - Execution record ID
   * @param nodeId - Target node ID
   * @param request - Batch execution request containing action details
   */
  private async executeAction(batchId: string, entry: QueuedExecution, request: BatchExecutionRequest): Promise<void> {
    try {
      if (this.isStopping()) return;
      await this.executionQueue.acquire(entry);
      if (this.isStopping()) return;
      const claimed = await this.db.withTransaction(async () => {
        await this.lockBatch(batchId);
        if (this.isStopping()) return false;
        const result = await this.db.execute(`UPDATE executions SET status = 'running', started_at = ?
          WHERE id = ? AND status = 'queued'`, [new Date().toISOString(), entry.id]);
        await this.updateBatchStatus(batchId);
        return result.changes === 1;
      });
      if (!claimed || this.isStopping()) return;
      const result = await this.integrationManager.executeAction(request.tool ?? "bolt", {
        type: request.type, target: entry.nodeId, action: request.action, parameters: request.parameters,
      });
      if (this.isStopping()) return;
      if (!["success", "failed", "partial"].includes(result.status)) {
        throw new BatchLifecycleError("Provider returned without a terminal outcome");
      }
      await this.db.withTransaction(async () => {
        await this.lockBatch(batchId);
        const record = await this.executionRepository.findById(entry.id);
        if (record?.status !== "running") return;
        await this.executionRepository.update(entry.id, {
          status: result.status, completedAt: result.completedAt ?? new Date().toISOString(),
          results: result.results, error: result.error, command: result.command,
        });
        await this.updateBatchStatus(batchId);
      });
    } catch (error) {
      if (!this.isStopping()) {
        await this.db.withTransaction(async () => {
          await this.lockBatch(batchId);
          await this.db.execute(`UPDATE executions SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'interrupted' END,
            completed_at = ?, error = ? WHERE id = ? AND status IN ('queued', 'running')`,
          [new Date().toISOString(), error instanceof Error ? error.message : "Unknown execution outcome", entry.id]);
          await this.updateBatchStatus(batchId);
        });
      }
    } finally {
      this.executionQueue.releaseReservations([entry.id]);
      this.executionQueue.release(entry.id);
    }
  }
}
