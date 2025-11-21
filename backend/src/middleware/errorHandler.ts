import type { Request, Response, NextFunction } from "express";
import { ErrorHandlingService, type ExecutionContext } from "../errors";

// Extend Express Request to include custom properties
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      boltCommand?: string;
    }
  }
}

/**
 * Global error handling middleware with expert mode support
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const errorService = new ErrorHandlingService();

  // Check if expert mode is enabled via header
  const expertMode = req.headers["x-expert-mode"] === "true";

  // Generate or use existing request ID
  const requestId = req.id ?? errorService.generateRequestId();

  // Build execution context
  const context: ExecutionContext = {
    requestId,
    timestamp: new Date().toISOString(),
    endpoint: req.path,
    method: req.method,
    nodeId: req.params.id || req.params.nodeId,
    boltCommand: req.boltCommand,
  };

  // Log the error with full context
  errorService.logError(err, context);

  // Format error response based on expert mode
  const errorResponse = errorService.formatError(err, expertMode, context);

  // Sanitize sensitive data even in expert mode
  if (expertMode && errorResponse.error.rawResponse) {
    errorResponse.error.rawResponse = errorService.sanitizeSensitiveData(
      errorResponse.error.rawResponse,
    );
  }

  // Determine HTTP status code
  const statusCode = getStatusCode(err);

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Determine HTTP status code from error
 */
function getStatusCode(error: Error): number {
  // Check for custom statusCode property
  if (
    "statusCode" in error &&
    typeof (error as Error & { statusCode?: number }).statusCode === "number"
  ) {
    return (error as Error & { statusCode: number }).statusCode;
  }

  // Map error types to status codes
  const errorName = error.name;
  switch (errorName) {
    case "ValidationError":
    case "ZodError":
    case "BoltTaskParameterError":
      return 400; // Bad Request

    case "BoltInventoryNotFoundError":
    case "BoltTaskNotFoundError":
      return 404; // Not Found

    case "BoltTimeoutError":
      return 504; // Gateway Timeout

    case "BoltNodeUnreachableError":
      return 503; // Service Unavailable

    case "BoltExecutionError":
    case "BoltParseError":
      return 500; // Internal Server Error

    default:
      return 500; // Internal Server Error
  }
}

/**
 * Request ID middleware - adds unique ID to each request
 */
export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const errorService = new ErrorHandlingService();
  req.id = errorService.generateRequestId();
  next();
}
