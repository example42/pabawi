import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";

/**
 * Request validation schemas
 */
const ExecutionIdParamSchema = z.object({
  id: z.string().min(1, "Execution ID is required"),
});

/**
 * Create streaming router for Server-Sent Events (SSE)
 */
export function createStreamingRouter(
  streamingManager: StreamingExecutionManager,
  executionRepository: ExecutionRepository,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/executions/:id/stream
   * Subscribe to streaming events for an execution
   */
  router.get(
    "/:id/stream",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/executions/:id/stream', requestId, 0)
        : null;

      logger.info("Setting up execution stream", {
        component: "StreamingRouter",
        operation: "streamExecution",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            level: 'debug',
          });
        }

        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Verifying execution exists",
            context: JSON.stringify({ executionId }),
            level: 'debug',
          });
        }

        // Verify execution exists
        const execution = await executionRepository.findById(executionId);
        if (!execution) {
          logger.warn("Execution not found for streaming", {
            component: "StreamingRouter",
            operation: "streamExecution",
            metadata: { executionId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Subscribing to streaming events",
            context: JSON.stringify({ executionId, status: execution.status }),
            level: 'debug',
          });
        }

        logger.info("Subscribing to execution stream", {
          component: "StreamingRouter",
          operation: "streamExecution",
          metadata: { executionId, status: execution.status },
        });

        // Subscribe to streaming events
        streamingManager.subscribe(executionId, res);

        // If execution is already completed, send completion event immediately
        if (execution.status === "success" || execution.status === "failed") {
          if (debugInfo) {
            expertModeService.addInfo(debugInfo, {
              message: "Execution already completed, sending completion event",
              context: JSON.stringify({ executionId, status: execution.status }),
              level: 'info',
            });
          }

          streamingManager.emitComplete(executionId, {
            status: execution.status,
            results: execution.results,
            error: execution.error,
            command: execution.command,
          });
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter", {
            component: "StreamingRouter",
            operation: "streamExecution",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_REQUEST",
              message: "Request validation failed",
              details: error.errors,
            },
          };

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error setting up execution stream", {
          component: "StreamingRouter",
          operation: "streamExecution",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error setting up execution stream: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to set up execution stream",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * GET /api/streaming/stats
   * Get streaming statistics
   */
  router.get(
    "/stats",
    asyncHandler((req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/streaming/stats', requestId, 0)
        : null;

      logger.info("Fetching streaming statistics", {
        component: "StreamingRouter",
        operation: "getStreamingStats",
      });

      if (debugInfo) {
        expertModeService.addDebug(debugInfo, {
          message: "Retrieving active execution count",
          level: 'debug',
        });
      }

      const activeExecutions = streamingManager.getActiveExecutionCount();
      const duration = Date.now() - startTime;

      logger.info("Streaming statistics fetched successfully", {
        component: "StreamingRouter",
        operation: "getStreamingStats",
        metadata: { activeExecutions, duration },
      });

      const responseData = {
        activeExecutions,
      };

      // Attach debug info if expert mode is enabled
      if (debugInfo) {
        debugInfo.duration = duration;
        expertModeService.addMetadata(debugInfo, 'activeExecutions', activeExecutions);
        expertModeService.addInfo(debugInfo, {
          message: `Retrieved streaming statistics: ${activeExecutions} active executions`,
          level: 'info',
        });

        debugInfo.performance = expertModeService.collectPerformanceMetrics();
        debugInfo.context = expertModeService.collectRequestContext(req);

        res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
      } else {
        res.json(responseData);
      }

      return Promise.resolve();
    }),
  );

  return router;
}
