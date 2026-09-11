/**
 * Mutation retry policy and authenticated replay (A14 / I05).
 *
 * Three contracts are covered:
 *
 * - A non-idempotent request is not replayed by the transport, because a lost
 *   response is indistinguishable from a lost request and replaying it can
 *   duplicate infrastructure work.
 * - A request carrying a durable idempotency key may be replayed, and every
 *   attempt must present the same key: a key regenerated per attempt gives no
 *   protection at all.
 * - An authenticated replay after a token refresh is not a retry. A zero-retry
 *   mutation must still perform exactly one replay with the new token, which is
 *   what the previous attempt-counting implementation prevented.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultMaxRetriesFor, del, get, newIdempotencyKey, post, put } from './api';
import { authManager } from './auth.svelte';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function ok(body: unknown): unknown {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function unavailable(): unknown {
  return {
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: () => Promise.resolve({ error: { code: 'UNAVAILABLE', message: 'nope', type: 'connection', actionableMessage: 'retry' } }),
  };
}

function unauthorized(): unknown {
  return {
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'expired', type: 'authentication', actionableMessage: 'log in' } }),
  };
}

const user = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  isAdmin: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  lastLoginAt: '2024-01-01T00:00:00Z',
};

/** Log in so the 401 path has a refresh token to work with. */
async function login(token: string): Promise<void> {
  mockFetch.mockResolvedValueOnce(ok({ token, refreshToken: 'refresh-token', user }));
  await authManager.login({ username: 'testuser', password: 'password123' });
  mockFetch.mockClear();
}

/**
 * Serve queued responses while recording the Authorization value at call time.
 *
 * A replayed request reuses one mutable `Headers` instance, so reading it back
 * from `mock.calls` afterwards reports the final value for every attempt. The
 * token an attempt actually sent has to be captured as it is sent.
 */
function captureAuthorization(responses: unknown[]): (string | null)[] {
  const sent: (string | null)[] = [];
  const queue = [...responses];
  mockFetch.mockImplementation((_url: string, init?: { headers?: HeadersInit }) => {
    const headers = init?.headers;
    sent.push(headers instanceof Headers
      ? headers.get('Authorization')
      : (headers as Record<string, string> | undefined)?.Authorization ?? null);
    return Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]);
  });
  return sent;
}

describe('defaultMaxRetriesFor', () => {
  it('retries safe methods and refuses to replay mutations', () => {
    expect(defaultMaxRetriesFor('GET', undefined)).toBe(3);
    expect(defaultMaxRetriesFor('head', undefined)).toBe(3);
    expect(defaultMaxRetriesFor(undefined, undefined)).toBe(3);
    expect(defaultMaxRetriesFor('POST', undefined)).toBe(0);
    expect(defaultMaxRetriesFor('PUT', undefined)).toBe(0);
    expect(defaultMaxRetriesFor('PATCH', undefined)).toBe(0);
    expect(defaultMaxRetriesFor('DELETE', undefined)).toBe(0);
  });

  it('permits replaying a mutation that carries an idempotency key', () => {
    expect(defaultMaxRetriesFor('POST', 'key-1')).toBe(3);
    expect(defaultMaxRetriesFor('DELETE', 'key-1')).toBe(3);
  });
});

describe('newIdempotencyKey', () => {
  it('produces a distinct value per submission', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
  });
});

