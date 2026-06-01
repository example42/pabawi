import type { Request, Response, NextFunction } from "express";
import { recordRequestStart, recordRequestFinish } from "../utils/crashHandler";

/**
 * Records every request into the crash-handler ring buffer so a fatal exit
 * produces a dump containing the last N requests + anything still in flight.
 *
 * Only method + path + requestId + (post-auth) userId are stored. Query strings,
 * headers, and bodies are intentionally excluded — query strings can contain
 * SSE tickets and auth tokens.
 *
 * Must be registered AFTER requestIdMiddleware so req.id is populated.
 */
export function requestRecorderMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const key = recordRequestStart({
    ts: new Date(start).toISOString(),
    requestId: req.id,
    method: req.method,
    path: req.path,
  });

  let recorded = false;
  const finish = (): void => {
    if (recorded) return;
    recorded = true;
    recordRequestFinish(key, res.statusCode, Date.now() - start, req.user?.userId);
  };

  res.once("finish", finish);
  res.once("close", finish);

  next();
}
