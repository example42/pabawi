/**
 * Logs Routes
 *
 * Admin-only endpoint for querying the in-memory log ring buffer.
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler } from "./asyncHandler";
import type { DIContainer } from "../container/DIContainer";

/**
 * Create logs router (admin-only)
 */
export function createLogsRouter(container: DIContainer): Router {
  const router = Router();
  const logger = container.resolve("logger");

  /**
   * GET /api/logs
   *
   * Query params:
   *   level      — max level to include (error|warn|info|debug). Default: debug (all)
   *   component  — substring filter on component name
   *   integration — filter by integration name
   *   since      — ISO timestamp; return only entries newer than this
   *   limit      — max entries to return (default 200, max 1000)
   */
  router.get(
    "/",
    asyncHandler((_req: Request, res: Response): void => {
      const logBuffer = logger.getLogBuffer();
      if (!logBuffer) {
        res.json({ entries: [], total: 0, bufferSize: 0 });
        return;
      }

      const level = _req.query.level as string | undefined;
      const component = _req.query.component as string | undefined;
      const integration = _req.query.integration as string | undefined;
      const since = _req.query.since as string | undefined;
      const rawLimit = parseInt(_req.query.limit as string, 10);
      const limit = Math.min(isNaN(rawLimit) ? 200 : rawLimit, 1000);

      const validLevels = ['error', 'warn', 'info', 'debug'];
      const queryLevel = level && validLevels.includes(level)
        ? level as 'error' | 'warn' | 'info' | 'debug'
        : undefined;

      const entries = logBuffer.query({
        level: queryLevel,
        component,
        integration,
        since,
        limit,
      });

      res.json({
        entries,
        total: entries.length,
        bufferSize: logBuffer.size,
      });
    }),
  );

  /**
   * DELETE /api/logs
   * Clear the in-memory log buffer.
   */
  router.delete(
    "/",
    asyncHandler((_req: Request, res: Response): void => {
      const logBuffer = logger.getLogBuffer();
      if (logBuffer) {
        logBuffer.clear();
      }
      res.json({ success: true });
    }),
  );

  return router;
}
