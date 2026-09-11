import { initializeTestSchema } from "../helpers/schema";
import { ensureConsoleUser } from "../helpers/consoleUser";
/**
 * Property-Based Tests for Console Session Token Claiming
 *
 * Feature: console-integration, Property 2: Session token validation correctness
 *
 * **Validates: Requirements 4.2, 4.3, 5.2, 5.3, 8.1, 8.2**
 *
 * Property 2: Session token validation correctness
 * ∀ token, state, age, consumed flag:
 *   claimTokenForUpgrade(token) returns a ConsoleSession iff:
 *     - token exists in the database
 *     - token was created < 60s ago
 *     - token has not been consumed (tokenConsumed === 0)
 *     - the session is still live ('creating' or 'active')
 *   All other combinations → null (rejected)
 *
 * A15 (S08) replaced the read-then-decide validators with this single
 * conditional update, so validation and consumption cannot come apart. There
 * is no connecting-userId argument any more: the upgrade handshake carries no
 * identity, and ownership is the row the token resolves to. The token itself
 * is 32 random bytes, single use, and bound to one session.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleConfig } from "../../src/config/schema";

const CONSOLE_CONFIG: ConsoleConfig = {
  sessionTimeoutMs: 300000,
  maxSessionDuration: 28800000,
  maxConcurrentSessions: 3,
  heartbeatIntervalMs: 30000,
};

function createMockLogger(): LoggerService {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerService;
}

function createMockAuditLogger(): AuditLoggingService {
  return {
    logAdminAction: async () => {},
  } as unknown as AuditLoggingService;
}

/** Arbitrary: hex-like token strings (16–64 hex chars) */
const tokenArb = fc.stringMatching(/^[0-9a-f]{16,64}$/);

/** Arbitrary: user IDs (alphanumeric, 4–20 chars) */
const userIdArb = fc.stringMatching(/^[a-z0-9]{4,20}$/);

/** Arbitrary: session IDs */
const sessionIdArb = fc.uuid();

/** Arbitrary: node IDs */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{3,10}$/);

/** Arbitrary: provider names */
const providerArb = fc.constantFrom("proxmox", "aws", "azure");

/** Arbitrary: transport types */
const transportArb = fc.constantFrom(
  "websocket-vnc" as const,
  "websocket-terminal" as const,
);

/** Live states hold a slot and accept an upgrade; the others must not. */
const LIVE_STATES = ["creating", "active"] as const;
const stateArb = fc.constantFrom(
  "creating" as const,
  "active" as const,
  "terminated" as const,
  "failed" as const,
);

/**
 * Represents a session row to insert, with controllable validity factors.
 */
interface TestSessionParams {
  sessionId: string;
  ownerUserId: string;
  nodeId: string;
  provider: string;
  transport: "websocket-vnc" | "websocket-terminal";
  token: string;
  /** Milliseconds ago the token was created (0 = now) */
  tokenAgeMs: number;
  /** Whether token has been consumed */
  consumed: boolean;
  /** Session state at claim time */
  state: "creating" | "active" | "terminated" | "failed";
}

const testSessionArb: fc.Arbitrary<TestSessionParams> = fc.record({
  sessionId: sessionIdArb,
  ownerUserId: userIdArb,
  nodeId: nodeIdArb,
  provider: providerArb,
  transport: transportArb,
  token: tokenArb,
  // Ages from 0ms to 120s to cover both valid (<60s) and expired (>=60s)
  tokenAgeMs: fc.integer({ min: 0, max: 120000 }),
  consumed: fc.boolean(),
  state: stateArb,
});

function isLive(state: TestSessionParams["state"]): boolean {
  return (LIVE_STATES as readonly string[]).includes(state);
}

async function insertSession(
  db: SQLiteAdapter,
  params: TestSessionParams,
): Promise<void> {
  await ensureConsoleUser(db, params.ownerUserId);
  const tokenCreatedAt = new Date(
    Date.now() - params.tokenAgeMs,
  ).toISOString();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO console_sessions (
      id, user_id, node_id, provider, transport, state,
      token, token_created_at, token_consumed, upstream_url,
      started_at, last_heartbeat_at, session_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
    [
      params.sessionId,
      params.ownerUserId,
      params.nodeId,
      params.provider,
      params.transport,
      params.state,
      params.token,
      tokenCreatedAt,
      params.consumed ? 1 : 0,
      now,
      now,
    ],
  );
}

