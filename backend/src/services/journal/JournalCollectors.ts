import type { DatabaseAdapter } from "../../database/DatabaseAdapter";
import type { JournalEntry, JournalEventType, JournalSource } from "./types";
import type { Report } from "../../integrations/puppetdb/types";
import type { ExecutionRecord } from "../../database/ExecutionRepository";
import { LoggerService } from "../LoggerService";

/**
 * SSE event types for the journal stream protocol
 */
export type JournalStreamEvent =
  | { type: "init"; sources: string[] }
  | { type: "batch"; source: string; entries: JournalEntry[] }
  | { type: "source_error"; source: string; message: string }
  | { type: "complete" };

/**
 * Minimal interface for PuppetDB service to avoid circular deps
 */
export interface PuppetDBLike {
  isInitialized(): boolean;
  getNodeReports(nodeId: string, limit?: number, offset?: number): Promise<Report[]>;
  getAllReports?(limit?: number, offset?: number): Promise<Report[]>;
}

/**
 * Convert a Puppet report to a JournalEntry
 */
export function reportToJournalEntry(report: Report, nodeId: string): JournalEntry {
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const changedCount = report.metrics?.resources?.changed ?? 0;
  const failedCount = report.metrics?.resources?.failed ?? 0;
  const totalCount = report.metrics?.resources?.total ?? 0;
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  const summary = report.status === "changed"
    ? `Puppet run: ${String(changedCount)} resource${changedCount !== 1 ? "s" : ""} changed`
    : report.status === "failed"
      ? `Puppet run: failed (${String(failedCount)} resource${failedCount !== 1 ? "s" : ""} failed)`
      : `Puppet run: no changes (${String(totalCount)} resources)`;

  return {
    id: `puppetdb:report:${report.hash}`,
    nodeId,
    nodeUri: `puppetdb:${report.certname}`,
    eventType: "puppet_run",
    source: "puppetdb",
    action: report.noop ? "puppet agent run (noop)" : "puppet agent run",
    summary,
    details: {
      hash: report.hash,
      environment: report.environment,
      status: report.status,
      noop: report.noop,
      puppet_version: report.puppet_version,
      configuration_version: report.configuration_version,
      start_time: report.start_time,
      end_time: report.end_time,
      resources_total: totalCount,
      resources_changed: changedCount,
      resources_failed: failedCount,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      resources_skipped: report.metrics?.resources?.skipped ?? 0,
    },
    userId: undefined,
    timestamp: report.end_time || report.start_time,
    isLive: true,
  };
}

/**
 * Convert an execution record to a JournalEntry
 */
export function executionToJournalEntry(
  execution: ExecutionRecord,
  nodeId: string,
): JournalEntry {
  // Map execution type to journal event type
  const eventTypeMap: Record<string, JournalEntry["eventType"]> = {
    command: "command_execution",
    task: "task_execution",
    puppet: "puppet_run",
    package: "package_install",
    plan: "task_execution",
  };

  // Map execution tool to journal source
  const sourceMap: Record<string, JournalSource> = {
    bolt: "bolt",
    ansible: "ansible",
    ssh: "ssh",
  };

  const eventType = eventTypeMap[execution.type] ?? "unknown";
  const source: JournalSource = sourceMap[execution.executionTool ?? "bolt"] ?? "bolt";

  const nodeResult = execution.results.find((r) => r.nodeId === nodeId);
  const nodeStatus = nodeResult?.status ?? execution.status;

  let summary: string;
  if (execution.type === "command") {
    const cmd = execution.command ?? execution.action;
    const shortCmd = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
    summary = `Command: ${shortCmd} — ${nodeStatus}`;
  } else if (execution.type === "puppet") {
    summary = `Puppet agent run — ${nodeStatus}`;
  } else if (execution.type === "package") {
    summary = `Package install: ${execution.action} — ${nodeStatus}`;
  } else {
    summary = `${execution.type === "task" ? "Task" : "Plan"}: ${execution.action} — ${nodeStatus}`;
  }

  const duration =
    execution.completedAt && execution.startedAt
      ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
      : null;

  return {
    id: `execution:${execution.id}`,
    nodeId,
    nodeUri: nodeId,
    eventType,
    source,
    action: execution.action,
    summary,
    details: {
      executionId: execution.id,
      type: execution.type,
      status: execution.status,
      nodeStatus,
      command: execution.command,
      parameters: execution.parameters,
      stdout: nodeResult?.output?.stdout,
      stderr: nodeResult?.output?.stderr,
      exitCode: nodeResult?.output?.exitCode,
      error: nodeResult?.error ?? execution.error,
      durationMs: duration,
      executionTool: execution.executionTool,
    },
    userId: undefined,
    timestamp: execution.completedAt ?? execution.startedAt,
    isLive: true,
  };
}

