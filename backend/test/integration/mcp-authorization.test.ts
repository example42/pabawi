import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { PermissionService } from '../../src/services/PermissionService';
import { LoggerService } from '../../src/services/LoggerService';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import { JournalService } from '../../src/services/journal/JournalService';
import { provisionMcpServiceUser } from '../../src/mcp/McpServiceUser';
import { createMcpRouter } from '../../src/mcp/McpRouter';
import { createMcpAuthMiddleware } from '../../src/middleware/mcpAuthMiddleware';
import { createAuthMiddleware } from '../../src/middleware/authMiddleware';

const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'security-test', version: '1' },
} };
const jwtSecret = 'test-mcp-jwt-secret'; // pragma: allowlist secret
const machineToken = 'test-mcp-machine-credential'; // pragma: allowlist secret
const toolArgs: Record<string, Record<string, unknown>> = {
  inventory_list: {}, facts_get: { certname: 'node' }, facts_bulk: { fact_names: ['os'] },
  reports_query: {}, catalogs_get: { certname: 'node' }, hiera_lookup: { key: 'secret' },
  executions_list: {}, integrations_list: {}, journal_query: {},
  monitoring_services_get: { nodeId: 'node' }, monitoring_events_get: { nodeId: 'node' },
};

function result(response: request.Response): { result?: { isError?: boolean; content: { text: string }[] } } {
  const data = response.text.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(data ? data.slice(6) : response.text) as ReturnType<typeof result>;
}

