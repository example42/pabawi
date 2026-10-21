import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { deferred, ldapResult } from '../helpers/ldapAuthentication';
import { createLdapTransportContext, liveDirectoryReady } from '../helpers/ldapTransport';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';
import { LdapDirectoryError } from '../../src/services/LdapDirectoryService';
import type { LdapDirectoryResult } from '../../src/services/LdapDirectoryService';
import { StreamingExecutionManager } from '../../src/services/StreamingExecutionManager';
import { createJournalRouter } from '../../src/routes/journal';
import { JournalService } from '../../src/services/journal/JournalService';
import type { JournalEntry } from '../../src/services/journal/types';
import { createMcpRouter } from '../../src/mcp/McpRouter';
import { createMcpAuthMiddleware } from '../../src/middleware/mcpAuthMiddleware';
import { PermissionService } from '../../src/services/PermissionService';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { ConsoleSessionManager } from '../../src/services/ConsoleSessionManager';
import { ConsoleConnectionBroker } from '../../src/services/ConsoleConnectionBroker';
import { ConsoleWebSocketProxy } from '../../src/services/ConsoleWebSocketProxy';
import { ConsoleConfigSchema } from '../../src/config/schema';
import { createConsoleRouter } from '../../src/routes/console';
import { LoggerService } from '../../src/services/LoggerService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';

const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ldap-test', version: '1' },
} };

