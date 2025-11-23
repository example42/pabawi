import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { ExecutionRepository} from '../database/ExecutionRepository';
import { type ExecutionFilters } from '../database/ExecutionRepository';
import type { ExecutionQueue } from '../services/ExecutionQueue';
import { asyncHandler } from './asyncHandler';

/**
 * Request validation schemas
 */
const ExecutionIdParamSchema = z.object({
  id: z.string().min(1, 'Execution ID is required'),
});

const ExecutionFiltersQuerySchema = z.object({
  type: z.enum(['command', 'task', 'facts', 'puppet', 'package']).optional(),
  status: z.enum(['running', 'success', 'failed', 'partial']).optional(),
  targetNode: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * Create executions router
 */
export function createExecutionsRouter(
  executionRepository: ExecutionRepository,
  executionQueue?: ExecutionQueue
): Router {
  const router = Router();

  /**
   * GET /api/executions
   * Return paginated execution list with filters
   */
  router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate and parse query parameters
      const query = ExecutionFiltersQuerySchema.parse(req.query);

      // Build filters
      const filters: ExecutionFilters = {
        type: query.type,
        status: query.status,
        targetNode: query.targetNode,
        startDate: query.startDate,
        endDate: query.endDate,
      };

      // Get executions with pagination
      const executions = await executionRepository.findAll(filters, {
        page: query.page,
        pageSize: query.pageSize,
      });

      // Get status counts for summary
      const statusCounts = await executionRepository.countByStatus();

      res.json({
        executions,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          hasMore: executions.length === query.pageSize,
        },
        summary: statusCounts,
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

      // Unknown error
      console.error('Error fetching executions:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch executions',
        },
      });
    }
  }));

  /**
   * GET /api/executions/:id
   * Return detailed execution results
   */
  router.get('/:id', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request parameters
      const params = ExecutionIdParamSchema.parse(req.params);
      const executionId = params.id;

      // Get execution by ID
      const execution = await executionRepository.findById(executionId);

      if (!execution) {
        res.status(404).json({
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: `Execution '${executionId}' not found`,
          },
        });
        return;
      }

      res.json({ execution });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid execution ID parameter',
            details: error.errors,
          },
        });
        return;
      }

      // Unknown error
      console.error('Error fetching execution details:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch execution details',
        },
      });
    }
  }));

  /**
   * GET /api/executions/queue/status
   * Return current execution queue status
   */
  router.get('/queue/status', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!executionQueue) {
      res.status(503).json({
        error: {
          code: 'QUEUE_NOT_AVAILABLE',
          message: 'Execution queue is not configured',
        },
      });
      return;
    }

    try {
      const status = executionQueue.getStatus();
      res.json({
        queue: {
          running: status.running,
          queued: status.queued,
          limit: status.limit,
          available: status.limit - status.running,
          queuedExecutions: status.queue.map(exec => ({
            id: exec.id,
            type: exec.type,
            nodeId: exec.nodeId,
            action: exec.action,
            enqueuedAt: exec.enqueuedAt.toISOString(),
            waitTime: Date.now() - exec.enqueuedAt.getTime(),
          })),
        },
      });
    } catch (error) {
      console.error('Error fetching queue status:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch queue status',
        },
      });
    }
  }));

  return router;
}
