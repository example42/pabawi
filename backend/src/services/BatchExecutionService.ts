import type sqlite3 from "sqlite3";
import type { ExecutionQueue } from "./ExecutionQueue";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { LoggerService } from "./LoggerService";

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
  status: "running" | "success" | "failed" | "partial" | "cancelled";

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
  };
}

/**
 * Response from batch status query
 */
export interface BatchStatusResponse {
  /** Batch execution details */
  batch: BatchExecution;

  /** Individual execution details */
  executions: Array<{
    id: string;
    nodeId: string;
    nodeName: string;
    status: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
    result?: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    };
  }>;

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
export class BatchExecutionService {
  constructor(
    private db: sqlite3.Database,
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
   * **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7**
   *
   * @param request - Batch execution request
   * @param userId - User initiating the batch
   * @returns Batch execution response with IDs and target count
   */
  async createBatch(
    request: BatchExecutionRequest,
    userId: string,
  ): Promise<BatchExecutionResponse> {
    const logger = new LoggerService();
    const { randomUUID } = await import("crypto");

    // Step 1: Expand groups and deduplicate nodes
    const groupNodeIds = await this.expandGroups(request.targetGroupIds || []);
    const allNodeIds = this.deduplicateNodes([
      ...(request.targetNodeIds || []),
      ...groupNodeIds,
    ]);

    logger.info(
      `Creating batch execution for ${allNodeIds.length} targets (${request.targetNodeIds?.length || 0} direct nodes + ${groupNodeIds.length} from groups)`,
    );

    // Step 2: Validate all nodes exist
    await this.validateNodes(allNodeIds);

    // Step 3: Generate batch ID
    const batchId = randomUUID();
    const executionIds: string[] = [];
    const createdAt = new Date().toISOString();

    // Step 4: Create individual execution records for each target node
    for (let i = 0; i < allNodeIds.length; i++) {
      const nodeId = allNodeIds[i];

      // Create execution record with batch tracking
      const executionId = await this.executionRepository.create({
        type: request.type,
        targetNodes: [nodeId],
        action: request.action,
        parameters: request.parameters,
        status: "running",
        startedAt: createdAt,
        results: [],
        batchId,
        batchPosition: i,
      });

      executionIds.push(executionId);

      // Step 5: Enqueue execution through ExecutionQueue
      try {
        await this.executionQueue.acquire({
          id: executionId,
          type: request.type,
          nodeId,
          action: request.action,
          enqueuedAt: new Date(),
        });
      } catch (error) {
        // Handle queue capacity errors
        if (error instanceof Error && error.name === "ExecutionQueueFullError") {
          logger.error(
            `Execution queue is full while creating batch ${batchId}`,
            { component: "BatchExecutionService" },
            new Error(error.message),
          );
          throw new Error(
            `Failed to enqueue execution for node ${nodeId}: ${error.message}`,
          );
        }
        throw error;
      }
    }

    // Step 6: Create batch execution record in database
    const sql = `
      INSERT INTO batch_executions (
        id, type, action, parameters, target_nodes, target_groups,
        status, created_at, started_at, user_id, execution_ids,
        stats_total, stats_queued, stats_running, stats_success, stats_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      batchId,
      request.type,
      request.action,
      request.parameters ? JSON.stringify(request.parameters) : null,
      JSON.stringify(allNodeIds),
      JSON.stringify(request.targetGroupIds || []),
      "running",
      createdAt,
      createdAt,
      userId,
      JSON.stringify(executionIds),
      allNodeIds.length,
      allNodeIds.length,
      0,
      0,
      0,
    ];

    await new Promise<void>((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          logger.error(`Failed to create batch execution record: ${err.message}`);
          reject(new Error(`Failed to create batch execution: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    logger.info(
      `Created batch execution ${batchId} with ${executionIds.length} executions`,
    );

    // Step 7: Return batch execution response
    return {
      batchId,
      executionIds,
      targetCount: allNodeIds.length,
      expandedNodeIds: allNodeIds,
    };
  }

  /**
   * Get batch execution status
   *
   * Fetches batch details and aggregates status from all individual executions.
   *
   * @param batchId - Batch execution ID
   * @returns Batch status with aggregated statistics
   */
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

      // Step 1: Fetch batch execution record
      const batchSql = "SELECT * FROM batch_executions WHERE id = ?";
      const batchRow = await new Promise<any>((resolve, reject) => {
        this.db.get(batchSql, [batchId], (err, row) => {
          if (err) {
            logger.error(`Failed to fetch batch execution: ${err.message}`);
            reject(new Error(`Failed to fetch batch execution: ${err.message}`));
          } else {
            resolve(row);
          }
        });
      });

      if (!batchRow) {
        throw new Error(`Batch execution ${batchId} not found`);
      }

      // Step 2: Fetch all executions for this batch
      let executionsSql = "SELECT * FROM executions WHERE batch_id = ? ORDER BY batch_position ASC";
      const executionsParams: any[] = [batchId];

      // Apply status filter if provided
      if (statusFilter) {
        executionsSql = "SELECT * FROM executions WHERE batch_id = ? AND status = ? ORDER BY batch_position ASC";
        executionsParams.push(statusFilter);
      }

      const executionRows = await new Promise<any[]>((resolve, reject) => {
        this.db.all(executionsSql, executionsParams, (err, rows) => {
          if (err) {
            logger.error(`Failed to fetch executions for batch: ${err.message}`);
            reject(new Error(`Failed to fetch executions: ${err.message}`));
          } else {
            resolve(rows || []);
          }
        });
      });

      // Step 3: Get node names from inventory
      const inventory = await this.integrationManager.getAggregatedInventory();
      const nodeMap = new Map(inventory.nodes.map(n => [n.id, n.name]));

      // Step 4: Map execution rows to response format
      const executions = executionRows.map(row => {
        const nodeId = JSON.parse(row.target_nodes)[0]; // Get first node ID
        const nodeName = nodeMap.get(nodeId) || nodeId;

        // Parse results if available
        let result: any = undefined;
        if (row.results) {
          try {
            const results = JSON.parse(row.results);
            if (results.length > 0) {
              const nodeResult = results[0];
              result = {
                exitCode: nodeResult.output?.exitCode,
                stdout: nodeResult.output?.stdout || row.stdout,
                stderr: nodeResult.output?.stderr || row.stderr,
              };
            }
          } catch (error) {
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
          startedAt: row.started_at ? new Date(row.started_at) : undefined,
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          duration,
          result,
        };
      });

      // Step 5: Aggregate statistics from all executions (not filtered)
      const allExecutionsSql = "SELECT status FROM executions WHERE batch_id = ?";
      const allExecutionRows = await new Promise<any[]>((resolve, reject) => {
        this.db.all(allExecutionsSql, [batchId], (err, rows) => {
          if (err) {
            logger.error(`Failed to fetch all executions for stats: ${err.message}`);
            reject(new Error(`Failed to fetch executions: ${err.message}`));
          } else {
            resolve(rows || []);
          }
        });
      });

      const stats = {
        total: allExecutionRows.length,
        queued: allExecutionRows.filter(r => r.status === "running" && !r.started_at).length,
        running: allExecutionRows.filter(r => r.status === "running").length,
        success: allExecutionRows.filter(r => r.status === "success").length,
        failed: allExecutionRows.filter(r => r.status === "failed").length,
      };

      // Step 6: Calculate progress percentage
      const completedCount = stats.success + stats.failed;
      const progress = stats.total > 0 ? Math.round((completedCount / stats.total) * 100) : 0;

      // Step 7: Determine batch status
      let batchStatus: "running" | "success" | "failed" | "partial" | "cancelled" = "running";
      if (completedCount === stats.total) {
        if (stats.success === stats.total) {
          batchStatus = "success";
        } else if (stats.failed === stats.total) {
          batchStatus = "failed";
        } else {
          batchStatus = "partial";
        }
      }

      // Step 8: Build batch execution object
      const batch = {
        id: batchRow.id,
        type: batchRow.type as "command" | "task" | "plan",
        action: batchRow.action,
        parameters: batchRow.parameters ? JSON.parse(batchRow.parameters) : undefined,
        targetNodes: JSON.parse(batchRow.target_nodes),
        targetGroups: JSON.parse(batchRow.target_groups),
        status: batchStatus,
        createdAt: new Date(batchRow.created_at),
        startedAt: batchRow.started_at ? new Date(batchRow.started_at) : undefined,
        completedAt: batchRow.completed_at ? new Date(batchRow.completed_at) : undefined,
        userId: batchRow.user_id,
        executionIds: JSON.parse(batchRow.execution_ids),
        stats,
      };

      logger.info(
        `Fetched batch status for ${batchId}: ${stats.success}/${stats.total} success, ${stats.failed}/${stats.total} failed, ${progress}% complete`
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
   * Cancels all queued and running executions in the batch.
   *
   * @param batchId - Batch execution ID
   * @returns Count of cancelled executions
   */
  async cancelBatch(batchId: string): Promise<{ cancelledCount: number }> {
    const logger = new LoggerService();

    // Step 1: Verify batch exists
    const batchSql = "SELECT * FROM batch_executions WHERE id = ?";
    const batchRow = await new Promise<any>((resolve, reject) => {
      this.db.get(batchSql, [batchId], (err, row) => {
        if (err) {
          logger.error(`Failed to fetch batch execution: ${err.message}`);
          reject(new Error(`Failed to fetch batch execution: ${err.message}`));
        } else {
          resolve(row);
        }
      });
    });

    if (!batchRow) {
      throw new Error(`Batch execution ${batchId} not found`);
    }

    // Step 2: Cancel queued and running executions
    const cancelSql = `
      UPDATE executions
      SET status = 'failed', error = 'Cancelled by user', completed_at = ?
      WHERE batch_id = ? AND status = 'running'
    `;

    const cancelledCount = await new Promise<number>((resolve, reject) => {
      this.db.run(cancelSql, [new Date().toISOString(), batchId], function(err) {
        if (err) {
          logger.error(`Failed to cancel executions: ${err.message}`);
          reject(new Error(`Failed to cancel executions: ${err.message}`));
        } else {
          resolve(this.changes);
        }
      });
    });

    // Step 3: Update batch status to cancelled
    const updateBatchSql = `
      UPDATE batch_executions
      SET status = 'cancelled', completed_at = ?
      WHERE id = ?
    `;

    await new Promise<void>((resolve, reject) => {
      this.db.run(updateBatchSql, [new Date().toISOString(), batchId], (err) => {
        if (err) {
          logger.error(`Failed to update batch status: ${err.message}`);
          reject(new Error(`Failed to update batch status: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    logger.info(`Cancelled batch ${batchId}: ${cancelledCount} executions cancelled`);

    return { cancelledCount };
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
          `Expanded group ${groupId} (${group.name}) to ${group.nodes.length} nodes`,
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

    logger.info(`Validated ${nodeIds.length} node IDs successfully`);
  }
}
