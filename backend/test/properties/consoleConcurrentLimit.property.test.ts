import { initializeTestSchema } from "../helpers/schema";
import { ensureConsoleUser } from "../helpers/consoleUser";
/**
 * Property-Based Tests for Concurrent Session Limit Enforcement
 *
 * Feature: console-integration, Property 7: Concurrent session limit enforcement
 *
 * **Validates: Requirements 8.6**
 *
 * Property 7: Concurrent session limit enforcement
 * ∀ held ∈ [0..10], maxConcurrentSessions ∈ [1..10]:
 *   reserveSession admits a session iff the user holds fewer than the cap, and
 *   the reservation itself is what holds the slot, so no provider resource can
 *   be created for a session the cap did not count (A15 / S09).
 *
 * The cap is enforced inside `reserveSession` rather than read by the caller,
 * so these properties exercise the reservation, not a count the route could
 * act on after it went stale.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import { SQLiteAdapter } from "../../src/database/SQLiteAdapter";
import { ConsoleSessionManager, ConsoleCapacityError } from "../../src/services/ConsoleSessionManager";
import type { ConsoleConfig } from "../../src/config/schema";
import type { AuditLoggingService } from "../../src/services/AuditLoggingService";
import type { LoggerService } from "../../src/services/LoggerService";

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

describe("Feature: console-integration, Property 7: Concurrent session limit enforcement", () => {
  let db: SQLiteAdapter;

  beforeEach(async () => {
    db = new SQLiteAdapter(":memory:");
    await db.initialize();
    await initializeTestSchema(db);
  });

  afterEach(async () => {
    await db.close();
  });

  function makeManager(maxConcurrent: number): ConsoleSessionManager {
    return new ConsoleSessionManager(db, makeConfig(maxConcurrent), makeLogger(), makeAuditLogger());
  }

  /** Reserve and activate one session, the shape the create route produces. */
  async function openSession(
    manager: ConsoleSessionManager,
    userId: string,
    index: number,
  ): Promise<string> {
    await ensureConsoleUser(db, userId);
    const reservation = await manager.reserveSession({
      userId, nodeId: `node-${String(index)}`, provider: "proxmox", transport: "websocket-vnc",
    });
    await manager.activateSession(reservation.sessionId);
    return reservation.sessionId;
  }

  it("getActiveSessionCount returns the exact number of active sessions for a user", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 0, max: 10 }),
        async (userId, activeCount) => {
          await db.execute("DELETE FROM console_sessions");

          // The cap has to admit the fixture; the cap itself is the next property.
          const manager = makeManager(activeCount + 1);
          for (let i = 0; i < activeCount; i++) {
            await openSession(manager, userId, i);
          }

          expect(await manager.getActiveSessionCount(userId)).toBe(activeCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reserveSession refuses once the user holds the cap", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 6 }),
        async (userId, maxConcurrent) => {
          await db.execute("DELETE FROM console_sessions");

          const manager = makeManager(maxConcurrent);
          for (let i = 0; i < maxConcurrent; i++) {
            await openSession(manager, userId, i);
          }

          await expect(manager.reserveSession({
            userId, nodeId: "node-over", provider: "proxmox", transport: "websocket-vnc",
          })).rejects.toThrow(ConsoleCapacityError);

          // The refusal admits nothing: no extra row, so no provider resource
          // could have been created for it either.
          expect(await manager.getActiveSessionCount(userId)).toBe(maxConcurrent);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("an unactivated reservation still holds a slot", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        async (userId) => {
          await db.execute("DELETE FROM console_sessions");
          await ensureConsoleUser(db, userId);

          const manager = makeManager(1);
          await manager.reserveSession({
            userId, nodeId: "node-1", provider: "proxmox", transport: "websocket-vnc",
          });

          // Still 'creating': the slot is held while the provider works, which
          // is what stops a second request from racing into the same slot.
          expect(await manager.getActiveSessionCount(userId)).toBe(0);
          await expect(manager.reserveSession({
            userId, nodeId: "node-2", provider: "proxmox", transport: "websocket-vnc",
          })).rejects.toThrow(ConsoleCapacityError);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("concurrent reservations for the last slot admit exactly one", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 4 }),
        async (userId, maxConcurrent) => {
          await db.execute("DELETE FROM console_sessions");
          await ensureConsoleUser(db, userId);

          const manager = makeManager(maxConcurrent);
          const attempts = maxConcurrent + 3;
          const outcomes = await Promise.allSettled(
            Array.from({ length: attempts }, (_, index) => manager.reserveSession({
              userId, nodeId: `node-${String(index)}`, provider: "proxmox", transport: "websocket-vnc",
            })),
          );

          const admitted = outcomes.filter((outcome) => outcome.status === "fulfilled");
          expect(admitted).toHaveLength(maxConcurrent);
          for (const outcome of outcomes.filter((o) => o.status === "rejected")) {
            expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(ConsoleCapacityError);
          }

          const held = await db.queryOne<{ count: number }>(
            `SELECT COUNT(*) AS "count" FROM console_sessions
              WHERE user_id = ? AND state IN ('creating', 'active')`,
            [userId],
          );
          expect(held?.count).toBe(maxConcurrent);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("terminated/failed sessions do not count toward the concurrent limit", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (userId, activeCount, terminatedCount) => {
          await db.execute("DELETE FROM console_sessions");

          const manager = makeManager(activeCount + terminatedCount);
          for (let i = 0; i < activeCount; i++) {
            await openSession(manager, userId, i);
          }
          for (let i = 0; i < terminatedCount; i++) {
            const sessionId = await openSession(manager, userId, activeCount + i);
            await manager.terminateSession(sessionId, "test-termination");
          }

          expect(await manager.getActiveSessionCount(userId)).toBe(activeCount);

          // Terminated sessions released their slots, so the cap admits again.
          await expect(manager.reserveSession({
            userId, nodeId: "node-next", provider: "proxmox", transport: "websocket-vnc",
          })).resolves.toBeDefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("sessions from different users do not affect each other's concurrent count", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        async (userA, userB, countA, countB) => {
          const actualUserB = userA === userB ? `${userB}_other` : userB;
          await db.execute("DELETE FROM console_sessions");

          const manager = makeManager(Math.max(countA, countB) + 1);
          for (let i = 0; i < countA; i++) {
            await openSession(manager, userA, i);
          }
          for (let i = 0; i < countB; i++) {
            await openSession(manager, actualUserB, i + 100);
          }

          expect(await manager.getActiveSessionCount(userA)).toBe(countA);
          expect(await manager.getActiveSessionCount(actualUserB)).toBe(countB);
        },
      ),
      { numRuns: 100 },
    );
  });
});
