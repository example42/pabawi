import type sqlite3 from "sqlite3";
import { randomUUID } from "crypto";

/**
 * Database row type
 */
interface DbRow {
  id: string;
  type: string;
  target_nodes: string;
  action: string;
  parameters: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  results: string;
  error: string | null;
  command: string | null;
  expert_mode: number;
  original_execution_id: string | null;
  re_execution_count: number | null;
  stdout: string | null;
  stderr: string | null;
  execution_tool: string | null;
  total?: number;
  running?: number;
  success?: number;
  failed?: number;
  partial?: number;
}

/**
 * Execution types
 */
export type ExecutionType = "command" | "task" | "facts" | "puppet" | "package";

export type ExecutionTool = "bolt" | "ansible";

/**
 * Execution status
 */
export type ExecutionStatus = "running" | "success" | "failed" | "partial";

/**
 * Node execution result
 */
export interface NodeResult {
  nodeId: string;
  status: "success" | "failed";
  output?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  value?: unknown;
  error?: string;
  duration: number;
}

/**
 * Execution record stored in database
 */
export interface ExecutionRecord {
  id: string;
  type: ExecutionType;
  targetNodes: string[];
  action: string;
  parameters?: Record<string, unknown>;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  results: NodeResult[];
  error?: string;
  command?: string;
  expertMode?: boolean;
  originalExecutionId?: string;
  reExecutionCount?: number;
  stdout?: string;
  stderr?: string;
  executionTool?: ExecutionTool;
}

/**
 * Filters for querying executions
 */
export interface ExecutionFilters {
  type?: ExecutionType;
  status?: ExecutionStatus;
  targetNode?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Pagination parameters
 */
export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * Status counts for summary statistics
 */
export interface StatusCounts {
  total: number;
  running: number;
  success: number;
  failed: number;
  partial: number;
}

/**
 * Repository for managing execution records in SQLite
 */
export class ExecutionRepository {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  /**
   * Create a new execution record
   */
  public async create(execution: Omit<ExecutionRecord, "id">): Promise<string> {
    const id = randomUUID();
    const record: ExecutionRecord = {
      id,
      ...execution,
    };

    const sql = `
      INSERT INTO executions (
        id, type, target_nodes, action, parameters, status,
        started_at, completed_at, results, error, command, expert_mode,
        original_execution_id, re_execution_count, stdout, stderr, execution_tool
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      record.id,
      record.type,
      JSON.stringify(record.targetNodes),
      record.action,
      record.parameters ? JSON.stringify(record.parameters) : null,
      record.status,
      record.startedAt,
      record.completedAt ?? null,
      JSON.stringify(record.results),
      record.error ?? null,
      record.command ?? null,
      record.expertMode ? 1 : 0,
      record.originalExecutionId ?? null,
      record.reExecutionCount ?? 0,
      record.stdout ?? null,
      record.stderr ?? null,
      record.executionTool ?? "bolt",
    ];

    try {
      await this.run(sql, params);
      return id;
    } catch (error) {
      throw new Error(
        `Failed to create execution record: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Update an existing execution record
   */
  public async update(
    id: string,
    updates: Partial<ExecutionRecord>,
  ): Promise<void> {
    const allowedFields = [
      "status",
      "completedAt",
      "results",
      "error",
      "command",
      "expertMode",
      "originalExecutionId",
      "reExecutionCount",
      "stdout",
      "stderr",
      "executionTool",
    ];
    const updateFields: string[] = [];
    const params: unknown[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        const columnName = this.camelToSnake(key);
        updateFields.push(`${columnName} = ?`);

        if (key === "results" && value) {
          params.push(JSON.stringify(value));
        } else if (key === "expertMode") {
          params.push(value ? 1 : 0);
        } else if (key === "reExecutionCount") {
          params.push(value);
        } else {
          params.push(value || null);
        }
      }
    });

    if (updateFields.length === 0) {
      return;
    }

    params.push(id);
    const sql = `UPDATE executions SET ${updateFields.join(", ")} WHERE id = ?`;

    try {
      await this.run(sql, params);
    } catch (error) {
      // Provide detailed error information for debugging
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetails = {
        operation: "update",
        executionId: id,
        fields: Object.keys(updates),
        sqlError: errorMessage,
      };

      throw new Error(
        `Failed to update execution record: ${errorMessage} (Details: ${JSON.stringify(errorDetails)})`,
      );
    }
  }

