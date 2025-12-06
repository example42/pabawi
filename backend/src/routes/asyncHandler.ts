import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wrapper for async Express route handlers to properly handle promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
