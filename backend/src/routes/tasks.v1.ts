/**
 * Tasks API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for task listing and execution using capability-based routing.
 * All task operations go through the CapabilityRegistry for:
 * - Permission checking via RBAC
 * - Plugin routing based on priority
 * - Consistent error handling
 *
 * @module routes/tasks
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { ExecutionStatus, NodeResult } from "../database/ExecutionRepository";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";
import { asyncHandler } from "./asyncHandler";
import {
  requestUserToCapabilityUser,
  createDebugContext,
  createErrorResponse,
} from "./capabilityRouter";
import { requireCapability } from "../middleware/rbac";

// =============================================================================
// Request Validation Schemas
// =============================================================================

const TaskExecutionBodySchema = z.object({
  taskName: z.string().min(1, "Task name is required"),
  parameters: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional(),
});

const TaskDetailsQuerySchema = z.object({
  task: z.string().optional(),
  module: z.string().optional(),
});

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create tasks router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @param executionRepository - Repository for execution history
 * @param streamingManager - Optional streaming manager for real-time output
 * @returns Express router
 */
export function createTasksRouterV1(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  streamingManager?: StreamingExecutionManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  // =========================================================================
  // GET /api/tasks
  // List available Bolt tasks via capability system
  // =========================================================================
  router.get(
    "/",
    requireCapability("bolt.task.list"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/tasks", requestId, 0)
        : null;

      logger.info("Fetching available Bolt tasks via capability", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "listTasks",
      });

      try {
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);
        const query = TaskDetailsQuerySchema.parse(req.query);

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Executing bolt.task.list capability",
            context: JSON.stringify({ module: query.module }),
            level: "debug",
          });
        }

        // Execute via capability system
        const result = await integrationManager.executeCapability(
          user,
          "bolt.task.list",
          { module: query.module },
          debugContext
        );

        const duration = Date.now() - startTime;

        if (!result.success) {
          logger.warn("Failed to list tasks via capability", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasks",
            metadata: { error: result.error?.code },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: result.error?.message ?? "Failed to list tasks",
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = createErrorResponse(
            result.error?.code ?? "CAPABILITY_FAILED",
            result.error?.message ?? "Failed to list tasks"
          );

          res.status(result.error?.code === "PERMISSION_DENIED" ? 403 : 500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const tasks = result.data as unknown[];

        logger.info("Bolt tasks fetched successfully via capability", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasks",
          metadata: { taskCount: tasks.length, duration, handledBy: result.handledBy },
        });

        const responseData = { tasks, source: result.handledBy };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addMetadata(debugInfo, "taskCount", tasks.length);
          expertModeService.addMetadata(debugInfo, "handledBy", result.handledBy);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(tasks.length)} Bolt tasks`,
            level: "info",
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
          const errorResponse = createErrorResponse(
            "INVALID_REQUEST",
            "Request validation failed",
            error.errors
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
          }

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error listing tasks", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasks",
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to list tasks"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // =========================================================================
  // GET /api/tasks/:taskName
  // Get task details via capability system
  // =========================================================================
  router.get(
    "/:taskName",
    requireCapability("bolt.task.list"),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("GET /api/tasks/:taskName", requestId, 0)
        : null;

      const taskName = req.params.taskName;

      logger.info("Fetching task details via capability", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "getTaskDetails",
        metadata: { taskName },
      });

      try {
        const user = requestUserToCapabilityUser(req);
        const debugContext = createDebugContext(req);

        // Use task.details capability if available
        const result = await integrationManager.executeCapability(
          user,
          "bolt.task.details",
          { task: taskName },
          debugContext
        );

        const duration = Date.now() - startTime;

        if (!result.success) {
          // Fall back to listing and filtering
          const listResult = await integrationManager.executeCapability(
            user,
            "bolt.task.list",
            {},
            debugContext
          );

          if (listResult.success && Array.isArray(listResult.data)) {
            const task = listResult.data.find(
              (t: { name?: string }) => t.name === taskName
            );

            if (task) {
              const responseData = { task, source: listResult.handledBy };

              if (debugInfo) {
                debugInfo.duration = Date.now() - startTime;
                expertModeService.setIntegration(debugInfo, "bolt");
                expertModeService.addInfo(debugInfo, {
                  message: "Task found via list fallback",
                  level: "info",
                });
                debugInfo.performance = expertModeService.collectPerformanceMetrics();
                debugInfo.context = expertModeService.collectRequestContext(req);

                res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
              } else {
                res.json(responseData);
              }
              return;
            }
          }

          // Task not found
          const errorResponse = createErrorResponse(
            "TASK_NOT_FOUND",
            `Task '${taskName}' not found`
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: `Task '${taskName}' not found`,
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        const responseData = { task: result.data, source: result.handledBy };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved details for task ${taskName}`,
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error("Error fetching task details", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "getTaskDetails",
          metadata: { taskName },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to fetch task details"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  // =========================================================================
  // POST /api/nodes/:id/task
  // Execute task on a node via capability system
  // =========================================================================
  router.post(
    "/:id/task",
    requireCapability("bolt.task.execute", {
      contextExtractor: (req) => ({
        node: req.params.id,
        metadata: { task: req.body?.taskName },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/nodes/:id/task", requestId, 0)
        : null;

      logger.info("Processing task execution request via capability", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "executeTask",
        metadata: { nodeId: req.params.id },
      });

      try {
        // Validate request
        const params = NodeIdParamSchema.parse(req.params);
        const body = TaskExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const taskName = body.taskName;
        const parameters = body.parameters;
        const expertMode = body.expertMode ?? false;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, taskName }),
            level: "debug",
          });
        }

        // Create execution record
        const executionId = await executionRepository.create({
          type: "task",
          targetNodes: [nodeId],
          action: taskName,
          parameters,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting capability execution", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "executeTask",
          metadata: { executionId, nodeId, taskName },
        });

        // Execute task asynchronously via capability system
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            const user = requestUserToCapabilityUser(req);
            const debugContext = createDebugContext(req);

            // Execute via capability system
            const result = await integrationManager.executeCapability(
              user,
              "bolt.task.execute",
              {
                task: taskName,
                targets: [nodeId],
                parameters,
                streamingCallback,
              },
              debugContext
            );

            if (result.success && result.data) {
              const execResult = result.data as {
                status: ExecutionStatus;
                completedAt?: string;
                results: NodeResult[];
                error?: string;
                stdout?: string;
                stderr?: string;
              };

              await executionRepository.update(executionId, {
                status: execResult.status,
                completedAt: execResult.completedAt ?? new Date().toISOString(),
                results: execResult.results,
                error: execResult.error,
                stdout: expertMode ? execResult.stdout : undefined,
                stderr: expertMode ? execResult.stderr : undefined,
              });

              if (streamingManager) {
                streamingManager.emitComplete(executionId, execResult);
              }
            } else {
              const errorMessage = result.error?.message ?? "Task execution failed";
              await executionRepository.update(executionId, {
                status: "failed",
                completedAt: new Date().toISOString(),
                results: [
                  {
                    nodeId,
                    status: "failed",
                    error: errorMessage,
                    duration: 0,
                  },
                ],
                error: errorMessage,
              });

              if (streamingManager) {
                streamingManager.emitError(executionId, errorMessage);
              }
            }
          } catch (error) {
            logger.error("Error executing task via capability", {
              component: "TasksRouter",
              integration: "bolt",
              operation: "executeTask",
              metadata: { executionId, nodeId, taskName },
            }, error instanceof Error ? error : undefined);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            await executionRepository.update(executionId, {
              status: "failed",
              completedAt: new Date().toISOString(),
              results: [
                {
                  nodeId,
                  status: "failed",
                  error: errorMessage,
                  duration: 0,
                },
              ],
              error: errorMessage,
            });

            if (streamingManager) {
              streamingManager.emitError(executionId, errorMessage);
            }
          }
        })();

        const duration = Date.now() - startTime;

        logger.info("Task execution request accepted", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "executeTask",
          metadata: { executionId, nodeId, taskName, duration },
        });

        const responseData = {
          executionId,
          status: "running",
          message: "Task execution started",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addMetadata(debugInfo, "executionId", executionId);
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "taskName", taskName);
          expertModeService.addInfo(debugInfo, {
            message: "Task execution started via capability system",
            level: "info",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);

          res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(202).json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          const errorResponse = createErrorResponse(
            "INVALID_REQUEST",
            "Request validation failed",
            error.errors
          );

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, "bolt");
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          res.status(400).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        logger.error("Error processing task execution request", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "executeTask",
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addError(debugInfo, {
            message: error instanceof Error ? error.message : "Unknown error",
            level: "error",
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "Failed to process task execution request"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
