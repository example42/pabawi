import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { BoltService } from '../bolt/BoltService';
import { ExecutionRepository } from '../database/ExecutionRepository';
import { CommandWhitelistService, CommandNotAllowedError } from '../validation/CommandWhitelistService';
import {
  BoltNodeUnreachableError,
  BoltExecutionError,
  BoltParseError,
  BoltInventoryNotFoundError,
  BoltTimeoutError,
} from '../bolt/types';

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
});

const CommandExecutionBodySchema = z.object({
  command: z.string().min(1, 'Command is required'),
});

/**
 * Create commands router
 */
export function createCommandsRouter(
  boltService: BoltService,
  executionRepository: ExecutionRepository,
  commandWhitelistService: CommandWhitelistService
): Router {
  const router = Router();

  /**
   * POST /api/nodes/:id/command
   * Execute command on a node
   */
  router.post('/:id/command', async (req: Request, res: Response) => {
    try {
      // Validate request parameters and body
      const params = NodeIdParamSchema.parse(req.params);
      const body = CommandExecutionBodySchema.parse(req.body);
      const nodeId = params.id;
      const command = body.command;

      // Verify node exists in inventory
      const nodes = await boltService.getInventory();
      const node = nodes.find((n) => n.id === nodeId || n.name === nodeId);

      if (!node) {
        res.status(404).json({
          error: {
            code: 'INVALID_NODE_ID',
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
              code: 'COMMAND_NOT_ALLOWED',
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
        type: 'command',
        targetNodes: [nodeId],
        action: command,
        status: 'running',
        startedAt: new Date().toISOString(),
        results: [],
      });

      // Execute command asynchronously
      // We don't await here to return immediately with execution ID
      void (async () => {
        try {
          const result = await boltService.runCommand(nodeId, command);
          
          // Update execution record with results
          await executionRepository.update(executionId, {
            status: result.status,
            completedAt: result.completedAt,
            results: result.results,
            error: result.error,
          });
        } catch (error) {
          console.error('Error executing command:', error);
          
          // Update execution record with error
          await executionRepository.update(executionId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            results: [{
              nodeId,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              duration: 0,
            }],
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      // Return execution ID and initial status immediately
      res.status(202).json({
        executionId,
        status: 'running',
        message: 'Command execution started',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request validation failed',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof BoltInventoryNotFoundError) {
        res.status(404).json({
          error: {
            code: 'BOLT_CONFIG_MISSING',
            message: error.message,
          },
        });
        return;
      }

      // Unknown error
      console.error('Error processing command execution request:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process command execution request',
        },
      });
    }
  });

  return router;
}
