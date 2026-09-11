import type { LoggerService } from "./LoggerService";

/**
 * How long a provider's connection material stays claimable.
 *
 * Matches the session token's own validity window: the browser presents both
 * in the same upgrade, so material that outlives the token is only a credential
 * waiting to be stolen.
 */
export const CONSOLE_UPGRADE_WINDOW_MS = 60_000;

const COMPONENT = "ConsoleConnectionBroker";

/**
 * A live relay the broker can tear down.
 *
 * `close` must close both ends and must tolerate being called more than once:
 * revocation, client disconnect and upstream failure can race.
 */
export interface ConsoleConnection {
  close(reason: string): void;
}

interface PendingOffer {
  upstreamUrl: string;
  expiresAt: number;
}

/**
 * Carries console connection material from a provider to the WebSocket broker,
 * and owns the live relays so a session can actually be torn down.
 *
 * Two problems are solved in one place because they are the same problem: the
 * connection belongs to a session, and nothing outside this object should hold
 * either the material or the sockets.
 *
 * **Connection material never reaches the database.** A Proxmox upstream URL
 * embeds a live `vncticket`; persisting it would store a credential in
 * plaintext and keep it readable long after the session ended. Offers live in
 * memory, are claimable exactly once, and expire with the session token. This
 * makes console sessions process-local, consistent with the documented
 * single-process baseline.
 *
 * Never log an upstream URL.
 */
export class ConsoleConnectionBroker {
  private readonly offers = new Map<string, PendingOffer>();
  private readonly live = new Map<string, ConsoleConnection>();

  constructor(
    private readonly logger: LoggerService,
    private readonly windowMs: number = CONSOLE_UPGRADE_WINDOW_MS,
  ) {}

  /**
   * Record the material a provider produced for a reserved session.
   *
   * Replaces any earlier offer for the same session: a reserved session is
   * created once, so a second offer means the first was abandoned.
   */
  offer(sessionId: string, upstreamUrl: string): void {
    this.offers.set(sessionId, { upstreamUrl, expiresAt: Date.now() + this.windowMs });
  }

  /**
   * Take the material for a session, if any is still claimable.
   *
   * Single use: a second upgrade for the same session finds nothing, which is
   * the second half of the one-time claim that starts with the session token.
   *
   * @returns the upstream URL, or null when absent or expired
   */
  claim(sessionId: string): string | null {
    const offer = this.offers.get(sessionId);
    if (!offer) return null;
    this.offers.delete(sessionId);
    if (offer.expiresAt <= Date.now()) return null;
    return offer.upstreamUrl;
  }

  /** Drop unclaimed material, for a session that will never connect. */
  discard(sessionId: string): void {
    this.offers.delete(sessionId);
  }

  /** Register a live relay so the session can be torn down later. */
  attach(sessionId: string, connection: ConsoleConnection): void {
    this.live.set(sessionId, connection);
  }

  /** Forget a relay that has already closed on its own. */
  detach(sessionId: string): void {
    this.live.delete(sessionId);
  }

  /**
   * Tear a session down: unclaimed material is dropped and a live relay is
   * closed at both ends.
   *
   * Safe for a session that never connected or has already gone.
   *
   * @returns true if a live relay was closed
   */
  revoke(sessionId: string, reason: string): boolean {
    this.offers.delete(sessionId);
    const connection = this.live.get(sessionId);
    if (!connection) return false;
    this.live.delete(sessionId);
    try {
      connection.close(reason);
    } catch (error) {
      this.logger.warn("Failed to close console connection on revocation", {
        component: COMPONENT,
        metadata: { sessionId, reason, error: error instanceof Error ? error.message : String(error) },
      });
    }
    return true;
  }

  /**
   * Tear every session down. Used at shutdown, where no session survives the
   * process that owns its sockets.
   *
   * @returns number of live relays closed
   */
  revokeAll(reason: string): number {
    const sessionIds = [...this.live.keys()];
    let closed = 0;
    for (const sessionId of sessionIds) {
      if (this.revoke(sessionId, reason)) closed += 1;
    }
    this.offers.clear();
    return closed;
  }

  /**
   * Drop material whose window has passed.
   *
   * `claim` already refuses an expired offer, so this only stops an abandoned
   * one from holding a provider credential in memory indefinitely.
   *
   * @returns number of offers dropped
   */
  purgeExpiredOffers(): number {
    const now = Date.now();
    let purged = 0;
    for (const [sessionId, offer] of this.offers) {
      if (offer.expiresAt <= now) {
        this.offers.delete(sessionId);
        purged += 1;
      }
    }
    return purged;
  }

  /** Counts for diagnostics and tests. Never exposes the material itself. */
  getStatus(): { pendingOffers: number; liveConnections: number } {
    return { pendingOffers: this.offers.size, liveConnections: this.live.size };
  }
}
