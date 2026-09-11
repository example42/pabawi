import { PermissionService } from "./PermissionService";
import { randomBytes, randomUUID } from "crypto";

import type { ConsoleConfig } from "../config/schema";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { ConsoleSession, ConsoleTransport } from "../integrations/console/types";

import type { AuditLoggingService } from "./AuditLoggingService";
import type { ConsoleConnectionBroker } from "./ConsoleConnectionBroker";
import { CONSOLE_UPGRADE_WINDOW_MS } from "./ConsoleConnectionBroker";
import type { LoggerService } from "./LoggerService";

/**
 * Releases a provider-side session.
 *
 * The manager owns lifecycle transitions but has no plugin registry, so the
 * caller supplies the bridge. Without it a terminated session keeps its
 * provider-side entry, which is a leak and a stale `getSessionStatus`.
 *
 * Must not throw: a provider that cannot be reached should not stop a
 * termination that is already recorded.
 *
 * @returns whether the provider had a session to release
 */
export type ConsoleProviderCleanup = (
  provider: string,
  sessionId: string,
) => Promise<boolean>;

/** A reserved session: capacity is held and the browser has its credential. */
export interface ConsoleReservation {
  sessionId: string;
  token: string;
  startedAt: string;
}

/** Thrown when a user already holds as many sessions as the cap allows. */
export class ConsoleCapacityError extends Error {
  constructor(public readonly limit: number) {
    super(`Concurrent session limit (${String(limit)}) reached`);
    this.name = "ConsoleCapacityError";
  }
}

/** Thrown when the reserving account cannot hold a console session. */
export class ConsoleAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsoleAccountError";
  }
}

/**
 * Row shape returned by console_sessions SELECT queries.
 */
interface ConsoleSessionRow {
  id: string;
  userId: string;
  nodeId: string;
  provider: string;
  transport: string;
  state: string;
  token: string | null;
  tokenCreatedAt: string | null;
  tokenConsumed: number;
  /**
   * Retired by the connection broker: always null. The column survives in the
   * schema because rebuilding a SQLite table to drop it buys nothing, but
   * nothing writes or reads it. Connection material is a credential and must
   * not be persisted.
   */
  upstreamUrl: string | null;
  startedAt: string;
  lastHeartbeatAt: string | null;
  terminatedAt: string | null;
  errorMessage: string | null;
}

const COMPONENT = "ConsoleSessionManager";

const SESSION_SELECT = `
  SELECT
    id, user_id AS "userId", node_id AS "nodeId", provider, transport, state,
    token, token_created_at AS "tokenCreatedAt", token_consumed AS "tokenConsumed",
    upstream_url AS "upstreamUrl", started_at AS "startedAt",
    last_heartbeat_at AS "lastHeartbeatAt", terminated_at AS "terminatedAt",
    error_message AS "errorMessage"
  FROM console_sessions`;

/**
 * Manages console session lifecycle: token generation/validation,
 * session CRUD, heartbeats, concurrent limiting, and cleanup.
 *
 * Requirements: 2.1–2.8, 8.1, 8.2, 8.4, 8.6, 8.7
 */
export class ConsoleSessionManager {
  private permissionService: PermissionService;

  /**
   * @param broker - Owns connection material and live relays. Without it a
   *   state transition is only a database write: the sockets stay open. The
   *   parameter is optional so narrow tests can construct a manager without a
   *   broker, never so production can.
   * @param providerCleanup - Reaches the provider that prepared the upstream.
   *   Optional for the same reason as `broker`: tests that only assert
   *   persisted state can omit it, production wires it.
   */
  constructor(
    private db: DatabaseAdapter,
    private config: ConsoleConfig,
    private logger: LoggerService,
    private auditLogger: AuditLoggingService,
    private broker?: ConsoleConnectionBroker,
    private providerCleanup?: ConsoleProviderCleanup,
  ) {
    this.permissionService = new PermissionService(db);
  }

