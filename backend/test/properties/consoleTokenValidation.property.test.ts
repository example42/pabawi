/**
 * Property-Based Tests for Console Session Token Validation
 *
 * Feature: console-integration, Property 2: Session token validation correctness
 *
 * **Validates: Requirements 4.2, 4.3, 5.2, 5.3, 8.1, 8.2**
 *
 * Property 2: Session token validation correctness
 * ∀ token, userId, timestamp, consumed state:
 *   validateToken(token, userId) returns a ConsoleSession iff:
 *     - token exists in DB
 *     - token was created < 60s ago
 *     - token has not been consumed (tokenConsumed === 0)
 *     - connecting userId matches session owner
 *   All other combinations → null (rejected)
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT chk_state CHECK (state IN ('creating', 'active', 'terminated', 'failed')),
    CONSTRAINT chk_transport CHECK (transport IN ('websocket-vnc', 'websocket-terminal'))
  );
  CREATE INDEX IF NOT EXISTS idx_console_sessions_token ON console_sessions(token);
`;

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
});

async function insertSession(
  db: SQLiteAdapter,
  params: TestSessionParams,
): Promise<void> {
  const tokenCreatedAt = new Date(
    Date.now() - params.tokenAgeMs,
  ).toISOString();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO console_sessions (
      id, user_id, node_id, provider, transport, state,
      token, token_created_at, token_consumed, upstream_url,
      started_at, last_heartbeat_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?, ?)`,
    [
      params.sessionId,
      params.ownerUserId,
      params.nodeId,
      params.provider,
      params.transport,
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
    await db.execute(CREATE_TABLE_SQL);
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

  it("valid token accepted: exists, <60s old, not consumed, userId matches owner", async () => {
    await fc.assert(
      fc.asyncProperty(testSessionArb, async (params) => {
        // Force all validity conditions
        const validParams: TestSessionParams = {
          ...params,
          tokenAgeMs: Math.min(params.tokenAgeMs, 59000), // <60s
          consumed: false,
        };

        // Clean slate for each run
        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, validParams);

        const result = await sessionManager.validateToken(
          validParams.token,
          validParams.ownerUserId,
        );

        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe(validParams.sessionId);
        expect(result!.userId).toBe(validParams.ownerUserId);
        expect(result!.token).toBe(validParams.token);
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected when it does not exist in DB", async () => {
    await fc.assert(
      fc.asyncProperty(tokenArb, userIdArb, async (token, userId) => {
        // Empty DB — no tokens exist
        await db.execute("DELETE FROM console_sessions");

        const result = await sessionManager.validateToken(token, userId);
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
        };

        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, consumedParams);

        const result = await sessionManager.validateToken(
          consumedParams.token,
          consumedParams.ownerUserId,
        );
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
        };

        await db.execute("DELETE FROM console_sessions");
        await insertSession(db, expiredParams);

        const result = await sessionManager.validateToken(
          expiredParams.token,
          expiredParams.ownerUserId,
        );
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("token rejected when connecting userId does not match session owner", async () => {
    await fc.assert(
      fc.asyncProperty(
        testSessionArb,
        userIdArb,
        async (params, differentUserId) => {
          // Ensure the connecting user is different from the owner
          fc.pre(differentUserId !== params.ownerUserId);

          const validParams: TestSessionParams = {
            ...params,
            tokenAgeMs: Math.min(params.tokenAgeMs, 59000), // valid age
            consumed: false,
          };

          await db.execute("DELETE FROM console_sessions");
          await insertSession(db, validParams);

          const result = await sessionManager.validateToken(
            validParams.token,
            differentUserId,
          );
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("token validation is a conjunction: ALL conditions must hold for acceptance", async () => {
    await fc.assert(
      fc.asyncProperty(
        testSessionArb,
        userIdArb,
        fc.boolean(),
        async (params, connectingUserId, useCorrectUser) => {
          const connectAs = useCorrectUser
            ? params.ownerUserId
            : connectingUserId;

          // Skip when "different" user accidentally equals owner
          if (!useCorrectUser) {
            fc.pre(connectAs !== params.ownerUserId);
          }

          await db.execute("DELETE FROM console_sessions");
          await insertSession(db, params);

          const result = await sessionManager.validateToken(
            params.token,
            connectAs,
          );

          const isValid =
            params.tokenAgeMs < 60000 &&
            !params.consumed &&
            connectAs === params.ownerUserId;

          if (isValid) {
            expect(result).not.toBeNull();
            expect(result!.sessionId).toBe(params.sessionId);
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