describe('Production MCP authentication and session boundary', () => {
  let harness: HttpHarness;
  let database: DatabaseService;
  let mcp: ReturnType<typeof createMcpRouter>;
  let auth: AuthenticationService;
  let users: UserService;
  let roles: RoleService;
  let permissions: PermissionService;
  let manager: IntegrationManager;
  let logger: LoggerService;
  let alice: { id: string; username: string };
  let bob: { id: string; username: string };
  let machine: { userId: string; roleId: string };
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => { harness = await createHttpHarness(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    auth = new AuthenticationService(db, jwtSecret);
    users = new UserService(db, auth);
    roles = new RoleService(db);
    permissions = new PermissionService(db);
    logger = new LoggerService();
    vi.spyOn(logger, 'info');
    manager = new IntegrationManager({ logger });
    machine = await provisionMcpServiceUser(users, roles, permissions, logger);
    await db.execute('DELETE FROM user_roles WHERE user_id = ? AND role_id <> ?', [machine.userId, machine.roleId]);
    alice = await users.createUser({ username: 'alice', email: 'alice@example.test', password: 'Test!password123', firstName: 'Test', lastName: 'User', isActive: true, isAdmin: false }); // pragma: allowlist secret
    bob = await users.createUser({ username: 'bob', email: 'bob@example.test', password: 'Test!password123', firstName: 'Test', lastName: 'User', isActive: true, isAdmin: false }); // pragma: allowlist secret
    await db.execute('DELETE FROM user_roles WHERE user_id IN (?, ?)', [alice.id, bob.id]);
    aliceToken = await auth.generateToken(alice);
    bobToken = await auth.generateToken(bob);
    mcp = createMcpRouter({
      integrationManager: manager, executionRepository: new ExecutionRepository(db),
      journalService: new JournalService(db), permissionService: permissions,
      hieraPlugin: undefined, puppetDBService: undefined, puppetRunHistoryService: undefined,
      logger, version: 'test',
    }, createMcpAuthMiddleware(machineToken, machine.userId, createAuthMiddleware(db, jwtSecret), db),
    { total: 4, perPrincipal: 2, ttlMs: 86400000 });
    const app = express();
    app.use(express.json());
    app.use('/mcp', mcp.router);
    harness.use(app);
  });
  afterEach(async () => {
    await mcp?.close();
    await database.close();
    vi.restoreAllMocks();
  });

  function send(token: string, method: 'post' | 'get' | 'delete' = 'post', session?: string) {
    const req = request(`http://127.0.0.1:${String(harness.port)}`)[method]('/mcp').set(headers).auth(token, { type: 'bearer' });
    return session ? req.set('mcp-session-id', session) : req;
  }
  it('applies the account request budget before session lookup and preserves other accounts', async () => {
    for (let i = 0; i < 100; i++) await send(aliceToken, 'post', `missing-${i}`).send({}).expect(404);
    await send(aliceToken, 'post', 'another').send({}).expect(429);
    await send(bobToken, 'post', 'another').send({}).expect(404);
  });

  async function open(token: string): Promise<string> {
    const response = await send(token).send(initialize).expect(200);
    const id = response.headers['mcp-session-id'] as string;
    expect(id).toBeTruthy();
    await send(token, 'post', id).send({ jsonrpc: '2.0', method: 'notifications/initialized' }).expect(202);
    return id;
  }
  async function call(token: string, session: string, name: string) {
    const response = await send(token, 'post', session).send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: toolArgs[name] } }).expect(200);
    return result(response).result;
  }
  async function grant(userId: string, resource: string) {
    const permission = (await permissions.listPermissions({ resource, action: 'read' })).items[0];
    const role = await roles.createRole({ name: `${userId}-${resource}`, description: 'Narrow test role' });
    await roles.assignPermissionToRole(role.id, permission.id);
    await users.assignRoleToUser(userId, role.id);
    return { roleId: role.id, permissionId: permission.id };
  }

  it('rejects missing credentials, refresh JWTs and invalid initialization', async () => {
    await request(`http://127.0.0.1:${String(harness.port)}`).post('/mcp').send(initialize).expect(401);
    const pair = await auth.generateTokenPair(alice);
    await send(pair.refreshToken).send(initialize).expect(401);
    await send(aliceToken).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(400);
  });

  it('denies every tool to a no-role JWT, while the machine retains its own scope', async () => {
    const session = await open(aliceToken);
    const inventory = vi.spyOn(manager, 'getAggregatedInventory');
    const health = vi.spyOn(manager, 'healthCheckAll');
    for (const name of Object.keys(toolArgs)) {
      expect((await call(aliceToken, session, name))?.isError).toBe(true);
    }
    expect(inventory).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
    expect((await call(machineToken, await open(machineToken), 'integrations_list'))?.isError).toBeUndefined();
    expect(health).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('MCP tool authorization', expect.objectContaining({
      metadata: expect.objectContaining({ userId: alice.id, authMethod: 'jwt', allowed: false }),
    }));
  });

  it('rejects cross-user GET, POST and DELETE without destroying the owner session', async () => {
    const session = await open(aliceToken);
    for (const method of ['get', 'post', 'delete'] as const) {
      await send(bobToken, method, session).send(method === 'post' ? { jsonrpc: '2.0', id: 2, method: 'tools/list' } : undefined).expect(404);
    }
    await send(aliceToken, 'post', session).send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(200);
    await send(aliceToken, 'delete', session).expect(200);
    await send(aliceToken, 'post', session).send(initialize).expect(404);
  });

  it('separates JWT and static authentication even for the same user ID', async () => {
    const jwt = await auth.generateToken({ id: machine.userId, username: 'mcp-service' });
    const staticSession = await open(machineToken);
    const jwtSession = await open(jwt);
    for (const method of ['get', 'post', 'delete'] as const) {
      await send(jwt, method, staticSession).expect(404);
      await send(machineToken, method, jwtSession).expect(404);
    }
    await send(machineToken).send(initialize).expect(429);
  });

  it('rechecks narrow permissions after removal and preserves machine permissions', async () => {
    const grantIds = await grant(alice.id, 'integration_config');
    const session = await open(aliceToken);
    expect((await call(aliceToken, session, 'integrations_list'))?.isError).toBeUndefined();
    expect((await call(aliceToken, session, 'executions_list'))?.isError).toBe(true);
    await roles.removePermissionFromRole(grantIds.roleId, grantIds.permissionId);
    expect((await call(aliceToken, session, 'integrations_list'))?.isError).toBe(true);
    expect((await call(machineToken, await open(machineToken), 'integrations_list'))?.isError).toBeUndefined();
  });

  it('scopes aggregate inventory and facts before provider dispatch', async () => {
    await grant(alice.id, 'ansible');
    await grant(alice.id, 'puppetdb');
    const inventory = vi.spyOn(manager, 'getAggregatedInventory').mockResolvedValue({ nodes: [], groups: [], sources: {} } as never);
    const facts = vi.spyOn(manager, 'getNodeData').mockResolvedValue({ facts: {} } as never);
    const session = await open(aliceToken);
    // Registered providers determine the scope; Bolt is always considered.
    vi.spyOn(manager, 'getAllInformationSources').mockReturnValue([{ name: 'ansible' }, { name: 'puppetdb' }, { name: 'aws' }] as never);
    await call(aliceToken, session, 'inventory_list');
    await call(aliceToken, session, 'facts_get');
    expect(inventory).toHaveBeenCalledWith(true, ['ansible', 'puppetdb']);
    expect(facts).toHaveBeenCalledWith('node', ['ansible', 'puppetdb']);
  });

  it('revokes opening JWT credentials even if a new JWT is supplied for continuation', async () => {
    const session = await open(aliceToken);
    await database.getAdapter().execute('UPDATE users SET session_version = ? WHERE id = ?', ['a'.repeat(32), alice.id]);
    const fresh = await auth.generateToken(alice);
    await send(fresh, 'post', session).send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(401);
    await send(fresh, 'post', session).send(initialize).expect(404);
  });

  it('rejects deactivated JWT and machine accounts, including established sessions', async () => {
    const session = await open(aliceToken);
    const staticSession = await open(machineToken);
    await database.getAdapter().execute('UPDATE users SET is_active = 0 WHERE id IN (?, ?)', [alice.id, machine.userId]);
    await send(aliceToken, 'post', session).send(initialize).expect(401);
    await send(machineToken, 'delete', staticSession).expect(401);
    await send(machineToken).send(initialize).expect(401);
  });

  it('applies machine role removal immediately to an existing session', async () => {
    const session = await open(machineToken);
    const permission = (await permissions.listPermissions({ resource: 'integration_config', action: 'read' })).items[0];
    expect((await call(machineToken, session, 'integrations_list'))?.isError).toBeUndefined();
    await roles.removePermissionFromRole(machine.roleId, permission.id);
    expect((await call(machineToken, session, 'integrations_list'))?.isError).toBe(true);
  });

  it('evicts revoked idle sessions and permits fresh machine sessions', async () => {
    const session = await open(machineToken);
    await database.getAdapter().execute('UPDATE users SET session_version = ? WHERE id = ?', ['b'.repeat(32), machine.userId]);
    await new Promise(resolve => setTimeout(resolve, 1200));
    await send(machineToken, 'post', session).send(initialize).expect(404);
    await open(machineToken);
  });

  it('expires sessions at the TTL and closes admission during shutdown', async () => {
    const session = await open(machineToken);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 86400000);
    await send(machineToken, 'post', session).send(initialize).expect(401);
    await open(machineToken);
    await mcp.close();
    await send(machineToken).send(initialize).expect(503);
  });

  it('bounds concurrent initialization per account and releases capacity on deletion', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => send(aliceToken).send(initialize)));
    expect(responses.filter(response => response.status === 200)).toHaveLength(2);
    expect(responses.filter(response => response.status === 429)).toHaveLength(3);
    const id = responses.find(response => response.status === 200)?.headers['mcp-session-id'] as string;
    await send(aliceToken, 'delete', id).expect(200);
    await open(aliceToken);
    await open(bobToken);
    await open(machineToken);
    await send(bobToken).send(initialize).expect(503);
  });

  it('releases failed initialization reservations', async () => {
    for (let index = 0; index < 4; index++) {
      await send(aliceToken).send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    }
    await open(aliceToken);
  });
});
