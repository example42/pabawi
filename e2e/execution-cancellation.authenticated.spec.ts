import { test, expect, type APIRequestContext } from '@playwright/test';
import { createServer, type Server, type Socket } from 'node:net';
import { ADMIN, REFUSED_HOST, STALLED_HOST, STALLED_PORT } from '../playwright.config';

/**
 * Cancelling work that was admitted but never dispatched, through the UI.
 *
 * The queue runs one execution at a time (CONCURRENT_EXECUTION_LIMIT=1 in the
 * webServer env), so the second target of a batch stays queued behind the
 * first. Holding the first open is what makes the test deterministic rather
 * than a race: the listener below accepts the TCP connection and then says
 * nothing, so the SSH handshake waits for a banner that never arrives.
 *
 * The contract under test is A13/I04's: cancelling queued work removes it from
 * dispatch, and the UI reports what actually happened.
 */

/**
 * Accepts connections and keeps them open without ever writing a byte.
 *
 * Bound on both loopback stacks, because the fixture host is "localhost" and
 * which family that resolves to first is the runner's business, not ours.
 */
async function blackHole(port: number): Promise<{ close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const servers: Server[] = [];

  const bind = (host: string, required: boolean): Promise<void> => new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => sockets.delete(socket));
    });
    server.once('error', (error) => { required ? reject(error) : resolve(); });
    server.listen(port, host, () => { servers.push(server); resolve(); });
  });

  await bind('127.0.0.1', true);
  await bind('::1', false);

  return {
    close: () => new Promise<void>((done) => {
      for (const socket of sockets) socket.destroy();
      let pending = servers.length;
      if (pending === 0) { done(); return; }
      for (const server of servers) server.close(() => { if (--pending === 0) done(); });
    }),
  };
}

async function authorize(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/auth/login', {
    data: { username: ADMIN.username, password: ADMIN.password },
  });
  expect(login.status()).toBe(200);
  return ((await login.json()) as { token: string }).token;
}

interface BatchChild {
  id: string;
  status: string;
  targetNodes: string[];
}

async function children(request: APIRequestContext, token: string, batchId: string): Promise<BatchChild[]> {
  const response = await request.get(`/api/executions/batch/${batchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { executions?: BatchChild[]; children?: BatchChild[] };
  return body.executions ?? body.children ?? [];
}

test('cancels a queued execution from the UI before it is dispatched', async ({ page, request }) => {
  const token = await authorize(request);
  const listener = await blackHole(STALLED_PORT);

  try {
    const startedAt = Date.now();
    const submission = await request.post('/api/executions/batch', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        type: 'command',
        action: 'echo pabawi-e2e-cancel',
        // The stalled target takes the single slot; the refused one queues.
        targetNodeIds: [STALLED_HOST, REFUSED_HOST],
        tool: 'ssh',
      },
    });
    const admissionMs = Date.now() - startedAt;

    // Admission returns identifiers without waiting for a slot (finding I04).
    expect(submission.status()).toBe(201);
    const { batchId } = (await submission.json()) as { batchId: string };
    expect(batchId).toBeTruthy();
    expect(admissionMs).toBeLessThan(5000);

    // The queued child is the one to cancel. Which target lands in the slot is
    // the queue's business, so ask rather than assume.
    let queued: BatchChild | undefined;
    await expect(async () => {
      queued = (await children(request, token, batchId)).find((child) => child.status === 'queued');
      expect(queued, 'a child must be queued behind the occupied slot').toBeDefined();
    }).toPass({ timeout: 15_000 });

    const queuedId = queued!.id;

    await page.goto('/executions');
    const row = page.getByTestId(`execution-row-${queuedId}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('execution-status')).toHaveText('Queued');

    await row.click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Cancel Execution' }).click();

    // Cancelled, not failed: the run never reached the provider.
    await expect(row.getByTestId('execution-status')).toHaveText('Cancelled', { timeout: 30_000 });
  } finally {
    await listener.close();
  }
});
