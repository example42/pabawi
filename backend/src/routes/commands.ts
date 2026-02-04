import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { CommandWhitelistService } from "../validation/CommandWhitelistService";
import { CommandNotAllowedError } from "../validation/CommandWhitelistService";
import { InventoryNotFoundError, normalizePluginError } from "../errors/PluginErrors";
import { asyncHandler } from "./asyncHandler";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { NodeIdParamSchema } from "../validation/commonSchemas";

const CommandExecutionBodySchema = z.object({
  command: z.string().min(1, "Command is required"),
  expertMode: z.boolean().optional(),
});

/**
 * Create commands router
 */
export function createCommandsRouter(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  commandWhitelistService: CommandWhitelistService,
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * POST /api/nodes/:id/command
   * Execute command on a node
   */
  router.post(
    "/:id/command",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('POST /api/nodes/:id/command', requestId, 0)
        : null;

      logger.info("Processing command execution request", {
        component: "CommandsRouter",
        integration: "bolt",
        operation: "executeCommand",
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
        const body = CommandExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const command = body.command;
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
            component: "CommandsRouter",
            integration: "bolt",
            operation: "executeCommand",
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

        // Validate command against whitelist
        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating command against whitelist",
            context: JSON.stringify({ command }),
            level: 'debug',
          });
        }

        try {
          commandWhitelistService.validateCommand(command);
        } catch (error) {
          if (error instanceof CommandNotAllowedError) {
            logger.warn("Command not allowed", {
              component: "CommandsRouter",
              integration: "bolt",
              operation: "executeCommand",
              metadata: { command, reason: error.reason },
            });

            if (debugInfo) {
              debugInfo.duration = Date.now() - startTime;
              expertModeService.setIntegration(debugInfo, 'bolt');
              expertModeService.addWarning(debugInfo, {
                message: `Command not allowed: ${error.message}`,
                context: error.reason,
                level: 'warn',
              });
              debugInfo.performance = expertModeService.collectPerformanceMetrics();
              debugInfo.context = expertModeService.collectRequestContext(req);
            }

            const errorResponse = {
              error: {
                code: "COMMAND_NOT_ALLOWED",
                message: error.message,
                details: error.reason,
              },
            };

            res.status(403).json(
              debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
            );
            return;
          }
          throw error;
        }

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, command, expertMode }),
            level: 'debug',
          });
        }

        // Create initial execution record
        const executionId = await executionRepository.create({
          type: "command",
          targetNodes: [nodeId],
          action: command,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting command execution", {
          component: "CommandsRouter",
          integration: "bolt",
          operation: "executeCommand",
          metadata: { executionId, nodeId, command },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Execution record created, starting command execution",
            context: JSON.stringify({ executionId, nodeId, command }),
            level: 'info',
          });
        }

        // Execute command asynchronously using IntegrationManager
        // We don't await here to return immediately with execution ID
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            // Execute action through IntegrationManager
            const result = await integrationManager.executeAction("bolt", {
              type: "command",
              target: nodeId,
              action: command,
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
            logger.error("Error executing command", {
              component: "CommandsRouter",
              integration: "bolt",
              operation: "executeCommand",
              metadata: { executionId, nodeId, command },
            }, error instanceof Error ? error : undefined);

            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

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

        logger.info("Command execution request accepted", {
          component: "CommandsRouter",
          integration: "bolt",
          operation: "executeCommand",
          metadata: { executionId, nodeId, command, duration },
        });

        // Return execution ID and initial status immediately
        const responseData = {
          executionId,
          status: "running",
          message: "Command execution started",
        };

        // Attach debug info if expert mode is enabled
        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addMetadata(debugInfo, 'executionId', executionId);
          expertModeService.addMetadata(debugInfo, 'nodeId', nodeId);
          expertModeService.addMetadata(debugInfo, 'command', command);
          expertModeService.addInfo(debugInfo, {
            message: "Command execution started",
            context: JSON.stringify({ executionId, nodeId, command }),
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
            component: "CommandsRouter",
            integration: "bolt",
            operation: "executeCommand",
            metadata: { errors: error.errors },
          });

          if (debugInfo) {
            debugInfo.duration = duration;
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

        if (error instanceof InventoryNotFoundError || (error instanceof Error && error.name === 'BoltInventoryNotFoundError')) {
          const normalizedError = normalizePluginError(error, 'bolt');
          logger.error("Inventory configuration missing", {
            component: "CommandsRouter",
            integration: "bolt",
            operation: "executeCommand",
          }, error instanceof Error ? error : undefined);

          if (debugInfo) {
            debugInfo.duration = duration;
            expertModeService.setIntegration(debugInfo, 'bolt');
            expertModeService.addError(debugInfo, {
              message: `Inventory configuration missing: ${normalizedError.message}`,
              stack: error instanceof Error ? error.stack : undefined,
              level: 'error',
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
          }

          const errorResponse = {
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
            },
          };

          res.status(404).json(
            debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
          );
          return;
        }

        // Unknown error
        logger.error("Error processing command execution request", {
          component: "CommandsRouter",
          integration: "bolt",
          operation: "executeCommand",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, 'bolt');
          expertModeService.addError(debugInfo, {
            message: `Error processing command execution request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }

        const errorResponse = {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process command execution request",
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
