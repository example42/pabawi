/**
 * Reading an execution's terminal status (A16 / I07).
 *
 * The rule under test is that nothing but an explicit `success` counts as
 * success, because the alternative is telling someone their infrastructure
 * change worked when nothing said so.
 */
import { describe, it, expect } from 'vitest';
import {
  TERMINAL_EXECUTION_STATUSES,
  executionErrorOf,
  executionFailureReason,
  executionReportsSuccess,
  executionStatusOf,
  isTerminalExecutionStatus,
} from './executionStatus';

describe('executionStatusOf', () => {
  it('reads a reported status', () => {
    expect(executionStatusOf({ status: 'partial' })).toBe('partial');
  });

  it('reports nothing for payloads that carry no usable status', () => {
    for (const payload of [null, undefined, 'failed', 42, {}, { status: '' }, { status: 3 }]) {
      expect(executionStatusOf(payload)).toBeNull();
    }
  });
});

describe('executionReportsSuccess', () => {
  it('accepts only an explicit success', () => {
    expect(executionReportsSuccess({ status: 'success' })).toBe(true);
  });

  it('refuses every other terminal status', () => {
    for (const status of TERMINAL_EXECUTION_STATUSES.filter(s => s !== 'success')) {
      expect(executionReportsSuccess({ status })).toBe(false);
    }
  });

  it('refuses a missing, empty or unrecognised status', () => {
    for (const payload of [null, {}, { status: '' }, { status: 'weird' }, { status: 'running' }]) {
      expect(executionReportsSuccess(payload)).toBe(false);
    }
  });
});

describe('isTerminalExecutionStatus', () => {
  it('recognises the statuses an execution never leaves', () => {
    for (const status of TERMINAL_EXECUTION_STATUSES) {
      expect(isTerminalExecutionStatus(status)).toBe(true);
    }
  });

  it('rejects in-flight and unknown statuses', () => {
    for (const status of ['queued', 'running', 'weird', null]) {
      expect(isTerminalExecutionStatus(status)).toBe(false);
    }
  });
});

describe('executionErrorOf and executionFailureReason', () => {
  it('prefers the error the run reported', () => {
    expect(executionErrorOf({ error: 'exit code 1' })).toBe('exit code 1');
    expect(executionFailureReason({ status: 'failed', error: 'exit code 1' })).toBe('exit code 1');
  });

  it('names the status when no error was reported', () => {
    expect(executionFailureReason({ status: 'cancelled' })).toBe("Execution reported status 'cancelled'");
  });

  it('says so when nothing was reported at all', () => {
    expect(executionErrorOf({})).toBeNull();
    expect(executionFailureReason({})).toBe('Execution reported no status');
    expect(executionFailureReason(null)).toBe('Execution reported no status');
  });
});
