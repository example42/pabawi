/**
 * Console session lifecycle against a live fake upstream (A15 / I06, S08, S09).
 *
 * These are the acceptance tests for the console findings, run through the real
 * route, session manager, connection broker and WebSocket proxy with a local
 * WebSocket server standing in for the provider's upstream:
 *
 * - I06: connection material reaches the proxy at all, and frames relay in both
 *   directions. Before A15 the material was inserted as null and read back from
 *   the database, so every upgrade closed immediately.
 * - S08: a ticket is claimable exactly once, even by concurrent upgrades, and a
 *   losing attempt opens no second upstream.
 * - S09: owner termination, administrator termination, heartbeat expiry, restart
 *   cleanup and shutdown each close both ends of a live connection; a terminated
 *   session never upgrades; and another user cannot read or extend a session.
 *
 * A fake upstream proves the broker contract. It does not prove Proxmox
 * compatibility: the real endpoint, port and authentication still require a
 * test provider, which is recorded as outstanding.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';

import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService, type User } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { PermissionService } from '../../src/services/PermissionService';
import { ConsoleSessionManager } from '../../src/services/ConsoleSessionManager';
import { ConsoleConnectionBroker } from '../../src/services/ConsoleConnectionBroker';
import { ConsoleWebSocketProxy } from '../../src/services/ConsoleWebSocketProxy';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';
import { ExpertModeService } from '../../src/services/ExpertModeService';
import { ConfigService } from '../../src/config/ConfigService';
import { ConsoleConfigSchema } from '../../src/config/schema';
import { DIContainer } from '../../src/container/DIContainer';
import { createConsoleRouter } from '../../src/routes/console';
import type { IntegrationManager } from '../../src/integrations/IntegrationManager';
import type { ConsoleSessionRequest } from '../../src/integrations/console/types';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const SECRET = 'console-lifecycle-test-secret-32-characters'; // pragma: allowlist secret
const ORIGIN = 'http://localhost';

let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('A15: console session lifecycle', () => {
  let database: DatabaseService;
  let users: UserService;
  let roles: RoleService;
  let permissions: PermissionService;
  let manager: ConsoleSessionManager;
  let broker: ConsoleConnectionBroker;
  let upstreamServer: WebSocketServer;
  let upstreamPort: number;
  /** Per-test HTTP server the WebSocket proxy attaches to. */
  let wsServer: http.Server;
  let wsPort: number;
  /** Upstreams the fake provider was asked to prepare, in order. */
  let prepared: ConsoleSessionRequest[];
  /** Sessions the provider was asked to release, in order. */
  let released: string[];
  let integrationManager: IntegrationManager;
  let proxy: ConsoleWebSocketProxy;
  /**
   * Relay registrations, in order.
   *
   * The proxy registers twice per connection: a placeholder before it dials
   * the upstream, so a termination during the dial still has something to
   * close, and the full relay once both ends exist. The second registration is
   * therefore the point at which frames relay.
   */
  let attachments: ReturnType<typeof vi.spyOn<ConsoleConnectionBroker, 'attach'>>;
  let owner: User;
  let ownerToken: string;
  let app: express.Express;
  const consoleConfig = ConsoleConfigSchema.parse({});

  /** Sockets opened by a test, torn down even when an assertion fails. */
  const openClients: WebSocket[] = [];

  /** Grant `console:access`, plus `console:admin` when asked, through a fresh role. */
  async function grantConsole(user: User, action: 'access' | 'admin'): Promise<void> {
    const role = await roles.createRole({
      name: `console-${action}-${user.id}`,
      description: `console:${action}`,
    });
    const wanted = action === 'admin' ? ['access', 'admin'] : ['access'];
    const all = await permissions.listPermissions({ limit: 500 });
    for (const name of wanted) {
      const existing = all.items.find(p => p.resource === 'console' && p.action === name);
      const permission = existing ?? await permissions.createPermission({
        resource: 'console', action: name, description: `console:${name}`,
      });
      await roles.assignPermissionToRole(role.id, permission.id);
    }
    await users.assignRoleToUser(user.id, role.id);
  }

  beforeEach(async () => {
    process.env.JWT_SECRET = SECRET;
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    const auth = new AuthenticationService(db, SECRET);
    users = new UserService(db, auth);
    roles = new RoleService(db);
    permissions = new PermissionService(db);
    await db.execute("UPDATE config SET value = '' WHERE key = 'default_new_user_role'");

    owner = await users.createUser({
      username: 'owner', email: 'owner@example.test', password: 'Password123!',
      firstName: 'Console', lastName: 'Owner',
    });
    await grantConsole(owner, 'access');
    ownerToken = await auth.generateToken(owner);

    // A local WebSocket server stands in for the provider's upstream.
    upstreamServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(upstreamServer, 'listening');
    const address = upstreamServer.address();
    if (typeof address === 'string') throw new Error('Unexpected socket address');
    upstreamPort = address.port;

    broker = new ConsoleConnectionBroker(new LoggerService());
    attachments = vi.spyOn(broker, 'attach');
    manager = new ConsoleSessionManager(
      db, consoleConfig, new LoggerService(), new AuditLoggingService(db), broker,
      // The same bridge server.ts wires: the manager owns the transitions and
      // has no plugin registry, so provider cleanup arrives from outside.
      (providerName: string, sessionId: string): Promise<boolean> => {
        const provider = integrationManager.getConsoleProvider(providerName);
        if (!provider) return Promise.resolve(false);
        return provider.terminateSession(sessionId);
      },
    );

    prepared = [];
    released = [];
    integrationManager = {
      getConsoleProvider: vi.fn().mockReturnValue({
        getSupportedTransports: () => ['websocket-vnc'],
        createSession: (sessionRequest: ConsoleSessionRequest) => {
          prepared.push(sessionRequest);
          return Promise.resolve({ upstream: { url: `ws://127.0.0.1:${String(upstreamPort)}` } });
        },
        terminateSession: (sessionId: string) => {
          released.push(sessionId);
          return Promise.resolve(true);
        },
      }),
      getAggregatedInventory: vi.fn().mockResolvedValue({ nodes: [], groups: [], sources: {} }),
      getAllConsoleProviders: vi.fn().mockReturnValue([{ name: 'proxmox' }]),
    } as unknown as IntegrationManager;

    const container = new DIContainer();
    container.register('logger', new LoggerService());
    container.register('expertMode', new ExpertModeService());
    container.register('config', new ConfigService());

    app = express();
    app.use(express.json());
    app.use('/api/console', createConsoleRouter(container, integrationManager, manager, db, broker));

    // A proxy per test on its own server. The shared supertest harness cannot
    // host it: a proxy adds an 'upgrade' listener for the life of the server,
    // so reusing the harness would leave every earlier test's proxy answering
    // upgrades against a closed database.
    wsServer = http.createServer();
    await new Promise<void>((resolve) => { wsServer.listen(0, '127.0.0.1', () => { resolve(); }); });
    wsPort = (wsServer.address() as AddressInfo).port;
    proxy = new ConsoleWebSocketProxy(
      wsServer, manager, { allowedOrigins: [ORIGIN], console: consoleConfig }, new LoggerService(), broker,
    );
  });

  afterEach(async () => {
    // Close relays through the broker while the database is still open. A live
    // relay runs an authorization poller and persists a terminal state when it
    // closes, so tearing the database down first turns ordinary teardown into
    // unhandled rejections.
    broker.revokeAll('test_teardown');
    for (const client of openClients) client.close();
    openClients.length = 0;
    for (const peer of upstreamServer.clients) peer.close();
    await vi.waitFor(() => { expect(broker.getStatus().liveConnections).toBe(0); });
    // The same drain the shutdown path uses: close handlers persist a terminal
    // state, and the database closes at the end of this teardown.
    await proxy.drain();

    for (const client of openClients) client.terminate();
    for (const peer of upstreamServer.clients) peer.terminate();
    await new Promise<void>((resolve) => { upstreamServer.close(() => { resolve(); }); });
    wsServer.closeAllConnections();
    await new Promise<void>((resolve) => { wsServer.close(() => { resolve(); }); });
    await database.close();
    vi.restoreAllMocks();
  });

  /** Create a session through the real route, as the browser would. */
  async function createSession(token = ownerToken): Promise<{ sessionId: string; wsToken: string }> {
    const response = await request(harness.use(app))
      .post('/api/console/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ nodeId: 'proxmox:pve:100', provider: 'proxmox' })
      .expect(201);
    return { sessionId: response.body.session.sessionId, wsToken: response.body.session.token };
  }

  /**
   * Open the client end and wait until the relay is fully established.
   *
   * The client's 'open' fires during the upgrade, before the proxy has dialled
   * the upstream and wired the relay, so waiting for the second registration
   * is what makes a following frame or termination assertion deterministic.
   */
  async function connect(wsToken: string): Promise<{ client: WebSocket; peer: WebSocket }> {
    const accepted = once(upstreamServer, 'connection');
    const before = attachments.mock.calls.length;
    const client = new WebSocket(
      `ws://127.0.0.1:${String(wsPort)}/ws/console/vnc?token=${wsToken}`,
      { origin: ORIGIN },
    );
    openClients.push(client);
    await once(client, 'open');
    const [peer] = await accepted as [WebSocket];
    await vi.waitFor(() => {
      expect(attachments.mock.calls.length).toBe(before + 2);
      expect(broker.getStatus().liveConnections).toBe(1);
    });
    return { client, peer };
  }

  /**
   * Attempt an upgrade and report whether it was admitted.
   *
   * A refused upgrade destroys the socket, which surfaces as either 'error' or
   * 'close' depending on timing; both mean the same thing here.
   */
  async function attemptUpgrade(wsToken: string): Promise<'open' | 'rejected'> {
    const client = new WebSocket(
      `ws://127.0.0.1:${String(wsPort)}/ws/console/vnc?token=${wsToken}`,
      { origin: ORIGIN },
    );
    openClients.push(client);
    return new Promise<'open' | 'rejected'>((resolve) => {
      client.once('open', () => { resolve('open'); });
      client.once('error', () => { resolve('rejected'); });
      client.once('close', () => { resolve('rejected'); });
    });
  }

  async function stateOf(sessionId: string): Promise<string | undefined> {
    const row = await database.getAdapter().queryOne<{ state: string }>(
      'SELECT state FROM console_sessions WHERE id = ?', [sessionId],
    );
    return row?.state;
  }

  describe('provider to broker wiring (I06)', () => {
    it('relays frames in both directions between client and upstream', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      // The provider was asked to prepare the reserved identity, not one of its own.
      expect(prepared).toHaveLength(1);
      expect(prepared[0].sessionId).toBe(sessionId);
      expect(prepared[0].transport).toBe('websocket-vnc');

      const fromUpstream = once(client, 'message');
      peer.send(Buffer.from([0x52, 0x46, 0x42]), { binary: true });
      const [downstream] = await fromUpstream as [Buffer];
      expect(Buffer.from(downstream)).toEqual(Buffer.from([0x52, 0x46, 0x42]));

      const fromClient = once(peer, 'message');
      client.send(Buffer.from([0x01, 0x02]), { binary: true });
      const [upstreamFrame] = await fromClient as [Buffer];
      expect(Buffer.from(upstreamFrame)).toEqual(Buffer.from([0x01, 0x02]));
    });

    it('never persists the connection material', async () => {
      const { sessionId } = await createSession();

      const row = await database.getAdapter().queryOne<{ upstream_url: string | null }>(
        'SELECT upstream_url FROM console_sessions WHERE id = ?', [sessionId],
      );
      expect(row?.upstream_url).toBeNull();
    });

    it('closes the client when the upstream cannot be reached', async () => {
      // Stop the fake upstream so the offered URL refuses connections.
      await new Promise<void>((resolve) => { upstreamServer.close(() => { resolve(); }); });
      const { sessionId, wsToken } = await createSession();

      const client = new WebSocket(
        `ws://127.0.0.1:${String(wsPort)}/ws/console/vnc?token=${wsToken}`,
        { origin: ORIGIN },
      );
      openClients.push(client);
      await once(client, 'open');
      await once(client, 'close');

      await vi.waitFor(async () => { expect(await stateOf(sessionId)).toBe('terminated'); });
    });

    it('refuses a session whose provider produced no upstream', async () => {
      const reservation = await manager.reserveSession({
        userId: owner.id, nodeId: 'proxmox:pve:101', provider: 'proxmox', transport: 'websocket-vnc',
      });
      await manager.activateSession(reservation.sessionId);

      const client = new WebSocket(
        `ws://127.0.0.1:${String(wsPort)}/ws/console/vnc?token=${reservation.token}`,
        { origin: ORIGIN },
      );
      openClients.push(client);
      await once(client, 'open');
      await once(client, 'close');

      await vi.waitFor(async () => { expect(await stateOf(reservation.sessionId)).toBe('terminated'); });
    });
  });

  describe('one-time ticket claim (S08)', () => {
    it('admits exactly one of several concurrent upgrades', async () => {
      const { wsToken } = await createSession();

      const attempts = await Promise.all(
        Array.from({ length: 4 }, () => attemptUpgrade(wsToken)),
      );

      expect(attempts.filter(outcome => outcome === 'open')).toHaveLength(1);
      // The losers opened no second upstream: one peer for one claim.
      await vi.waitFor(() => { expect(upstreamServer.clients.size).toBe(1); });
    });

    it('refuses a second upgrade after the ticket is spent', async () => {
      const { wsToken } = await createSession();
      await connect(wsToken);

      await expect(attemptUpgrade(wsToken)).resolves.toBe('rejected');
      expect(upstreamServer.clients.size).toBe(1);
    });

    it('refuses an upgrade for a terminated session', async () => {
      const { sessionId, wsToken } = await createSession();
      await manager.terminateSession(sessionId, 'user_terminated');

      await expect(attemptUpgrade(wsToken)).resolves.toBe('rejected');
      expect(upstreamServer.clients.size).toBe(0);
    });

    it('refuses an upgrade once the ticket window has passed', async () => {
      const { sessionId, wsToken } = await createSession();
      await database.getAdapter().execute(
        'UPDATE console_sessions SET token_created_at = ? WHERE id = ?',
        [new Date(Date.now() - 120_000).toISOString(), sessionId],
      );

      await expect(attemptUpgrade(wsToken)).resolves.toBe('rejected');
    });
  });

  describe('termination closes connections (S09)', () => {
    /** Both ends must close, not just the one the caller was holding. */
    async function expectBothEndsClose(
      client: WebSocket,
      peer: WebSocket,
      trigger: () => Promise<unknown>,
    ): Promise<void> {
      const clientClosed = once(client, 'close');
      const peerClosed = once(peer, 'close');
      await trigger();
      await Promise.all([clientClosed, peerClosed]);
    }

    it('closes both ends when the owner terminates through the route', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await expectBothEndsClose(client, peer, () => request(harness.use(app))
        .delete(`/api/console/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204));

      expect(await stateOf(sessionId)).toBe('terminated');
    });

    it('closes both ends when an administrator terminates another user\'s session', async () => {
      const auth = new AuthenticationService(database.getAdapter(), SECRET);
      const operator = await users.createUser({
        username: 'operator', email: 'operator@example.test', password: 'Password123!',
        firstName: 'Console', lastName: 'Operator',
      });
      await grantConsole(operator, 'admin');
      const operatorToken = await auth.generateToken(operator);

      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await expectBothEndsClose(client, peer, () => request(harness.use(app))
        .delete(`/api/console/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(204));
    });

    it('closes both ends when the heartbeat expires', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await database.getAdapter().execute(
        'UPDATE console_sessions SET last_heartbeat_at = ? WHERE id = ?',
        [new Date(Date.now() - consoleConfig.sessionTimeoutMs - 60_000).toISOString(), sessionId],
      );

      await expectBothEndsClose(client, peer, () => manager.cleanupExpiredSessions());

      expect(await stateOf(sessionId)).toBe('terminated');
    });

    it('closes both ends on restart cleanup for the provider', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await expectBothEndsClose(client, peer, () => manager.terminateAllForProvider('proxmox'));

      expect(await stateOf(sessionId)).toBe('terminated');
    });

    it('closes both ends at shutdown', async () => {
      const { wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await expectBothEndsClose(client, peer, () => {
        expect(broker.revokeAll('server_shutdown')).toBe(1);
        return Promise.resolve();
      });
    });

    it('records the termination of a connection the shutdown closed', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      // The assembled shutdown order: revoke, then wait for the writes the
      // close handlers started, then close the database. Without the drain the
      // last two race and the terminal state is lost.
      await expectBothEndsClose(client, peer, () => {
        expect(broker.revokeAll('server_shutdown')).toBe(1);
        return Promise.resolve();
      });
      await proxy.drain();

      expect(await stateOf(sessionId)).toBe('terminated');
    });

    it('releases the provider session when the owner terminates', async () => {
      const { sessionId, wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      await expectBothEndsClose(client, peer, () => request(harness.use(app))
        .delete(`/api/console/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204));

      // Without this the provider keeps the session for the process lifetime
      // and keeps reporting it as active.
      expect(released).toEqual([sessionId]);
    });

    it('releases the provider session when the heartbeat expires', async () => {
      const { sessionId } = await createSession();
      await database.getAdapter().execute(
        'UPDATE console_sessions SET last_heartbeat_at = ? WHERE id = ?',
        [new Date(Date.now() - consoleConfig.sessionTimeoutMs - 60_000).toISOString(), sessionId],
      );

      await manager.cleanupExpiredSessions();

      expect(released).toEqual([sessionId]);
    });

    it('releases every provider session on restart cleanup', async () => {
      const first = await createSession();
      const second = await createSession();

      await manager.terminateAllForProvider('proxmox');

      expect(released.toSorted()).toEqual([first.sessionId, second.sessionId].toSorted());
    });

    it('closes an upstream that opens after the session was terminated', async () => {
      // A dial can take up to the connect timeout. A termination in that window
      // used to find no relay, so the upstream opened unsupervised and stayed
      // open until the authorization poller next fired.
      const slowServer = http.createServer();
      const slowUpstream = new WebSocketServer({ noServer: true });
      let arrived: (() => void) | undefined;
      const upgradeArrived = new Promise<void>((resolve) => { arrived = resolve; });
      let completeHandshake: (() => void) | undefined;
      slowServer.on('upgrade', (req, socket, head) => {
        completeHandshake = (): void => {
          slowUpstream.handleUpgrade(req, socket, head, (ws) => {
            slowUpstream.emit('connection', ws, req);
          });
        };
        arrived?.();
      });
      await new Promise<void>((resolve) => { slowServer.listen(0, '127.0.0.1', () => { resolve(); }); });
      const slowPort = (slowServer.address() as AddressInfo).port;

      try {
        const reservation = await manager.reserveSession({
          userId: owner.id, nodeId: 'proxmox:pve:102', provider: 'proxmox', transport: 'websocket-vnc',
        });
        broker.offer(reservation.sessionId, `ws://127.0.0.1:${String(slowPort)}`);
        await manager.activateSession(reservation.sessionId);

        const client = new WebSocket(
          `ws://127.0.0.1:${String(wsPort)}/ws/console/vnc?token=${reservation.token}`,
          { origin: ORIGIN },
        );
        openClients.push(client);
        await once(client, 'open');
        await upgradeArrived;

        // Terminate while the dial is still in flight, then let it complete.
        const clientClosed = once(client, 'close');
        await manager.terminateSession(reservation.sessionId, 'user_terminated');
        await clientClosed;

        const accepted = once(slowUpstream, 'connection');
        completeHandshake?.();
        const [peer] = await accepted as [WebSocket];
        await once(peer, 'close');

        expect(broker.getStatus().liveConnections).toBe(0);
      } finally {
        for (const peer of slowUpstream.clients) peer.terminate();
        slowServer.closeAllConnections();
        await new Promise<void>((resolve) => { slowServer.close(() => { resolve(); }); });
      }
    });

    it('leaves no live relay registered after the client disconnects', async () => {
      const { wsToken } = await createSession();
      const { client, peer } = await connect(wsToken);

      const peerClosed = once(peer, 'close');
      client.close();
      await peerClosed;

      await vi.waitFor(() => { expect(broker.getStatus().liveConnections).toBe(0); });
    });
  });

  describe('session ownership (S09)', () => {
    let otherToken: string;

    beforeEach(async () => {
      const auth = new AuthenticationService(database.getAdapter(), SECRET);
      const other = await users.createUser({
        username: 'other', email: 'other@example.test', password: 'Password123!',
        firstName: 'Other', lastName: 'User',
      });
      await grantConsole(other, 'access');
      otherToken = await auth.generateToken(other);
    });

    it('denies another user\'s heartbeat', async () => {
      const { sessionId } = await createSession();

      await request(harness.use(app))
        .post(`/api/console/sessions/${sessionId}/heartbeat`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('denies reading another user\'s session metadata', async () => {
      const { sessionId } = await createSession();

      await request(harness.use(app))
        .get(`/api/console/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('allows the owner to heartbeat and read their own session', async () => {
      const { sessionId } = await createSession();

      await request(harness.use(app))
        .post(`/api/console/sessions/${sessionId}/heartbeat`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      await request(harness.use(app))
        .get(`/api/console/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    });

    it('refuses to extend a terminated session', async () => {
      const { sessionId } = await createSession();
      await manager.terminateSession(sessionId, 'user_terminated');

      await request(harness.use(app))
        .post(`/api/console/sessions/${sessionId}/heartbeat`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });
  });

  describe('capacity reservation (S09)', () => {
    it('refuses a session beyond the cap without asking the provider', async () => {
      const cap = consoleConfig.maxConcurrentSessions;
      for (let i = 0; i < cap; i++) {
        await createSession();
      }
      const askedBefore = prepared.length;

      await request(harness.use(app))
        .post('/api/console/sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ nodeId: 'proxmox:pve:200', provider: 'proxmox' })
        .expect(429);

      // Nothing was prepared, so no provider resource leaked past the cap.
      expect(prepared).toHaveLength(askedBefore);
    });

    it('releases the reserved slot when the provider fails', async () => {
      const failing = {
        getConsoleProvider: vi.fn().mockReturnValue({
          getSupportedTransports: () => ['websocket-vnc'],
          createSession: () => Promise.reject(new Error('Guest must be running for console access')),
          terminateSession: vi.fn().mockResolvedValue(true),
        }),
        getAggregatedInventory: vi.fn().mockResolvedValue({ nodes: [], groups: [], sources: {} }),
      } as unknown as IntegrationManager;

      const container = new DIContainer();
      container.register('logger', new LoggerService());
      container.register('expertMode', new ExpertModeService());
      container.register('config', new ConfigService());
      const failingApp = express();
      failingApp.use(express.json());
      failingApp.use('/api/console', createConsoleRouter(
        container, failing, manager, database.getAdapter(), broker,
      ));

      await request(harness.use(failingApp))
        .post('/api/console/sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ nodeId: 'proxmox:pve:300', provider: 'proxmox' })
        .expect(502);

      // The failed reservation holds no slot, so the cap still admits.
      expect(await manager.getActiveSessionCount(owner.id)).toBe(0);
      const held = await database.getAdapter().queryOne<{ count: number }>(
        `SELECT COUNT(*) AS "count" FROM console_sessions
          WHERE user_id = ? AND state IN ('creating', 'active')`,
        [owner.id],
      );
      expect(held?.count).toBe(0);
    });
  });
});
