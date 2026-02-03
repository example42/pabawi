/**
 * Puppet Run History Routes
 *
 * API endpoints for retrieving puppet run history and statistics.
 * Provides both node-specific and aggregated history data.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import type { PuppetRunHistoryService } from "../services/PuppetRunHistoryService";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";

const DaysQuerySchema = z.object({
  days: z.string().optional().transform((val) => {
    if (!val) return 7; // default
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 365) {
      throw new Error("Days must be between 1 and 365");
    }
    return parsed;
  }),
});

/**
 * Create Puppet History router
 */
export function createPuppetHistoryRouter(
  puppetRunHistoryService: PuppetRunHistoryService,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/puppet/nodes/:id/history
   * Get run history for a specific node
   *
   * Query parameters:
   * - days: Number of days to look back (default: 7, max: 365)
   *
   * Returns:
   * - nodeId: Node identifier
   * - history: Array of run history data grouped by date
   * - summary: Summary statistics (total runs, success rate, avg duration, last run)
   */
  router.get(
    "/nodes/:id/history",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing node run history request", {
        component: "PuppetHistoryRouter",
        integration: "puppetdb",
        operation: "getNodeHistory",
        metadata: { nodeId: req.params.id, days: req.query.days },
      });

      const debugInfo = expertModeService.createDebugInfo(
        "GET /api/puppet/nodes/:id/history",
        requestId,
        0
      );

      if (req.expertMode) {
        expertModeService.setIntegration(debugInfo, "puppetdb");
        expertModeService.addInfo(debugInfo, {
          message: "Processing node run history request",
          context: JSON.stringify({ nodeId: req.params.id, days: req.query.days }),
          level: "info",
        });
      }

      try {
        // Validate request parameters
        logger.debug("Validating request parameters", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getNodeHistory",
          metadata: { params: req.params, query: req.query },
        });

        if (req.expertMode) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            context: JSON.stringify({ params: req.params, query: req.query }),
            level: "debug",
          });
        }

        const params = NodeIdParamSchema.parse(req.params);
        const query = DaysQuerySchema.parse(req.query);
        const nodeId = params.id;
        const days = query.days;

        logger.debug("Fetching node run history", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getNodeHistory",
          metadata: { nodeId, days },
        });

        if (req.expertMode) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching node run history",
            context: JSON.stringify({ nodeId, days }),
            level: "debug",
          });
        }

        // Get node history
        const history = await puppetRunHistoryService.getNodeHistory(nodeId, days);

        const duration = Date.now() - startTime;

        logger.info("Node run history retrieved successfully", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getNodeHistory",
          metadata: {
            nodeId,
            days,
            historyCount: history.history.length,
            totalRuns: history.summary.totalRuns,
            duration,
          },
        });

        if (req.expertMode) {
          debugInfo.duration = duration;
          expertModeService.addInfo(debugInfo, {
            message: "Node run history retrieved successfully",
            context: JSON.stringify({
              nodeId,
              days,
              historyCount: history.history.length,
              totalRuns: history.summary.totalRuns,
              duration,
            }),
            level: "info",
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(history, debugInfo));
        } else {
          res.json(history);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        debugInfo.duration = duration;

        if (error instanceof z.ZodError) {
          logger.warn("Request validation failed", {
            component: "PuppetHistoryRouter",
            integration: "puppetdb",
            operation: "getNodeHistory",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: "warn",
            });

            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(400).json(
              expertModeService.attachDebugInfo(
                {
                  error: {
                    code: "INVALID_REQUEST",
                    message: "Request validation failed",
                    details: error.errors,
                  },
                },
                debugInfo
              )
            );
          } else {
            res.status(400).json({
              error: {
                code: "INVALID_REQUEST",
                message: "Request validation failed",
                details: error.errors,
              },
            });
          }
          return;
        }

        // Unknown error
        logger.error(
          "Unexpected error processing node run history request",
          {
            component: "PuppetHistoryRouter",
            integration: "puppetdb",
            operation: "getNodeHistory",
            metadata: { duration },
          },
          error instanceof Error ? error : undefined
        );

        if (req.expertMode) {
          expertModeService.addError(debugInfo, {
            message: "Unexpected error processing node run history request",
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(
            expertModeService.attachDebugInfo(
              {
                error: {
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to retrieve node run history",
                },
              },
              debugInfo
            )
          );
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to retrieve node run history",
            },
          });
        }
      }
    })
  );

  /**
   * GET /api/puppet/history
   * Get aggregated run history for all nodes
   *
   * Query parameters:
   * - days: Number of days to look back (default: 7, max: 365)
   *
   * Returns:
   * - Array of run history data grouped by date with aggregated counts
   */
  router.get(
    "/history",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing aggregated run history request", {
        component: "PuppetHistoryRouter",
        integration: "puppetdb",
        operation: "getAggregatedHistory",
        metadata: { days: req.query.days },
      });

      const debugInfo = expertModeService.createDebugInfo(
        "GET /api/puppet/history",
        requestId,
        0
      );

      if (req.expertMode) {
        expertModeService.setIntegration(debugInfo, "puppetdb");
        expertModeService.addInfo(debugInfo, {
          message: "Processing aggregated run history request",
          context: JSON.stringify({ days: req.query.days }),
          level: "info",
        });
      }

      try {
        // Validate request parameters
        logger.debug("Validating request parameters", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getAggregatedHistory",
          metadata: { query: req.query },
        });

        if (req.expertMode) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            context: JSON.stringify({ query: req.query }),
            level: "debug",
          });
        }

        const query = DaysQuerySchema.parse(req.query);
        const days = query.days;

        logger.debug("Fetching aggregated run history", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getAggregatedHistory",
          metadata: { days },
        });

        if (req.expertMode) {
          expertModeService.addDebug(debugInfo, {
            message: "Fetching aggregated run history",
            context: JSON.stringify({ days }),
            level: "debug",
          });
        }

        // Get aggregated history
        const history = await puppetRunHistoryService.getAggregatedHistory(days);

        const duration = Date.now() - startTime;

        logger.info("Aggregated run history retrieved successfully", {
          component: "PuppetHistoryRouter",
          integration: "puppetdb",
          operation: "getAggregatedHistory",
          metadata: {
            days,
            historyCount: history.length,
            duration,
          },
        });

        if (req.expertMode) {
          debugInfo.duration = duration;
          expertModeService.addInfo(debugInfo, {
            message: "Aggregated run history retrieved successfully",
            context: JSON.stringify({
              days,
              historyCount: history.length,
              duration,
            }),
            level: "info",
          });

          // Add performance metrics
          debugInfo.performance = expertModeService.collectPerformanceMetrics();

          // Add request context
          debugInfo.context = expertModeService.collectRequestContext(req);

          // Wrap array in object for expert mode to preserve array structure
          res.json(expertModeService.attachDebugInfo({ history }, debugInfo));
        } else {
          res.json(history);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        debugInfo.duration = duration;

        if (error instanceof z.ZodError) {
          logger.warn("Request validation failed", {
            component: "PuppetHistoryRouter",
            integration: "puppetdb",
            operation: "getAggregatedHistory",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: "warn",
            });

            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(400).json(
              expertModeService.attachDebugInfo(
                {
                  error: {
                    code: "INVALID_REQUEST",
                    message: "Request validation failed",
                    details: error.errors,
                  },
                },
                debugInfo
              )
            );
          } else {
            res.status(400).json({
              error: {
                code: "INVALID_REQUEST",
                message: "Request validation failed",
                details: error.errors,
              },
            });
          }
          return;
        }

        // Unknown error
        logger.error(
          "Unexpected error processing aggregated run history request",
          {
            component: "PuppetHistoryRouter",
            integration: "puppetdb",
            operation: "getAggregatedHistory",
            metadata: { duration },
          },
          error instanceof Error ? error : undefined
        );

        if (req.expertMode) {
          expertModeService.addError(debugInfo, {
            message: "Unexpected error processing aggregated run history request",
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(
            expertModeService.attachDebugInfo(
              {
                error: {
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Failed to retrieve aggregated run history",
                },
              },
              debugInfo
            )
          );
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to retrieve aggregated run history",
            },
          });
        }
      }
    })
  );

  return router;
}
