/**
 * The streamed-output viewer renders every terminal status (A16 / I07).
 *
 * Before A16 the stream reported success for every completion, so the viewer's
 * running/complete split was exhaustive by accident. Once the run's own status
 * came through, a cancelled or interrupted run was neither running nor
 * complete: it showed a "Running" badge, no duration, and kept its elapsed
 * timer going.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';
import type { ExecutionStream } from '../lib/executionStream.svelte';

vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  getErrorGuidance: () => ({ guidance: null, actionable: false }),
}));

function makeStream(executionStatus: string | null): ExecutionStream {
  return {
    status: 'disconnected',
    command: 'puppet agent -t',
    stdout: 'Notice: applied catalog\n',
    stderr: '',
    executionStatus,
    result: null,
    error: null,
    events: [],
    isConnected: false,
    isConnecting: false,
    hasError: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    clearOutput: vi.fn(),
    reset: vi.fn(),
  } as unknown as ExecutionStream;
}

describe('RealtimeOutputViewer terminal statuses', () => {
  for (const [status, label] of [
    ['success', 'Success'],
    ['failed', 'Failed'],
    ['partial', 'Partial'],
    ['cancelled', 'Cancelled'],
    ['interrupted', 'Interrupted'],
  ] as const) {
    it(`shows a ${status} run as ${label} rather than as running`, () => {
      render(RealtimeOutputViewer, {
        props: {
          stream: makeStream(status),
          executionId: 'exec-1',
          autoConnect: false,
          enablePollingFallback: false,
        },
      });

      expect(screen.getByRole('status').textContent).toContain(label);
      expect(screen.queryByText(/^Elapsed:/)).toBeNull();
    });
  }

  it('shows a running run as running', () => {
    render(RealtimeOutputViewer, {
      props: {
        stream: makeStream('running'),
        executionId: 'exec-1',
        autoConnect: false,
        enablePollingFallback: false,
      },
    });

    expect(screen.getByRole('status').textContent).toContain('Running');
  });
});
