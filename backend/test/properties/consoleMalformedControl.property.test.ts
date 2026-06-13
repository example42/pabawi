/**
 * Property-Based Tests for Malformed Control Message Resilience
 *
 * Feature: console-integration, Property 16: Malformed control message resilience
 *
 * **Validates: Requirements 5.8**
 *
 * Property 16: Malformed control message resilience
 * ∀ binary control frame with unrecognized type byte or truncated payload:
 *   the system SHALL discard the frame and continue relaying without
 *   terminating the session.
 *
 * Specifically:
 *   - Empty frames (0 bytes) → discard
 *   - Unrecognized type byte (anything != 0x01) with any payload → discard
 *   - Type 0x01 (resize) but total length < 5 bytes → discard (truncated)
 *
 * In all discard cases:
 *   - upstream.send is NOT called
 *   - session is NOT terminated (no clientWs.close)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { WebSocket } from "ws";

import { ConsoleWebSocketProxy } from "../../src/services/ConsoleWebSocketProxy";
import type { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { ConsoleSession } from "../../src/integrations/console/types";
import type { LoggerService } from "../../src/services/LoggerService";
import type { Server as HTTPServer } from "http";

// ============================================================
// Constants
// ============================================================

const RESIZE_TYPE = 0x01;
const RESIZE_FRAME_LENGTH = 5;

// ============================================================
// Helpers
// ============================================================

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LoggerService;
}

function createMockSessionManager(): ConsoleSessionManager {
  return {
    validateTokenForUpgrade: vi.fn(),
    consumeToken: vi.fn(),
    getUpstreamUrl: vi.fn(),
    terminateSession: vi.fn(),
    validateToken: vi.fn(),
    heartbeat: vi.fn(),
    getSession: vi.fn(),
    getActiveSessionCount: vi.fn(),
    createSession: vi.fn(),
    terminateAllForProvider: vi.fn(),
    cleanupExpiredSessions: vi.fn(),
  } as unknown as ConsoleSessionManager;
}

function createMockUpstream(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
  } as unknown as WebSocket;
}

function createMockClientWs(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
  } as unknown as WebSocket;
}

function createMockSession(): ConsoleSession {
  return {
    sessionId: "test-session-id",
    token: "test-token",
    wsUrl: "/ws/console/terminal",
    transport: "websocket-terminal",
    state: "active",
    startedAt: new Date().toISOString(),
    nodeId: "node-test",
    userId: "user-test",
    provider: "proxmox",
  };
}

/**
 * Creates a ConsoleWebSocketProxy instance with mocked dependencies.
 * We use a fake HTTP server that doesn't actually listen.
 */
function createProxy(): {
  proxy: ConsoleWebSocketProxy;
  sessionManager: ConsoleSessionManager;
} {
  const mockHttpServer = {
    on: vi.fn(),
  } as unknown as HTTPServer;

  const sessionManager = createMockSessionManager();
  const logger = createMockLogger();
  const config = {
    allowedOrigins: [],
    console: {
      sessionTimeoutMs: 300000,
      maxSessionDuration: 28800000,
      maxConcurrentSessions: 3,
      heartbeatIntervalMs: 30000,
    },
  };

  const proxy = new ConsoleWebSocketProxy(
    mockHttpServer,
    sessionManager,
    config,
    logger,
  );

  return { proxy, sessionManager };
}

// ============================================================
// Arbitraries
// ============================================================

/**
 * Arbitrary: Unrecognized type byte (anything != 0x01).
 * Combined with a random payload of 0–50 bytes.
 */
const unrecognizedTypeFrameArb: fc.Arbitrary<Buffer> = fc
  .integer({ min: 0, max: 255 })
  .filter((b) => b !== RESIZE_TYPE)
  .chain((typeByte) =>
    fc.uint8Array({ minLength: 0, maxLength: 50 }).map((payload) => {
      const buf = Buffer.alloc(1 + payload.length);
      buf[0] = typeByte;
      payload.forEach((byte, i) => { buf[i + 1] = byte; });
      return buf;
    }),
  );

/**
 * Arbitrary: Truncated resize frame.
 * First byte is 0x01 (resize), but total length is 1–4 bytes (< 5).
 */
