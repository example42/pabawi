import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { type EntraIdService, EntraIdError, ENTRA_ID_ERROR_CODES } from "../services/EntraIdService";
import type { DatabaseService } from "../database/DatabaseService";
import type { DIContainer } from "../container/DIContainer";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";

const TokenExchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

/**
 * Map EntraIdError codes to HTTP status codes.
 */
function httpStatusForEntraIdError(code: string): number {
  switch (code) {
    case ENTRA_ID_ERROR_CODES.IDENTITY_COLLISION:
    case ENTRA_ID_ERROR_CODES.GROUPS_UNAVAILABLE:
      return 403;
    case ENTRA_ID_ERROR_CODES.INVALID_STATE:
      return 400;
    case ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE:
      return 400;
    case ENTRA_ID_ERROR_CODES.TOKEN_EXCHANGE_FAILED:
    case ENTRA_ID_ERROR_CODES.INVALID_ID_TOKEN:
    case ENTRA_ID_ERROR_CODES.AUTH_PROVIDER_ERROR:
    case ENTRA_ID_ERROR_CODES.MISSING_CLAIMS:
      return 401;
    case ENTRA_ID_ERROR_CODES.JWKS_UNAVAILABLE:
      return 503;
    case ENTRA_ID_ERROR_CODES.PROVISIONING_FAILED:
      return 500;
    default:
      return 500;
  }
}

/**
 * Derive the frontend base URL from the configured redirectUri.
 * The redirectUri is something like "https://app.example.com/api/auth/entra-id/callback".
 * We want the origin: "https://app.example.com".
 */
function deriveFrontendUrl(redirectUri: string): string {
  try {
    const parsed = new URL(redirectUri);
    return parsed.origin;
  } catch {
    return redirectUri;
  }
}

/**
 * Create Entra ID authentication router.
 *
 * Endpoints (mounted at /api/auth/entra-id):
 *   GET  /login    — 302 redirect to Entra ID authorization endpoint
 *   GET  /callback — handle OAuth callback, redirect to frontend with auth code
 *   POST /token    — exchange single-use auth code for Pabawi JWT pair
 *
 * Public OAuth endpoints return 404 when Entra ID is not enabled.
 * POST /enroll requires entitlement and account-recovery authority.
 */