/**
 * Fetch execution history for a node and convert to journal entries
 */
export async function collectExecutionEntries(
  db: DatabaseAdapter,
  nodeId: string,
  limit = 50,
): Promise<JournalEntry[]> {
  // Use LIKE filter on target_nodes JSON array
  const sql = `
    SELECT * FROM executions
    WHERE target_nodes LIKE ?
    ORDER BY started_at DESC
    LIMIT ?
  `;
  const rows = await db.query<{
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
    batch_id: string | null;
    batch_position: number | null;
  }>(sql, [`%"${nodeId}"%`, limit]);

  return rows.map((row) => {
    const execution: ExecutionRecord = {
      id: row.id,
      type: row.type as ExecutionRecord["type"],
      targetNodes: JSON.parse(row.target_nodes) as string[],
      action: row.action,
      parameters: row.parameters ? (JSON.parse(row.parameters) as Record<string, unknown>) : undefined,
      status: row.status as ExecutionRecord["status"],
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      results: JSON.parse(row.results) as ExecutionRecord["results"],
      error: row.error ?? undefined,
      command: row.command ?? undefined,
      expertMode: row.expert_mode === 1,
      executionTool: row.execution_tool as ExecutionRecord["executionTool"],
    };
    return executionToJournalEntry(execution, nodeId);
  });
}

/**
 * Fetch PuppetDB reports for a node and convert to journal entries
 */
export async function collectPuppetDBEntries(
  puppetdb: PuppetDBLike,
  nodeId: string,
  limit = 25,
): Promise<JournalEntry[]> {
  if (!puppetdb.isInitialized()) return [];
  const reports = await puppetdb.getNodeReports(nodeId, limit, 0);
  return reports.map((r) => reportToJournalEntry(r, nodeId));
}

// ============================================================================
// Proxmox Task Collector
// ============================================================================

/**
 * Shape of a task record from GET /api2/json/nodes/{node}/tasks
 */
export interface ProxmoxTaskRecord {
  upid: string;
  node: string;
  starttime: number;
  type: string;
  status?: string;
  user: string;
  id: string;
}

/**
 * Minimal interface for Proxmox client to avoid circular deps
 */
export interface ProxmoxClientLike {
  get(endpoint: string): Promise<unknown>;
}

/**
 * Map a Proxmox task type string to a JournalEventType.
 */
export function mapProxmoxTaskType(taskType: string): JournalEventType {
  const mapping: Record<string, JournalEventType> = {
    qmstart: "start",
    vzstart: "start",
    qmstop: "stop",
    vzstop: "stop",
    qmshutdown: "stop",
    vzshutdown: "stop",
    qmreboot: "reboot",
    qmsuspend: "suspend",
    vzsuspend: "suspend",
    qmresume: "resume",
    vzresume: "resume",
  };
  return mapping[taskType] ?? "unknown";
}

/**
 * Collect Proxmox task history entries for a guest.
 * Queries GET /api2/json/nodes/{pveNode}/tasks?vmid={vmid}&limit=50
 * Returns JournalEntry[] with deterministic IDs based on UPID.
 */
