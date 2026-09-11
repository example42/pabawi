import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { DatabaseAdapter } from "../database/DatabaseAdapter";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";
import { PermissionService } from "../services/PermissionService";
import type { ConsoleSessionManager } from "../services/ConsoleSessionManager";
import { ConsoleAccountError, ConsoleCapacityError } from "../services/ConsoleSessionManager";
import type { ConsoleConnectionBroker } from "../services/ConsoleConnectionBroker";
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
  broker?: ConsoleConnectionBroker,
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const config = container.resolve("config");

  const jwtSecret = config.getJwtSecret();
  const authMiddleware = createAuthMiddleware(db, jwtSecret);
  const rbacMiddleware = createRbacMiddleware(db);
  const permissionService = new PermissionService(db);

  // All console routes require authentication
  router.use(asyncHandler(authMiddleware));

  /**
   * Resolve a session the caller is entitled to act on.
   *
   * `console:access` says a user may use the console, not that they may touch
   * someone else's session. Every per-session route goes through this, so
   * reading metadata and extending a heartbeat are gated the same way as
   * terminating: own session, or `console:admin`.
   *
   * Responds and returns null when the caller must be refused.
   */
  async function resolveOwnedSession(
    req: Request,
    res: Response,
    operation: string,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const { sessionId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return null;
    }

    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: `Session '${sessionId}' not found` },
      });
      return null;
    }

    if (session.userId !== userId) {
      const hasAdmin = await permissionService.hasPermission(userId, "console", "admin");
      if (!hasAdmin) {
        logger.warn("Denied console session access across users", {
          component: COMPONENT,
          operation,
          metadata: { sessionId, userId },
        });
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "The console:admin permission is required to act on another user's session",
          },
        });
        return null;
      }
    }

    return { sessionId, userId };
  }

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

      // The contract promises at least one transport, but a provider that
      // breaks it must not produce a reservation with an empty transport.
      const transports = provider.getSupportedTransports();
      if (transports.length === 0) {
        res.status(502).json({
          error: {
            code: "PROVIDER_ERROR",
            message: `Console provider '${providerName}' advertises no transport`,
          },
        });
        return;
      }
      const transport = transports[0];

      // Resolve nodeId to provider-specific ID (e.g. FQDN → proxmox:node:vmid).
      // The frontend passes the merged inventory name; providers expect their own format.
      let resolvedNodeId = nodeId;
      try {
        const aggregated = await integrationManager.getAggregatedInventory(true);
        const linkedNode = aggregated.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );
        const providerSpecificId = linkedNode?.sourceData[providerName]?.id;
        if (providerSpecificId) {
          resolvedNodeId = providerSpecificId;
        }
      } catch {
        // Proceed with raw nodeId if inventory lookup fails
      }

      // Reserve capacity before the provider is asked for anything. A provider
      // resource created ahead of the reservation is one the cap never counted
      // and nothing is obliged to clean up (Requirement 8.6).
      let reservation;
      try {
        reservation = await sessionManager.reserveSession({
          userId, nodeId: resolvedNodeId, provider: providerName, transport,
        });
      } catch (error) {
        if (error instanceof ConsoleCapacityError) {
          res.status(429).json({
            error: {
              code: "TOO_MANY_SESSIONS",
              message: `${error.message}. Terminate an existing session first.`,
            },
          });
          return;
        }
        if (error instanceof ConsoleAccountError) {
          res.status(403).json({
            error: { code: "FORBIDDEN", message: error.message },
          });
          return;
        }
        throw error;
      }

      // From here the reservation exists, so every failure path must release it
      // rather than leave a slot held by a session that will never connect.
      let admission;
      try {
        admission = await provider.createSession({
          nodeId: resolvedNodeId, userId, sessionId: reservation.sessionId, transport,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.error("Provider failed to create console session", {
          component: COMPONENT,
          operation: "createSession",
          metadata: { nodeId, provider: providerName, userId, sessionId: reservation.sessionId },
        }, error instanceof Error ? error : undefined);

        await sessionManager.failReservation(reservation.sessionId, "provider_error");
        res.status(502).json({
          error: {
            code: "PROVIDER_ERROR",
            message,
          },
        });
        return;
      }

      // Connection material goes to the broker, never to the database: it
      // embeds a provider credential.
      broker?.offer(reservation.sessionId, admission.upstream.url);

      const session = await sessionManager.activateSession(reservation.sessionId);
      if (!session) {
        // The reservation was terminated or expired while the provider worked.
        broker?.discard(reservation.sessionId);
        await provider.terminateSession(reservation.sessionId).catch(() => {
          // Best effort: the reservation is already gone either way.
        });
        res.status(409).json({
          error: {
            code: "SESSION_UNAVAILABLE",
            message: "Session was terminated before it became active",
          },
        });
        return;
      }

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
      const owned = await resolveOwnedSession(req, res, "terminateSession");
      if (!owned) return;

      logger.info("Terminating console session", {
        component: COMPONENT,
        operation: "terminateSession",
        metadata: { sessionId: owned.sessionId, userId: owned.userId },
      });

      // Closes the live relay as well as recording the state (Requirements 6.4, 6.5)
      await sessionManager.terminateSession(owned.sessionId, "user_terminated");

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
      const owned = await resolveOwnedSession(req, res, "getSessionStatus");
      if (!owned) return;

      logger.info("Fetching console session status", {
        component: COMPONENT,
        operation: "getSessionStatus",
        metadata: { sessionId: owned.sessionId },
      });

      const session = await sessionManager.getSession(owned.sessionId);
      if (!session) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Session '${owned.sessionId}' not found`,
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
      const owned = await resolveOwnedSession(req, res, "heartbeat");
      if (!owned) return;

      logger.info("Recording console session heartbeat", {
        component: COMPONENT,
        operation: "heartbeat",
        metadata: { sessionId: owned.sessionId },
      });

      const extended = await sessionManager.heartbeat(owned.sessionId);
      if (!extended) {
        res.status(409).json({
          error: {
            code: "SESSION_NOT_LIVE",
            message: "Session is no longer live",
          },
        });
        return;
      }

      res.status(204).send();
    }),
  );

  return router;
}
