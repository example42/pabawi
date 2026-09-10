import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionAuthorization } from '../../src/services/SessionAuthorization';

afterEach(() => { vi.useRealTimers(); });

describe('SessionAuthorization', () => {
  it('closes an idle session when revalidation fails', async () => {
    vi.useFakeTimers();
    const closed = vi.fn();
    const guard = new SessionAuthorization(async () => { throw new Error('revoked'); }, closed);
    await vi.advanceTimersByTimeAsync(1000);
    expect(closed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(closed).toHaveBeenCalledTimes(1);
    guard.close();
  });

  it('does not deliver after closure while authorization is pending', async () => {
    let release!: () => void;
    const check = new Promise<void>(resolve => { release = resolve; });
    const delivered = vi.fn();
    const guard = new SessionAuthorization(() => check, vi.fn());
    guard.run(delivered);
    await Promise.resolve();
    guard.close();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(delivered).not.toHaveBeenCalled();
  });

  it('bounds queued deliveries when the authorization database stalls', async () => {
    let release!: () => void;
    const check = new Promise<void>(resolve => { release = resolve; });
    const closed = vi.fn();
    const delivered = vi.fn();
    const guard = new SessionAuthorization(() => check, closed);
    for (let i = 0; i < 129; i++) guard.run(delivered);
    expect(closed).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    expect(delivered).not.toHaveBeenCalled();
    guard.close();
  });
});