  /**
   * Find execution by ID
   */
  public async findById(id: string): Promise<ExecutionRecord | null> {
    const sql = "SELECT * FROM executions WHERE id = ?";

    try {
      const row = await this.get(sql, [id]);
      return row ? this.mapRowToRecord(row) : null;
    } catch (error) {
      throw new Error(
        `Failed to find execution by ID: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Find all executions with optional filters and pagination
   */
  public async findAll(
    filters: ExecutionFilters = {},
    pagination: Pagination = { page: 1, pageSize: 50 },
  ): Promise<ExecutionRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }

    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    if (filters.targetNode) {
      conditions.push("target_nodes LIKE ?");
      params.push(`%"${filters.targetNode}"%`);
    }

    if (filters.startDate) {
      conditions.push("started_at >= ?");
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push("started_at <= ?");
      params.push(filters.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (pagination.page - 1) * pagination.pageSize;

    const sql = `
      SELECT * FROM executions
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(pagination.pageSize, offset);

    try {
      const rows = await this.all(sql, params);
      return rows.map((row) => this.mapRowToRecord(row));
    } catch (error) {
      throw new Error(
        `Failed to find executions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Find original execution for a re-execution
   * Returns the original execution if this execution has an originalExecutionId
   */
  public async findOriginalExecution(
    executionId: string,
  ): Promise<ExecutionRecord | null> {
    const sql = `
      SELECT original.* FROM executions original
      INNER JOIN executions reexec ON original.id = reexec.original_execution_id
      WHERE reexec.id = ?
    `;

    try {
      const row = await this.get(sql, [executionId]);
      return row ? this.mapRowToRecord(row) : null;
    } catch (error) {
      throw new Error(
        `Failed to find original execution: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Find all re-executions of an execution
   * Returns all executions that have this execution as their originalExecutionId
   */
  public async findReExecutions(
    originalExecutionId: string,
  ): Promise<ExecutionRecord[]> {
    const sql = `
      SELECT * FROM executions
      WHERE original_execution_id = ?
      ORDER BY started_at DESC
    `;

    try {
      const rows = await this.all(sql, [originalExecutionId]);
      return rows.map((row) => this.mapRowToRecord(row));
    } catch (error) {
      throw new Error(
        `Failed to find re-executions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Create a re-execution with reference to original execution
   * Increments the re-execution count on the original execution
   */
  public async createReExecution(
    originalExecutionId: string,
    execution: Omit<ExecutionRecord, "id" | "originalExecutionId">,
  ): Promise<string> {
    // First, verify the original execution exists
    const original = await this.findById(originalExecutionId);
    if (!original) {
      throw new Error(`Original execution not found: ${originalExecutionId}`);
    }

    // Create the new execution with reference to original
    const newExecutionId = await this.create({
      ...execution,
      originalExecutionId,
    });

    // Increment the re-execution count on the original
    const newCount = (original.reExecutionCount ?? 0) + 1;
    await this.update(originalExecutionId, {
      reExecutionCount: newCount,
    });

    return newExecutionId;
  }

  /**
   * Count executions by status
   */
  public async countByStatus(): Promise<StatusCounts> {
    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial
      FROM executions
    `;

    try {
      const row = await this.get(sql, []);
      return {
        total: row?.total ?? 0,
        running: row?.running ?? 0,
        success: row?.success ?? 0,
        failed: row?.failed ?? 0,
        partial: row?.partial ?? 0,
      };
    } catch (error) {
      throw new Error(
        `Failed to count executions by status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Execute SQL statement with parameters (INSERT, UPDATE, DELETE)
   */
  private run(sql: string, params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get single row from database
   */
  private get(sql: string, params: unknown[]): Promise<DbRow | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row: DbRow | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all rows from database
   */
  private all(sql: string, params: unknown[]): Promise<DbRow[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as DbRow[]);
        }
      });
    });
  }

  /**
   * Map database row to ExecutionRecord
   */
  private mapRowToRecord(row: DbRow): ExecutionRecord {
    return {
      id: row.id,
      type: row.type as ExecutionType,
      targetNodes: JSON.parse(row.target_nodes) as string[],
      action: row.action,
      parameters: row.parameters
        ? (JSON.parse(row.parameters) as Record<string, unknown>)
        : undefined,
      status: row.status as ExecutionStatus,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      results: JSON.parse(row.results) as NodeResult[],
      error: row.error ?? undefined,
      command: row.command ?? undefined,
      expertMode: row.expert_mode === 1,
      originalExecutionId: row.original_execution_id ?? undefined,
      reExecutionCount: row.re_execution_count ?? 0,
      stdout: row.stdout ?? undefined,
      stderr: row.stderr ?? undefined,
      executionTool:
        row.execution_tool === "ansible"
          ? "ansible"
          : "bolt",
    };
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