describe("Feature: console-integration, Property 2: Session token validation correctness", () => {
  let db: SQLiteAdapter;
  let sessionManager: ConsoleSessionManager;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);
    sessionManager = new ConsoleSessionManager(
      db,
      CONSOLE_CONFIG,
      createMockLogger(),
      createMockAuditLogger(),
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it("valid token accepted: exists, <60s old, not consumed, session live", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        // Force all validity conditions
        const validParams: TestSessionParams = {
          ...params,
          tokenAgeMs: Math.min(params.tokenAgeMs, 59000), // <60s
          consumed: false,
          state: "active",
        };

        // Clean slate for each run
        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, validParams);

        const result = await sessionManager.claimTokenForUpgrade(validParams.token);

        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe(validParams.sessionId);
        expect(result!.userId).toBe(validParams.ownerUserId);
        expect(result!.token).toBe(validParams.token);
      }),
      { numRuns: 100 },
    );
  });

  it("the claim consumes the token, so a replayed upgrade is refused", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        const validParams: TestSessionParams = {
          ...params,
          tokenAgeMs: Math.min(params.tokenAgeMs, 59000),
          consumed: false,
          state: "active",
        };

        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, validParams);

        await expect(
          sessionManager.claimTokenForUpgrade(validParams.token),
        ).resolves.not.toBeNull();
        await expect(
          sessionManager.claimTokenForUpgrade(validParams.token),
        ).resolves.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected when it does not exist in DB", async () => {
    await fc.assert(
      fc.asyncProperty(tokenArb, async (token) => {
        // Empty DB — no tokens exist
        await db.execute("DELETE FROM console_sessions");

        const result = await sessionManager.claimTokenForUpgrade(token);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected when consumed (tokenConsumed !== 0)", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        const consumedParams: TestSessionParams = {
          ...params,
          tokenAgeMs: Math.min(params.tokenAgeMs, 59000), // valid age
          consumed: true, // consumed → should be rejected
          state: "active",
        };

        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, consumedParams);

        const result = await sessionManager.claimTokenForUpgrade(consumedParams.token);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected when expired (created >= 60s ago)", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        const expiredParams: TestSessionParams = {
          ...params,
          tokenAgeMs: Math.max(params.tokenAgeMs, 60000), // >=60s
          consumed: false,
          state: "active",
        };

        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, expiredParams);

        const result = await sessionManager.claimTokenForUpgrade(expiredParams.token);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected once the session is no longer live", async () => {
    await fc.assert(
      fc.asyncProperty(
        testSessionArb,
        fc.constantFrom("terminated" as const, "failed" as const),
        async (params, deadState) => {
          const deadParams: TestSessionParams = {
            ...params,
            tokenAgeMs: Math.min(params.tokenAgeMs, 59000), // valid age
            consumed: false,
            state: deadState,
          };

          await db.execute("DELETE FROM console_sessions");
          await insertSession(db, deadParams);

          const result = await sessionManager.claimTokenForUpgrade(deadParams.token);
          expect(result).toBeNull();

          // The refusal leaves the token unconsumed rather than mutating a
          // dead row: the state is what refused it.
          const row = await db.queryOne<{ consumed: number }>(
            `SELECT token_consumed AS "consumed" FROM console_sessions WHERE id = ?`,
            [deadParams.sessionId],
          );
          expect(row?.consumed).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("token claiming is a conjunction: ALL conditions must hold for acceptance", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, params);

        const result = await sessionManager.claimTokenForUpgrade(params.token);

        const claimable =
          params.tokenAgeMs < 60000 && !params.consumed && isLive(params.state);

        if (claimable) {
          expect(result).not.toBeNull();
          expect(result!.sessionId).toBe(params.sessionId);
        } else {
          expect(result).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