export async function collectProxmoxTaskEntries(
  proxmoxClient: ProxmoxClientLike,
  pveNode: string,
  vmid: number,
  nodeId: string,
): Promise<JournalEntry[]> {
  const logger = new LoggerService();

  let rawData: unknown;
  try {
    rawData = await proxmoxClient.get(
      `/api2/json/nodes/${pveNode}/tasks?vmid=${String(vmid)}&limit=50`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch Proxmox tasks for vmid ${String(vmid)} on ${pveNode}: ${message}`, {
      component: "JournalCollectors",
      integration: "proxmox",
      operation: "collectProxmoxTaskEntries",
    });
    return [];
  }

  // Extract the data array from the response
  const response = rawData as { data?: unknown };
  const records = Array.isArray(response.data) ? (response.data as unknown[]) : [];

  const entries: JournalEntry[] = [];
  for (const raw of records) {
    try {
      const record = raw as ProxmoxTaskRecord;
      if (!record.upid || typeof record.starttime !== "number" || !record.type) {
        logger.warn("Skipping malformed Proxmox task record: missing required fields", {
          component: "JournalCollectors",
          integration: "proxmox",
          operation: "collectProxmoxTaskEntries",
        });
        continue;
      }

      const eventType = mapProxmoxTaskType(record.type);
      const timestamp = new Date(record.starttime * 1000).toISOString();

      entries.push({
        id: `proxmox:task:${record.upid}`,
        nodeId,
        nodeUri: `proxmox:${pveNode}:${String(vmid)}`,
        eventType,
        source: "proxmox",
        action: record.type,
        summary: `Proxmox ${record.type}: ${record.status ?? "running"}`,
        details: {
          upid: record.upid,
          status: record.status,
          type: record.type,
          node: record.node,
        },
        userId: undefined,
        timestamp,
        isLive: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Skipping malformed Proxmox task record: ${message}`, {
        component: "JournalCollectors",
        integration: "proxmox",
        operation: "collectProxmoxTaskEntries",
      });
    }
  }

  return entries;
}

// ============================================================================
// AWS EC2 State Collector
// ============================================================================

/**
 * Minimal interface for AWS service to avoid circular deps.
 * Subset of AWSService — only the method we need for state collection.
 */
export interface AWSServiceLike {
  getNodeFacts(nodeId: string): Promise<{
    facts: {
      categories?: {
        system: {
          state: string;
          instanceId?: string;
          region?: string;
          stateTransitionReason?: string;
        };
      };
    };
  }>;
}

/**
 * Map an EC2 instance state string to a JournalEventType.
 */
export function mapEC2StateToEventType(state: string): JournalEventType {
  const mapping: Record<string, JournalEventType> = {
    running: "start",
    stopped: "stop",
    terminated: "destroy",
    pending: "provision",
    "shutting-down": "stop",
    stopping: "stop",
  };
  return mapping[state] ?? "unknown";
}

/**
 * Collect AWS EC2 state change entry for an instance.
 * Calls getNodeFacts to get current state, compares against last recorded
 * state in journal_entries. Returns 0 or 1 JournalEntry with deterministic ID.
 */
export async function collectAWSStateEntry(
  awsService: AWSServiceLike,
  instanceId: string,
  region: string,
  db: DatabaseAdapter,
  nodeId: string,
): Promise<JournalEntry[]> {
  const logger = new LoggerService();

  // 1. Get current state from AWS
  let currentState: string;
  let stateTransitionReason: string;
  try {
    const factsResult = await awsService.getNodeFacts(nodeId);
    const system = factsResult.facts.categories?.system;
    if (!system?.state) {
      logger.warn("AWS facts missing system state", {
        component: "JournalCollectors",
        integration: "aws",
        operation: "collectAWSStateEntry",
      });
      return [];
    }
    currentState = system.state;
    stateTransitionReason = system.stateTransitionReason ?? "State change detected";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to fetch AWS facts for ${nodeId}: ${message}`, {
      component: "JournalCollectors",
      integration: "aws",
      operation: "collectAWSStateEntry",
    });
    return [];
  }

  // 2. Query last recorded state from journal_entries
  let previousState: string | undefined;
  try {
    const rows = await db.query<{ details: string }>(
      `SELECT details FROM journal_entries WHERE nodeId = ? AND source = 'aws' ORDER BY timestamp DESC LIMIT 1`,
      [nodeId],
    );
    if (rows.length > 0) {
      const details = typeof rows[0].details === "string"
        ? (JSON.parse(rows[0].details) as Record<string, unknown>)
        : (rows[0].details as Record<string, unknown>);
      previousState = details.currentState as string | undefined;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to query last AWS state for ${nodeId}: ${message}`, {
      component: "JournalCollectors",
      integration: "aws",
      operation: "collectAWSStateEntry",
    });
    // Treat as "no previous state known" — record the current state
  }

  // 3. If state hasn't changed, return empty
  if (previousState === currentState) {
    return [];
  }

  // 4. Create new journal entry for the state change
  const eventType = mapEC2StateToEventType(currentState);
  const timestamp = new Date().toISOString();

  return [
    {
      id: `aws:state:${instanceId}:${currentState}:${timestamp}`,
      nodeId,
      nodeUri: `aws:${region}:${instanceId}`,
      eventType,
      source: "aws",
      action: `EC2 state change: ${previousState ?? "unknown"} → ${currentState}`,
      summary: `EC2 instance ${currentState} — ${stateTransitionReason}`,
      details: {
        instanceId,
        region,
        previousState: previousState ?? "unknown",
        currentState,
        stateTransitionReason,
      },
      userId: undefined,
      timestamp,
      isLive: true,
    },
  ];
}

