import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import { type EntraIdService, EntraIdError, ENTRA_ID_ERROR_CODES } from "../services/EntraIdService";
import type { DatabaseService } from "../database/DatabaseService";
import type { DIContainer } from "../container/DIContainer";

const TokenExchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

/**
 * Map EntraIdError codes to HTTP status codes.
 */
function httpStatusForEntraIdError(code: string): number {
  switch (code) {
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
 * All endpoints return 404 when Entra ID is not enabled (service absent from container).
 */
export function createEntraIdAuthRouter(
  _databaseService: DatabaseService,
  container: DIContainer,
): Router {
  const router = Router();
  const logger = container.resolve("logger");

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
        const { url } = await entraIdService.generateAuthorizationUrl();
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

      if (!code || !state) {
        res.status(400).json({
          error: {
            code: ENTRA_ID_ERROR_CODES.INVALID_STATE,
            message: "Missing code or state parameter",
          },
        });
        return;
      }

      try {
        const authCodeEntry = await entraIdService.handleCallback(code, state);

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
          await entraIdService.exchangeAuthCode(parseResult.data.code);

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

  return router;
}
