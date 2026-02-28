import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type {
  ExecutionRepository,
  ExecutionType,
  ExecutionStatus,
  NodeResult,
  ExecutionRecord,
} from "../database/ExecutionRepository";
import { type ExecutionFilters } from "../database/ExecutionRepository";
import type { ExecutionQueue } from "../services/ExecutionQueue";
import { asyncHandler } from "./asyncHandler";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import type { BatchExecutionService } from "../services/BatchExecutionService";

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

const ReExecutionModificationsSchema = z.object({
  type: z.string().optional(),
  targetNodes: z.array(z.string()).optional(),
  action: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  command: z.string().optional(),
  expertMode: z.boolean().optional(),
});

const BatchExecutionRequestSchema = z.object({
  targetNodeIds: z.array(z.string()).optional(),
  targetGroupIds: z.array(z.string()).optional(),
  type: z.enum(["command", "task", "plan"]),
  action: z.string().min(1, "Action is required"),
  parameters: z.record(z.unknown()).optional(),
}).refine(
  (data) => (data.targetNodeIds && data.targetNodeIds.length > 0) || (data.targetGroupIds && data.targetGroupIds.length > 0),
  { message: "At least one target node or group must be specified" }
);

/**
 * Create executions router
 */
export function createExecutionsRouter(
  executionRepository: ExecutionRepository,
  executionQueue?: ExecutionQueue,
  batchExecutionService?: BatchExecutionService,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/executions
   * Return paginated execution list with filters
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching executions list", {
        component: "ExecutionsRouter",
        operation: "getExecutions",
      });

      try {
        // Validate and parse query parameters
        const query = ExecutionFiltersQuerySchema.parse(req.query);

        logger.debug("Processing executions list request", {
          component: "ExecutionsRouter",
          operation: "getExecutions",
          metadata: {
            filters: {
              type: query.type,
              status: query.status,
              targetNode: query.targetNode
            },
            pagination: { page: query.page, pageSize: query.pageSize }
          },
        });

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

        const duration = Date.now() - startTime;

        logger.info("Executions list fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getExecutions",
          metadata: {
            count: executions.length,
            duration,
            statusCounts
          },
        });

        const responseData = {
          executions,
          pagination: {
            page: query.page,
            pageSize: query.pageSize,
            hasMore: executions.length === query.pageSize,
          },
          summary: statusCounts,
        };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Executions list fetched successfully",
            context: JSON.stringify({ count: executions.length, statusCounts }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid query parameters for executions list", {
            component: "ExecutionsRouter",
            operation: "getExecutions",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid query parameters",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error fetching executions", {
          component: "ExecutionsRouter",
          operation: "getExecutions",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch executions",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching execution details", {
        component: "ExecutionsRouter",
        operation: "getExecutionById",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing execution details request", {
          component: "ExecutionsRouter",
          operation: "getExecutionById",
          metadata: { executionId },
        });

        // Get execution by ID
        const execution = await executionRepository.findById(executionId);

        if (!execution) {
          logger.warn("Execution not found", {
            component: "ExecutionsRouter",
            operation: "getExecutionById",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;
          const errorResponse = {
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          };

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(404).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(404).json(errorResponse);
          }
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Execution details fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getExecutionById",
          metadata: { executionId, duration },
        });

        const responseData = { execution };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Execution details fetched successfully",
            context: JSON.stringify({ executionId }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter", {
            component: "ExecutionsRouter",
            operation: "getExecutionById",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid execution ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error fetching execution details", {
          component: "ExecutionsRouter",
          operation: "getExecutionById",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch execution details",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching original execution", {
        component: "ExecutionsRouter",
        operation: "getOriginalExecution",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing original execution request", {
          component: "ExecutionsRouter",
          operation: "getOriginalExecution",
          metadata: { executionId },
        });

        // Get the original execution
        const originalExecution =
          await executionRepository.findOriginalExecution(executionId);

        if (!originalExecution) {
          // Check if the execution exists at all
          const execution = await executionRepository.findById(executionId);
          if (!execution) {
            logger.warn("Execution not found", {
              component: "ExecutionsRouter",
              operation: "getOriginalExecution",
              metadata: { executionId },
            });

            const duration = Date.now() - startTime;

            if (req.expertMode) {
              const debugInfo = expertModeService.createDebugInfo(
                'GET /api/executions/:id/original',
                requestId,
                duration
              );
              expertModeService.addWarning(debugInfo, {
                message: `Execution '${executionId}' not found`,
                level: 'warn',
              });
              debugInfo.performance = expertModeService.collectPerformanceMetrics();
              debugInfo.context = expertModeService.collectRequestContext(req);
            }

            res.status(404).json({
              error: {
                code: "EXECUTION_NOT_FOUND",
                message: `Execution '${executionId}' not found`,
              },
            });
            return;
          }

          // Execution exists but is not a re-execution
          logger.warn("Execution is not a re-execution", {
            component: "ExecutionsRouter",
            operation: "getOriginalExecution",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/original',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' is not a re-execution`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(404).json({
            error: {
              code: "NOT_A_RE_EXECUTION",
              message: `Execution '${executionId}' is not a re-execution`,
            },
          });
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Original execution fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getOriginalExecution",
          metadata: { executionId, originalExecutionId: originalExecution.id, duration },
        });

        const responseData = { execution: originalExecution };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/original',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Original execution fetched successfully",
            context: JSON.stringify({ executionId, originalExecutionId: originalExecution.id }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter", {
            component: "ExecutionsRouter",
            operation: "getOriginalExecution",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/original',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid execution ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error fetching original execution", {
          component: "ExecutionsRouter",
          operation: "getOriginalExecution",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/original',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch original execution",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching re-executions", {
        component: "ExecutionsRouter",
        operation: "getReExecutions",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing re-executions request", {
          component: "ExecutionsRouter",
          operation: "getReExecutions",
          metadata: { executionId },
        });

        // Check if the execution exists
        const execution = await executionRepository.findById(executionId);
        if (!execution) {
          logger.warn("Execution not found", {
            component: "ExecutionsRouter",
            operation: "getReExecutions",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/re-executions',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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

        const duration = Date.now() - startTime;

        logger.info("Re-executions fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getReExecutions",
          metadata: { executionId, count: reExecutions.length, duration },
        });

        const responseData = {
          executions: reExecutions,
          count: reExecutions.length,
        };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/re-executions',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Re-executions fetched successfully",
            context: JSON.stringify({ executionId, count: reExecutions.length }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter", {
            component: "ExecutionsRouter",
            operation: "getReExecutions",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/re-executions',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid execution ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error fetching re-executions", {
          component: "ExecutionsRouter",
          operation: "getReExecutions",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/re-executions',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch re-executions",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Creating re-execution", {
        component: "ExecutionsRouter",
        operation: "createReExecution",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing re-execution request", {
          component: "ExecutionsRouter",
          operation: "createReExecution",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          metadata: { executionId, hasModifications: Object.keys(req.body).length > 0 },
        });

        // Get the original execution
        const originalExecution =
          await executionRepository.findById(executionId);
        if (!originalExecution) {
          logger.warn("Execution not found for re-execution", {
            component: "ExecutionsRouter",
            operation: "createReExecution",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/re-execute',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(404).json({
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          });
          return;
        }

        // Parse request body for parameter modifications
        const modifications = ReExecutionModificationsSchema.parse(req.body);

        // Create new execution with preserved parameters
        // Allow modifications from request body
        const executionData: Omit<ExecutionRecord, "id" | "originalExecutionId"> = {
          type: (modifications.type ?? originalExecution.type) as ExecutionType,
          targetNodes:
            (modifications.targetNodes ?? originalExecution.targetNodes),
          action: (modifications.action ?? originalExecution.action),

          parameters: (modifications.parameters ?? originalExecution.parameters),
          status: "running" as ExecutionStatus,
          startedAt: new Date().toISOString(),
          results: [] as NodeResult[],
          command: (modifications.command ?? originalExecution.command),
          expertMode: (modifications.expertMode ?? originalExecution.expertMode),
          executionTool: originalExecution.executionTool,
        };

        logger.debug("Creating re-execution with parameters", {
          component: "ExecutionsRouter",
          operation: "createReExecution",
          metadata: {
            executionId,
            type: executionData.type,
            targetNodesCount: executionData.targetNodes.length,
          },
        });

        // Create the re-execution with reference to original

        const newExecutionId = await executionRepository.createReExecution(
          executionId,
          executionData,
        );

        // Return the new execution ID and details
        const createdExecution =
          await executionRepository.findById(newExecutionId);

        const duration = Date.now() - startTime;

        logger.info("Re-execution created successfully", {
          component: "ExecutionsRouter",
          operation: "createReExecution",
          metadata: {
            originalExecutionId: executionId,
            newExecutionId,
            duration,
          },
        });

        const responseData = {
          execution: createdExecution,
          message: "Re-execution created successfully",
        };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/executions/:id/re-execute',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Re-execution created successfully",
            context: JSON.stringify({ originalExecutionId: executionId, newExecutionId }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(201).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(201).json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid request parameters for re-execution", {
            component: "ExecutionsRouter",
            operation: "createReExecution",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/re-execute',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid request parameters",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error creating re-execution", {
          component: "ExecutionsRouter",
          operation: "createReExecution",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/executions/:id/re-execute',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to create re-execution",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = _req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching queue status", {
        component: "ExecutionsRouter",
        operation: "getQueueStatus",
      });

      if (!executionQueue) {
        logger.warn("Execution queue not configured", {
          component: "ExecutionsRouter",
          operation: "getQueueStatus",
        });

        const duration = Date.now() - startTime;

        if (_req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/queue/status',
            requestId,
            duration
          );
          expertModeService.addWarning(debugInfo, {
            message: "Execution queue is not configured",
            level: 'warn',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(_req);
        }

        res.status(503).json({
          error: {
            code: "QUEUE_NOT_AVAILABLE",
            message: "Execution queue is not configured",
          },
        });
        return Promise.resolve();
      }

      try {
        logger.debug("Retrieving queue status", {
          component: "ExecutionsRouter",
          operation: "getQueueStatus",
        });

        const status = executionQueue.getStatus();
        const duration = Date.now() - startTime;

        logger.info("Queue status retrieved successfully", {
          component: "ExecutionsRouter",
          operation: "getQueueStatus",
          metadata: {
            running: status.running,
            queued: status.queued,
            duration,
          },
        });

        const responseData = {
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
        };

        // Handle expert mode response
        if (_req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/queue/status',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Queue status retrieved successfully",
            context: JSON.stringify({ running: status.running, queued: status.queued }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(_req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }

        return Promise.resolve();
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching queue status", {
          component: "ExecutionsRouter",
          operation: "getQueueStatus",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (_req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/queue/status',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch queue status",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(_req);
        }

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
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching execution output", {
        component: "ExecutionsRouter",
        operation: "getExecutionOutput",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing execution output request", {
          component: "ExecutionsRouter",
          operation: "getExecutionOutput",
          metadata: { executionId },
        });

        // Get execution by ID
        const execution = await executionRepository.findById(executionId);

        if (!execution) {
          logger.warn("Execution not found for output retrieval", {
            component: "ExecutionsRouter",
            operation: "getExecutionOutput",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/output',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(404).json({
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          });
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Execution output fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getExecutionOutput",
          metadata: {
            executionId,
            hasStdout: !!execution.stdout,
            hasStderr: !!execution.stderr,
            duration,
          },
        });

        // Return output data
        const responseData = {
          executionId: execution.id,
          command: execution.command,
          stdout: execution.stdout ?? "",
          stderr: execution.stderr ?? "",
          expertMode: execution.expertMode ?? false,
        };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/output',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Execution output fetched successfully",
            context: JSON.stringify({
              executionId,
              hasStdout: !!execution.stdout,
              hasStderr: !!execution.stderr,
            }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter for output", {
            component: "ExecutionsRouter",
            operation: "getExecutionOutput",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'GET /api/executions/:id/output',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid execution ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error fetching execution output", {
          component: "ExecutionsRouter",
          operation: "getExecutionOutput",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'GET /api/executions/:id/output',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to fetch execution output",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch execution output",
          },
        });
      }
    }),
  );

  /**
   * POST /api/executions/:id/cancel
   * Cancel or abort a running/stuck execution
   */
  router.post(
    "/:id/cancel",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Cancelling execution", {
        component: "ExecutionsRouter",
        operation: "cancelExecution",
        metadata: { executionId: req.params.id },
      });

      try {
        // Validate request parameters
        const params = ExecutionIdParamSchema.parse(req.params);
        const executionId = params.id;

        logger.debug("Processing execution cancellation request", {
          component: "ExecutionsRouter",
          operation: "cancelExecution",
          metadata: { executionId },
        });

        // Get execution by ID
        const execution = await executionRepository.findById(executionId);

        if (!execution) {
          logger.warn("Execution not found for cancellation", {
            component: "ExecutionsRouter",
            operation: "cancelExecution",
            metadata: { executionId },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/cancel',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' not found`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(404).json({
            error: {
              code: "EXECUTION_NOT_FOUND",
              message: `Execution '${executionId}' not found`,
            },
          });
          return;
        }

        // Check if execution is already completed
        if (execution.status !== 'running') {
          logger.warn("Cannot cancel non-running execution", {
            component: "ExecutionsRouter",
            operation: "cancelExecution",
            metadata: { executionId, status: execution.status },
          });

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/cancel',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: `Execution '${executionId}' is not running (status: ${execution.status})`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(400).json({
            error: {
              code: "INVALID_STATUS",
              message: `Cannot cancel execution with status '${execution.status}'`,
            },
          });
          return;
        }

        // Try to cancel from queue if it's queued
        let cancelledFromQueue = false;
        if (executionQueue) {
          cancelledFromQueue = executionQueue.cancel(executionId);
        }

        // Update execution status to failed with cancellation message
        try {
          await executionRepository.update(executionId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: 'Execution cancelled by user',
          });
        } catch (dbError) {
          // Database error - likely a constraint violation
          logger.error("Database error while cancelling execution", {
            component: "ExecutionsRouter",
            operation: "cancelExecution",
            metadata: { executionId },
          }, dbError instanceof Error ? dbError : undefined);

          const duration = Date.now() - startTime;

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/cancel',
              requestId,
              duration
            );
            expertModeService.addError(debugInfo, {
              message: "Database error while updating execution status",
              context: JSON.stringify({
                executionId,
                attemptedStatus: 'failed',
                error: dbError instanceof Error ? dbError.message : String(dbError),
              }),
              stack: dbError instanceof Error ? dbError.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(500).json(expertModeService.attachDebugInfo({
              error: {
                code: "DATABASE_ERROR",
                message: "Failed to update execution status in database",
                details: dbError instanceof Error ? dbError.message : String(dbError),
              },
            }, debugInfo));
          } else {
            res.status(500).json({
              error: {
                code: "DATABASE_ERROR",
                message: "Failed to update execution status in database",
              },
            });
          }
          return;
        }

        const duration = Date.now() - startTime;

        logger.info("Execution cancelled successfully", {
          component: "ExecutionsRouter",
          operation: "cancelExecution",
          metadata: {
            executionId,
            cancelledFromQueue,
            duration,
          },
        });

        const responseData = {
          message: "Execution cancelled successfully",
          executionId,
          cancelledFromQueue,
        };

        // Handle expert mode response
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/executions/:id/cancel',
            requestId,
            duration
          );

          expertModeService.addInfo(debugInfo, {
            message: "Execution cancelled successfully",
            context: JSON.stringify({ executionId, cancelledFromQueue }),
            level: 'info',
          });

          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Invalid execution ID parameter for cancellation", {
            component: "ExecutionsRouter",
            operation: "cancelExecution",
            metadata: { errors: error.errors },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/executions/:id/cancel',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Invalid execution ID parameter",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

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
        logger.error("Error cancelling execution", {
          component: "ExecutionsRouter",
          operation: "cancelExecution",
          metadata: {
            duration,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/executions/:id/cancel',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Failed to cancel execution",
            context: JSON.stringify({
              errorType: error instanceof Error ? error.constructor.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error),
            }),
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to cancel execution",
              details: error instanceof Error ? error.message : String(error),
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to cancel execution",
            },
          });
        }
      }
    }),
  );

  /**
   * POST /api/executions/batch
   * Create a batch execution for multiple nodes or groups
   *
   * **Validates: Requirements 5.1, 5.2, 5.8, 5.9, 5.10, 12.1**
   */
  router.post(
    "/batch",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Creating batch execution", {
        component: "ExecutionsRouter",
        operation: "createBatch",
      });

      // Check if BatchExecutionService is available
      if (!batchExecutionService) {
        logger.error("BatchExecutionService not available", {
          component: "ExecutionsRouter",
          operation: "createBatch",
        });

        const duration = Date.now() - startTime;
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          });
        }
        return;
      }

      try {
        // Validate request body
        const validationResult = BatchExecutionRequestSchema.safeParse(req.body);

        if (!validationResult.success) {
          logger.warn("Invalid batch execution request", {
            component: "ExecutionsRouter",
            operation: "createBatch",
            metadata: { errors: validationResult.error.errors },
          });

          const duration = Date.now() - startTime;
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "POST /api/executions/batch",
              requestId,
              duration,
            );
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(400).json(expertModeService.attachDebugInfo({
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid request body",
                details: validationResult.error.errors,
              },
            }, debugInfo));
          } else {
            res.status(400).json({
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid request body",
                details: validationResult.error.errors,
              },
            });
          }
          return;
        }

        const batchRequest = validationResult.data;

        // Get user ID from request (set by auth middleware)
        const userId = (req as any).user?.id || "unknown";

        logger.debug("Processing batch execution request", {
          component: "ExecutionsRouter",
          operation: "createBatch",
          metadata: {
            targetNodeIds: batchRequest.targetNodeIds?.length || 0,
            targetGroupIds: batchRequest.targetGroupIds?.length || 0,
            type: batchRequest.type,
            action: batchRequest.action,
            userId,
          },
        });

        // Create batch execution
        const response = await batchExecutionService.createBatch(
          batchRequest,
          userId,
        );

        logger.info(
          `Batch execution created: ${response.batchId} with ${response.targetCount} targets`,
          {
            component: "ExecutionsRouter",
            operation: "createBatch",
            metadata: {
              batchId: response.batchId,
              targetCount: response.targetCount,
              executionCount: response.executionIds.length,
              userId,
              type: batchRequest.type,
              action: batchRequest.action,
            },
          },
        );

        const duration = Date.now() - startTime;
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(201).json(expertModeService.attachDebugInfo(response, debugInfo));
        } else {
          res.status(201).json(response);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for queue full error
        if (errorMessage.includes("queue") && errorMessage.includes("full")) {
        logger.warn("Execution queue is full", {
          component: "ExecutionsRouter",
          operation: "createBatch",
        });

          const duration = Date.now() - startTime;
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "POST /api/executions/batch",
              requestId,
              duration,
            );
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(429).json(expertModeService.attachDebugInfo({
              error: {
                code: "QUEUE_FULL",
                message: "Execution queue is full. Please try again later.",
                details: errorMessage,
              },
            }, debugInfo));
          } else {
            res.status(429).json({
              error: {
                code: "QUEUE_FULL",
                message: "Execution queue is full. Please try again later.",
              },
            });
          }
          return;
        }

        // Check for validation errors (invalid node IDs)
        if (errorMessage.includes("Invalid node IDs")) {
        logger.warn("Invalid node IDs in batch request", {
          component: "ExecutionsRouter",
          operation: "createBatch",
        });

          const duration = Date.now() - startTime;
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "POST /api/executions/batch",
              requestId,
              duration,
            );
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(400).json(expertModeService.attachDebugInfo({
              error: {
                code: "INVALID_NODES",
                message: "One or more target nodes are invalid",
                details: errorMessage,
              },
            }, debugInfo));
          } else {
            res.status(400).json({
              error: {
                code: "INVALID_NODES",
                message: "One or more target nodes are invalid",
                details: errorMessage,
              },
            });
          }
          return;
        }

        // Generic error handling
        logger.error("Failed to create batch execution", {
          component: "ExecutionsRouter",
          operation: "createBatch",
        }, error instanceof Error ? error : new Error(errorMessage));

        const duration = Date.now() - startTime;
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create batch execution",
              details: errorMessage,
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create batch execution",
            },
          });
        }
      }
    }),
  );

  /**
   * GET /api/executions/batch/:batchId
   * Get batch execution status with aggregated statistics
   *
   * **Validates: Requirements 6.1, 6.2, 6.6, 6.7**
   */
  router.get(
    "/batch/:batchId",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Fetching batch execution status", {
        component: "ExecutionsRouter",
        operation: "getBatchStatus",
        metadata: { batchId: req.params.batchId },
      });

      // Check if BatchExecutionService is available
      if (!batchExecutionService) {
        logger.error("BatchExecutionService not available", {
          component: "ExecutionsRouter",
          operation: "getBatchStatus",
        });

        const duration = Date.now() - startTime;
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "GET /api/executions/batch/:batchId",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          });
        }
        return;
      }

      try {
        const batchId = req.params.batchId;
        const statusFilter = req.query.status as string | undefined;

        logger.debug("Processing batch status request", {
          component: "ExecutionsRouter",
          operation: "getBatchStatus",
          metadata: { batchId, statusFilter },
        });

        // Get batch status from service
        const batchStatus = await batchExecutionService.getBatchStatus(
          batchId,
          statusFilter,
        );

        const duration = Date.now() - startTime;

        logger.info("Batch status fetched successfully", {
          component: "ExecutionsRouter",
          operation: "getBatchStatus",
          metadata: {
            batchId,
            status: batchStatus.batch.status,
            progress: batchStatus.progress,
            totalExecutions: batchStatus.batch.stats.total,
            duration,
          },
        });

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "GET /api/executions/batch/:batchId",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(batchStatus, debugInfo));
        } else {
          res.json(batchStatus);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const duration = Date.now() - startTime;

        // Check if batch not found
        if (errorMessage.includes("not found")) {
          logger.warn("Batch execution not found", {
            component: "ExecutionsRouter",
            operation: "getBatchStatus",
            metadata: { batchId: req.params.batchId },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "GET /api/executions/batch/:batchId",
              requestId,
              duration,
            );
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(404).json(expertModeService.attachDebugInfo({
              error: {
                code: "BATCH_NOT_FOUND",
                message: `Batch execution '${req.params.batchId}' not found`,
              },
            }, debugInfo));
          } else {
            res.status(404).json({
              error: {
                code: "BATCH_NOT_FOUND",
                message: `Batch execution '${req.params.batchId}' not found`,
              },
            });
          }
          return;
        }

        // Generic error handling
        logger.error("Failed to fetch batch status", {
          component: "ExecutionsRouter",
          operation: "getBatchStatus",
          metadata: { batchId: req.params.batchId, duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "GET /api/executions/batch/:batchId",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to fetch batch status",
              details: errorMessage,
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to fetch batch status",
            },
          });
        }
      }
    }),
  );

  /**
   * POST /api/executions/batch/:batchId/cancel
   * Cancel a batch execution
   *
   * **Validates: Requirements 8.2, 8.9**
   */
  router.post(
    "/batch/:batchId/cancel",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Cancelling batch execution", {
        component: "ExecutionsRouter",
        operation: "cancelBatch",
        metadata: { batchId: req.params.batchId },
      });

      // Check if BatchExecutionService is available
      if (!batchExecutionService) {
        logger.error("BatchExecutionService not available", {
          component: "ExecutionsRouter",
          operation: "cancelBatch",
        });

        const duration = Date.now() - startTime;
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch/:batchId/cancel",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Batch execution service is not available",
            },
          });
        }
        return;
      }

      try {
        const batchId = req.params.batchId;

        logger.debug("Processing batch cancellation request", {
          component: "ExecutionsRouter",
          operation: "cancelBatch",
          metadata: { batchId },
        });

        // Cancel the batch execution
        const result = await batchExecutionService.cancelBatch(batchId);

        const duration = Date.now() - startTime;

        logger.info("Batch execution cancelled successfully", {
          component: "ExecutionsRouter",
          operation: "cancelBatch",
          metadata: {
            batchId,
            cancelledCount: result.cancelledCount,
            duration,
          },
        });

        const responseData = {
          batchId,
          cancelledCount: result.cancelledCount,
          message: `Cancelled ${result.cancelledCount} execution${result.cancelledCount !== 1 ? 's' : ''}`,
        };

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch/:batchId/cancel",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const duration = Date.now() - startTime;

        // Check if batch not found
        if (errorMessage.includes("not found")) {
          logger.warn("Batch execution not found for cancellation", {
            component: "ExecutionsRouter",
            operation: "cancelBatch",
            metadata: { batchId: req.params.batchId },
          });

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "POST /api/executions/batch/:batchId/cancel",
              requestId,
              duration,
            );
            debugInfo.context = expertModeService.collectRequestContext(req);

            res.status(404).json(expertModeService.attachDebugInfo({
              error: {
                code: "BATCH_NOT_FOUND",
                message: `Batch execution '${req.params.batchId}' not found`,
              },
            }, debugInfo));
          } else {
            res.status(404).json({
              error: {
                code: "BATCH_NOT_FOUND",
                message: `Batch execution '${req.params.batchId}' not found`,
              },
            });
          }
          return;
        }

        // Generic error handling
        logger.error("Failed to cancel batch execution", {
          component: "ExecutionsRouter",
          operation: "cancelBatch",
          metadata: { batchId: req.params.batchId, duration },
        }, error instanceof Error ? error : undefined);

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/executions/batch/:batchId/cancel",
            requestId,
            duration,
          );
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(500).json(expertModeService.attachDebugInfo({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to cancel batch execution",
              details: errorMessage,
            },
          }, debugInfo));
        } else {
          res.status(500).json({
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to cancel batch execution",
            },
          });
        }
      }
    }),
  );

  return router;
}