for (const [mode, dialect] of [['synthetic', 'sqlite'], ['ldaps', 'sqlite'], ['starttls', 'sqlite'], ['ldaps', 'postgres'], ['starttls', 'postgres']] as const) {
describe.skipIf((mode !== 'synthetic' && !liveDirectoryReady) || (dialect === 'postgres' && !process.env.TEST_DATABASE_URL))('LDAP protected delivery across transports: ' + dialect + '/' + mode, () => {
  let ctx: Awaited<ReturnType<typeof createLdapTransportContext>>;
  let harness: HttpHarness;
  let pair: { token: string; refreshToken: string; user: { id: string } };
  let cleanup: (() => void | Promise<void>)[];

  beforeEach(async () => {
    ctx = await createLdapTransportContext(mode, dialect);
    harness = await createHttpHarness();
    harness.use(ctx.app);
    // Administrative authority still requires an explicit LDAP/manual role.
    const proof = await ctx.ldap.authenticate(ctx.loginName, ctx.loginPassword);
    await ctx.users.updateUser(proof.user.id, { isAdmin: true });
    pair = (await request(harness.use(ctx.app)).post('/api/auth/ldap/login').send({ username: ctx.loginName, password: ctx.loginPassword }).expect(200)).body;
    cleanup = [];
  });
  afterEach(async () => {
    vi.useRealTimers();
    for (const close of cleanup.reverse()) await close();
    await harness.close();
    await ctx.live?.close();
    await ctx.database.close();
    await ctx.releaseDatabase();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  async function expire() { await ctx.db.execute('UPDATE ldap_validation_state SET last_validated_at = 1'); }
  async function openEvents(path: string) {
    const abort = new AbortController();
    cleanup.push(() => { abort.abort(); });
    const response = await fetch(`http://127.0.0.1:${harness.port}${path}`, {
      headers: { Authorization: `Bearer ${pair.token}` }, signal: abort.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    return { reader, read: async () => {
      const next = await reader.read();
      return next.done ? null : new TextDecoder().decode(next.value);
    } };
  }

  it('REST and refresh fail without extending freshness during an outage, retain retryable credentials and recover independently of local login', async () => {
    const before = await ctx.db.queryOne('SELECT * FROM ldap_validation_state');
    if (ctx.live) ctx.live.outage(true);
    else ctx.directory.revalidate.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    const server = harness.use(ctx.app);
    await request(server).post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(503);
    expect(await ctx.db.queryOne('SELECT * FROM ldap_validation_state')).toEqual(before);
    await request(server).get('/protected').set('Authorization', 'Bearer ' + pair.token).expect(200);
    await expire();
    const expired = await ctx.db.queryOne('SELECT * FROM ldap_validation_state');
    await request(server).get('/protected').set('Authorization', 'Bearer ' + pair.token).expect(503);
    expect(await ctx.db.queryOne('SELECT * FROM ldap_validation_state')).toEqual(expired);
    await request(server).post('/api/auth/login').send({ username: 'administrator', password: 'LocalTest123!' }).expect(200); // pragma: allowlist secret
    if (ctx.live) ctx.live.outage(false);
    else ctx.directory.revalidate.mockResolvedValue(ldapResult);
    await request(server).get('/protected').set('Authorization', 'Bearer ' + pair.token).expect(200);
    await request(server).post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(200);
  });

  it('execution SSE stops output while revalidation is pending and closes without protected delivery on failure', async () => {
    const streaming = new StreamingExecutionManager();
    cleanup.push(() => { streaming.cleanup(); });
    ctx.app.get('/events', ctx.authenticate, (_req, res) => { streaming.subscribe('execution', res); });
    const stream = await openEvents('/events');
    await stream.read();
    const pending = deferred<LdapDirectoryResult>();
    if (ctx.live) ctx.live.pause();
    else ctx.directory.revalidate.mockReturnValueOnce(pending.promise);
    await expire();
    streaming.emit('execution', { type: 'stdout', data: 'protected-output' });
    await vi.waitFor(() => expect(ctx.directory.revalidate).toHaveBeenCalledOnce());
    if (ctx.live) ctx.live.outage(true);
    else pending.reject(new LdapDirectoryError('UNAVAILABLE'));
    expect(await stream.read()).toBeNull();
  });

  it('idle SSE revalidates on the shared timer and closes at expired freshness', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const streaming = new StreamingExecutionManager();
    cleanup.push(() => { streaming.cleanup(); });
    ctx.app.get('/idle', ctx.authenticate, (_req, res) => { streaming.subscribe('execution', res); });
    const stream = await openEvents('/idle');
    await stream.read();
    await expire();
    if (ctx.live) await ctx.live.setEligible(false);
    else ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await stream.read()).toBeNull();
    await expect(ctx.auth.verifyToken(pair.token)).rejects.toThrow();
  });

  it.each(['/api/journal/node/stream', '/api/journal/global/stream'])('journal SSE checks delayed batches at delivery: %s', async path => {
    const pending = deferred<JournalEntry[]>();
    vi.spyOn(JournalService.prototype, 'getNodeTimeline').mockReturnValue(pending.promise);
    vi.spyOn(JournalService.prototype, 'getGlobalTimeline').mockReturnValue(pending.promise);
    ctx.app.use('/api/journal', createJournalRouter(ctx.database, {}, ctx.container));
    const stream = await openEvents(path + '?source=system');
    expect(await stream.read()).toContain('event: init');
    await expire();
    if (ctx.live) ctx.live.outage(true);
    else ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('UNAVAILABLE'));
    pending.resolve([{ summary: 'protected-journal-data' } as JournalEntry]);
    expect(await stream.read()).toBeNull();
  });

  it('MCP rechecks an in-flight tool result and does not deliver data after freshness expires', async () => {
    const logger = new LoggerService('error');
    const manager = new IntegrationManager({ logger });
    const pending = deferred<Awaited<ReturnType<IntegrationManager['getAggregatedInventory']>>>();
    const query = vi.spyOn(manager, 'getAggregatedInventory').mockReturnValueOnce(pending.promise);
    const mcp = createMcpRouter({ integrationManager: manager, executionRepository: new ExecutionRepository(ctx.db),
      journalService: new JournalService(ctx.db), permissionService: new PermissionService(ctx.db),
      hieraPlugin: undefined, puppetDBService: undefined, puppetRunHistoryService: undefined, logger, version: 'test',
    }, createMcpAuthMiddleware(undefined, 'machine', ctx.authenticate, ctx.db));
    cleanup.push(async () => { await mcp.close(); });
    ctx.app.use('/mcp', mcp.router);
    const opening = await request(harness.use(ctx.app)).post('/mcp').set(headers).set('Authorization', `Bearer ${pair.token}`).send(initialize).expect(200);
    const session = opening.headers['mcp-session-id'] as string;
    const output = request(harness.use(ctx.app)).post('/mcp').set(headers).set('Authorization', `Bearer ${pair.token}`)
      .set('mcp-session-id', session).send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'inventory_list', arguments: {} } }).then(response => response);
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    await expire();
    if (ctx.live) ctx.live.outage(true);
    else ctx.directory.revalidate.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    pending.resolve({ nodes: [{ id: 'protected-node', name: 'protected-node', source: 'ssh' }], groups: [], sources: {} } as Awaited<ReturnType<IntegrationManager['getAggregatedInventory']>>);
    const response = await output;
    expect(response.text).not.toContain('protected-node');
    expect(response.text).toMatch(/authorization unavailable|session revoked/i);
  });

  it.each(['websocket-vnc', 'websocket-terminal'] as const)('console %s retains provider context and stops both delivery directions on stale authorization', async transport => {
    const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(upstream, 'listening');
    const address = upstream.address();
    if (typeof address === 'string') throw new Error('Unexpected address');
    cleanup.push(async () => { for (const ws of upstream.clients) ws.terminate(); await new Promise<void>(resolve => { upstream.close(() => { resolve(); }); }); });
    const logger = new LoggerService('error');
    const broker = new ConsoleConnectionBroker(logger);
    const config = ConsoleConfigSchema.parse({});
    const manager = new ConsoleSessionManager(ctx.db, config, logger, new AuditLoggingService(ctx.db), ctx.auth, broker);
    const integrations = { getConsoleProvider: () => ({ getSupportedTransports: () => [transport],
      createSession: async () => ({ upstream: { url: `ws://127.0.0.1:${address.port}` } }), terminateSession: async () => true,
    }), getAggregatedInventory: async () => ({ nodes: [], groups: [], sources: {} }) } as unknown as IntegrationManager;
    ctx.app.use('/api/console', createConsoleRouter(ctx.container, integrations, manager, ctx.db, broker));
    const proxy = new ConsoleWebSocketProxy(harness.use(ctx.app), manager, { allowedOrigins: ['http://localhost'], console: config }, logger, broker);
    cleanup.push(async () => { broker.revokeAll('test_teardown'); await new Promise(resolve => setImmediate(resolve)); await proxy.drain(); });
    const admission = await request(harness.use(ctx.app)).post('/api/console/sessions').set('Authorization', `Bearer ${pair.token}`)
      .send({ nodeId: 'node', provider: 'proxmox' }).expect(201);
    const row = await ctx.db.queryOne<{ auth_context: string }>('SELECT auth_context FROM console_sessions');
    expect(JSON.parse(row!.auth_context)).toMatchObject({ provider: 'ldap', directoryId: 'directory' });
    const connected = once(upstream, 'connection');
    const pathname = transport === 'websocket-vnc' ? 'vnc' : 'terminal';
    const ws = new WebSocket(`ws://127.0.0.1:${harness.port}/ws/console/${pathname}?token=${admission.body.session.token}`, { origin: 'http://localhost' });
    cleanup.push(() => { ws.close(); });
    await once(ws, 'open');
    const [peer] = await connected;
    // Wait for relay registration after the upstream opens.
    await new Promise(resolve => setTimeout(resolve, 30));
    const sent = vi.fn(); const received = vi.fn();
    peer.on('message', received); ws.on('message', sent);
    await expire();
    if (ctx.live) ctx.live.outage(true);
    else ctx.directory.revalidate.mockRejectedValue(new LdapDirectoryError('UNAVAILABLE'));
    const closed = once(ws, 'close');
    peer.send('protected-upstream'); ws.send('protected-client');
    await closed;
    expect(sent).not.toHaveBeenCalled();
    expect(received).not.toHaveBeenCalled();
    // A transient failure closes this relay but does not rotate account tokens.
    if (ctx.live) ctx.live.outage(false);
    else ctx.directory.revalidate.mockResolvedValue(ldapResult);
    await expect(ctx.auth.verifyToken(pair.token)).resolves.toMatchObject({ authContext: { provider: 'ldap' } });

    const second = await request(harness.use(ctx.app)).post('/api/console/sessions').set('Authorization', `Bearer ${pair.token}`)
      .send({ nodeId: 'node', provider: 'proxmox' }).expect(201);
    const idle = new WebSocket(`ws://127.0.0.1:${harness.port}/ws/console/${pathname}?token=${second.body.session.token}`, { origin: 'http://localhost' });
    cleanup.push(() => { idle.close(); });
    const idleUpstream = once(upstream, 'connection');
    await once(idle, 'open');
    await idleUpstream;
    await new Promise(resolve => setTimeout(resolve, 30));
    const idleClosed = once(idle, 'close');
    await expire();
    if (ctx.live) await ctx.live.setEligible(false);
    else ctx.directory.revalidate.mockRejectedValue(new LdapDirectoryError('INELIGIBLE'));
    await idleClosed;
    await expect(ctx.auth.verifyToken(pair.token)).rejects.toThrow();
  });

  it('rejects console upgrade on stale eligibility before an upstream is claimed', async () => {
    const config = ConsoleConfigSchema.parse({});
    const logger = new LoggerService('error');
    const manager = new ConsoleSessionManager(ctx.db, config, logger, new AuditLoggingService(ctx.db), ctx.auth);
    const payload = await ctx.auth.verifyToken(pair.token);
    const reservation = await manager.reserveSession({ userId: pair.user.id, nodeId: 'node', provider: 'proxmox', transport: 'websocket-vnc',
      authContext: payload.authContext, sessionVersion: payload.sessionVersion });
    await expire();
    if (ctx.live) await ctx.live.setEligible(false);
    else ctx.directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
    await expect(manager.claimTokenForUpgrade(reservation.token)).rejects.toMatchObject({ code: 'DENIED' });
    expect(await manager.claimTokenForUpgrade(reservation.token)).toBeNull();
    expect(await ctx.db.queryOne('SELECT token_consumed FROM console_sessions')).toEqual({ token_consumed: 1 });
  });
});

}
