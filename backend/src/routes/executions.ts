import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type {
  ExecutionRepository,
  ExecutionType,
} from "../database/ExecutionRepository";
import { type ExecutionFilters } from "../database/ExecutionRepository";
import type { ExecutionQueue } from "../services/ExecutionQueue";
import { asyncHandler } from "./asyncHandler";

/**
 * Request validation schemas
 */
const ExecutionIdParamSchema = z.object({
  id: z.string().min(1, "Execution ID is required"),
});

const ExecutionFiltersQuerySchema = z.object({
  type: z.enum(["command", "task", "facts", "puppet", "package"]).optional(),
  status: z.enum(["running", "success", "failed", "partial"]).optional(),
  targetNode: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * Interface for re-execution parameter modifications
 */
interface ReExecutionModifications {
  type?: string;
  targetNodes?: string[];
  action?: string;
  parameters?: Record<string, unknown>;
  command?: string;
  expertMode?: boolean;
}

/**
 * Create executions router
 */
export function createExecutionsRouter(
  executionRepository: ExecutionRepository,
  executionQueue?: ExecutionQueue,
): Router {
  const router = Router();

  /**
   * GET /api/executions
   * Return paginated execution list with filters
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate and parse query parameters
        const query = ExecutionFiltersQuerySchema.parse(req.query);

        // Build filters
        const filters: ExecutionFilters = {
          type: query.type,
          status: query.status,
          targetNode: query.targetNode,
          startDate: query.startDate,
          endDate: query.endDate,
        };

        // Get executions with pagination
        const executions = await executionRepository.findAll(filters, {
          page: query.page,
          pageSize: query.pageSize,
        });

        // Get status counts for summary
        const statusCounts = await executionRepository.countByStatus();

        res.json({
          executions,
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            hasMore: executions.length === query.pageSize,
          },
          summary: statusCounts,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid query parameters",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching executions:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch executions",
          },
        });
      }
    }),
  );

  /**
   * GET /api/executions/:id
   * Return detailed execution results
   */
  router.get(
    "/:id",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Get execution by ID
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

        res.json({ execution });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid execution ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching execution details:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch execution details",
          },
        });
      }
    }),
  );

  /**
   * GET /api/executions/:id/original
   * Return original execution for a re-execution
   */
  router.get(
    "/:id/original",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Get the original execution
        const originalExecution =
          await executionRepository.findOriginalExecution(executionId);

        if (!originalExecution) {
          // Check if the execution exists at all
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

          // Execution exists but is not a re-execution
          res.status(404).json({
            error: {
              code: "NOT_A_RE_EXECUTION",
              message: `Execution '${executionId}' is not a re-execution`,
            },
          });
          return;
        }

        res.json({ execution: originalExecution });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid execution ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching original execution:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch original execution",
          },
        });
      }
    }),
  );

  /**
   * GET /api/executions/:id/re-executions
   * Return all re-executions of an execution
   */
  router.get(
    "/:id/re-executions",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Check if the execution exists
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

        // Get all re-executions
        const reExecutions =
          await executionRepository.findReExecutions(executionId);

        res.json({
          executions: reExecutions,
          count: reExecutions.length,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid execution ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching re-executions:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch re-executions",
          },
        });
      }
    }),
  );

  /**
   * POST /api/executions/:id/re-execute
   * Trigger re-execution with preserved parameters
   */
  router.post(
    "/:id/re-execute",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Get the original execution
        const originalExecution =
          await executionRepository.findById(executionId);
        if (!originalExecution) {
          res.status(404).json({
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          });
          return;
        }

        // Parse request body for parameter modifications
        const modifications = req.body as ReExecutionModifications;

        // Create new execution with preserved parameters
        // Allow modifications from request body
        const newExecution = {
          type: (modifications.type ?? originalExecution.type) as ExecutionType,
          targetNodes:
            modifications.targetNodes ?? originalExecution.targetNodes,
          action: modifications.action ?? originalExecution.action,
          parameters: modifications.parameters ?? originalExecution.parameters,
          status: "running" as const,
          startedAt: new Date().toISOString(),
          results: [],
          command: modifications.command ?? originalExecution.command,
          expertMode: modifications.expertMode ?? originalExecution.expertMode,
        };

        // Create the re-execution with reference to original
        const newExecutionId = await executionRepository.createReExecution(
          executionId,
          newExecution,
        );

        // Return the new execution ID and details
        const createdExecution =
          await executionRepository.findById(newExecutionId);

        res.status(201).json({
          execution: createdExecution,
          message: "Re-execution created successfully",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid request parameters",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error creating re-execution:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create re-execution",
            details: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }),
  );

  /**
   * GET /api/executions/queue/status
   * Return current execution queue status
   */
  router.get(
    "/queue/status",
    asyncHandler((_req: Request, res: Response): Promise<void> => {
      if (!executionQueue) {
        res.status(503).json({
          error: {
            code: "QUEUE_NOT_AVAILABLE",
            message: "Execution queue is not configured",
          },
        });
        return Promise.resolve();
      }

      try {
        const status = executionQueue.getStatus();
        res.json({
          queue: {
            running: status.running,
            queued: status.queued,
            limit: status.limit,
            available: status.limit - status.running,
            queuedExecutions: status.queue.map((exec) => ({
              id: exec.id,
              type: exec.type,
              nodeId: exec.nodeId,
              action: exec.action,
              enqueuedAt: exec.enqueuedAt.toISOString(),
              waitTime: Date.now() - exec.enqueuedAt.getTime(),
            })),
          },
        });
        return Promise.resolve();
      } catch (error) {
        console.error("Error fetching queue status:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch queue status",
          },
        });
        return Promise.resolve();
      }
    }),
  );

  /**
   * GET /api/executions/:id/output
   * Return complete stdout/stderr for an execution
   * This endpoint is specifically for expert mode to retrieve full output
   */
  router.get(
    "/:id/output",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        // Get execution by ID
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

        // Return output data
        res.json({
          executionId: execution.id,
          command: execution.command,
          stdout: execution.stdout ?? "",
          stderr: execution.stderr ?? "",
          expertMode: execution.expertMode ?? false,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Invalid execution ID parameter",
              details: error.errors,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error fetching execution output:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch execution output",
          },
        });
      }
    }),
  );

  return router;
}
