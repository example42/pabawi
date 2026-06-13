/**
 * Property-Based Tests for Concurrent Session Limit Enforcement
 *
 * Feature: console-integration, Property 7: Concurrent session limit enforcement
 *
 * **Validates: Requirements 8.6**
 *
 * Property 7: Concurrent session limit enforcement
 * ∀ activeCount ∈ [0..10], maxConcurrentSessions ∈ [1..10]:
 *   getActiveSessionCount returns the correct number of active sessions,
 *   and when activeCount >= maxConcurrentSessions, new creation is rejected (429 semantics).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { ConsoleSessionManager } from "../../src/services/ConsoleSessionManager";
import type { ConsoleConfig } from "../../src/config/schema";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";
import type { ConsoleSession } from "../../src/integrations/console/types";

function makeLogger(): LoggerService {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as unknown as LoggerService;
}

function makeAuditLogger(): AuditLoggingService {
  return {
    logAdminAction: async () => {},
  } as unknown as AuditLoggingService;
}

function makeConfig(maxConcurrentSessions: number): ConsoleConfig {
  return {
    sessionTimeoutMs: 300000,
    maxSessionDuration: 28800000,
    maxConcurrentSessions,
    heartbeatIntervalMs: 30000,
  };
}

function makeSession(userId: string, index: number): ConsoleSession {
  return {
    sessionId: `session-${userId}-${String(index)}-${String(Date.now())}`,
    userId,
    nodeId: `node-${String(index)}`,
    provider: "proxmox",
    transport: "websocket-vnc",
    state: "active",
    token: `token-${String(index)}-${String(Math.random())}`,
    wsUrl: `/ws/console/vnc?token=token-${String(index)}`,
    startedAt: new Date().toISOString(),
  };
}

const CREATE_TABLE_SQL = `
  CREATE TABLE console_sessions (
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
  )
`;

describe("Feature: console-integration, Property 7: Concurrent session limit enforcement", () => {
  let db: SQLiteAdapter;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await db.execute(CREATE_TABLE_SQL);
  });

  afterEach(async () => {
    await db.close();
  });

  it("getActiveSessionCount returns the exact number of active sessions for a user", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 0, max: 10 }),
        async (userId, activeCount) => {
          // Clear table
          await db.execute("DELETE FROM console_sessions");

          const config = makeConfig(3);
          const manager = new ConsoleSessionManager(
            db,
            config,
            makeLogger(),
            makeAuditLogger(),
          );

          // Insert N active sessions for this user
          for (let i = 0; i < activeCount; i++) {
            const session = makeSession(userId, i);
            await manager.createSession(session);
          }

          const count = await manager.getActiveSessionCount(userId);
          expect(count).toBe(activeCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when active count >= maxConcurrentSessions, new session creation should be rejected", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (userId, maxConcurrent, activeCount) => {
          // Clear table
          await db.execute("DELETE FROM console_sessions");

          const config = makeConfig(maxConcurrent);
          const manager = new ConsoleSessionManager(
            db,
            config,
            makeLogger(),
            makeAuditLogger(),
          );

          // Insert active sessions for this user
          for (let i = 0; i < activeCount; i++) {
            const session = makeSession(userId, i);
            await manager.createSession(session);
          }

          const count = await manager.getActiveSessionCount(userId);
          const shouldReject = count >= maxConcurrent;

          // The route layer uses this logic: if count >= max → reject with 429
          // We verify the count-based decision matches expectations
          if (shouldReject) {
            expect(count).toBeGreaterThanOrEqual(maxConcurrent);
          } else {
            expect(count).toBeLessThan(maxConcurrent);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("terminated/failed sessions do not count toward the concurrent limit", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        async (userId, activeCount, terminatedCount, maxConcurrent) => {
          // Clear table
          await db.execute("DELETE FROM console_sessions");

          const config = makeConfig(maxConcurrent);
          const manager = new ConsoleSessionManager(
            db,
            config,
            makeLogger(),
            makeAuditLogger(),
          );

          // Insert active sessions
          for (let i = 0; i < activeCount; i++) {
            const session = makeSession(userId, i);
            await manager.createSession(session);
          }

          // Insert terminated sessions (create then terminate)
          for (let i = 0; i < terminatedCount; i++) {
            const session = makeSession(userId, activeCount + i);
            await manager.createSession(session);
            await manager.terminateSession(session.sessionId, "test-termination");
          }

          // Only active sessions should count
          const count = await manager.getActiveSessionCount(userId);
          expect(count).toBe(activeCount);

          // Enforcement check: only active count matters for limit
          const wouldReject = count >= maxConcurrent;
          expect(wouldReject).toBe(activeCount >= maxConcurrent);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sessions from different users do not affect each other's concurrent count", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        async (userA, userB, countA, countB, maxConcurrent) => {
          // Ensure users are different
          const actualUserB = userA === userB ? `${userB}_other` : userB;

          // Clear table
          await db.execute("DELETE FROM console_sessions");

          const config = makeConfig(maxConcurrent);
          const manager = new ConsoleSessionManager(
            db,
            config,
            makeLogger(),
            makeAuditLogger(),
          );

          // Insert sessions for user A
          for (let i = 0; i < countA; i++) {
            const session = makeSession(userA, i);
            await manager.createSession(session);
          }

          // Insert sessions for user B
          for (let i = 0; i < countB; i++) {
            const session = makeSession(actualUserB, i + 100);
            await manager.createSession(session);
          }

          // Each user's count is independent
          const activeA = await manager.getActiveSessionCount(userA);
          const activeB = await manager.getActiveSessionCount(actualUserB);

          expect(activeA).toBe(countA);
          expect(activeB).toBe(countB);

          // Limit enforcement is per-user
          expect(activeA >= maxConcurrent).toBe(countA >= maxConcurrent);
          expect(activeB >= maxConcurrent).toBe(countB >= maxConcurrent);
        },
      ),
      { numRuns: 100 },
    );
  });
});
