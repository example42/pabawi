/**
 * Property-Based Tests for Console Session Record Completeness
 *
 * Feature: console-integration, Property 8: Session record completeness
 *
 * **Validates: Requirements 2.7**
 *
 * Property 8: Session record completeness
 * ∀ random ConsoleSession inputs:
 *   after createSession, the stored DB record SHALL have non-null
 *   id, user_id, node_id, provider, started_at, last_heartbeat_at.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { ConsoleSession } from "../../src/integrations/console/types";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleConfig } from "../../src/config/schema";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS console_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    transport TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'creating',
    token TEXT,
    token_created_at TEXT,
    token_consumed INTEGER NOT NULL DEFAULT 0,
    upstream_url TEXT,
    started_at TEXT NOT NULL,
    last_heartbeat_at TEXT,
    terminated_at TEXT,
    error_message TEXT,
    CONSTRAINT chk_state CHECK (state IN ('creating', 'active', 'terminated', 'failed')),
    CONSTRAINT chk_transport CHECK (transport IN ('websocket-vnc', 'websocket-terminal'))
  )
`;

/** Arbitrary: hex string of given length */
function hexStringArb(length: number): fc.Arbitrary<string> {
  return fc
    .array(
      fc.integer({ min: 0, max: 15 }).map((n) => n.toString(16)),
      { minLength: length, maxLength: length },
    )
    .map((chars) => chars.join(""));
}

/** Arbitrary: UUID-like string */
const uuidArb = fc
  .tuple(
    hexStringArb(8),
    hexStringArb(4),
    hexStringArb(4),
    hexStringArb(4),
    hexStringArb(12),
  )
  .map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`);

/** Arbitrary: random user IDs */
const userIdArb = fc
  .tuple(fc.constantFrom("user", "admin", "operator", "svc"), fc.nat({ max: 99999 }))
  .map(([prefix, n]) => `${prefix}-${String(n)}`);

/** Arbitrary: random node IDs */
const nodeIdArb = fc
  .tuple(fc.constantFrom("node", "vm", "lxc", "host"), fc.nat({ max: 99999 }))
  .map(([prefix, n]) => `${prefix}-${String(n)}`);

/** Arbitrary: random provider names */
const providerArb = fc.constantFrom("proxmox", "aws", "azure", "ssh", "custom-provider");

/** Arbitrary: random transport types */
const transportArb = fc.constantFrom<"websocket-vnc" | "websocket-terminal">(
  "websocket-vnc",
  "websocket-terminal",
);

/** Arbitrary: a full ConsoleSession object */
const consoleSessionArb = fc
  .tuple(uuidArb, userIdArb, nodeIdArb, providerArb, transportArb)
  .map(([sessionId, userId, nodeId, provider, transport]): ConsoleSession => ({
    sessionId,
    userId,
    nodeId,
    provider,
    transport,
    state: "active",
    token: `tok-${sessionId}`,
    wsUrl: `/ws/console/${transport === "websocket-vnc" ? "vnc" : "terminal"}?token=tok-${sessionId}`,
    startedAt: new Date().toISOString(),
  }));

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LoggerService;
}

function createMockAuditLogger(): AuditLoggingService {
  return {
    logAdminAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLoggingService;
}

const defaultConfig: ConsoleConfig = {
  sessionTimeoutMs: 300000,
  maxSessionDuration: 28800000,
  maxConcurrentSessions: 3,
  heartbeatIntervalMs: 30000,
};

describe("Feature: console-integration, Property 8: Session record completeness", () => {
  let db: SQLiteAdapter;
  let sessionManager: ConsoleSessionManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await db.execute(CREATE_TABLE_SQL);
    sessionManager = new ConsoleSessionManager(
      db,
      defaultConfig,
      createMockLogger(),
      createMockAuditLogger(),
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it("stored session record always has non-null id, user_id, node_id, provider, started_at, last_heartbeat_at", async () => {
    await fc.assert(
      fc.asyncProperty(consoleSessionArb, async (session) => {
        await sessionManager.createSession(session);

        const row = await db.queryOne<{
          id: string | null;
          user_id: string | null;
          node_id: string | null;
          provider: string | null;
          started_at: string | null;
          last_heartbeat_at: string | null;
        }>(
          `SELECT id, user_id, node_id, provider, started_at, last_heartbeat_at
           FROM console_sessions WHERE id = ?`,
          [session.sessionId],
        );

        expect(row).not.toBeNull();
        expect(row!.id).not.toBeNull();
        expect(row!.user_id).not.toBeNull();
        expect(row!.node_id).not.toBeNull();
        expect(row!.provider).not.toBeNull();
        expect(row!.started_at).not.toBeNull();
        expect(row!.last_heartbeat_at).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("stored session record fields match the input values", async () => {
    await fc.assert(
      fc.asyncProperty(consoleSessionArb, async (session) => {
        await sessionManager.createSession(session);

        const row = await db.queryOne<{
          id: string;
          user_id: string;
          node_id: string;
          provider: string;
        }>(
          `SELECT id, user_id, node_id, provider
           FROM console_sessions WHERE id = ?`,
          [session.sessionId],
        );

        expect(row).not.toBeNull();
        expect(row!.id).toBe(session.sessionId);
        expect(row!.user_id).toBe(session.userId);
        expect(row!.node_id).toBe(session.nodeId);
        expect(row!.provider).toBe(session.provider);
      }),
      { numRuns: 100 },
    );
  });
});
