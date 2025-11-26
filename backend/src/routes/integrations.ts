import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PuppetDBService } from '../integrations/puppetdb/PuppetDBService';
import {
  PuppetDBConnectionError,
  PuppetDBQueryError,
  PuppetDBAuthenticationError,
} from '../integrations/puppetdb';
import { asyncHandler } from './asyncHandler';

/**
 * Request validation schemas
 */
const CertnameParamSchema = z.object({
  certname: z.string().min(1, 'Certname is required'),
});

const PQLQuerySchema = z.object({
  query: z.string().optional(),
});

/**
 * Create integrations router
 */
export function createIntegrationsRouter(puppetDBService?: PuppetDBService): Router {
  const router = Router();

  /**
   * GET /api/integrations/puppetdb/nodes
   * Return all nodes from PuppetDB inventory
   */
  router.get('/puppetdb/nodes', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!puppetDBService) {
      res.status(503).json({
        error: {
          code: 'PUPPETDB_NOT_CONFIGURED',
          message: 'PuppetDB integration is not configured',
        },
      });
      return;
    }

    if (!puppetDBService.isInitialized()) {
      res.status(503).json({
        error: {
          code: 'PUPPETDB_NOT_INITIALIZED',
          message: 'PuppetDB integration is not initialized',
        },
      });
      return;
    }

    try {
      // Validate query parameters
      const queryParams = PQLQuerySchema.parse(req.query);
      const pqlQuery = queryParams.query;

      // Get inventory from PuppetDB
      const nodes = await puppetDBService.getInventory(pqlQuery);

      res.json({
        nodes,
        source: 'puppetdb',
        count: nodes.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof PuppetDBAuthenticationError) {
        res.status(401).json({
          error: {
            code: 'PUPPETDB_AUTH_ERROR',
            message: error.message,
          },
        });
        return;
      }

      if (error instanceof PuppetDBConnectionError) {
        res.status(503).json({
          error: {
            code: 'PUPPETDB_CONNECTION_ERROR',
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      if (error instanceof PuppetDBQueryError) {
        res.status(400).json({
          error: {
            code: 'PUPPETDB_QUERY_ERROR',
            message: error.message,
            query: error.query,
          },
        });
        return;
      }

      // Unknown error
      console.error('Error fetching PuppetDB inventory:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch inventory from PuppetDB',
        },
      });
    }
  }));

  /**
   * GET /api/integrations/puppetdb/nodes/:certname
   * Return specific node details from PuppetDB
   */
  router.get('/puppetdb/nodes/:certname', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!puppetDBService) {
      res.status(503).json({
        error: {
          code: 'PUPPETDB_NOT_CONFIGURED',
          message: 'PuppetDB integration is not configured',
        },
      });
      return;
    }

    if (!puppetDBService.isInitialized()) {
      res.status(503).json({
        error: {
          code: 'PUPPETDB_NOT_INITIALIZED',
          message: 'PuppetDB integration is not initialized',
        },
      });
      return;
    }

    try {
      // Validate request parameters
      const params = CertnameParamSchema.parse(req.params);
      const certname = params.certname;

      // Get all nodes from inventory
      const nodes = await puppetDBService.getInventory();

      // Find the specific node
      const node = nodes.find((n) => n.id === certname || n.name === certname);

      if (!node) {
        res.status(404).json({
          error: {
            code: 'NODE_NOT_FOUND',
            message: `Node '${certname}' not found in PuppetDB`,
          },
        });
        return;
      }

      res.json({
        node,
        source: 'puppetdb',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid certname parameter',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof PuppetDBAuthenticationError) {
        res.status(401).json({
          error: {
            code: 'PUPPETDB_AUTH_ERROR',
            message: error.message,
          },
        });
        return;
      }

      if (error instanceof PuppetDBConnectionError) {
        res.status(503).json({
          error: {
            code: 'PUPPETDB_CONNECTION_ERROR',
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      // Unknown error
      console.error('Error fetching node details from PuppetDB:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch node details from PuppetDB',
        },
      });
    }
  }));

  return router;
}
