/**
 * Property-Based Tests for Terminal Resize Dimension Validation
 *
 * Feature: console-integration, Property 4: Terminal resize dimension validation
 *
 * **Validates: Requirements 5.5, 5.8**
 *
 * Property 4: Terminal resize dimension validation
 * ∀ resize control message with columns/rows:
 *   resize propagated iff columns ∈ [1, 500] AND rows ∈ [1, 200];
 *   otherwise discarded without session termination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { WebSocket } from "ws";
import type { Server as HTTPServer } from "http";

import { ConsoleWebSocketProxy } from "../../src/services/ConsoleWebSocketProxy";
import type { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleSession } from "../../src/integrations/console/types";

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
    generateToken: vi.fn(),
    createSession: vi.fn(),
    validateToken: vi.fn(),
    consumeToken: vi.fn(),
    heartbeat: vi.fn(),
    terminateSession: vi.fn(),
    getActiveSessionCount: vi.fn(),
    terminateAllForProvider: vi.fn(),
    cleanupExpiredSessions: vi.fn(),
    getSession: vi.fn(),
  } as unknown as ConsoleSessionManager;
}

function createMockHttpServer(): HTTPServer {
  return { on: vi.fn() } as unknown as HTTPServer;
}

function createMockUpstream(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
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
    nodeId: "node-1",
    userId: "user-1",
    provider: "test-provider",
  };
}

/** Build a valid 5-byte resize control message buffer. */
function buildResizeBuffer(columns: number, rows: number): Buffer {
  const buf = Buffer.alloc(5);
  buf[0] = 0x01; // RESIZE type
  buf.writeUInt16BE(columns, 1);
  buf.writeUInt16BE(rows, 3);
  return buf;
}

// ============================================================
// Arbitraries
// ============================================================

/** Full uint16 range for columns */
const columnsArb = fc.integer({ min: 0, max: 65535 });

/** Full uint16 range for rows */
const rowsArb = fc.integer({ min: 0, max: 65535 });

/** Valid columns: [1, 500] */
const validColumnsArb = fc.integer({ min: 1, max: 500 });

/** Valid rows: [1, 200] */
const validRowsArb = fc.integer({ min: 1, max: 200 });

/** Invalid columns: 0 or > 500 (within uint16) */
const invalidColumnsArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 501, max: 65535 }),
);

/** Invalid rows: 0 or > 200 (within uint16) */
const invalidRowsArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 201, max: 65535 }),
);

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 4: Terminal resize dimension validation", () => {
  let proxy: ConsoleWebSocketProxy;
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
    const sessionManager = createMockSessionManager();
    const httpServer = createMockHttpServer();

    proxy = new ConsoleWebSocketProxy(
      httpServer,
      sessionManager,
      { allowedOrigins: ["http://localhost:3000"], console: { sessionTimeoutMs: 300000, maxSessionDuration: 28800000, maxConcurrentSessions: 3, heartbeatIntervalMs: 30000 } },
      logger,
    );
  });

  it("propagates resize when columns ∈ [1,500] AND rows ∈ [1,200]", () => {
    fc.assert(
      fc.property(validColumnsArb, validRowsArb, (columns, rows) => {
        const upstream = createMockUpstream();
        const session = createMockSession();
        const data = buildResizeBuffer(columns, rows);

        // Call private method via bracket notation
        (proxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        // upstream.send must have been called with the exact buffer
        expect(upstream.send).toHaveBeenCalledTimes(1);
        expect(upstream.send).toHaveBeenCalledWith(data, { binary: true });
      }),
      { numRuns: 100 },
    );
  });

  it("discards resize when columns or rows are outside valid range", () => {
    fc.assert(
      fc.property(columnsArb, rowsArb, (columns, rows) => {
        // Pre-condition: at least one dimension is out of valid range
        const columnsValid = columns >= 1 && columns <= 500;
        const rowsValid = rows >= 1 && rows <= 200;
        fc.pre(!(columnsValid && rowsValid));

        const upstream = createMockUpstream();
        const session = createMockSession();
        const data = buildResizeBuffer(columns, rows);

        (proxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        // upstream.send must NOT have been called
        expect(upstream.send).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("never terminates session regardless of dimension validity", () => {
    fc.assert(
      fc.property(columnsArb, rowsArb, (columns, rows) => {
        const upstream = createMockUpstream();
        const session = createMockSession();
        const sessionManager = createMockSessionManager();
        const httpServer = createMockHttpServer();
        const localLogger = createMockLogger();

        const localProxy = new ConsoleWebSocketProxy(
          httpServer,
          sessionManager,
          { allowedOrigins: ["http://localhost:3000"], console: { sessionTimeoutMs: 300000, maxSessionDuration: 28800000, maxConcurrentSessions: 3, heartbeatIntervalMs: 30000 } },
          localLogger,
        );

        const data = buildResizeBuffer(columns, rows);

        (localProxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        // Session must never be terminated
        expect(sessionManager.terminateSession).not.toHaveBeenCalled();
        // Upstream must never be closed
        expect(upstream.close).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("resize propagation is correct: send called iff both dimensions valid", () => {
    fc.assert(
      fc.property(columnsArb, rowsArb, (columns, rows) => {
        const upstream = createMockUpstream();
        const session = createMockSession();
        const data = buildResizeBuffer(columns, rows);

        (proxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        const shouldPropagate = columns >= 1 && columns <= 500 && rows >= 1 && rows <= 200;

        if (shouldPropagate) {
          expect(upstream.send).toHaveBeenCalledTimes(1);
          expect(upstream.send).toHaveBeenCalledWith(data, { binary: true });
        } else {
          expect(upstream.send).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("specifically tests invalid columns with valid rows → discarded", () => {
    fc.assert(
      fc.property(invalidColumnsArb, validRowsArb, (columns, rows) => {
        const upstream = createMockUpstream();
        const session = createMockSession();
        const data = buildResizeBuffer(columns, rows);

        (proxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        expect(upstream.send).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it("specifically tests valid columns with invalid rows → discarded", () => {
    fc.assert(
      fc.property(validColumnsArb, invalidRowsArb, (columns, rows) => {
        const upstream = createMockUpstream();
        const session = createMockSession();
        const data = buildResizeBuffer(columns, rows);

        (proxy as unknown as Record<string, unknown>)["handleTerminalControlMessage"](
          data, upstream, session,
        );

        expect(upstream.send).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