  async assertSessionAuthorized(sessionId: string): Promise<void> {
    const session = await this.db.queryOne<{ userId: string }>(
      `SELECT c.user_id AS "userId" FROM console_sessions c JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.state IN ('creating', 'active') AND u.is_active = 1
         AND c.session_version = u.session_version`,
      [sessionId],
    );
    if (!session || !await this.permissionService.hasPermission(session.userId, 'console', 'access')) {
      throw new Error('Console session authorization revoked');
    }
  }

  /** Generate a cryptographically random session token (32 bytes → 64 hex chars). */
  generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Reserve capacity for a session before any provider resource exists.
   *
   * The reservation is the session: it holds a `creating` row that counts
   * against the concurrent cap, so a provider call that follows cannot create
   * an upstream nobody accounted for. Reading the cap and inserting the row
   * happen in one transaction, with the account row locked, so two concurrent
   * requests cannot both find room for the last slot.
   *
   * The caller must either activate the reservation or fail it; an abandoned
   * `creating` row holds a slot until heartbeat cleanup expires it.
   *
   * Requirement 8.6
   *
   * @throws ConsoleCapacityError when the user already holds the cap
   * @throws ConsoleAccountError when the account cannot hold a session
   */
  async reserveSession(request: {
    userId: string;
    nodeId: string;
    provider: string;
    transport: ConsoleTransport;
  }): Promise<ConsoleReservation> {
    const sessionId = randomUUID();
    const token = this.generateToken();
    const now = new Date().toISOString();

    await this.db.withTransaction(async () => {
      // Lock the account so the count below cannot go stale under a concurrent
      // reservation. SQLite serialises writers outright; PostgreSQL needs the
      // explicit row lock.
      const account = await this.db.queryOne<{ sessionVersion: string }>(
        `SELECT session_version AS "sessionVersion" FROM users
          WHERE id = ? AND is_active = 1${this.db.getDialect() === "postgres" ? " FOR UPDATE" : ""}`,
        [request.userId],
      );
      if (!account) throw new ConsoleAccountError("User not found or inactive");

      const held = await this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) AS "count" FROM console_sessions
          WHERE user_id = ? AND state IN ('creating', 'active')`,
        [request.userId],
      );
      if ((held?.count ?? 0) >= this.config.maxConcurrentSessions) {
        throw new ConsoleCapacityError(this.config.maxConcurrentSessions);
      }

      // `upstream_url` is deliberately left null: connection material is a
      // credential and lives only in ConsoleConnectionBroker.
      await this.db.execute(
        `INSERT INTO console_sessions (
          id, user_id, node_id, provider, transport, state,
          token, token_created_at, token_consumed,
          started_at, last_heartbeat_at, session_version
        ) VALUES (?, ?, ?, ?, ?, 'creating', ?, ?, 0, ?, ?, ?)`,
        [
          sessionId, request.userId, request.nodeId, request.provider, request.transport,
          token, now, now, now, account.sessionVersion,
        ],
      );
    });

    await this.auditLogger.logAdminAction(
      "console_session_create",
      request.userId,
      {
        nodeId: request.nodeId,
        provider: request.provider,
        sessionId,
        timestamp: now,
      },
    );

    this.logger.info("Console session reserved", {
      component: COMPONENT,
      metadata: { sessionId, userId: request.userId },
    });

    return { sessionId, token, startedAt: now };
  }

  /**
   * Mark a reservation active once its upstream is ready.
   *
   * Returns the persisted session so the response describes stored state
   * rather than what the caller hoped it wrote. A null result means the
   * reservation is gone: terminated, expired or already activated, in which
   * case the caller must release the upstream it just prepared.
   */
  async activateSession(sessionId: string): Promise<ConsoleSession | null> {
    const result = await this.db.execute(
      `UPDATE console_sessions SET state = 'active' WHERE id = ? AND state = 'creating'`,
      [sessionId],
    );
    if (result.changes !== 1) return null;
    return this.getSession(sessionId);
  }

  /**
   * Release a reservation whose upstream could not be prepared.
   *
   * Frees the slot immediately instead of waiting for heartbeat cleanup, and
   * drops any material the provider managed to offer.
   */
  async failReservation(sessionId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE console_sessions
        SET state = 'failed', terminated_at = ?, error_message = ?
        WHERE id = ? AND state = 'creating'`,
      [now, reason, sessionId],
    );
    this.broker?.revoke(sessionId, reason);
  }

