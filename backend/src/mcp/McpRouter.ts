import { createRateLimitMiddleware, createMcpConcurrencyMiddleware } from '../middleware/securityMiddleware';
import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../routes/asyncHandler';
import { SessionAuthorization } from '../services/SessionAuthorization';
import { createMcpServer, type McpDependencies, type McpPrincipal, type McpServerInstance } from './McpServer';

// The backend's CommonJS module resolution cannot resolve the SDK export map.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js') as typeof import('@modelcontextprotocol/sdk/server/streamableHttp.js'); // eslint-disable-line @typescript-eslint/consistent-type-imports

interface Session {
  principal: McpPrincipal;
  createdAt: number;
  revalidate: () => Promise<void>;
  server: McpServerInstance;
  transport: InstanceType<typeof StreamableHTTPServerTransport>;
  id?: string;
  authorization?: SessionAuthorization;
  closed: boolean;
}

export function createMcpRouter(
  deps: Omit<McpDependencies, 'principal' | 'revalidateAuth'>,
  authenticate: RequestHandler,
  limits = { total: 100, perPrincipal: 10, ttlMs: 24 * 60 * 60 * 1000 },
): { router: Router; close: () => Promise<void> } {
  const router = Router();
  let closing = false;
  const sessions = new Map<string, Session>();
  // Includes pending initialization, reserving capacity before any asynchronous work.
  const allocated = new Set<Session>();

  function release(session: Session): void {
    session.closed = true;
    session.authorization?.close();
    if (session.id) sessions.delete(session.id);
    allocated.delete(session);
  }

  async function closeSession(session: Session): Promise<void> {
    if (session.closed) return;
    release(session);
    await session.server.close();
  }

  function log(principal: McpPrincipal, operation: string): void {
    deps.logger.info('MCP session boundary', {
      component: 'McpRouter', operation, metadata: { ...principal },
    });
  }

  router.all('/', authenticate, createRateLimitMiddleware(), createMcpConcurrencyMiddleware(), asyncHandler(async (req, res) => {
    if (!req.user || !req.mcpAuthMethod || !req.revalidateAuth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (closing) { res.sendStatus(503); return; }
    const principal: McpPrincipal = { userId: req.user.userId, authMethod: req.mcpAuthMethod };
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'POST, GET, DELETE');
      res.sendStatus(405);
      return;
    }
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId !== undefined) {
      const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
      if (session?.principal.userId !== principal.userId || session.principal.authMethod !== principal.authMethod) {
        log(principal, 'sessionAccessDenied');
        res.status(404).json({ error: 'MCP session unavailable' });
        return;
      }
      try {
        await session.revalidate();
      } catch {
        await closeSession(session);
        res.status(401).json({ error: 'MCP session expired or revoked' });
        return;
      }
      if (req.method === 'DELETE') {
        await closeSession(session);
        log(principal, 'sessionClosed');
        res.sendStatus(200);
        return;
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }
    const body = req.body as { method?: unknown } | undefined;
    if (req.method !== 'POST' || body?.method !== 'initialize') {
      res.status(400).json({ error: 'MCP initialization required' });
      return;
    }
    for (const session of allocated) {
      if (Date.now() - session.createdAt >= limits.ttlMs) await closeSession(session);
    }
    // Shutdown can begin while expired transports are being closed.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (closing) { res.sendStatus(503); return; }
    // Count by account even when the same account uses both authentication methods.
    if ([...allocated].filter(session => session.principal.userId === principal.userId).length >= limits.perPrincipal) {
      log(principal, 'sessionQuotaDenied');
      res.status(429).json({ error: 'MCP account session limit reached' });
      return;
    }
    if (allocated.size >= limits.total) {
      res.status(503).json({ error: 'Maximum MCP session limit reached' });
      return;
    }
    const openingAuth = req.revalidateAuth;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id: string): void => {
        session.id = id;
        sessions.set(id, session);
        log(principal, 'sessionCreated');
      },
    });
    const session: Session = {
      transport, principal, createdAt: Date.now(), closed: false,
      revalidate: async () => {
        await openingAuth();
        if (session.closed || Date.now() - session.createdAt >= limits.ttlMs) throw new Error('MCP session closed');
      },
      server: createMcpServer({ ...deps, principal, revalidateAuth: async () => { await session.revalidate(); } }),
    };
    allocated.add(session);
    // Install before connect so the SDK preserves its own close callback.
    transport.onclose = (): void => { release(session); };
    session.authorization = new SessionAuthorization(session.revalidate, () => {
      void closeSession(session).catch((error: unknown) => {
        deps.logger.error('Failed to close MCP session', { component: 'McpRouter', operation: 'closeSession' }, error instanceof Error ? error : undefined);
      });
    });
    try {
      await session.server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      await closeSession(session);
      throw error;
    } finally {
      if (!session.id || res.statusCode >= 400) await closeSession(session);
    }
  }));

  return { router, close: async (): Promise<void> => {
    closing = true;
    await Promise.all([...allocated].map(closeSession));
  } };
}
