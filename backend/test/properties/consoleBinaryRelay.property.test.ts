/**
 * Property-Based Tests for Console Binary Frame Relay Integrity
 *
 * Feature: console-integration, Property 3: Binary frame relay integrity
 *
 * **Validates: Requirements 4.4**
 *
 * Property 3: Binary frame relay integrity
 * ∀ binary data frame sent through the VNC WebSocket proxy in either direction,
 *   the frame SHALL arrive at the other end byte-for-byte identical to what was sent.
 *
 * Testing approach: Creates a local WebSocket server pair and wires them using
 * the same relay logic as ConsoleWebSocketProxy.wireVncRelay. Random binary
 * buffers are sent in both directions and verified byte-for-byte on receipt.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "net";
import { createServer, type Server as HTTPServer } from "http";

/** Replicate the VNC relay logic from ConsoleWebSocketProxy.wireVncRelay */
function wireVncRelay(clientWs: WebSocket, upstream: WebSocket): void {
  upstream.on("message", (data: Buffer) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: true });
    }
  });
  clientWs.on("message", (data: Buffer) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: true });
    }
  });
}

/**
 * Sets up a test relay topology:
 *   [sender] <--WS--> [proxyClient | proxyUpstream] <--WS--> [target]
 *
 * The proxy wires proxyClient↔proxyUpstream using wireVncRelay.
 * "sender" represents the browser/noVNC client.
 * "target" represents the upstream VNC server.
 */
interface RelayFixture {
  senderServer: HTTPServer;
  targetServer: HTTPServer;
  senderWss: WebSocketServer;
  targetWss: WebSocketServer;
  sender: WebSocket;
  target: WebSocket;
  proxyClient: WebSocket;
  proxyUpstream: WebSocket;
  cleanup: () => Promise<void>;
}

async function createRelayFixture(): Promise<RelayFixture> {
  // Create "target" WS server (simulates upstream VNC server)
  const targetHttpServer = createServer();
  const targetWss = new WebSocketServer({ server: targetHttpServer });

  await new Promise<void>((resolve) => {
    targetHttpServer.listen(0, "127.0.0.1", resolve);
  });
  const targetPort = (targetHttpServer.address() as AddressInfo).port;

  // Create "sender" WS server (simulates client-facing endpoint)
  const senderHttpServer = createServer();
  const senderWss = new WebSocketServer({ server: senderHttpServer });

  await new Promise<void>((resolve) => {
    senderHttpServer.listen(0, "127.0.0.1", resolve);
  });
  const senderPort = (senderHttpServer.address() as AddressInfo).port;

  // Wait for the proxy's upstream connection to the target
  const targetConnectionPromise = new Promise<WebSocket>((resolve) => {
    targetWss.on("connection", (ws) => resolve(ws));
  });

  // Wait for the proxy's client-side connection from sender
  const senderConnectionPromise = new Promise<WebSocket>((resolve) => {
    senderWss.on("connection", (ws) => resolve(ws));
  });

  // proxyUpstream connects to target
  const proxyUpstream = new WebSocket(`ws://127.0.0.1:${targetPort}`);
  await new Promise<void>((resolve, reject) => {
    proxyUpstream.on("open", resolve);
    proxyUpstream.on("error", reject);
  });

  // sender connects to senderWss (represents browser → proxy endpoint)
  const sender = new WebSocket(`ws://127.0.0.1:${senderPort}`);
  await new Promise<void>((resolve, reject) => {
    sender.on("open", resolve);
    sender.on("error", reject);
  });

  // Get the server-side sockets
  const target = await targetConnectionPromise;
  const proxyClient = await senderConnectionPromise;

  // Wire the relay (the logic under test)
  wireVncRelay(proxyClient, proxyUpstream);

  const cleanup = async (): Promise<void> => {
    const closeWs = (ws: WebSocket): Promise<void> =>
      new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.on("close", () => resolve());
          ws.close();
        } else {
          resolve();
        }
      });

    await Promise.all([
      closeWs(sender),
      closeWs(proxyClient),
      closeWs(proxyUpstream),
      closeWs(target),
    ]);

    await new Promise<void>((resolve) => { senderWss.close(() => resolve()); });
    await new Promise<void>((resolve) => { targetWss.close(() => resolve()); });
    await new Promise<void>((resolve) => { senderHttpServer.close(() => resolve()); });
    await new Promise<void>((resolve) => { targetHttpServer.close(() => resolve()); });
  };

  return {
    senderServer: senderHttpServer,
    targetServer: targetHttpServer,
    senderWss,
    targetWss,
    sender,
    target,
    proxyClient,
    proxyUpstream,
    cleanup,
  };
}

/**
 * Collect N messages from a WebSocket as Buffers.
 *
 * Listeners are removed on settle so the same long-lived socket can be reused
 * across property runs without accumulating handlers.
 */