  /**
   * Claim a session token for a WebSocket upgrade.
   *
   * The conditional update is the claim: existence, the unconsumed flag, the
   * live state and the age bound are all in the one statement that consumes
   * the token, so two concurrent upgrades cannot both pass validation and
   * then both consume. Exactly one caller sees a changed row.
   *
   * Authorization is revalidated after the claim, so a revoked account burns
   * the token rather than getting a second attempt.
   *
   * Requirements 4.2, 5.2, 8.2
   *
   * @returns the claimed session, or null when the token cannot be claimed
   * @throws when the session's authorization has been revoked
   */
  async claimTokenForUpgrade(token: string): Promise<ConsoleSession | null> {
    const cutoff = new Date(Date.now() - CONSOLE_UPGRADE_WINDOW_MS).toISOString();
    const claimed = await this.db.execute(
      `UPDATE console_sessions SET token_consumed = 1
        WHERE token = ? AND token_consumed = 0
          AND state IN ('creating', 'active')
          AND token_created_at IS NOT NULL AND token_created_at > ?`,
      [token, cutoff],
    );

    if (claimed.changes !== 1) {
      return null;
    }

    // Safe to read after the claim: no other caller can hold this token.
    const row = await this.db.queryOne<ConsoleSessionRow>(
      `${SESSION_SELECT} WHERE token = ?`,
      [token],
    );
    if (!row) {
      return null;
    }

    await this.assertSessionAuthorized(row.id);
    return this.rowToSession(row);
  }

  /**
   * Record a heartbeat for a live session.
   *
   * Scoped to live states so a heartbeat cannot resurrect a terminated
   * session's timestamps or keep a dead row looking recent.
   *
   * Requirement 2.3
   *
   * @returns true if the session was live and its heartbeat advanced
   */
  async heartbeat(sessionId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.execute(
      `UPDATE console_sessions SET last_heartbeat_at = ?
        WHERE id = ? AND state IN ('creating', 'active')`,
      [now, sessionId],
    );
    return result.changes === 1;
  }

