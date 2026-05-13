import type { Request, Response, NextFunction, RequestHandler } from "express";

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
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    if (token === mcpAuthToken) {
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
  };
}
