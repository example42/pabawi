import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";
import { PermissionService } from "../services/PermissionService";
import type { ConsoleSessionManager } from "../services/ConsoleSessionManager";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";

import { asyncHandler } from "./asyncHandler";

const COMPONENT = "ConsoleRoutes";

/**
 * Request validation schemas
 */
const CreateSessionSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  provider: z.string().min(1, "provider is required"),
});

/**
 * Create console router with session management endpoints.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 8.3, 8.6, 10.4
 */
export function createConsoleRouter(
  container: DIContainer = createDefaultContainer(),
  integrationManager: IntegrationManager,
  sessionManager: ConsoleSessionManager,
  db: DatabaseAdapter,
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const config = container.resolve("config");
  const consoleConfig = config.getConsoleConfig();

  const jwtSecret = config.getJwtSecret();
  const authMiddleware = createAuthMiddleware(db, jwtSecret);
  const rbacMiddleware = createRbacMiddleware(db);
  const permissionService = new PermissionService(db);

  // All console routes require authentication
  router.use(asyncHandler(authMiddleware));

  /**
   * GET /availability/:nodeId
   * Get available console options for a node.
   * Requirement 6.2
   */
  router.get(
    "/availability/:nodeId",
    asyncHandler(rbacMiddleware("console", "access")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { nodeId } = req.params;

      logger.info("Fetching console availability", {
        component: COMPONENT,
        operation: "getAvailability",
        metadata: { nodeId },
      });

      const availability =
        await integrationManager.getConsoleAvailability(nodeId);

      res.json({ availability });
    }),
  );

  /**
   * POST /sessions
   * Create a new console session.
   * Requirements: 6.2, 8.6
   */
  router.post(
    "/sessions",
    asyncHandler(rbacMiddleware("console", "access")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        });
        return;
      }

      const parsed = CreateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parsed.error.errors,
          },
        });
        return;
      }

      const { nodeId, provider: providerName } = parsed.data;

      logger.info("Creating console session", {
        component: COMPONENT,
        operation: "createSession",
        metadata: { nodeId, provider: providerName, userId },
      });

      // Check concurrent session limit (Requirement 8.6)
      const activeCount =
        await sessionManager.getActiveSessionCount(userId);
      if (activeCount >= consoleConfig.maxConcurrentSessions) {
        res.status(429).json({
          error: {
            code: "TOO_MANY_SESSIONS",
            message: `Concurrent session limit (${String(consoleConfig.maxConcurrentSessions)}) reached. Terminate an existing session first.`,
          },
        });
        return;
      }

      // Get the console provider
      const provider =
        integrationManager.getConsoleProvider(providerName);
      if (!provider) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Console provider '${providerName}' not found`,
          },
        });
        return;
      }

      // Create session via provider
      let session;
      try {
        session = await provider.createSession(nodeId, userId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.error("Provider failed to create console session", {
          component: COMPONENT,
          operation: "createSession",
          metadata: { nodeId, provider: providerName, userId },
        }, error instanceof Error ? error : undefined);

        res.status(502).json({
          error: {
            code: "PROVIDER_ERROR",
            message,
          },
        });
        return;
      }

      // Persist session
      await sessionManager.createSession(session);

      res.status(201).json({ session });
    }),
  );

  /**
   * DELETE /sessions/:sessionId
   * Terminate a console session.
   * Requirements: 6.4, 6.5, 6.6
   */
  router.delete(
    "/sessions/:sessionId",
    asyncHandler(rbacMiddleware("console", "access")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { sessionId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        });
        return;
      }

      logger.info("Terminating console session", {
        component: COMPONENT,
        operation: "terminateSession",
        metadata: { sessionId, userId },
      });

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Session '${sessionId}' not found`,
          },
        });
        return;
      }

      // If not own session, require console:admin (Requirements 6.4, 6.5)
      if (session.userId !== userId) {
        const hasAdmin = await permissionService.hasPermission(
          userId,
          "console",
          "admin",
        );
        if (!hasAdmin) {
          res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message:
                "The console:admin permission is required to terminate another user's session",
            },
          });
          return;
        }
      }

      await sessionManager.terminateSession(sessionId, "user_terminated");

      res.status(204).send();
    }),
  );

  /**
   * GET /sessions/:sessionId
   * Get session status.
   * Requirement 6.3
   */
  router.get(
    "/sessions/:sessionId",
    asyncHandler(rbacMiddleware("console", "access")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { sessionId } = req.params;

      logger.info("Fetching console session status", {
        component: COMPONENT,
        operation: "getSessionStatus",
        metadata: { sessionId },
      });

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Session '${sessionId}' not found`,
          },
        });
        return;
      }

      res.json({
        session: {
          sessionId: session.sessionId,
          state: session.state,
          transport: session.transport,
          nodeId: session.nodeId,
          provider: session.provider,
          startedAt: session.startedAt,
        },
      });
    }),
  );

  /**
   * POST /sessions/:sessionId/heartbeat
   * Record heartbeat for an active session.
   * Requirement 6.3
   */
  router.post(
    "/sessions/:sessionId/heartbeat",
    asyncHandler(rbacMiddleware("console", "access")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { sessionId } = req.params;

      logger.info("Recording console session heartbeat", {
        component: COMPONENT,
        operation: "heartbeat",
        metadata: { sessionId },
      });

      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Session '${sessionId}' not found`,
          },
        });
        return;
      }

      await sessionManager.heartbeat(sessionId);

      res.status(204).send();
    }),
  );

  return router;
}
