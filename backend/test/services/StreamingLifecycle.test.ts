/**
 * Streaming lifecycle: terminal status, state release and flush latency
 * (A16 / I07).
 *
 * Three contracts, each of which failed before A16:
 *
 * - Output state (buffers, output counters, per-IP connection slots) is
 *   released for every execution, including the usual case where the client
 *   disconnected before the delayed teardown ran.
 * - Buffered output reaches subscribers within the buffer interval, even while
 *   output keeps arriving. The timer used to restart on every chunk, so a
 *   continuously producing run streamed nothing until it went quiet.
 * - A completion carries the run's own terminal status, and every terminal
 *   status is replayed to a client that subscribes after the fact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';

import { StreamingExecutionManager } from '../../src/services/StreamingExecutionManager';
import { DatabaseService } from '../../src/database/DatabaseService';
import { ExecutionRepository, type ExecutionStatus } from '../../src/database/ExecutionRepository';
import { createStreamingRouter } from '../../src/routes/streaming';
import { createDefaultContainer } from '../../src/container/DIContainer';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const CONFIG = { bufferMs: 40, maxOutputSize: 1_000_000, maxLineLength: 1000 };
/** The manager closes connections one second after a terminal event. */
const TEARDOWN_GRACE_MS = 1300;

/** A response double that records frames and reports its own close. */
function makeResponse(ip = '10.0.0.1'): Response & { frames: () => string[] } {
  const handlers: Record<string, (() => void)[]> = {};
  const written: string[] = [];
  const response = {
    setHeader: vi.fn(),
    write: (chunk: string): boolean => { written.push(chunk); return true; },
    end: (): void => { for (const handler of handlers.close ?? []) handler(); },
    on: (event: string, handler: () => void): void => { (handlers[event] ??= []).push(handler); },
    req: { ip, socket: { remoteAddress: ip } },
    frames: (): string[] => written.filter(frame => frame.startsWith('event: ')),
  };
  return response as unknown as Response & { frames: () => string[] };
}

function eventsOfType(response: { frames: () => string[] }, type: string): string[] {
  return response.frames().filter(frame => frame.startsWith(`event: ${type}`));
}

describe('A16: streaming output state release', () => {
  let manager: StreamingExecutionManager;

  beforeEach(() => { manager = new StreamingExecutionManager(CONFIG); });
  afterEach(() => { manager.cleanup(); });

  it('releases output state when the client disconnected before completion', async () => {
    const response = makeResponse();
    manager.subscribe('exec-1', response);
    manager.emitStdout('exec-1', 'output\n');
    manager.unsubscribe('exec-1', response);

    manager.emitComplete('exec-1', { status: 'failed', error: 'boom' });
    await vi.waitFor(() => { expect(manager.getRetainedStateCount()).toBe(0); }, { timeout: TEARDOWN_GRACE_MS });
  });

  it('releases output state for a subscriber that stays to the end', async () => {
    const response = makeResponse();
    manager.subscribe('exec-2', response);
    manager.emitStdout('exec-2', 'output\n');

    manager.emitComplete('exec-2', { status: 'success' });
    await vi.waitFor(() => {
      expect(manager.getRetainedStateCount()).toBe(0);
      expect(manager.getSubscriberCount('exec-2')).toBe(0);
    }, { timeout: TEARDOWN_GRACE_MS });
  });

  it('leaves no pending flush after a terminal event', async () => {
    const response = makeResponse();
    manager.subscribe('exec-3', response);
    manager.emitStdout('exec-3', 'tail\n');
    manager.emitComplete('exec-3', { status: 'success' });

    const framesAtCompletion = response.frames().length;
    // The buffered tail is flushed by the completion itself, so nothing may
    // fire afterwards against state that has been released.
    expect(eventsOfType(response, 'stdout')).toHaveLength(1);
    await new Promise<void>((resolve) => { setTimeout(resolve, CONFIG.bufferMs * 4); });
    expect(response.frames()).toHaveLength(framesAtCompletion);
  });

  it('releases state for an execution abandoned without a terminal event', () => {
    const response = makeResponse();
    manager.subscribe('exec-4', response);
    manager.emitStdout('exec-4', 'partial output\n');
    manager.unsubscribe('exec-4', response);
    expect(manager.getRetainedStateCount()).toBe(1);

    // Nothing is due yet: the sweep only takes state that has gone quiet.
    expect(manager.sweepAbandonedState()).toBe(0);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
      expect(manager.sweepAbandonedState()).toBeGreaterThanOrEqual(1);
      expect(manager.getRetainedStateCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the state of an execution that still has a subscriber', () => {
    const response = makeResponse();
    manager.subscribe('exec-5', response);
    manager.emitStdout('exec-5', 'output\n');

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
      expect(manager.sweepAbandonedState()).toBe(0);
      expect(manager.getRetainedStateCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A16: streaming flush latency', () => {
  let manager: StreamingExecutionManager;

  beforeEach(() => { manager = new StreamingExecutionManager(CONFIG); });
  afterEach(() => { manager.cleanup(); });

  it('flushes continuously arriving output within the buffer interval', async () => {
    const response = makeResponse();
    manager.subscribe('exec-1', response);

    const chunker = setInterval(() => { manager.emitStdout('exec-1', 'x'); }, 5);
    try {
      // Output never stops, so a timer restarted per chunk never fires. The
      // bound has to come from the first buffered chunk instead.
      await vi.waitFor(() => { expect(eventsOfType(response, 'stdout').length).toBeGreaterThanOrEqual(3); },
        { timeout: CONFIG.bufferMs * 12 });
    } finally {
      clearInterval(chunker);
    }
  });

  it('coalesces the chunks that arrive inside one interval into one event', async () => {
    const response = makeResponse();
    manager.subscribe('exec-2', response);

    manager.emitStdout('exec-2', 'a');
    manager.emitStdout('exec-2', 'b');
    manager.emitStdout('exec-2', 'c');

    await vi.waitFor(() => { expect(eventsOfType(response, 'stdout')).toHaveLength(1); });
    expect(eventsOfType(response, 'stdout')[0]).toContain('abc');
  });
});

describe('A16: per-IP connection slots', () => {
  let manager: StreamingExecutionManager;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    manager = new StreamingExecutionManager(CONFIG);
    const app = express();
    app.get('/stream/:id', (req, res) => { manager.subscribe(req.params.id, res); });
    server = http.createServer(app);
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve(); }); });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    manager.cleanup();
    server.closeAllConnections();
    await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
  });

  it('releases the slot when the server itself closes the stream', async () => {
    const response = await fetch(`http://127.0.0.1:${String(port)}/stream/exec-1`);
    const reader = response.body!.getReader();
    await reader.read(); // the 'start' event: the subscription is live

    manager.emitComplete('exec-1', { status: 'success' });

    // The slot is counted on subscribe, so a stream the server closes has to
    // release it too. Releasing it only from the client's own disconnect
    // handler leaked one slot per completed stream, and ten locked the client
    // out entirely.
    expect(manager.getTrackedConnectionCount()).toBe(1);
    await vi.waitFor(() => { expect(manager.getTrackedConnectionCount()).toBe(0); },
      { timeout: TEARDOWN_GRACE_MS });
    await reader.cancel();
  });
});

