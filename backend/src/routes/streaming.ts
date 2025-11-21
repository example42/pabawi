import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";

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

  /**
   * GET /api/executions/:id/stream
   * Subscribe to streaming events for an execution
   */
  router.get(
    "/:id/stream",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Verify execution exists
        const execution = await executionRepository.findById(executionId);
        if (!execution) {
          res.status(404).json({
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          });
          return;
        }

        // Subscribe to streaming events
        streamingManager.subscribe(executionId, res);

        // If execution is already completed, send completion event immediately
        if (execution.status === "success" || execution.status === "failed") {
          streamingManager.emitComplete(executionId, {
            status: execution.status,
            results: execution.results,
            error: execution.error,
            command: execution.command,
          });
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Request validation failed",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error setting up execution stream:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to set up execution stream",
          },
        });
      }
    }),
  );

  /**
   * GET /api/streaming/stats
   * Get streaming statistics
   */
  router.get(
    "/stats",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      res.json({
        activeExecutions: streamingManager.getActiveExecutionCount(),
      });
    }),
  );

  return router;
}
