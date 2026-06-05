/**
 * Global Monitoring Overview Route
 *
 * Provides a single endpoint for the home page dashboard to fetch:
 * - Unhandled service problems (state != 0, not acknowledged)
 * - Recent monitoring events (state changes within a time window)
 *
 * Uses the Checkmk REST API for service problems and Livestatus
 * (with REST fallback) for events — both in a single request cycle.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { IntegrationManager } from "../../integrations/IntegrationManager";
import type { CheckmkPlugin } from "../../integrations/checkmk/CheckmkPlugin";
import { asyncHandler } from "../asyncHandler";
import {
  type DIContainer,
  createDefaultContainer,
} from "../../container/DIContainer";

const UPSTREAM_TIMEOUT_MS = 30_000;

const OverviewQuerySchema = z.object({
  hours: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 4))
    .pipe(z.number().int().min(1).max(168)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(500)),
});

/**
 * Create the global monitoring overview router.
 *
 * Endpoint:
 *   GET /api/monitoring/overview?hours=4&limit=100
 *
 * Returns:
 *   {
 *     serviceProblems: CheckmkFailingService[],
 *     events: CheckmkHostEvent[],
 *     hostSummary: CheckmkHostSummary[],
 *   }
 */
export function createMonitoringOverviewRouter(
  integrationManager: IntegrationManager,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");

  function getCheckmkPlugin(): CheckmkPlugin | null {
    return integrationManager.getInformationSource(
      "checkmk",
    ) as CheckmkPlugin | null;
  }

  router.get(
    "/overview",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const plugin = getCheckmkPlugin();

      if (!plugin?.isInitialized()) {
        res.status(503).json({
          error: {
            code: "CHECKMK_NOT_CONFIGURED",
            message: "Checkmk monitoring integration is not configured",
          },
        });
        return;
      }

      const queryResult = OverviewQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid query parameters",
            details: queryResult.error.errors,
          },
        });
        return;
      }

      const { hours, limit } = queryResult.data;

      logger.info("Fetching monitoring overview", {
        component: "MonitoringOverviewRouter",
        integration: "checkmk",
        operation: "getOverview",
        metadata: { hours, limit },
      });

      try {
        const [serviceProblems, events, hostSummary, hostStateSummary] = await Promise.race([
          Promise.all([
            plugin.getUnhandledServiceProblems(limit),
            plugin.getRecentEvents(hours, limit),
            plugin.getHostServiceSummary(),
            plugin.getHostStateSummary(),
          ]),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Upstream timeout"));
            }, UPSTREAM_TIMEOUT_MS);
          }),
        ]);

        res.json({ serviceProblems, events, hostSummary, hostStateSummary });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown upstream error";

        logger.error("Monitoring overview upstream failure", {
          component: "MonitoringOverviewRouter",
          integration: "checkmk",
          operation: "getOverview",
          metadata: { hours, limit, error: errorMessage },
        });

        res.status(502).json({
          error: {
            code: "UPSTREAM_ERROR",
            message: `Checkmk API failure: ${errorMessage}`,
          },
        });
      }
    }),
  );

  return router;
}
