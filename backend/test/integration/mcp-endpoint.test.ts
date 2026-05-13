/**
 * Integration Tests for MCP Endpoint
 *
 * Validates that the MCP server is properly wired into Express
 * and responds to MCP protocol requests.
 *
 * Requirements: 10.1, 10.3, 10.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { PermissionService } from '../../src/services/PermissionService';
import { LoggerService } from '../../src/services/LoggerService';
import { provisionMcpServiceUser } from '../../src/mcp/McpServiceUser';
import { createMcpServer } from '../../src/mcp/McpServer';
import type { McpServerInstance } from '../../src/mcp/McpServer';
import { IntegrationManager } from '../../src/integrations/IntegrationManager';
import { ExecutionRepository } from '../../src/database/ExecutionRepository';
import { JournalService } from '../../src/services/journal/JournalService';

const MCP_HEADERS = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
};

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const { StreamableHTTPServerTransport } = require(
  '@modelcontextprotocol/sdk/server/streamableHttp.js',
);

/**
 * Creates a fresh Express app with a new MCP transport connected to the given server.
 */
async function createMcpApp(mcpServer: McpServerInstance): Promise<Express> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  await mcpServer.connect(transport);

  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal MCP error' });
      }
    }
  });

  return app;
}

describe('MCP Endpoint Integration Tests', () => {
  let databaseService: DatabaseService;
  let mcpDeps: Parameters<typeof createMcpServer>[0];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-mcp-secret'; // pragma: allowlist secret

    databaseService = new DatabaseService(':memory:');
    await databaseService.initialize();

    const db = databaseService.getAdapter();
    const logger = new LoggerService();
    const authService = new AuthenticationService(db);
    const userService = new UserService(db, authService);
    const roleService = new RoleService(db);
    const permissionService = new PermissionService(db);

    const { userId: mcpUserId } = await provisionMcpServiceUser(
      userService, roleService, permissionService, logger,
    );

    mcpDeps = {
      integrationManager: new IntegrationManager({ logger }),
      executionRepository: new ExecutionRepository(db),
      journalService: new JournalService(db),
      permissionService,
      hieraPlugin: undefined,
      puppetDBService: undefined,
      puppetRunHistoryService: undefined,
      mcpUserId,
      logger,
      version: '1.0.0-test',
    };
  });

  afterAll(async () => {
    await databaseService.close();
  });

  it('should respond to MCP initialize with server name pabawi', async () => {
    const mcpServer = createMcpServer(mcpDeps);
    const app = await createMcpApp(mcpServer);

    const response = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })
      .expect(200);

    expect(response.body.result).toBeDefined();
    expect(response.body.result.serverInfo.name).toBe('pabawi');
    expect(response.body.result.protocolVersion).toBeDefined();

    await mcpServer.close();
  });

  it('should return all 8 tools on tools/list', async () => {
    const mcpServer = createMcpServer(mcpDeps);
    const app = await createMcpApp(mcpServer);

    // Initialize session
    const initResponse = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })
      .expect(200);

    const sessionId = initResponse.headers['mcp-session-id'] as string;
    expect(sessionId).toBeDefined();

    // Send initialized notification
    await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // Request tools list
    const toolsResponse = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      .expect(200);

    expect(toolsResponse.body.result).toBeDefined();
    expect(toolsResponse.body.result.tools).toBeDefined();

    const toolNames = toolsResponse.body.result.tools.map(
      (t: { name: string }) => t.name,
    );

    const expectedTools = [
      'inventory_list',
      'facts_get',
      'facts_bulk',
      'reports_query',
      'catalogs_get',
      'hiera_lookup',
      'executions_list',
      'integrations_list',
      'journal_query',
    ];

    expect(toolNames).toHaveLength(9);
    for (const tool of expectedTools) {
      expect(toolNames).toContain(tool);
    }

    await mcpServer.close();
  });
});