const truncatedResizeFrameArb: fc.Arbitrary<Buffer> = fc
  .integer({ min: 1, max: RESIZE_FRAME_LENGTH - 1 })
  .chain((totalLength) =>
    fc.uint8Array({ minLength: totalLength, maxLength: totalLength }).map((bytes) => {
      const buf = Buffer.from(bytes);
      buf[0] = RESIZE_TYPE; // Force first byte to resize type
      return buf;
    }),
  );

/**
 * Arbitrary: Empty frame (0 bytes).
 */
const emptyFrameArb: fc.Arbitrary<Buffer> = fc.constant(Buffer.alloc(0));

/**
 * Arbitrary: All malformed frames combined.
 * Union of empty, unrecognized type, and truncated resize.
 */
const malformedFrameArb: fc.Arbitrary<Buffer> = fc.oneof(
  emptyFrameArb,
  unrecognizedTypeFrameArb,
  truncatedResizeFrameArb,
);

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 16: Malformed control message resilience", () => {
  let proxy: ConsoleWebSocketProxy;
  let handleMessage: (data: Buffer, upstream: WebSocket, session: ConsoleSession) => void;

  beforeEach(() => {
    const created = createProxy();
    proxy = created.proxy;
    // Access private method via bracket notation, bound to the proxy instance
    const rawFn = (proxy as unknown as Record<string, unknown>)[
      "handleTerminalControlMessage"
    ] as (data: Buffer, upstream: WebSocket, session: ConsoleSession) => void;
    handleMessage = rawFn.bind(proxy);
  });

  it("discards frames with unrecognized type bytes without sending upstream or terminating session", () => {
    fc.assert(
      fc.property(unrecognizedTypeFrameArb, (frame) => {
        const upstream = createMockUpstream();
        const session = createMockSession();

        handleMessage(frame, upstream, session);

        // Upstream must NOT receive any data
        expect(upstream.send).not.toHaveBeenCalled();
        // Session must NOT be terminated (no close on clientWs proxy)
        expect(upstream.close).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("discards truncated resize frames (type 0x01, length < 5) without sending upstream or terminating session", () => {
    fc.assert(
      fc.property(truncatedResizeFrameArb, (frame) => {
        const upstream = createMockUpstream();
        const session = createMockSession();

        handleMessage(frame, upstream, session);

        expect(upstream.send).not.toHaveBeenCalled();
        expect(upstream.close).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("discards empty frames (0 bytes) without sending upstream or terminating session", () => {
    fc.assert(
      fc.property(emptyFrameArb, (frame) => {
        const upstream = createMockUpstream();
        const session = createMockSession();

        handleMessage(frame, upstream, session);

        expect(upstream.send).not.toHaveBeenCalled();
        expect(upstream.close).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("all malformed frames are discarded: upstream never receives data, session continues", () => {
    fc.assert(
      fc.property(malformedFrameArb, (frame) => {
        const upstream = createMockUpstream();
        const session = createMockSession();

        handleMessage(frame, upstream, session);

        // Core property: malformed → discard without side effects
        expect(upstream.send).not.toHaveBeenCalled();
        expect(upstream.close).not.toHaveBeenCalled();
        expect(upstream.terminate).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("valid resize frames (type 0x01, length >= 5, valid dimensions) ARE forwarded upstream", () => {
    // Counter-property: verifies that non-malformed frames DO get forwarded,
    // confirming the test is not trivially passing.
    const validResizeArb = fc.tuple(
      fc.integer({ min: 1, max: 500 }),
      fc.integer({ min: 1, max: 200 }),
    ).map(([cols, rows]) => {
      const buf = Buffer.alloc(RESIZE_FRAME_LENGTH);
      buf[0] = RESIZE_TYPE;
      buf.writeUInt16BE(cols, 1);
      buf.writeUInt16BE(rows, 3);
      return buf;
    });

    fc.assert(
      fc.property(validResizeArb, (frame) => {
        const upstream = createMockUpstream();
        const session = createMockSession();

        handleMessage(frame, upstream, session);

        // Valid resize frame SHOULD be forwarded
        expect(upstream.send).toHaveBeenCalledWith(frame, { binary: true });
      }),
      { numRuns: 100 },
    );
  });
});