// ============================================================================
// Global Collectors (cross-node)
// ============================================================================

/**
 * Fetch recent executions across all nodes and convert to journal entries.
 * Each execution is expanded into one entry per target node.
 */
export async function collectGlobalExecutionEntries(
  db: DatabaseAdapter,
  limit = 100,
  filters?: {
    nodeIds?: string[];
    startDate?: string;
    endDate?: string;
  },
): Promise<JournalEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.startDate) {
    conditions.push("started_at >= ?");
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    conditions.push("started_at <= ?");
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const sql = `
    SELECT * FROM executions
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = await db.query<{
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
    batch_id: string | null;
    batch_position: number | null;
  }>(sql, params);

  const entries: JournalEntry[] = [];
  const nodeIdSet = filters?.nodeIds
    ? new Set(filters.nodeIds)
    : undefined;

  for (const row of rows) {
    const targetNodes = JSON.parse(row.target_nodes) as string[];
    const execution: ExecutionRecord = {
      id: row.id,
      type: row.type as ExecutionRecord["type"],
      targetNodes,
      action: row.action,
      parameters: row.parameters
        ? (JSON.parse(row.parameters) as Record<string, unknown>)
        : undefined,
      status: row.status as ExecutionRecord["status"],
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      results: JSON.parse(row.results) as ExecutionRecord["results"],
      error: row.error ?? undefined,
      command: row.command ?? undefined,
      expertMode: row.expert_mode === 1,
      executionTool: row.execution_tool as ExecutionRecord["executionTool"],
    };

    for (const nodeId of targetNodes) {
      if (nodeIdSet && !nodeIdSet.has(nodeId)) continue;
      entries.push(executionToJournalEntry(execution, nodeId));
    }
  }

  return entries;
}

/**
 * Fetch recent PuppetDB reports across all nodes and convert to journal entries.
 * Uses getAllReports if available, otherwise falls back to per-node queries
 * using the provided nodeIds.
 */
export async function collectGlobalPuppetDBEntries(
  puppetdb: PuppetDBLike,
  nodeIds?: string[],
  limit = 50,
): Promise<JournalEntry[]> {
  if (!puppetdb.isInitialized()) return [];

  // If the service supports getAllReports, use it for efficiency
  if (puppetdb.getAllReports) {
    try {
      const reports = await puppetdb.getAllReports(limit, 0);
      let filtered = reports;
      if (nodeIds && nodeIds.length > 0) {
        const nodeSet = new Set(nodeIds);
        filtered = reports.filter((r) => nodeSet.has(r.certname));
      }
      return filtered.map((r) =>
        reportToJournalEntry(r, r.certname),
      );
    } catch {
      return [];
    }
  }

  // Fallback: query per-node if nodeIds are provided
  if (!nodeIds || nodeIds.length === 0) return [];

  const perNode = Math.max(1, Math.floor(limit / nodeIds.length));
  const promises = nodeIds.map(async (nodeId) => {
    try {
      const reports = await puppetdb.getNodeReports(nodeId, perNode, 0);
      return reports.map((r) => reportToJournalEntry(r, nodeId));
    } catch {
      return [] as JournalEntry[];
    }
  });

  const results = await Promise.all(promises);
  return results.flat();
}
