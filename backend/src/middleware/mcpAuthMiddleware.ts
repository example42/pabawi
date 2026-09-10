import { asyncHandler } from "../routes/asyncHandler";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { tokensEqual } from "../utils/tokensEqual";

/**
 * MCP-scoped authentication middleware.
 *
 * Checks the bearer token against the static MCP_AUTH_TOKEN first.
 * If it matches, attaches the mcp-service user identity to req.user and proceeds.
 * If it doesn't match (or MCP_AUTH_TOKEN is not configured), delegates to the
 * standard JWT authMiddleware.
 *
 * This middleware is mounted ONLY on /mcp routes — it cannot be used to
 * bypass JWT auth on other endpoints.
 */
export function createMcpAuthMiddleware(
  mcpAuthToken: string | undefined,
  mcpUserId: string,
  jwtAuthMiddleware: RequestHandler,
  db: DatabaseAdapter,
): RequestHandler {
  const machineVersion = async (): Promise<string> => {
    const user = await db.queryOne<{ active: number; version: string }>(
      'SELECT is_active AS active, session_version AS version FROM users WHERE id = ?', [mcpUserId],
    );
    if (user?.active !== 1) throw new Error('MCP account is inactive');
    return user.version;
  };

  return asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    req.mcpAuthMethod = 'jwt';
    if (!mcpAuthToken) {
      // No static token configured — fall through to JWT auth
      jwtAuthMiddleware(req, res, next);
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      // No bearer token — let JWT middleware produce the appropriate 401
      jwtAuthMiddleware(req, res, next);
      return;
    }

    const token = authHeader.substring(7);

    if (tokensEqual(token, mcpAuthToken)) {
      try {
        const version = await machineVersion();
        req.revalidateAuth = async (): Promise<void> => {
          if (version !== await machineVersion()) throw new Error('MCP session revoked');
        };
      } catch {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'MCP account unavailable' } });
        return;
      }
      req.mcpAuthMethod = 'static';
      // Static MCP token matched — authenticate as mcp-service user
      req.user = {
        userId: mcpUserId,
        username: "mcp-service",
        roles: ["MCP Service"],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      next();
      return;
    }

    // Token didn't match the static MCP token — try JWT verification
    jwtAuthMiddleware(req, res, next);
  });
}