function collectMessages(ws: WebSocket, count: number): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const messages: Buffer[] = [];

    const settle = (fn: () => void): void => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
      fn();
    };

    const onMessage = (data: Buffer): void => {
      messages.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      if (messages.length === count) {
        settle(() => resolve(messages));
      }
    };

    const onError = (err: Error): void => {
      settle(() => reject(err));
    };

    const timeout = setTimeout(() => {
      settle(() =>
        reject(
          new Error(`Timed out waiting for ${count} messages, received ${messages.length}`),
        ),
      );
    }, COLLECT_TIMEOUT_MS);

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

/**
 * Arbitrary: random binary buffer (1 byte to 64KB).
 *
 * The `.chain()` over a uniform size is deliberate: a bare
 * `fc.uint8Array({ maxLength: 65536 })` applies fast-check's default size bias
 * and yields buffers of ~12 bytes, which never reach the ws fragmentation and
 * internal-buffering paths this property exists to cover. Measured: `.chain()`
 * draws up to the full 65536 across 100 runs, the bare form up to 12.
 */
const binaryBufferArb = fc.integer({ min: 1, max: 65536 }).chain((size) =>
  fc.uint8Array({ minLength: size, maxLength: size }).map((arr) => Buffer.from(arr)),
);

/** Arbitrary: array of 1-10 random binary buffers */
const bufferBatchArb = fc.array(binaryBufferArb, { minLength: 1, maxLength: 10 });

/**
 * Budgets. 100 property runs of real socket I/O is not a 5s test; CI runners are
 * slower than a dev machine and vitest runs these files several workers deep.
 * TEST_TIMEOUT_MS must stay comfortably above COLLECT_TIMEOUT_MS so that a slow
 * run reports the vitest timeout rather than a misleading "relay dropped frames".
 */
const COLLECT_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;

describe("Feature: console-integration, Property 3: Binary frame relay integrity", () => {
  let fixture: RelayFixture;

  beforeEach(async () => {
    fixture = await createRelayFixture();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("binary frames sent from client to upstream arrive byte-for-byte identical", async () => {
    await fc.assert(
      fc.asyncProperty(bufferBatchArb, async (buffers) => {
        // Set up message collection on the target (upstream) side
        const received = collectMessages(fixture.target, buffers.length);

        // Send all buffers from the sender (client) side
        for (const buf of buffers) {
          fixture.sender.send(buf, { binary: true });
        }

        // Wait for all messages to arrive
        const receivedBuffers = await received;

        // Verify byte-for-byte identity
        expect(receivedBuffers.length).toBe(buffers.length);
        for (let i = 0; i < buffers.length; i++) {
          expect(Buffer.compare(receivedBuffers[i], buffers[i])).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  }, TEST_TIMEOUT_MS);

  it("binary frames sent from upstream to client arrive byte-for-byte identical", async () => {
    await fc.assert(
      fc.asyncProperty(bufferBatchArb, async (buffers) => {
        // Set up message collection on the sender (client) side
        const received = collectMessages(fixture.sender, buffers.length);

        // Send all buffers from the target (upstream) side
        for (const buf of buffers) {
          fixture.target.send(buf, { binary: true });
        }

        // Wait for all messages to arrive
        const receivedBuffers = await received;

        // Verify byte-for-byte identity
        expect(receivedBuffers.length).toBe(buffers.length);
        for (let i = 0; i < buffers.length; i++) {
          expect(Buffer.compare(receivedBuffers[i], buffers[i])).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  }, TEST_TIMEOUT_MS);

  it("bidirectional relay: frames in both directions are byte-for-byte identical simultaneously", async () => {
    await fc.assert(
      fc.asyncProperty(
        bufferBatchArb,
        bufferBatchArb,
        async (clientToServer, serverToClient) => {
          // Set up collectors for both directions
          const receivedAtTarget = collectMessages(fixture.target, clientToServer.length);
          const receivedAtSender = collectMessages(fixture.sender, serverToClient.length);

          // Send in both directions simultaneously
          for (const buf of clientToServer) {
            fixture.sender.send(buf, { binary: true });
          }
          for (const buf of serverToClient) {
            fixture.target.send(buf, { binary: true });
          }

          // Wait for both directions. allSettled (not all) so that a failure in
          // one direction still awaits the other: bailing early would leave a
          // live collector attached to a socket the next property run reuses,
          // turning one failure into a cascade of bogus shrink attempts.
          const [targetResult, senderResult] = await Promise.allSettled([
            receivedAtTarget,
            receivedAtSender,
          ]);
          if (targetResult.status === "rejected") throw targetResult.reason;
          if (senderResult.status === "rejected") throw senderResult.reason;
          const targetReceived = targetResult.value;
          const senderReceived = senderResult.value;

          // Verify client → server direction
          expect(targetReceived.length).toBe(clientToServer.length);
          for (let i = 0; i < clientToServer.length; i++) {
            expect(Buffer.compare(targetReceived[i], clientToServer[i])).toBe(0);
          }

          // Verify server → client direction
          expect(senderReceived.length).toBe(serverToClient.length);
          for (let i = 0; i < serverToClient.length; i++) {
            expect(Buffer.compare(senderReceived[i], serverToClient[i])).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, TEST_TIMEOUT_MS);
});
