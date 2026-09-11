import { initializeTestSchema } from "../helpers/schema";
import { ensureConsoleUser } from "../helpers/consoleUser";
/**
 * Property-Based Tests for Console Session Record Completeness
 *
 * Feature: console-integration, Property 8: Session record completeness
 *
 * **Validates: Requirements 2.7**
 *
 * Property 8: Session record completeness
 * ∀ random reservation requests:
 *   after reserveSession, the stored DB record SHALL have non-null
 *   id, user_id, node_id, provider, started_at, last_heartbeat_at, hold its
 *   slot as 'creating', and persist no connection material.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleConfig } from "../../src/config/schema";


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

/**
 * Arbitrary: the request a reservation is made from.
 *
 * The id, token and timestamps are the manager's to mint, so the record's
 * completeness is a property of the reservation rather than of the input.
 */
const reservationRequestArb = fc
  .tuple(userIdArb, nodeIdArb, providerArb, transportArb)
  .map(([userId, nodeId, provider, transport]) => ({ userId, nodeId, provider, transport }));

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
    await initializeTestSchema(db);
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
      fc.asyncProperty(reservationRequestArb, async (request) => {
        await db.execute("DELETE FROM console_sessions");
        await ensureConsoleUser(db, request.userId);
        const reservation = await sessionManager.reserveSession(request);

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
          [reservation.sessionId],
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
      fc.asyncProperty(reservationRequestArb, async (request) => {
        await db.execute("DELETE FROM console_sessions");
        await ensureConsoleUser(db, request.userId);
        const reservation = await sessionManager.reserveSession(request);

        const row = await db.queryOne<{
          id: string;
          user_id: string;
          node_id: string;
          provider: string;
          state: string;
          token: string;
          upstream_url: string | null;
        }>(
          `SELECT id, user_id, node_id, provider, state, token, upstream_url
           FROM console_sessions WHERE id = ?`,
          [reservation.sessionId],
        );

        expect(row).not.toBeNull();
        expect(row!.id).toBe(reservation.sessionId);
        expect(row!.user_id).toBe(request.userId);
        expect(row!.node_id).toBe(request.nodeId);
        expect(row!.provider).toBe(request.provider);
        expect(row!.token).toBe(reservation.token);
        // A reservation holds a slot before any provider work happens.
        expect(row!.state).toBe("creating");
        // Connection material is a credential and lives only in the broker.
        expect(row!.upstream_url).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
