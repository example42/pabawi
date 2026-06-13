/**
 * Property-Based Tests for Console Audit Log Completeness
 *
 * Feature: console-integration, Property 9: Audit log completeness for session events
 *
 * **Validates: Requirements 8.4**
 *
 * Property 9: Audit log completeness for session events
 * ∀ session create/terminate event:
 *   the audit log entry SHALL contain userId, nodeId, provider, action type, and ISO 8601 timestamp.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleConfig } from "../../src/config/schema";
import type { ConsoleSession } from "../../src/integrations/console/types";
import { initializeTestSchema } from "../helpers/schema";

// ============================================================
// Constants
// ============================================================

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const DEFAULT_CONSOLE_CONFIG: ConsoleConfig = {
  sessionTimeoutMs: 300000,
  maxSessionDuration: 28800000,
  maxConcurrentSessions: 3,
  heartbeatIntervalMs: 30000,
};

// ============================================================
// Arbitraries
// ============================================================

/** Non-empty alphanumeric string for IDs */
const idArb = fc.stringMatching(/^[a-z0-9]{8,32}$/);

/** Provider names */
const providerArb = fc.constantFrom("proxmox", "aws", "azure", "ssh");

/** Transport types */
const transportArb = fc.constantFrom(
  "websocket-vnc" as const,
  "websocket-terminal" as const,
);

/** Terminate reasons */
const terminateReasonArb = fc.constantFrom(
  "user_disconnect",
  "session_timeout",
  "admin_terminate",
  "upstream_failure",
  "max_duration_exceeded",
);

/** Arbitrary for session data used in createSession */
const sessionDataArb = fc.record({
  sessionId: idArb,
  userId: idArb,
  nodeId: idArb,
  provider: providerArb,
  transport: transportArb,
});

// ============================================================
// Test Helpers
// ============================================================

interface AuditCall {
  action: string;
  userId: string;
  details?: Record<string, unknown>;
}

function createMockAuditLogger(): AuditLoggingService & { calls: AuditCall[] } {
  const calls: AuditCall[] = [];
  return {
    calls,
    logAdminAction: vi.fn(
      async (
        action: string,
        userId: string,
        details?: Record<string, unknown>,
      ) => {
        calls.push({ action, userId, details });
      },
    ),
  } as unknown as AuditLoggingService & { calls: AuditCall[] };
}

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LoggerService;
}

function buildConsoleSession(data: {
  sessionId: string;
  userId: string;
  nodeId: string;
  provider: string;
  transport: "websocket-vnc" | "websocket-terminal";
}): ConsoleSession {
  return {
    sessionId: data.sessionId,
    userId: data.userId,
    nodeId: data.nodeId,
    provider: data.provider,
    transport: data.transport,
    state: "active",
    token: `token-${data.sessionId}`,
    wsUrl: `/ws/console/terminal?token=token-${data.sessionId}`,
    startedAt: new Date().toISOString(),
  };
}

// ============================================================
// Tests
// ============================================================

describe("Feature: console-integration, Property 9: Audit log completeness for session events", () => {
  let db: DatabaseAdapter;
  let auditLogger: AuditLoggingService & { calls: AuditCall[] };
  let logger: LoggerService;
  let sessionManager: ConsoleSessionManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);

    auditLogger = createMockAuditLogger();
    logger = createMockLogger();
    sessionManager = new ConsoleSessionManager(
      db,
      DEFAULT_CONSOLE_CONFIG,
      logger,
      auditLogger,
    );
  });

  afterEach(async () => {
    await (db as SQLiteAdapter).close();
    vi.restoreAllMocks();
  });

  it("createSession audit entry contains userId, nodeId, provider, action, and ISO 8601 timestamp", () => {
    return fc.assert(
      fc.asyncProperty(sessionDataArb, async (data) => {
        auditLogger.calls.length = 0;

        const session = buildConsoleSession(data);
        await sessionManager.createSession(session);

        expect(auditLogger.calls.length).toBe(1);
        const call = auditLogger.calls[0];

        // Action type
        expect(call.action).toBe("console_session_create");

        // userId passed as second arg
        expect(call.userId).toBe(data.userId);

        // Details contain nodeId, provider, sessionId, timestamp
        expect(call.details).toBeDefined();
        expect(call.details!.nodeId).toBe(data.nodeId);
        expect(call.details!.provider).toBe(data.provider);
        expect(call.details!.sessionId).toBe(data.sessionId);
        expect(call.details!.timestamp).toMatch(ISO_8601_PATTERN);
      }),
      { numRuns: 100 },
    );
  });

  it("terminateSession audit entry contains userId, nodeId, provider, action, and ISO 8601 timestamp", () => {
    return fc.assert(
      fc.asyncProperty(
        sessionDataArb,
        terminateReasonArb,
        async (data, reason) => {
          auditLogger.calls.length = 0;

          // First create the session so terminateSession can find it
          const session = buildConsoleSession(data);
          await sessionManager.createSession(session);

          // Clear audit calls from createSession
          auditLogger.calls.length = 0;

          await sessionManager.terminateSession(data.sessionId, reason);

          expect(auditLogger.calls.length).toBe(1);
          const call = auditLogger.calls[0];

          // Action type
          expect(call.action).toBe("console_session_terminate");

          // userId passed as second arg
          expect(call.userId).toBe(data.userId);

          // Details contain nodeId, provider, sessionId, reason, timestamp
          expect(call.details).toBeDefined();
          expect(call.details!.nodeId).toBe(data.nodeId);
          expect(call.details!.provider).toBe(data.provider);
          expect(call.details!.sessionId).toBe(data.sessionId);
          expect(call.details!.reason).toBe(reason);
          expect(call.details!.timestamp).toMatch(ISO_8601_PATTERN);
        },
      ),
      { numRuns: 100 },
    );
  });
});
