import { afterEach, expect, it, vi } from 'vitest';
import { ProviderReadGuard } from '../../src/integrations/ProviderReadGuard';

afterEach(() => { vi.useRealTimers(); });

it('retains timed-out capacity until real settlement, without blocking another provider', async () => {
  vi.useFakeTimers();
  const guard = new ProviderReadGuard(1);
  let reject!: (error: Error) => void;
  const upstream = new Promise<never>((_resolve, fail) => { reject = fail; });
  const first = expect(guard.run('stuck', 100, () => upstream)).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(100);
  await first;
  const read = vi.fn().mockResolvedValue('unexpected');
  await expect(guard.run('stuck', 100, read)).rejects.toThrow('outstanding reads');
  expect(read).not.toHaveBeenCalled();
  await expect(guard.run('healthy', 100, async () => 'ok')).resolves.toBe('ok');
  reject(new Error('late upstream failure'));
  await vi.advanceTimersByTimeAsync(0);
  await expect(guard.run('stuck', 100, async () => 'recovered')).resolves.toBe('recovered');
  expect(vi.getTimerCount()).toBe(0);
});

it('releases capacity and timers after synchronous provider failures', async () => {
  vi.useFakeTimers();
  const guard = new ProviderReadGuard(1);
  await expect(guard.run('source', 100, () => { throw new Error('synchronous failure'); }))
    .rejects.toThrow('synchronous failure');
  await expect(guard.run('source', 100, async () => 'ok')).resolves.toBe('ok');
  expect(vi.getTimerCount()).toBe(0);
});
