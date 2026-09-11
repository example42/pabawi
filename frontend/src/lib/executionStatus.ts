/**
 * Interpreting an execution's terminal status.
 *
 * A completed stream and a successful run are different facts. The SSE client
 * used to equate them, so a failed, partial or cancelled run was displayed as a
 * success (finding I07). These helpers exist so no caller has to re-derive the
 * rule, and so the rule fails closed: anything that is not an explicit
 * `success` is not a success.
 */

/** Statuses an execution never leaves. Mirrors the backend's own list. */
export const TERMINAL_EXECUTION_STATUSES = [
  'success',
  'failed',
  'partial',
  'cancelled',
  'interrupted',
] as const;

export type TerminalExecutionStatus = (typeof TERMINAL_EXECUTION_STATUSES)[number];

/**
 * Read the status an execution payload reports.
 *
 * @returns the reported status, or null when the payload carries none
 */
export function executionStatusOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const status = (payload as { status?: unknown }).status;
  return typeof status === 'string' && status.length > 0 ? status : null;
}

/**
 * Whether an execution payload reports success.
 *
 * Fails closed: a missing or unrecognised status is not a success, because the
 * alternative is telling someone their infrastructure change worked when
 * nothing said so.
 */
export function executionReportsSuccess(payload: unknown): boolean {
  return executionStatusOf(payload) === 'success';
}

/** Whether a status is one an execution never leaves. */
export function isTerminalExecutionStatus(status: string | null): boolean {
  return status !== null && (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Read the error an execution payload reports, if any.
 */
export function executionErrorOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' && error.length > 0 ? error : null;
}

/**
 * A short reason to show when an execution did not succeed.
 *
 * Prefers the error the run reported; otherwise names the status, so a
 * `partial` or `cancelled` run is described as what it was rather than as a
 * generic failure.
 */
export function executionFailureReason(payload: unknown): string {
  const error = executionErrorOf(payload);
  if (error !== null) {
    return error;
  }
  const status = executionStatusOf(payload);
  return status !== null
    ? `Execution reported status '${status}'`
    : 'Execution reported no status';
}