  /**
   * Release the provider-side session for a terminated row.
   *
   * Best effort by contract: the database state and the sockets are already
   * settled by the time this runs, so a provider error is logged and dropped
   * rather than surfaced to a caller that can do nothing with it.
   */
  private async releaseProviderSession(
    provider: string,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    if (!this.providerCleanup) return;
    try {
      await this.providerCleanup(provider, sessionId);
    } catch (error) {
      this.logger.warn("Provider cleanup failed for terminated console session", {
        component: COMPONENT,
        metadata: {
          provider, sessionId, reason,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Terminate a session and record an audit log entry.
   *
   * Every termination path ends here or in {@link terminateAllForProvider}, so
   * both do the same three things: record the state, close the sockets, and
   * release the provider-side session.
   *
   * Requirements 2.5, 8.4
   */
  async terminateSession(sessionId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();

    const session = await this.getSession(sessionId);
    if (!session) {
      this.logger.warn("Attempted to terminate non-existent session", {
        component: COMPONENT,
        metadata: { sessionId },
      });
      return;
    }

    await this.db.execute(
      `UPDATE console_sessions
        SET state = 'terminated', terminated_at = ?, error_message = ?
        WHERE id = ?`,
      [now, reason, sessionId],
    );

    // Close the sockets after the state write lands, so a relay that survives
    // the close cannot revalidate its way back to authorized.
    const closed = this.broker?.revoke(sessionId, reason) ?? false;

    await this.releaseProviderSession(session.provider, sessionId, reason);

    await this.auditLogger.logAdminAction(
      "console_session_terminate",
      session.userId,
      {
        nodeId: session.nodeId,
        provider: session.provider,
        sessionId,
        reason,
        timestamp: now,
      },
    );

    this.logger.info("Console session terminated", {
      component: COMPONENT,
      metadata: { sessionId, reason, connectionClosed: closed },
    });
  }

  /**
   * Count sessions in the `active` state for a user.
   *
   * Reporting only, deliberately narrower than the concurrent cap: the cap
   * counts `creating` as well, because a reservation holds a slot while the
   * provider works. Do not use this to decide admission; that decision lives
   * inside {@link reserveSession}, where the count and the insert share one
   * transaction.
   *
   * Requirement 8.6
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS "count"
        FROM console_sessions
        WHERE user_id = ? AND state = 'active'`,
      [userId],
    );
    return row?.count ?? 0;
  }

  /**
   * Terminate all active sessions for a provider (used on restart/shutdown).
   * Requirement 2.6
   */
  async terminateAllForProvider(provider: string): Promise<void> {
    const now = new Date().toISOString();
    // The ids have to be read in the same transaction as the update, or the
    // sockets of a session terminated here cannot be found afterwards.
    const { sessionIds, changes } = await this.db.withTransaction(async () => {
      const rows = await this.db.query<{ id: string }>(
        `SELECT id FROM console_sessions WHERE provider = ? AND state IN ('creating', 'active')`,
        [provider],
      );
      const result = await this.db.execute(
        `UPDATE console_sessions
          SET state = 'terminated', terminated_at = ?
          WHERE provider = ? AND state IN ('creating', 'active')`,
        [now, provider],
      );
      return { sessionIds: rows.map(row => row.id), changes: result.changes };
    });

    for (const sessionId of sessionIds) {
      this.broker?.revoke(sessionId, "provider_terminated");
    }
    for (const sessionId of sessionIds) {
      await this.releaseProviderSession(provider, sessionId, "provider_terminated");
    }

    this.logger.info("Bulk terminated sessions for provider", {
      component: COMPONENT,
      metadata: { provider, count: changes },
    });
  }

  /**
   * Cleanup expired sessions: active sessions whose last heartbeat
   * is older than sessionTimeoutMs.
   * Requirement 2.4
   */
  async cleanupExpiredSessions(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.config.sessionTimeoutMs,
    ).toISOString();
    const now = new Date().toISOString();

    // A reservation whose caller vanished holds a slot, so it expires on the
    // same schedule as an active session that stopped reporting.
    const { expired, changes } = await this.db.withTransaction(async () => {
      const rows = await this.db.query<{ id: string; provider: string }>(
        `SELECT id, provider FROM console_sessions
          WHERE state IN ('creating', 'active') AND last_heartbeat_at < ?`,
        [cutoff],
      );
      const result = await this.db.execute(
        `UPDATE console_sessions
          SET state = 'terminated', terminated_at = ?, error_message = 'session_timeout'
          WHERE state IN ('creating', 'active') AND last_heartbeat_at < ?`,
        [now, cutoff],
      );
      return { expired: rows, changes: result.changes };
    });

    for (const session of expired) {
      this.broker?.revoke(session.id, "session_timeout");
    }
    for (const session of expired) {
      await this.releaseProviderSession(session.provider, session.id, "session_timeout");
    }
    const purgedOffers = this.broker?.purgeExpiredOffers() ?? 0;

    if (changes > 0 || purgedOffers > 0) {
      this.logger.info("Cleaned up expired console sessions", {
        component: COMPONENT,
        metadata: { count: changes, purgedOffers },
      });
    }
  }

  /**
   * Retrieve a session by ID.
   */
  async getSession(sessionId: string): Promise<ConsoleSession | null> {
    const row = await this.db.queryOne<ConsoleSessionRow>(
      `${SESSION_SELECT} WHERE id = ?`,
      [sessionId],
    );

    if (!row) {
      return null;
    }

    return this.rowToSession(row);
  }

  /**
   * Map a database row to a ConsoleSession object.
   */
  private rowToSession(row: ConsoleSessionRow): ConsoleSession {
    return {
      sessionId: row.id,
      userId: row.userId,
      nodeId: row.nodeId,
      provider: row.provider,
      transport: row.transport as ConsoleSession["transport"],
      state: row.state as ConsoleSession["state"],
      token: row.token ?? "",
      wsUrl: `/ws/console/${row.transport === "websocket-vnc" ? "vnc" : "terminal"}?token=${row.token ?? ""}`,
      startedAt: row.startedAt,
    };
  }
}