describe('A16: terminal status reaches the client', () => {
  let database: DatabaseService;
  let repository: ExecutionRepository;
  let manager: StreamingExecutionManager;
  let harness: HttpHarness;
  let app: express.Express;

  beforeEach(async () => {
    database = new DatabaseService(':memory:');
    await database.initialize();
    repository = new ExecutionRepository(database.getAdapter());
    manager = new StreamingExecutionManager(CONFIG);
    harness = await createHttpHarness();

    app = express();
    app.use(express.json());
    app.use('/api/executions', createStreamingRouter(
      manager, repository,
      () => (_req, _res, next) => { next(); },
      createDefaultContainer(),
    ));
  });

  afterEach(async () => {
    manager.cleanup();
    await harness.close();
    await database.close();
  });

  async function storeExecution(id: string, status: ExecutionStatus): Promise<void> {
    await repository.create({
      type: 'command', targetNodes: ['node-1'], action: 'uptime', status: 'running',
      startedAt: new Date().toISOString(), results: [],
    }, id);
    await repository.update(id, {
      status, completedAt: new Date().toISOString(),
      results: [], error: status === 'success' ? undefined : `run ended as ${status}`,
    });
  }

  // Success and failure were replayed before A16; the rest were not, so a
  // client that subscribed to an already-cancelled run waited forever.
  for (const status of ['success', 'failed', 'partial', 'cancelled', 'interrupted'] as const) {
    it(`replays a ${status} execution with its own status`, async () => {
      await storeExecution(`exec-${status}`, status);

      const response = await request(harness.use(app))
        .get(`/api/executions/exec-${status}/stream`)
        .buffer(true)
        .parse((res, callback) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.includes('event: complete')) res.destroy();
          });
          res.on('close', () => { callback(null, body); });
          res.on('error', () => { callback(null, body); });
        });

      const body = response.body as string;
      expect(body).toContain('event: complete');
      expect(body).toContain(`"status":"${status}"`);
    });
  }

  it('does not replay a terminal event for a running execution', async () => {
    await repository.create({
      type: 'command', targetNodes: ['node-1'], action: 'uptime', status: 'running',
      startedAt: new Date().toISOString(), results: [],
    }, 'exec-running');

    const response = makeResponse();
    manager.subscribe('exec-running', response);
    expect(eventsOfType(response, 'complete')).toHaveLength(0);
  });
});
