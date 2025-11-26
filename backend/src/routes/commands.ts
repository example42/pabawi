import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../bolt/BoltService";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import type { CommandWhitelistService } from "../validation/CommandWhitelistService";
import { CommandNotAllowedError } from "../validation/CommandWhitelistService";
import { BoltInventoryNotFoundError } from "../bolt/types";
import { asyncHandler } from "./asyncHandler";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

const CommandExecutionBodySchema = z.object({
  command: z.string().min(1, "Command is required"),
  expertMode: z.boolean().optional(),
});

/**
 * Create commands router
 */
export function createCommandsRouter(
  boltService: BoltService,
  executionRepository: ExecutionRepository,
  commandWhitelistService: CommandWhitelistService,
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();

  /**
   * POST /api/nodes/:id/command
   * Execute command on a node
   */
  router.post(
    "/:id/command",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters and body
        const params = NodeIdParamSchema.parse(req.params);
        const body = CommandExecutionBodySchema.parse(req.body);
        const nodeId = params.id;
        const command = body.command;
        const expertMode = body.expertMode ?? false;

        // Verify node exists in inventory
        const nodes = await boltService.getInventory();
        const node = nodes.find((n) => n.id === nodeId || n.name === nodeId);

        if (!node) {
          res.status(404).json({
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          });
          return;
        }

        // Validate command against whitelist
        try {
          commandWhitelistService.validateCommand(command);
        } catch (error) {
          if (error instanceof CommandNotAllowedError) {
            res.status(403).json({
              error: {
                code: "COMMAND_NOT_ALLOWED",
                message: error.message,
                details: error.reason,
              },
            });
            return;
          }
          throw error;
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

        // Execute command asynchronously
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

            const result = await boltService.runCommand(
              nodeId,
              command,
              streamingCallback,
            );

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
            console.error("Error executing command:", error);

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

        // Return execution ID and initial status immediately
        res.status(202).json({
          executionId,
          status: "running",
          message: "Command execution started",
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
        console.error("Error processing command execution request:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process command execution request",
          },
        });
      }
    }),
  );

  return router;
}