export function createEntraIdAuthRouter(
  databaseService: DatabaseService,
  container: DIContainer,
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const db = databaseService.getAdapter();
  const secure = container.resolve("config").getEntraIdConfig()?.redirectUri.startsWith("https:") ?? false;
  const cookieName = secure ? "__Host-pabawi-sso" : "pabawi-sso";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  function browserBinding(req: Request): string {
    const values = (req.headers.cookie ?? "").split(";").map(value => value.trim())
      .filter(value => value.startsWith(`${cookieName}=`));
    return values.length === 1 ? values[0].slice(cookieName.length + 1) : "";
  }
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  /**
   * Resolve EntraIdService from the container's service map.
   * Returns null when Entra ID is not enabled.
   */
  function getEntraIdService(): EntraIdService | null {
    if (!container.has("entraId")) {
      return null;
    }
    return container.resolve("entraId") ?? null;
  }

  /**
   * Middleware that gates all endpoints behind Entra ID availability.
   */
  function requireEntraId(
    _req: Request,
    res: Response,
    entraIdService: EntraIdService | null,
  ): entraIdService is EntraIdService {
    if (!entraIdService) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Not found" },
      });
      return false;
    }
    return true;
  }

  // ─── GET /login ─────────────────────────────────────────────────────────────
  router.get(
    "/login",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const entraIdService = getEntraIdService();
      if (!requireEntraId(_req, res, entraIdService)) return;

      try {
        const binding = randomBytes(32).toString("hex");
        const { url } = await entraIdService.generateAuthorizationUrl(binding);
        res.cookie(cookieName, binding, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
        res.redirect(302, url);
      } catch (error) {
        if (error instanceof EntraIdError) {
          const status = httpStatusForEntraIdError(error.code);
          res.status(status).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }

        logger.error("Unexpected error during login redirect", {
          component: "EntraIdAuthRouter",
          operation: "login",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "SERVER_CONFIGURATION_ERROR",
            message: "Server configuration problem",
          },
        });
      }
    }),
  );

  // ─── GET /callback ──────────────────────────────────────────────────────────
  router.get(
    "/callback",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const entraIdService = getEntraIdService();
      if (!requireEntraId(req, res, entraIdService)) return;

      // Handle error parameter from Entra ID (Requirement 3.9)
      const errorParam = req.query.error as string | undefined;
      if (errorParam) {
        const errorDescription =
          (req.query.error_description as string | undefined) ?? "Authentication denied by provider";

        logger.warn("Entra ID returned error on callback", {
          component: "EntraIdAuthRouter",
          operation: "callback",
          metadata: { error: errorParam },
        });

        res.status(401).json({
          error: {
            code: ENTRA_ID_ERROR_CODES.AUTH_PROVIDER_ERROR,
            message: errorDescription,
            details: { error: errorParam, errorDescription },
          },
        });
        return;
      }

      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;

      if (typeof code !== "string" || typeof state !== "string" || !code || !state) {
        res.status(400).json({
          error: {
            code: ENTRA_ID_ERROR_CODES.INVALID_STATE,
            message: "Missing code or state parameter",
          },
        });
        return;
      }

      try {
        const authCodeEntry = await entraIdService.handleCallback(code, state, browserBinding(req));

        // Derive frontend URL and redirect with the single-use auth code
        const configService = container.resolve("config");
        const entraIdConfig = configService.getEntraIdConfig();
        if (!entraIdConfig) {
          res.status(500).json({
            error: {
              code: "SERVER_CONFIGURATION_ERROR",
              message: "Server configuration problem",
            },
          });
          return;
        }

        const frontendUrl = deriveFrontendUrl(entraIdConfig.redirectUri);
        res.redirect(302, `${frontendUrl}?code=${encodeURIComponent(authCodeEntry.code)}`);
      } catch (error) {
        if (error instanceof EntraIdError) {
          const status = httpStatusForEntraIdError(error.code);
          res.status(status).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }

        logger.error("Unexpected error during callback processing", {
          component: "EntraIdAuthRouter",
          operation: "callback",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "SERVER_CONFIGURATION_ERROR",
            message: "Server configuration problem",
          },
        });
      }
    }),
  );

  // ─── POST /token ────────────────────────────────────────────────────────────
  router.post(
    "/token",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const entraIdService = getEntraIdService();
      if (!requireEntraId(req, res, entraIdService)) return;

      const parseResult = TokenExchangeSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: {
            code: ENTRA_ID_ERROR_CODES.INVALID_AUTH_CODE,
            message: "Authorization code is required",
          },
        });
        return;
      }

      try {
        const { accessToken, refreshToken, user } =
          await entraIdService.exchangeAuthCode(parseResult.data.code, browserBinding(req));

        res.clearCookie(cookieName, cookieOptions);
        res.status(200).json({
          token: accessToken,
          refreshToken,
          user,
        });
      } catch (error) {
        if (error instanceof EntraIdError) {
          const status = httpStatusForEntraIdError(error.code);
          res.status(status).json({
            error: { code: error.code, message: error.message },
          });
          return;
        }

        logger.error("Unexpected error during token exchange", {
          component: "EntraIdAuthRouter",
          operation: "token",
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "SERVER_CONFIGURATION_ERROR",
            message: "Server configuration problem",
          },
        });
      }
    }),
  );

  router.post("/enroll",
    asyncHandler(createAuthMiddleware(db, container.resolve("config").getJwtSecret())),
    asyncHandler(createRbacMiddleware(db)("rbac", "admin")),
    asyncHandler(createRbacMiddleware(db)("users", "admin")),
    asyncHandler(async (req, res) => {
      const service = getEntraIdService();
      if (!requireEntraId(req, res, service)) return;
      const input = z.object({ userId: z.string().min(1), subject: z.string().min(1).max(255) }).strict().safeParse(req.body);
      if (!input.success) {
        res.status(400).json({ error: { code: "INVALID_ENROLLMENT", message: "User ID and subject are required" } });
        return;
      }
      const config = container.resolve("config").getEntraIdConfig();
      assert(config && req.user, "Missing authenticated enrollment context");
      const user = await service.userService.getUserById(input.data.userId);
      if (user?.isActive !== 1) {
        res.status(400).json({ error: { code: "INVALID_ENROLLMENT", message: "An active account is required" } });
        return;
      }
      const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
      try {
        await service.userService.linkFederatedIdentity(user.id, "entra-id", input.data.subject, issuer, null);
      } catch {
        res.status(409).json({ error: { code: "ENROLLMENT_FAILED", message: "Identity could not be enrolled" } });
        return;
      }
      await service.auditLogger.logAdminAction("enroll_federated_identity", req.user.userId,
        { userId: user.id, issuer, subject: input.data.subject }, req.ip, req.get("user-agent"));
      res.status(201).json({ userId: user.id });
    }),
  );

  return router;
}
