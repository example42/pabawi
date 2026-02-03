import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import {
  BoltExecutionError,
  BoltParseError,
  BoltInventoryNotFoundError,
  BoltTaskNotFoundError,
  BoltTaskParameterError,
} from "../bolt/types";
import { asyncHandler } from "./asyncHandler";
import type { BoltPlugin } from "../integrations/bolt/BoltPlugin";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";

const TaskExecutionBodySchema = z.object({
  taskName: z.string().min(1, "Task name is required"),
  parameters: z.record(z.unknown()).optional(),
  expertMode: z.boolean().optional(),
});

/**
 * Create tasks router
 */
export function createTasksRouter(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * GET /api/tasks
   * Return available Bolt tasks
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/tasks', requestId, 0)
        : null;

      logger.info("Fetching available Bolt tasks", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "listTasks",
      });

      try {
        // Get Bolt plugin from IntegrationManager
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Getting Bolt plugin from IntegrationManager",
            level: 'debug',
          });
        }

        const boltPlugin = integrationManager.getExecutionTool(
          "bolt",
        ) as BoltPlugin | null;

        if (!boltPlugin) {
          logger.warn("Bolt integration not available", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasks",
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Bolt integration is not available",
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_NOT_AVAILABLE",
              message: "Bolt integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Listing tasks from Bolt service",
            level: 'debug',
          });
        }

        const boltService = boltPlugin.getBoltService();
        const tasks = await boltService.listTasks();

        const duration = Date.now() - startTime;

        logger.info("Bolt tasks fetched successfully", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasks",
          metadata: { taskCount: tasks.length, duration },
        });

        const responseData = { tasks };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'taskCount', tasks.length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved ${String(tasks.length)} Bolt tasks`,
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

        if (error instanceof BoltExecutionError) {
          logger.error("Bolt execution failed", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasks",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt execution failed: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltParseError) {
          logger.error("Bolt parse error", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasks",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt parse error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error listing tasks", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasks",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list tasks",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * GET /api/tasks/by-module
   * Return available Bolt tasks grouped by module
   */
  router.get(
    "/by-module",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('GET /api/tasks/by-module', requestId, 0)
        : null;

      logger.info("Fetching Bolt tasks grouped by module", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "listTasksByModule",
      });

      try {
        // Get Bolt plugin from IntegrationManager
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Getting Bolt plugin from IntegrationManager",
            level: 'debug',
          });
        }

        const boltPlugin = integrationManager.getExecutionTool(
          "bolt",
        ) as BoltPlugin | null;

        if (!boltPlugin) {
          logger.warn("Bolt integration not available", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasksByModule",
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: "Bolt integration is not available",
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_NOT_AVAILABLE",
              message: "Bolt integration is not available",
            },
          };

          res.status(503).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Listing tasks by module from Bolt service",
            level: 'debug',
          });
        }

        const boltService = boltPlugin.getBoltService();
        const tasksByModule = await boltService.listTasksByModule();

        const duration = Date.now() - startTime;

        logger.info("Bolt tasks by module fetched successfully", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasksByModule",
          metadata: { moduleCount: Object.keys(tasksByModule).length, duration },
        });

        const responseData = { tasksByModule };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'moduleCount', Object.keys(tasksByModule).length);
          expertModeService.addInfo(debugInfo, {
            message: `Retrieved tasks from ${String(Object.keys(tasksByModule).length)} modules`,
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

        if (error instanceof BoltExecutionError) {
          logger.error("Bolt execution failed", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasksByModule",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt execution failed: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (error instanceof BoltParseError) {
          logger.error("Bolt parse error", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "listTasksByModule",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt parse error: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          };

          res.status(500).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error listing tasks by module", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "listTasksByModule",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error listing tasks by module: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list tasks by module",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  /**
   * POST /api/nodes/:id/task
   * Execute task on a node
   */
  router.post(
    "/:id/task",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/nodes/:id/task', requestId, 0)
        : null;

      logger.info("Processing task execution request", {
        component: "TasksRouter",
        integration: "bolt",
        operation: "executeTask",
        metadata: { nodeId: req.params.id },
      });

      try {
        // Validate request parameters and body
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            level: 'debug',
          });
        }

        const params = NodeIdParamSchema.parse(req.params);
        const body = TaskExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const taskName = body.taskName;
        const parameters = body.parameters;
        const expertMode = body.expertMode ?? false;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Verifying node exists in inventory",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        // Verify node exists in inventory using IntegrationManager
        const aggregatedInventory =
          await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );

        if (!node) {
          logger.warn("Node not found in inventory", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "executeTask",
            metadata: { nodeId },
          });

          if (debugInfo) {
            debugInfo.duration = Date.now() - startTime;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addWarning(debugInfo, {
              message: `Node '${nodeId}' not found in inventory`,
              level: 'warn',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, taskName, expertMode }),
            level: 'debug',
          });
        }

        // Create initial execution record
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

        logger.info("Execution record created, starting task execution", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "executeTask",
          metadata: { executionId, nodeId, taskName },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Execution record created, starting task execution",
            context: JSON.stringify({ executionId, nodeId, taskName }),
            level: 'info',
          });
        }

        // Execute task asynchronously using IntegrationManager
        // We don't await here to return immediately with execution ID
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            // Execute action through IntegrationManager
            const result = await integrationManager.executeAction("bolt", {
              type: "task",
              target: nodeId,
              action: taskName,
              parameters,
              metadata: {
                streamingCallback,
              },
            });

            // Update execution record with results
            // Include stdout/stderr when expert mode is enabled
            await executionRepository.update(executionId, {
              status: result.status,
              completedAt: result.completedAt,
              results: result.results,
              error: result.error,
              command: result.command,
              stdout: expertMode ? result.stdout : undefined,
              stderr: expertMode ? result.stderr : undefined,
            });

            // Emit completion event if streaming
            if (streamingManager) {
              streamingManager.emitComplete(executionId, result);
            }
          } catch (error) {
            logger.error("Error executing task", {
              component: "TasksRouter",
              integration: "bolt",
              operation: "executeTask",
              metadata: { executionId, nodeId, taskName },
            }, error instanceof Error ? error : undefined);

            let errorMessage = "Unknown error";

            if (error instanceof BoltTaskNotFoundError) {
              errorMessage = error.message;
            } else if (error instanceof BoltTaskParameterError) {
              errorMessage = error.message;
            } else if (error instanceof Error) {
              errorMessage = error.message;
            }

            // Update execution record with error
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

            // Emit error event if streaming
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

        // Return execution ID and initial status immediately
        const responseData = {
          executionId,
          status: "running",
          message: "Task execution started",
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'executionId', executionId);
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'taskName', taskName);
          expertModeService.addInfo(debugInfo, {
            message: "Task execution started",
            context: JSON.stringify({ executionId, nodeId, taskName }),
            level: 'info',
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
          logger.warn("Request validation failed", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "executeTask",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
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

        if (error instanceof BoltInventoryNotFoundError) {
          logger.error("Bolt configuration missing", {
            component: "TasksRouter",
            integration: "bolt",
            operation: "executeTask",
          }, error);

          if (debugInfo) {
            debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Bolt configuration missing: ${error.message}`,
              stack: error.stack,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error processing task execution request", {
          component: "TasksRouter",
          integration: "bolt",
          operation: "executeTask",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error processing task execution request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process task execution request",
          },
        };

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    }),
  );

  return router;
}
