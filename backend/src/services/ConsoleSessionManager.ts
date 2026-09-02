import { randomBytes } from "crypto";

import type { ConsoleConfig } from "../config/schema";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { ConsoleSession } from "../integrations/console/types";

import type { AuditLoggingService } from "./AuditLoggingService";
import type { LoggerService } from "./LoggerService";

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
  constructor(
    private db: DatabaseAdapter,
    private config: ConsoleConfig,
    private logger: LoggerService,
    private auditLogger: AuditLoggingService,
  ) {}

  /** Generate a cryptographically random session token (32 bytes → 64 hex chars). */
  generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  /** Store a new console session and record an audit log entry. */
  async createSession(session: ConsoleSession): Promise<void> {
    const now = new Date().toISOString();

    await this.db.execute(
      `INSERT INTO console_sessions (
        id, user_id, node_id, provider, transport, state,
        token, token_created_at, token_consumed, upstream_url,
        started_at, last_heartbeat_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        session.sessionId,
        session.userId,
        session.nodeId,
        session.provider,
        session.transport,
        session.state,
        session.token,
        now,
        null,
        session.startedAt,
        now,
      ],
    );

    await this.auditLogger.logAdminAction(
      "console_session_create",
      session.userId,
      {
        nodeId: session.nodeId,
        provider: session.provider,
        sessionId: session.sessionId,
        timestamp: now,
      },
    );

    this.logger.info("Console session created", {
      component: COMPONENT,
      metadata: { sessionId: session.sessionId, userId: session.userId },
    });
  }

  /**
   * Validate a session token for WebSocket upgrade (no userId required).
   * Token must: exist, be created < 60s ago, and not be consumed.
   * Used by ConsoleWebSocketProxy where userId is not available at handshake time.
   * Requirements 4.2, 5.2, 8.2
   */
  async validateTokenForUpgrade(token: string): Promise<ConsoleSession | null> {
    const row = await this.db.queryOne<ConsoleSessionRow>(
      `${SESSION_SELECT} WHERE token = ?`,
      [token],
    );

    if (!row) {
      return null;
    }

    // Token must not be consumed
    if (row.tokenConsumed !== 0) {
      return null;
    }

    // Token must be created < 60s ago
    if (!row.tokenCreatedAt) {
      return null;
    }
    const tokenAge = Date.now() - new Date(row.tokenCreatedAt).getTime();
    if (tokenAge >= 60_000) {
      return null;
    }

    return this.rowToSession(row);
  }

  /**
   * Validate a session token.
   * Token must: exist, be created < 60s ago, not be consumed, and match userId.
   * Requirements 8.2, 4.2
   */
  async validateToken(
    token: string,
    userId: string,
  ): Promise<ConsoleSession | null> {
    const row = await this.db.queryOne<ConsoleSessionRow>(
      `${SESSION_SELECT} WHERE token = ?`,
      [token],
    );

    if (!row) {
      return null;
    }

    // Token must not be consumed
    if (row.tokenConsumed !== 0) {
      return null;
    }

    // Token must be created < 60s ago
    if (!row.tokenCreatedAt) {
      return null;
    }
    const tokenAge =
      Date.now() - new Date(row.tokenCreatedAt).getTime();
    if (tokenAge >= 60_000) {
      return null;
    }

    // Owner must match
    if (row.userId !== userId) {
      return null;
    }

    return this.rowToSession(row);
  }

  /** Mark a token as consumed (after successful WebSocket upgrade). */
  async consumeToken(token: string): Promise<void> {
    await this.db.execute(
      `UPDATE console_sessions SET token_consumed = 1 WHERE token = ?`,
      [token],
    );
  }

  /**
   * Record a heartbeat for an active session.
   * Requirement 2.3
   */
  async heartbeat(sessionId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE console_sessions SET last_heartbeat_at = ? WHERE id = ?`,
      [now, sessionId],
    );
  }

  /**
   * Terminate a session and record an audit log entry.
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
      metadata: { sessionId, reason },
    });
  }

  /**
   * Count active sessions for a user.
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
    const result = await this.db.execute(
      `UPDATE console_sessions
        SET state = 'terminated', terminated_at = ?
        WHERE provider = ? AND state IN ('creating', 'active')`,
      [now, provider],
    );

    this.logger.info("Bulk terminated sessions for provider", {
      component: COMPONENT,
      metadata: { provider, count: result.changes },
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

    const result = await this.db.execute(
      `UPDATE console_sessions
        SET state = 'terminated', terminated_at = ?, error_message = 'session_timeout'
        WHERE state = 'active' AND last_heartbeat_at < ?`,
      [now, cutoff],
    );

    if (result.changes > 0) {
      this.logger.info("Cleaned up expired console sessions", {
        component: COMPONENT,
        metadata: { count: result.changes },
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
   * Get the upstream WebSocket URL for a session.
   */
  async getUpstreamUrl(sessionId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ upstreamUrl: string | null }>(
      `SELECT upstream_url AS "upstreamUrl" FROM console_sessions WHERE id = ?`,
      [sessionId],
    );
    return row?.upstreamUrl ?? null;
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
