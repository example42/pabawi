import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { BoltService } from '../bolt/BoltService';
import {
  BoltInventoryNotFoundError,
  BoltExecutionError,
  BoltParseError,
} from '../bolt/types';

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
});

/**
 * Create inventory router
 */
export function createInventoryRouter(boltService: BoltService): Router {
  const router = Router();

  /**
   * GET /api/inventory
   * Return all nodes from Bolt inventory
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const nodes = await boltService.getInventory();
      res.json({ nodes });
    } catch (error) {
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
      console.error('Error fetching inventory:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch inventory',
        },
      });
    }
  });

  /**
   * GET /api/nodes/:id
   * Return specific node details
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      // Validate request parameters
      const params = NodeIdParamSchema.parse(req.params);
      const nodeId = params.id;

      // Get all nodes from inventory
      const nodes = await boltService.getInventory();

      // Find the specific node
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

      res.json({ node });
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

      // Unknown error
      console.error('Error fetching node details:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch node details',
        },
      });
    }
  });

  return router;
}
