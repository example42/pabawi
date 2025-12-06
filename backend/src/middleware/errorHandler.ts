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

  // In development, also log to console for easier debugging
  if (process.env.NODE_ENV === "development") {
    console.error("\n=== Error Details for Developers ===");
    console.error(`Type: ${errorResponse.error.type}`);
    console.error(`Code: ${errorResponse.error.code}`);
    console.error(`Message: ${errorResponse.error.message}`);
    console.error(`Actionable: ${errorResponse.error.actionableMessage}`);
    if (errorResponse.error.troubleshooting) {
      console.error("\nTroubleshooting Steps:");
      errorResponse.error.troubleshooting.steps.forEach((step, i) => {
        console.error(`  ${i + 1}. ${step}`);
      });
    }
    console.error("====================================\n");
  }

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
    // Validation errors - 400
    case "ValidationError":
    case "ZodError":
    case "BoltTaskParameterError":
    case "PuppetserverValidationError":
      return 400; // Bad Request

    // Authentication errors - 401
    case "PuppetserverAuthenticationError":
      return 401; // Unauthorized

    // Not found errors - 404
    case "BoltInventoryNotFoundError":
    case "BoltTaskNotFoundError":
      return 404; // Not Found

    // Timeout errors - 504
    case "BoltTimeoutError":
    case "PuppetserverTimeoutError":
      return 504; // Gateway Timeout

    // Service unavailable - 503
    case "BoltNodeUnreachableError":
    case "PuppetserverConnectionError":
      return 503; // Service Unavailable

    // Execution/compilation errors - 500
    case "BoltExecutionError":
    case "BoltParseError":
    case "CertificateOperationError":
    case "CatalogCompilationError":
    case "EnvironmentDeploymentError":
    case "PuppetserverError":
      return 500; // Internal Server Error

    // Configuration errors - 500
    case "PuppetserverConfigurationError":
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
