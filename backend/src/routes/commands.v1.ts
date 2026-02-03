/**
 * Commands API Routes (v1.0.0 - Capability-Based)
 *
 * REST API endpoints for command execution using capability-based routing.
 * All command execution goes through the CapabilityRegistry for:
 * - Permission checking via RBAC
 * - Plugin routing based on priority
 * - Consistent error handling
 *
 * @module routes/commands
 * @version 1.0.0
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { ExecutionStatus, NodeResult } from "../database/ExecutionRepository";
import type { CommandWhitelistService } from "../validation/CommandWhitelistService";
import { CommandNotAllowedError } from "../validation/CommandWhitelistService";
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

const CommandExecutionBodySchema = z.object({
  command: z.string().min(1, "Command is required"),
  expertMode: z.boolean().optional(),
});

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create commands router with capability-based access
 *
 * @param integrationManager - IntegrationManager for capability execution
 * @param executionRepository - Repository for execution history
 * @param commandWhitelistService - Service for command validation
 * @param streamingManager - Optional streaming manager for real-time output
 * @returns Express router
 */
export function createCommandsRouterV1(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  commandWhitelistService: CommandWhitelistService,
  streamingManager?: StreamingExecutionManager
): Router {
  const router = Router();
  const logger = new LoggerService();

  // =========================================================================
  // POST /api/nodes/:id/command
  // Execute command on a node via capability system
  // =========================================================================
  router.post(
    "/:id/command",
    // RBAC middleware - require bolt.command.execute capability
    requireCapability("bolt.command.execute", {
      contextExtractor: (req) => ({
        node: req.params.id,
        metadata: { command: req.body?.command },
      }),
    }),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo("POST /api/nodes/:id/command", requestId, 0)
        : null;

      logger.info("Processing command execution request via capability", {
        component: "CommandsRouter",
        integration: "bolt",
        operation: "executeCommand",
        metadata: { nodeId: req.params.id },
      });

      try {
        // Validate request
        const params = NodeIdParamSchema.parse(req.params);
        const body = CommandExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const command = body.command;
        const expertMode = body.expertMode ?? false;

        if (debugInfo) {
          expertModeService.addDebug(debugInfo, {
            message: "Validating command against whitelist",
            context: JSON.stringify({ nodeId, command }),
            level: "debug",
          });
        }

        // Validate command against whitelist (security layer)
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
              expertModeService.setIntegration(debugInfo, "bolt");
              expertModeService.addWarning(debugInfo, {
                message: `Command not allowed: ${error.message}`,
                context: error.reason,
                level: "warn",
              });
              debugInfo.performance = expertModeService.collectPerformanceMetrics();
              debugInfo.context = expertModeService.collectRequestContext(req);
            }

            const errorResponse = createErrorResponse(
              "COMMAND_NOT_ALLOWED",
              error.message,
              error.reason
            );

            res.status(403).json(
              debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
            );
            return;
          }
          throw error;
        }

        // Create execution record
        const executionId = await executionRepository.create({
          type: "command",
          targetNodes: [nodeId],
          action: command,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting capability execution", {
          component: "CommandsRouter",
          integration: "bolt",
          operation: "executeCommand",
          metadata: { executionId, nodeId, command },
        });

        if (debugInfo) {
          expertModeService.addInfo(debugInfo, {
            message: "Execution record created",
            context: JSON.stringify({ executionId }),
            level: "info",
          });
        }

        // Execute command asynchronously via capability system
        void (async (): Promise<void> => {
          try {
            const streamingCallback = streamingManager?.createStreamingCallback(
              executionId,
              expertMode
            );

            // Get user context for capability execution
            const user = requestUserToCapabilityUser(req);
            const debugContext = createDebugContext(req);

            // Execute via capability system
            const result = await integrationManager.executeCapability(
              user,
              "bolt.command.execute",
              {
                command,
                targets: [nodeId],
                streamingCallback,
              },
              debugContext
            );

            if (result.success && result.data) {
              // Update execution record with results
              const execResult = result.data as {
                status: ExecutionStatus;
                completedAt?: string;
                results: NodeResult[];
                error?: string;
                command?: string;
                stdout?: string;
                stderr?: string;
              };

              await executionRepository.update(executionId, {
                status: execResult.status as ExecutionStatus,
                completedAt: execResult.completedAt ?? new Date().toISOString(),
                results: execResult.results as NodeResult[],
                error: execResult.error,
                command: execResult.command,
                stdout: expertMode ? execResult.stdout : undefined,
                stderr: expertMode ? execResult.stderr : undefined,
              });

              if (streamingManager) {
                streamingManager.emitComplete(executionId, execResult);
              }
            } else {
              // Capability execution failed
              const errorMessage = result.error?.message ?? "Unknown error";
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
            logger.error("Error executing command via capability", {
              component: "CommandsRouter",
              integration: "bolt",
              operation: "executeCommand",
              metadata: { executionId, nodeId, command },
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

        logger.info("Command execution request accepted", {
          component: "CommandsRouter",
          integration: "bolt",
          operation: "executeCommand",
          metadata: { executionId, nodeId, command, duration },
        });

        // Return execution ID immediately
        const responseData = {
          executionId,
          status: "running",
          message: "Command execution started",
        };

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.setIntegration(debugInfo, "bolt");
          expertModeService.addMetadata(debugInfo, "executionId", executionId);
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "command", command);
          expertModeService.addInfo(debugInfo, {
            message: "Command execution started via capability system",
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
          logger.warn("Request validation failed", {
            component: "CommandsRouter",
            integration: "bolt",
            operation: "executeCommand",
            metadata: { errors: error.errors },
          });

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

          const errorResponse = createErrorResponse(
            "INVALID_REQUEST",
            "Request validation failed",
            error.errors
          );

          res.status(400).json(
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
          "Failed to process command execution request"
        );

        res.status(500).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );
      }
    })
  );

  return router;
}
