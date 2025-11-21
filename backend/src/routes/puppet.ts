import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../bolt/BoltService";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import { BoltInventoryNotFoundError } from "../bolt/types";
import { asyncHandler } from "./asyncHandler";

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

const PuppetRunBodySchema = z.object({
  tags: z.array(z.string()).optional(),
  environment: z.string().optional(),
  noop: z.boolean().optional(),
  noNoop: z.boolean().optional(),
  debug: z.boolean().optional(),
});

/**
 * Create Puppet router
 */
export function createPuppetRouter(
  boltService: BoltService,
  executionRepository: ExecutionRepository,
): Router {
  const router = Router();

  /**
   * POST /api/nodes/:id/puppet-run
   * Execute Puppet run on a node
   */
  router.post(
    "/:id/puppet-run",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      try {
        // Validate request parameters and body
        const params = NodeIdParamSchema.parse(req.params);
        const body = PuppetRunBodySchema.parse(req.body);
        const nodeId = params.id;

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

        // Build Puppet run configuration
        const config = {
          tags: body.tags,
          environment: body.environment,
          noop: body.noop,
          noNoop: body.noNoop,
          debug: body.debug,
        };

        // Create initial execution record
        const executionId = await executionRepository.create({
          type: "task",
          targetNodes: [nodeId],
          action: "psick::puppet_agent",
          parameters: config,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
        });

        // Execute Puppet run asynchronously
        // We don't await here to return immediately with execution ID
        void (async (): Promise<void> => {
          try {
            const result = await boltService.runPuppetAgent(nodeId, config);

            // Update execution record with results
            await executionRepository.update(executionId, {
              status: result.status,
              completedAt: result.completedAt,
              results: result.results,
              error: result.error,
              command: result.command,
            });
          } catch (error) {
            console.error("Error executing Puppet run:", error);

            // Update execution record with error
            await executionRepository.update(executionId, {
              status: "failed",
              completedAt: new Date().toISOString(),
              results: [
                {
                  nodeId,
                  status: "failed",
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  duration: 0,
                },
              ],
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })();

        // Return execution ID and initial status immediately
        res.status(202).json({
          executionId,
          status: "running",
          message: "Puppet run started",
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
        console.error("Error processing Puppet run request:", error);
        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process Puppet run request",
          },
        });
      }
    }),
  );

  return router;
}
