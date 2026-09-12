import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { ShutdownCoordinator } from '../../src/services/ShutdownCoordinator';
import { LoggerService } from '../../src/services/LoggerService';

const logger = new LoggerService();
afterEach(() => { vi.useRealTimers(); });

it('rejects new requests including readiness and runs ordered cleanup once', async () => {
  const order: string[] = [];
  let release!: () => void;
  const drain = new Promise<void>(resolve => { release = resolve; });
  const coordinator = new ShutdownCoordinator(
    () => { order.push('stop'); },
    async () => { order.push('drain'); await drain; },
    async () => { order.push('close'); }, logger,
  );
  const app = express();
  const dispatch = vi.fn();
  app.use(coordinator.middleware);
  app.use((_req, res) => { dispatch(); res.sendStatus(200); });
  await request(app).get('/api/health').expect(200);
  dispatch.mockClear();
  const first = coordinator.shutdown();
  expect(coordinator.shutdown()).toBe(first);
  try {
    await request(app).get('/api/health').expect(503);
    await request(app).post('/api/nodes/node/command').expect(503);
    expect(dispatch).not.toHaveBeenCalled();
    expect(order).toEqual(['stop', 'drain']);
  } finally { release(); }
  expect(await first).toBe(0);
  expect(order).toEqual(['stop', 'drain', 'close']);
});

it('bounds a stuck drain and never closes storage underneath a late drain', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const close = vi.fn().mockResolvedValue(undefined);
  const coordinator = new ShutdownCoordinator(() => {}, () => pending, close, logger, 100);
  const result = coordinator.shutdown();
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toBe(1);
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(close).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['stop', 'drain', 'close'])('reports %s failures without hanging', async (stage) => {
  const fail = () => { throw new Error('test shutdown failure'); };
  const coordinator = new ShutdownCoordinator(
    stage === 'stop' ? fail : () => {},
    stage === 'drain' ? fail : async () => {},
    stage === 'close' ? fail : async () => {}, logger,
  );
  expect(await coordinator.shutdown()).toBe(1);
});
