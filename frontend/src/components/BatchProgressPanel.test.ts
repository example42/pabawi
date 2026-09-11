import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import BatchProgressPanel from './BatchProgressPanel.svelte';
import { get, post, type BatchStatusResponse } from '../lib/api';

vi.mock('../lib/api', () => ({ get: vi.fn(), post: vi.fn() }));

function status(state: 'running' | 'cancelled' | 'interrupted', requested = false): BatchStatusResponse {
  return {
    batch: {
      id: 'batch', type: 'command', action: 'uptime', targetNodes: ['one', 'two'], targetGroups: [],
      status: state, createdAt: '2026-09-11T12:00:00Z', userId: 'actor', executionIds: ['one', 'two'],
      cancellationRequestedAt: requested ? '2026-09-11T12:01:00Z' : undefined,
      stats: { total: 2, queued: state === 'running' && !requested ? 1 : 0,
        running: state === 'running' ? 1 : 0, success: state === 'cancelled' ? 1 : 0,
        failed: 0, cancelled: requested ? 1 : 0, interrupted: state === 'interrupted' ? 1 : 0 },
    },
    executions: [{ id: 'two', nodeId: 'two', nodeName: 'Node Two', status: requested ? 'cancelled' : 'queued' }],
    progress: state === 'running' ? 50 : 100,
  };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
  await tick();
}

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

describe('batch lifecycle display', () => {
  it('authenticates cancellation and keeps polling while dispatched work is running', async () => {
    vi.mocked(get).mockResolvedValueOnce(status('running')).mockResolvedValueOnce(status('running', true))
      .mockResolvedValue(status('cancelled', true));
    vi.mocked(post).mockResolvedValue({ cancelledCount: 1, runningCount: 1 });
    const onComplete = vi.fn();
    render(BatchProgressPanel, { batchId: 'batch', onComplete });
    await flush();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel remaining executions' }));
    await flush();
    expect(post).toHaveBeenCalledWith('/api/executions/batch/batch/cancel', {}, { maxRetries: 0 });
    expect(screen.getByText(/1 dispatched executions are still running/)).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.queryByText('Waiting in queue')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000);
    await tick();
    expect(screen.getByText('Batch execution cancelled')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const requests = vi.mocked(get).mock.calls.length;
    await vi.advanceTimersByTimeAsync(16000);
    expect(get).toHaveBeenCalledTimes(requests);
  });

  it('shows cancellation errors without claiming success', async () => {
    vi.mocked(get).mockResolvedValue(status('running'));
    vi.mocked(post).mockRejectedValue(new Error('Permission denied'));
    render(BatchProgressPanel, { batchId: 'batch' });
    await flush();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel remaining executions' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('Permission denied');
    expect(screen.queryByText('Batch execution cancelled')).toBeNull();
  });

  it('discards responses from a previous batch and stops on interrupted work', async () => {
    let resolveOld!: (value: BatchStatusResponse) => void;
    vi.mocked(get).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue(status('interrupted', true));
    const onComplete = vi.fn();
    const component = render(BatchProgressPanel, { batchId: 'old', onComplete });
    await flush();
    await component.rerender({ batchId: 'new', onComplete });
    await flush();
    resolveOld(status('running'));
    await flush();
    expect(screen.getByText('Execution interrupted. Verify provider state before retrying.')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(16000);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
