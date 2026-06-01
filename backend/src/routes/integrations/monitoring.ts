import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { CheckmkPlugin } from "../../integrations/checkmk/CheckmkPlugin";
import { asyncHandler } from "../asyncHandler";
import {
  type DIContainer,
  createDefaultContainer,
} from "../../container/DIContainer";

/** 30-second timeout for upstream Checkmk API calls (Requirement 11.7) */
const UPSTREAM_TIMEOUT_MS = 30_000;

/** Validation schema for the limit query parameter on monitoring-events */
const MonitoringEventsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 200))
    .pipe(z.number().int().min(1).max(1000)),
});

/**
 * Create monitoring router for Checkmk service status and events.
 *
 * RBAC (`checkmk:read`) is applied at the mount level in server.ts,
 * not inside this router.
 *
 * Endpoints (relative — mounted under /api/nodes):
 *   GET /:nodeId/services          — live service status
 *   GET /:nodeId/monitoring-events — state-change events
 */
export function createMonitoringRouter(
  integrationManager: IntegrationManager,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  /**
   * Resolve the CheckmkPlugin from IntegrationManager.
   * Returns null if not registered/configured.
   */
  function getCheckmkPlugin(): CheckmkPlugin | null {
    return integrationManager.getInformationSource(
      "checkmk",
    ) as CheckmkPlugin | null;
  }

  /**
   * GET /:nodeId/services
   * Return live service monitoring data for a node.
   *
   * Responses:
   *   200 — service array (may be empty)
   *   503 — CHECKMK_NOT_CONFIGURED (plugin absent/not initialized)
   *   404 — NODE_NOT_FOUND (hostname unknown to Checkmk)
   *   502 — upstream Checkmk API failure or timeout
   */
  router.get(
    "/:nodeId/services",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();
      const nodeId = req.params.nodeId;

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "GET /api/nodes/:nodeId/services",
            requestId,
            0,
          )
        : null;

      logger.info("Fetching Checkmk services for node", {
        component: "MonitoringRouter",
        integration: "checkmk",
        operation: "getServices",
        metadata: { nodeId },
      });

      const plugin = getCheckmkPlugin();

      if (!plugin?.isInitialized()) {
        logger.warn("Checkmk plugin not configured or not initialized", {
          component: "MonitoringRouter",
          integration: "checkmk",
          operation: "getServices",
          metadata: { nodeId },
        });

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Checkmk plugin not configured or not initialized",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "CHECKMK_NOT_CONFIGURED",
            message: "Checkmk monitoring integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse,
          );
        return;
      }

      try {
        const services = await Promise.race([
          plugin.getNodeData(nodeId, "services") as Promise<unknown[]>,
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Upstream timeout"));
            }, UPSTREAM_TIMEOUT_MS);
          }),
        ]);

        // If the plugin returns an empty array AND the node doesn't exist
        // in Checkmk inventory, return 404. If it returns an empty array
        // but the node IS known, return 200 with [].
        if (Array.isArray(services) && services.length === 0) {
          const inventory = await plugin.getInventory();
          const nodeExists = inventory.some(
            (n) =>
              n.id.toLowerCase() === nodeId.toLowerCase() ||
              n.name.toLowerCase() === nodeId.toLowerCase(),
          );

          if (!nodeExists) {
            logger.warn("Node not found in Checkmk inventory", {
              component: "MonitoringRouter",
              integration: "checkmk",
              operation: "getServices",
              metadata: { nodeId },
            });

            if (debugInfo) {
              debugInfo.duration = Date.now() - startTime;
              expertModeService.addWarning(debugInfo, {
                message: `Node '${nodeId}' not found in Checkmk`,
                level: "warn",
              });
              debugInfo.performance =
                expertModeService.collectPerformanceMetrics();
              debugInfo.context =
                expertModeService.collectRequestContext(req);
            }

            const errorResponse = {
              error: {
                code: "NODE_NOT_FOUND",
                message: `Node '${nodeId}' is not known to Checkmk`,
              },
            };

            res
              .status(404)
              .json(
                debugInfo
                  ? expertModeService.attachDebugInfo(
                      errorResponse,
                      debugInfo,
                    )
                  : errorResponse,
              );
            return;
          }
        }

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched Checkmk services", {
          component: "MonitoringRouter",
          integration: "checkmk",
          operation: "getServices",
          metadata: {
            nodeId,
            serviceCount: Array.isArray(services) ? services.length : 0,
            duration,
          },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "checkmk");
          expertModeService.addMetadata(
            debugInfo,
            "serviceCount",
            Array.isArray(services) ? services.length : 0,
          );
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched Checkmk services",
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(services, debugInfo));
        } else {
          res.json(services);
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown upstream error";

        logger.error("Upstream Checkmk API failure", {
          component: "MonitoringRouter",
          integration: "checkmk",
          operation: "getServices",
          metadata: { nodeId, duration, error: errorMessage },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "checkmk");
          expertModeService.addError(debugInfo, {
            message: `Upstream Checkmk failure: ${errorMessage}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "UPSTREAM_ERROR",
            message: `Checkmk API failure: ${errorMessage}`,
          },
        };

        res
          .status(502)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse,
          );
      }
    }),
  );

  /**
   * GET /:nodeId/monitoring-events
   * Return state-change events for a node.
   *
   * Query params:
   *   limit — 1..1000, default 200
   *
   * Responses:
   *   200 — events array (may be empty)
   *   503 — CHECKMK_NOT_CONFIGURED
   *   404 — NODE_NOT_FOUND
   *   502 — upstream failure/timeout
   */
  router.get(
    "/:nodeId/monitoring-events",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();
      const nodeId = req.params.nodeId;

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo(
            "GET /api/nodes/:nodeId/monitoring-events",
            requestId,
            0,
          )
        : null;

      // Validate limit query param
      const queryResult = MonitoringEventsQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message: "Invalid limit query parameter",
            context: JSON.stringify(queryResult.error.errors),
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INVALID_REQUEST",
            message:
              "Invalid limit parameter: must be an integer between 1 and 1000",
            details: queryResult.error.errors,
          },
        };

        res
          .status(400)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(errorResponse, debugInfo)
              : errorResponse,
          );
        return;
      }

      const limit = queryResult.data.limit;

      logger.info("Fetching Checkmk monitoring events for node", {
        component: "MonitoringRouter",
        integration: "checkmk",
        operation: "getMonitoringEvents",
        metadata: { nodeId, limit },
      });

      const plugin = getCheckmkPlugin();

      if (!plugin?.isInitialized()) {
        logger.warn(
          "Checkmk plugin not configured or not initialized",
          {
            component: "MonitoringRouter",
            integration: "checkmk",
            operation: "getMonitoringEvents",
            metadata: { nodeId },
          },
        );

        if (debugInfo) {
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {
            message:
              "Checkmk plugin not configured or not initialized",
            level: "warn",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "CHECKMK_NOT_CONFIGURED",
            message:
              "Checkmk monitoring integration is not configured",
          },
        };

        res
          .status(503)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(
                  errorResponse,
                  debugInfo,
                )
              : errorResponse,
          );
        return;
      }

      try {
        const events = await Promise.race([
          plugin.getNodeData(nodeId, "events") as Promise<unknown[]>,
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Upstream timeout"));
            }, UPSTREAM_TIMEOUT_MS);
          }),
        ]);

        // Check if node exists when events are empty
        if (Array.isArray(events) && events.length === 0) {
          const inventory = await plugin.getInventory();
          const nodeExists = inventory.some(
            (n) =>
              n.id.toLowerCase() === nodeId.toLowerCase() ||
              n.name.toLowerCase() === nodeId.toLowerCase(),
          );

          if (!nodeExists) {
            logger.warn("Node not found in Checkmk inventory", {
              component: "MonitoringRouter",
              integration: "checkmk",
              operation: "getMonitoringEvents",
              metadata: { nodeId },
            });

            if (debugInfo) {
              debugInfo.duration = Date.now() - startTime;
              expertModeService.addWarning(debugInfo, {
                message: `Node '${nodeId}' not found in Checkmk`,
                level: "warn",
              });
              debugInfo.performance =
                expertModeService.collectPerformanceMetrics();
              debugInfo.context =
                expertModeService.collectRequestContext(req);
            }

            const errorResponse = {
              error: {
                code: "NODE_NOT_FOUND",
                message: `Node '${nodeId}' is not known to Checkmk`,
              },
            };

            res
              .status(404)
              .json(
                debugInfo
                  ? expertModeService.attachDebugInfo(
                      errorResponse,
                      debugInfo,
                    )
                  : errorResponse,
              );
            return;
          }
        }

        // Apply limit
        const limitedEvents = Array.isArray(events)
          ? events.slice(0, limit)
          : [];

        const duration = Date.now() - startTime;

        logger.info("Successfully fetched Checkmk monitoring events", {
          component: "MonitoringRouter",
          integration: "checkmk",
          operation: "getMonitoringEvents",
          metadata: {
            nodeId,
            eventCount: limitedEvents.length,
            limit,
            duration,
          },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "checkmk");
          expertModeService.addMetadata(
            debugInfo,
            "eventCount",
            limitedEvents.length,
          );
          expertModeService.addMetadata(debugInfo, "limit", limit);
          expertModeService.addInfo(debugInfo, {
            message: "Successfully fetched Checkmk monitoring events",
            level: "info",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
          res.json(
            expertModeService.attachDebugInfo(limitedEvents, debugInfo),
          );
        } else {
          res.json(limitedEvents);
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime;
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unknown upstream error";

        logger.error("Upstream Checkmk API failure for events", {
          component: "MonitoringRouter",
          integration: "checkmk",
          operation: "getMonitoringEvents",
          metadata: { nodeId, duration, error: errorMessage },
        });

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "checkmk");
          expertModeService.addError(debugInfo, {
            message: `Upstream Checkmk failure: ${errorMessage}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });
          debugInfo.performance =
            expertModeService.collectPerformanceMetrics();
          debugInfo.context =
            expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "UPSTREAM_ERROR",
            message: `Checkmk API failure: ${errorMessage}`,
          },
        };

        res
          .status(502)
          .json(
            debugInfo
              ? expertModeService.attachDebugInfo(
                  errorResponse,
                  debugInfo,
                )
              : errorResponse,
          );
      }
    }),
  );

  return router;
}
