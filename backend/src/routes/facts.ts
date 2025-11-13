import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { BoltService } from '../bolt/BoltService';
import {
  BoltNodeUnreachableError,
  BoltExecutionError,
  BoltParseError,
  BoltInventoryNotFoundError,
} from '../bolt/types';

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
});

/**
 * Create facts router
 */
export function createFactsRouter(boltService: BoltService): Router {
  const router = Router();

  /**
   * POST /api/nodes/:id/facts
   * Trigger facts gathering for a node
   */
  router.post('/:id/facts', async (req: Request, res: Response) => {
    try {
      // Validate request parameters
      const params = NodeIdParamSchema.parse(req.params);
      const nodeId = params.id;

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

      // Gather facts from the node
      const facts = await boltService.gatherFacts(nodeId);

      res.json({ facts });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid node ID parameter',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof BoltNodeUnreachableError) {
        res.status(503).json({
          error: {
            code: 'NODE_UNREACHABLE',
            message: error.message,
            details: error.details,
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

      if (error instanceof BoltExecutionError) {
        res.status(500).json({
          error: {
            code: 'BOLT_EXECUTION_FAILED',
            message: error.message,
            details: error.stderr,
          },
        });
        return;
      }

      if (error instanceof BoltParseError) {
        res.status(500).json({
          error: {
            code: 'BOLT_PARSE_ERROR',
            message: error.message,
          },
        });
        return;
      }

      // Unknown error
      console.error('Error gathering facts:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to gather facts',
        },
      });
    }
  });

  return router;
}
