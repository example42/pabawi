/**
 * A completed Puppet run reports its own outcome (A16 / I07).
 *
 * The component used to announce success for every completion the stream
 * delivered, so a failed, partial or cancelled run was reported as a
 * successful one. These tests drive the stream's terminal callback directly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import PuppetRunInterface from './PuppetRunInterface.svelte';
import * as api from '../lib/api';
import * as toast from '../lib/toast.svelte';
import type { ExecutionStreamOptions } from '../lib/executionStream.svelte';

vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  // ErrorAlert, rendered once a failure is reported, reads its guidance here.
  getErrorGuidance: () => ({ guidance: null, actionable: false }),
}));
vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn(),
}));

/** Options the component handed to the stream, so its callbacks can be run. */
let streamOptions: ExecutionStreamOptions | null = null;
vi.mock('../lib/executionStream.svelte', () => ({
  useExecutionStream: (_executionId: string, options: ExecutionStreamOptions) => {
    streamOptions = options;
    return { connect: vi.fn(), disconnect: vi.fn(), isConnecting: false, executionStatus: null };
  },
}));

/** Expand the panel and submit a single-node run. */
async function startRun(): Promise<void> {
  render(PuppetRunInterface, { props: { nodeId: 'node-1' } });
  await fireEvent.click(screen.getByRole('button', { name: /Run Puppet/i }));
  const submit = await screen.findByRole('button', { name: 'Run Puppet' });
  await fireEvent.click(submit);
  await waitFor(() => { expect(streamOptions).not.toBeNull(); });
}

describe('PuppetRunInterface terminal status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamOptions = null;
    vi.mocked(api.get).mockResolvedValue({ integrations: [] });
    vi.mocked(api.post).mockResolvedValue({ executionId: 'exec-1' });
  });

  it('announces success only when the run reports success', async () => {
    await startRun();

    streamOptions?.onComplete?.({ status: 'success', results: [] });

    expect(toast.showSuccess).toHaveBeenCalledWith('Puppet run completed');
    expect(toast.showError).not.toHaveBeenCalled();
  });

  for (const status of ['failed', 'partial', 'cancelled', 'interrupted'] as const) {
    it(`reports a ${status} run as a failure, not a success`, async () => {
      await startRun();

      streamOptions?.onComplete?.({ status, results: [], error: `run ended as ${status}` });

      expect(toast.showSuccess).not.toHaveBeenCalledWith('Puppet run completed');
      expect(toast.showError).toHaveBeenCalledWith('Puppet run failed', `run ended as ${status}`);
    });
  }

  it('does not claim success for a completion that reports no status', async () => {
    await startRun();

    streamOptions?.onComplete?.({ results: [] });

    expect(toast.showSuccess).not.toHaveBeenCalledWith('Puppet run completed');
    expect(toast.showError).toHaveBeenCalledWith(
      'Puppet run failed', 'Execution reported no status',
    );
  });
});