describe('transport retry policy', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    if (authManager.isAuthenticated) await authManager.logout();
    mockFetch.mockClear();
  });

  it('does not replay a POST that the server may already have admitted', async () => {
    mockFetch.mockResolvedValue(unavailable());

    await expect(post('/api/executions/batch', { action: 'uptime' })).rejects.toThrow();

    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it('does not replay a PUT or DELETE either', async () => {
    mockFetch.mockResolvedValue(unavailable());

    await expect(put('/api/users/u1', { isAdmin: true })).rejects.toThrow();
    await expect(del('/api/users/u1')).rejects.toThrow();

    expect(mockFetch.mock.calls).toHaveLength(2);
  });

  it('still retries a GET, whose repetition cannot duplicate work', async () => {
    mockFetch.mockResolvedValueOnce(unavailable());
    mockFetch.mockResolvedValueOnce(unavailable());
    mockFetch.mockResolvedValueOnce(ok({ nodes: [] }));

    await expect(get('/api/inventory', { retryDelay: 0, showRetryNotifications: false }))
      .resolves.toEqual({ nodes: [] });

    expect(mockFetch.mock.calls).toHaveLength(3);
  });

  it('replays a keyed mutation and presents the same key every attempt', async () => {
    mockFetch.mockResolvedValueOnce(unavailable());
    mockFetch.mockResolvedValueOnce(ok({ batchId: 'batch-1' }));
    const key = newIdempotencyKey();

    const result = await post(
      '/api/executions/batch',
      { action: 'uptime' },
      { idempotencyKey: key, retryDelay: 0, showRetryNotifications: false },
    );

    expect(result).toEqual({ batchId: 'batch-1' });
    expect(mockFetch.mock.calls).toHaveLength(2);
    const keys = mockFetch.mock.calls.map((call) =>
      (call[1] as { headers: Headers }).headers.get('Idempotency-Key'));
    expect(keys).toEqual([key, key]);
  });

  it('sends no idempotency header when the caller supplies no key', async () => {
    mockFetch.mockResolvedValueOnce(ok({ batchId: 'batch-1' }));

    await post('/api/executions/batch', { action: 'uptime' });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get('Idempotency-Key')).toBeNull();
  });

  it('honours an explicit budget over the method default', async () => {
    mockFetch.mockResolvedValue(unavailable());

    await expect(post('/api/nodes/n1/facts', undefined, { maxRetries: 2, retryDelay: 0, showRetryNotifications: false }))
      .rejects.toThrow();

    expect(mockFetch.mock.calls).toHaveLength(3);
  });
});

describe('authenticated replay after a token refresh', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    if (authManager.isAuthenticated) await authManager.logout();
    mockFetch.mockClear();
  });

  it('replays a zero-retry mutation exactly once with the refreshed token', async () => {
    await login('old-token');

    const sent = captureAuthorization([
      unauthorized(),
      ok({ token: 'new-token', refreshToken: 'refresh-token', user }),
      ok({ batchId: 'batch-1' }),
    ]);

    const result = await post('/api/executions/batch', { action: 'uptime' }, { maxRetries: 0 });

    expect(result).toEqual({ batchId: 'batch-1' });
    expect(authManager.token).toBe('new-token');
    // Original attempt, the refresh call, then one authorized replay.
    expect(mockFetch.mock.calls).toHaveLength(3);
    expect(sent).toEqual(['Bearer old-token', null, 'Bearer new-token']);
  });

  it('surfaces the server error instead of looping when the replay is refused', async () => {
    await login('old-token');

    mockFetch.mockResolvedValueOnce(unauthorized());
    mockFetch.mockResolvedValueOnce(ok({ token: 'new-token', refreshToken: 'refresh-token', user }));
    mockFetch.mockResolvedValue(unauthorized());

    await expect(post('/api/executions/batch', { action: 'uptime' }, { maxRetries: 0 }))
      .rejects.toThrow('expired');

    // One refresh only: the replay is a one-shot, not a budget to burn through.
    expect(mockFetch.mock.calls).toHaveLength(3);
  });

  it('leaves the retry budget intact for the replayed request', async () => {
    await login('old-token');

    mockFetch.mockResolvedValueOnce(unauthorized());
    mockFetch.mockResolvedValueOnce(ok({ token: 'new-token', refreshToken: 'refresh-token', user }));
    mockFetch.mockResolvedValueOnce(unavailable());
    mockFetch.mockResolvedValueOnce(unavailable());
    mockFetch.mockResolvedValueOnce(ok({ nodes: [] }));

    const result = await get('/api/inventory', { retryDelay: 0, showRetryNotifications: false });

    expect(result).toEqual({ nodes: [] });
    expect(mockFetch.mock.calls).toHaveLength(5);
  });
});
