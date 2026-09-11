/**
 * Console connection broker (A15 / I06, S08, S09).
 *
 * The broker carries a provider's connection material to the WebSocket proxy
 * and owns the live relays. Two contracts matter: material is claimable exactly
 * once and expires, and revoking a session actually closes its sockets rather
 * than only recording an intention.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConsoleConnectionBroker, CONSOLE_UPGRADE_WINDOW_MS } from '../../src/services/ConsoleConnectionBroker';
import type { LoggerService } from '../../src/services/LoggerService';

function makeLogger(): LoggerService {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerService;
}

function makeBroker(windowMs?: number): ConsoleConnectionBroker {
  return new ConsoleConnectionBroker(makeLogger(), windowMs);
}

describe('ConsoleConnectionBroker', () => {
  describe('connection material', () => {
    it('hands an offer to exactly one claimant', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://upstream.invalid/console?ticket=secret');

      expect(broker.claim('session-1')).toBe('wss://upstream.invalid/console?ticket=secret');
      // Second half of the one-time claim: a replayed upgrade finds nothing.
      expect(broker.claim('session-1')).toBeNull();
    });

    it('returns null for a session that was never offered material', () => {
      expect(makeBroker().claim('unknown')).toBeNull();
    });

    it('refuses material whose window has passed', () => {
      const broker = makeBroker(0);
      broker.offer('session-1', 'wss://upstream.invalid/console');

      expect(broker.claim('session-1')).toBeNull();
    });

    it('keeps offers for different sessions separate', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://one.invalid');
      broker.offer('session-2', 'wss://two.invalid');

      expect(broker.claim('session-2')).toBe('wss://two.invalid');
      expect(broker.claim('session-1')).toBe('wss://one.invalid');
    });

    it('replaces an abandoned offer for the same session', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://stale.invalid');
      broker.offer('session-1', 'wss://fresh.invalid');

      expect(broker.claim('session-1')).toBe('wss://fresh.invalid');
      expect(broker.getStatus().pendingOffers).toBe(0);
    });

    it('discards material for a session that will never connect', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://upstream.invalid');
      broker.discard('session-1');

      expect(broker.claim('session-1')).toBeNull();
    });

    it('purges expired offers so a credential is not held indefinitely', () => {
      const broker = makeBroker(0);
      broker.offer('session-1', 'wss://upstream.invalid');
      broker.offer('session-2', 'wss://upstream.invalid');
      expect(broker.getStatus().pendingOffers).toBe(2);

      expect(broker.purgeExpiredOffers()).toBe(2);
      expect(broker.getStatus().pendingOffers).toBe(0);
    });

    it('keeps offers still inside their window when purging', () => {
      const broker = makeBroker(CONSOLE_UPGRADE_WINDOW_MS);
      broker.offer('session-1', 'wss://upstream.invalid');

      expect(broker.purgeExpiredOffers()).toBe(0);
      expect(broker.getStatus().pendingOffers).toBe(1);
    });

    it('never exposes material through its status', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://upstream.invalid/console?ticket=secret');

      expect(JSON.stringify(broker.getStatus())).not.toContain('secret');
    });
  });

  describe('live relays', () => {
    it('closes a registered relay on revocation', () => {
      const broker = makeBroker();
      const close = vi.fn();
      broker.attach('session-1', { close });

      expect(broker.revoke('session-1', 'user_terminated')).toBe(true);
      expect(close).toHaveBeenCalledWith('user_terminated');
      expect(broker.getStatus().liveConnections).toBe(0);
    });

    it('reports that nothing was closed for a session with no relay', () => {
      const broker = makeBroker();
      broker.offer('session-1', 'wss://upstream.invalid');

      // Revoking still drops the unclaimed material, which is the point.
      expect(broker.revoke('session-1', 'session_timeout')).toBe(false);
      expect(broker.claim('session-1')).toBeNull();
    });

    it('closes a relay only once across repeated revocation', () => {
      const broker = makeBroker();
      const close = vi.fn();
      broker.attach('session-1', { close });

      broker.revoke('session-1', 'first');
      broker.revoke('session-1', 'second');

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('forgets a relay that closed on its own', () => {
      const broker = makeBroker();
      const close = vi.fn();
      broker.attach('session-1', { close });
      broker.detach('session-1');

      expect(broker.revoke('session-1', 'user_terminated')).toBe(false);
      expect(close).not.toHaveBeenCalled();
    });

    it('closes every relay at shutdown and drops pending material', () => {
      const broker = makeBroker();
      const first = vi.fn();
      const second = vi.fn();
      broker.attach('session-1', { close: first });
      broker.attach('session-2', { close: second });
      broker.offer('session-3', 'wss://upstream.invalid');

      expect(broker.revokeAll('server_shutdown')).toBe(2);
      expect(first).toHaveBeenCalledWith('server_shutdown');
      expect(second).toHaveBeenCalledWith('server_shutdown');
      expect(broker.getStatus()).toEqual({ pendingOffers: 0, liveConnections: 0 });
    });

    it('closes the remaining relays when one throws', () => {
      const broker = makeBroker();
      const survivor = vi.fn();
      broker.attach('session-1', { close: () => { throw new Error('socket already gone'); } });
      broker.attach('session-2', { close: survivor });

      expect(() => broker.revokeAll('server_shutdown')).not.toThrow();
      expect(survivor).toHaveBeenCalledWith('server_shutdown');
      expect(broker.getStatus().liveConnections).toBe(0);
    });
  });
});
