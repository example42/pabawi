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

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

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

  /**
   * GET /api/tasks
   * Return available Bolt tasks
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      try {
        // Get Bolt plugin from IntegrationManager
        const boltPlugin = integrationManager.getExecutionTool(
          "bolt",
        ) as BoltPlugin | null;
        if (!boltPlugin) {
          res.status(503).json({
            error: {
              code: "BOLT_NOT_AVAILABLE",
              message: "Bolt integration is not available",
            },
          });
          return;
        }

        const boltService = boltPlugin.getBoltService();
        const tasks = await boltService.listTasks();
        res.json({ tasks });
      } catch (error) {
        if (error instanceof BoltExecutionError) {
          res.status(500).json({
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          });
          return;
        }

        if (error instanceof BoltParseError) {
          res.status(500).json({
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error listing tasks:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list tasks",
          },
        });
      }
    }),
  );

  /**
   * GET /api/tasks/by-module
   * Return available Bolt tasks grouped by module
   */
  router.get(
    "/by-module",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      try {
        // Get Bolt plugin from IntegrationManager
        const boltPlugin = integrationManager.getExecutionTool(
          "bolt",
        ) as BoltPlugin | null;
        if (!boltPlugin) {
          res.status(503).json({
            error: {
              code: "BOLT_NOT_AVAILABLE",
              message: "Bolt integration is not available",
            },
          });
          return;
        }

        const boltService = boltPlugin.getBoltService();
        const tasksByModule = await boltService.listTasksByModule();
        res.json({ tasksByModule });
      } catch (error) {
        if (error instanceof BoltExecutionError) {
          res.status(500).json({
            error: {
              code: "BOLT_EXECUTION_FAILED",
              message: error.message,
              details: error.stderr,
            },
          });
          return;
        }

        if (error instanceof BoltParseError) {
          res.status(500).json({
            error: {
              code: "BOLT_PARSE_ERROR",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error listing tasks by module:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list tasks by module",
          },
        });
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
      try {
        // Validate request parameters and body
        const params = NodeIdParamSchema.parse(req.params);
        const body = TaskExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const taskName = body.taskName;
        const parameters = body.parameters;
        const expertMode = body.expertMode ?? false;

        // Verify node exists in inventory using IntegrationManager
        const aggregatedInventory =
          await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );

        if (!node) {
          res.status(404).json({
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          });
          return;
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

        // Execute task asynchronously using IntegrationManager
        // We don't await here to return immediately with execution ID
        void (async (): Promise<void> => {
          try {
            // Set up streaming callback if expert mode is enabled and streaming manager is available
            const streamingCallback =
              expertMode && streamingManager
                ? {
                    onCommand: (cmd: string): void => {
                      streamingManager.emitCommand(executionId, cmd);
                    },
                    onStdout: (chunk: string): void => {
                      streamingManager.emitStdout(executionId, chunk);
                    },
                    onStderr: (chunk: string): void => {
                      streamingManager.emitStderr(executionId, chunk);
                    },
                  }
                : undefined;

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
            console.error("Error executing task:", error);

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

        // Return execution ID and initial status immediately
        res.status(202).json({
          executionId,
          status: "running",
          message: "Task execution started",
        });
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

        if (error instanceof BoltInventoryNotFoundError) {
          res.status(404).json({
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        console.error("Error processing task execution request:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process task execution request",
          },
        });
      }
    }),
  );

  return router;
}
