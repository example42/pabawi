import { asyncHandler } from "../routes/asyncHandler";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { tokensEqual } from "../utils/tokensEqual";

/**
 * Inventory-scoped authentication for the generic lifecycle routes.
 *
 * `PABAWI_LIFECYCLE_TOKEN` used to be checked *in addition to* the JWT the
 * mount already required, in the same `Authorization` header: a static token
 * and a user JWT cannot both be the value of one header, so the documented
 * flow was unusable and interactive callers were refused outright (finding
 * I08). The token is now an alternative credential, matched before JWT
 * verification, and it authenticates to the provisioned `lifecycle-service`
 * account. Authorization is unchanged either way: `rbacMiddleware` resolves
 * `<provider>:<action>` for whichever principal authenticated.
 *
 * Mounted ONLY on /api/inventory — it cannot authenticate any other route.
 */
export function createLifecycleAuthMiddleware(
  lifecycleToken: string | undefined,
  lifecycleUserId: string,
  jwtAuthMiddleware: RequestHandler,
  db: DatabaseAdapter,
): RequestHandler {
  const machineVersion = async (): Promise<string> => {
    const user = await db.queryOne<{ active: number; version: string }>(
      'SELECT is_active AS active, session_version AS version FROM users WHERE id = ?', [lifecycleUserId],
    );
    if (user?.active !== 1) throw new Error('Lifecycle account is inactive');
    return user.version;
  };

  return asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!lifecycleToken) {
      // No machine credential configured — JWT is the only way in.
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

    if (tokensEqual(token, lifecycleToken)) {
      try {
        const version = await machineVersion();
        req.revalidateAuth = async (): Promise<void> => {
          if (version !== await machineVersion()) throw new Error('Lifecycle session revoked');
        };
      } catch {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Lifecycle account unavailable' } });
        return;
      }
      req.user = {
        userId: lifecycleUserId,
        username: "lifecycle-service",
        roles: ["Lifecycle Service"],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      next();
      return;
    }

    // Not the static token — try JWT verification.
    jwtAuthMiddleware(req, res, next);
  });
}
