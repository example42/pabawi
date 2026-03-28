import type { DatabaseAdapter } from "../../database/DatabaseAdapter";
import type { JournalEntry, JournalSource } from "./types";
import type { Report } from "../../integrations/puppetdb/types";
import type { ExecutionRecord } from "../../database/ExecutionRepository";

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
}

/**
 * Convert a Puppet report to a JournalEntry
 */
export function reportToJournalEntry(report: Report, nodeId: string): JournalEntry {
  const changedCount = report.metrics?.resources?.changed ?? 0;
  const failedCount = report.metrics?.resources?.failed ?? 0;
  const totalCount = report.metrics?.resources?.total ?? 0;

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
    facts: "info",
    plan: "task_execution",
  };

  // Map execution tool to journal source
  const sourceMap: Record<string, JournalSource> = {
    bolt: "bolt",
    ansible: "ansible",
    ssh: "ssh",
  };

  const eventType = eventTypeMap[execution.type] ?? "info";
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
