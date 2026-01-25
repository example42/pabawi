/**
 * Debug Routes
 *
 * Endpoints for receiving and managing frontend debug logs
 * when expert mode is enabled.
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from './asyncHandler';
import { LoggerService } from '../services/LoggerService';

export interface FrontendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  stackTrace?: string;
}

export interface FrontendLogBatch {
  logs: FrontendLogEntry[];
  browserInfo?: {
    userAgent: string;
    language: string;
    platform: string;
    viewport: { width: number; height: number };
    url: string;
  };
}

/**
 * In-memory storage for frontend logs
 * Key: correlationId, Value: array of log entries
 */
const frontendLogStore = new Map<string, FrontendLogEntry[]>();

// Maximum number of correlation IDs to store
const MAX_CORRELATION_IDS = 100;

// Maximum age of logs in milliseconds (5 minutes)
const MAX_LOG_AGE = 5 * 60 * 1000;

/**
 * Clean up old logs periodically
 */
function cleanupOldLogs(): void {
  const now = Date.now();
  const idsToDelete: string[] = [];

  for (const [correlationId, logs] of frontendLogStore.entries()) {
    if (logs.length === 0) {
      idsToDelete.push(correlationId);
      continue;
    }

    // Check if oldest log is too old
    const oldestLog = logs[0];
    const logAge = now - new Date(oldestLog.timestamp).getTime();

    if (logAge > MAX_LOG_AGE) {
      idsToDelete.push(correlationId);
    }
  }

  for (const id of idsToDelete) {
    frontendLogStore.delete(id);
  }

  // If still too many, remove oldest
  if (frontendLogStore.size > MAX_CORRELATION_IDS) {
    const sortedIds = Array.from(frontendLogStore.entries())
      .sort((a, b) => {
        const aTime = new Date(a[1][0]?.timestamp || 0).getTime();
        const bTime = new Date(b[1][0]?.timestamp || 0).getTime();
        return aTime - bTime;
      })
      .map(([id]) => id);

    const toRemove = sortedIds.slice(0, frontendLogStore.size - MAX_CORRELATION_IDS);
    for (const id of toRemove) {
      frontendLogStore.delete(id);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupOldLogs, 60 * 1000);

/**
 * Create debug router
 */
export function createDebugRouter(): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * POST /api/debug/frontend-logs
   * Receive batch of frontend logs
   */
  router.post(
    '/frontend-logs',
    asyncHandler((req: Request, res: Response): void => {
      const startTime = Date.now();

      logger.info('Receiving frontend logs', {
        component: 'DebugRouter',
        operation: 'receiveFrontendLogs',
      });

      const batch = req.body as FrontendLogBatch;

      if (!Array.isArray(batch.logs)) {
        logger.warn('Invalid frontend log batch', {
          component: 'DebugRouter',
          operation: 'receiveFrontendLogs',
        });
        res.status(400).json({
          error: {
            code: 'INVALID_LOG_BATCH',
            message: 'Invalid log batch format',
          },
        });
        return;
      }

      // Store logs by correlation ID
      for (const log of batch.logs) {
        const correlationId = log.correlationId ?? 'unknown';

        if (!frontendLogStore.has(correlationId)) {
          frontendLogStore.set(correlationId, []);
        }

        const logs = frontendLogStore.get(correlationId);
        if (logs) {
          logs.push(log);
        }

        // Also log to backend logger for unified logging
        const logMethod = log.level === 'error' ? 'error'
          : log.level === 'warn' ? 'warn'
          : log.level === 'debug' ? 'debug'
          : 'info';

        logger[logMethod](`[Frontend] ${log.message}`, {
          component: `Frontend:${log.component}`,
          operation: log.operation,
          metadata: {
            ...log.metadata,
            correlationId: log.correlationId,
            timestamp: log.timestamp,
          },
        });
      }

      const duration = Date.now() - startTime;

      logger.info('Frontend logs received successfully', {
        component: 'DebugRouter',
        operation: 'receiveFrontendLogs',
        metadata: {
          logCount: batch.logs.length,
          duration,
          browserInfo: batch.browserInfo,
        },
      });

      res.json({
        success: true,
        received: batch.logs.length,
      });
    })
  );

  /**
   * GET /api/debug/frontend-logs/:correlationId
   * Retrieve frontend logs for a specific correlation ID
   */
  router.get(
    '/frontend-logs/:correlationId',
    asyncHandler((req: Request, res: Response): void => {
      const { correlationId } = req.params;

      logger.debug('Retrieving frontend logs', {
        component: 'DebugRouter',
        operation: 'getFrontendLogs',
        metadata: { correlationId },
      });

      const logs = frontendLogStore.get(correlationId) ?? [];

      res.json({
        correlationId,
        logs,
        count: logs.length,
      });
    })
  );

  /**
   * GET /api/debug/frontend-logs
   * Retrieve all stored correlation IDs
   */
  router.get(
    '/frontend-logs',
    asyncHandler((_req: Request, res: Response): void => {
      logger.debug('Retrieving all correlation IDs', {
        component: 'DebugRouter',
        operation: 'getAllCorrelationIds',
      });

      const correlationIds = Array.from(frontendLogStore.keys()).map(id => {
        const logs = frontendLogStore.get(id);
        return {
          correlationId: id,
          logCount: logs?.length ?? 0,
          firstLog: logs?.[0]?.timestamp,
          lastLog: logs?.[logs.length - 1]?.timestamp,
        };
      });

      res.json({
        correlationIds,
        total: correlationIds.length,
      });
    })
  );

  /**
   * DELETE /api/debug/frontend-logs/:correlationId
   * Clear logs for a specific correlation ID
   */
  router.delete(
    '/frontend-logs/:correlationId',
    asyncHandler((req: Request, res: Response): void => {
      const { correlationId } = req.params;

      logger.info('Clearing frontend logs', {
        component: 'DebugRouter',
        operation: 'clearFrontendLogs',
        metadata: { correlationId },
      });

      const existed = frontendLogStore.has(correlationId);
      frontendLogStore.delete(correlationId);

      res.json({
        success: true,
        existed,
      });
    })
  );

  /**
   * DELETE /api/debug/frontend-logs
   * Clear all frontend logs
   */
  router.delete(
    '/frontend-logs',
    asyncHandler((_req: Request, res: Response): void => {
      logger.info('Clearing all frontend logs', {
        component: 'DebugRouter',
        operation: 'clearAllFrontendLogs',
      });

      const count = frontendLogStore.size;
      frontendLogStore.clear();

      res.json({
        success: true,
        cleared: count,
      });
    })
  );

  return router;
}

/**
 * Get frontend logs for a correlation ID (used by other routes)
 */
export function getFrontendLogs(correlationId: string): FrontendLogEntry[] {
  return frontendLogStore.get(correlationId) ?? [];
}
