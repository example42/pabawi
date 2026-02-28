/**
 * Error Handling Utilities
 *
 * Consolidates duplicate error handling patterns across the codebase.
 * Provides consistent error formatting and response generation.
 */

import type { Response } from "express";
import { ZodError } from "zod";
import { LoggerService } from "../services/LoggerService";

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Error codes for different error types
 */
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // Bolt errors
  BOLT_EXECUTION_FAILED: "BOLT_EXECUTION_FAILED",
  BOLT_PARSE_ERROR: "BOLT_PARSE_ERROR",

  // PuppetDB errors
  PUPPETDB_CONNECTION_ERROR: "PUPPETDB_CONNECTION_ERROR",
  PUPPETDB_QUERY_ERROR: "PUPPETDB_QUERY_ERROR",

  // Puppetserver errors
  PUPPETSERVER_CONNECTION_ERROR: "PUPPETSERVER_CONNECTION_ERROR",
  PUPPETSERVER_COMPILATION_ERROR: "PUPPETSERVER_COMPILATION_ERROR",

  // Hiera errors
  HIERA_PARSE_ERROR: "HIERA_PARSE_ERROR",
  HIERA_RESOLUTION_ERROR: "HIERA_RESOLUTION_ERROR",
  HIERA_ANALYSIS_ERROR: "HIERA_ANALYSIS_ERROR",

  // Authentication errors (Requirement 16.1)
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  INVALID_TOKEN: "INVALID_TOKEN",

  // Authorization errors (Requirement 16.2)
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",

  // Validation errors (Requirement 16.3)
  INVALID_INPUT: "INVALID_INPUT",
  PASSWORD_COMPLEXITY_ERROR: "PASSWORD_COMPLEXITY_ERROR",  // pragma: allowlist secret

  // Conflict errors (Requirement 16.4)
  DUPLICATE_USERNAME: "DUPLICATE_USERNAME",
  DUPLICATE_EMAIL: "DUPLICATE_EMAIL",

  // Database errors (Requirement 16.5)
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_CONNECTION_ERROR: "DATABASE_CONNECTION_ERROR",

  // Generic errors
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
} as const;

/**
 * Format error message from unknown error type
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if error is a Zod validation error
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Format Zod validation errors
 */
export function formatZodErrors(error: ZodError): unknown {
  return error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
  }));
}

/**
 * Send validation error response
 */
export function sendValidationError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Validation failed",
      details: formatZodErrors(error),
    },
  });
}

/**
 * Send error response with appropriate status code and formatting
 */
export function sendErrorResponse(
  res: Response,
  error: unknown,
  defaultCode: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
  defaultStatus = 500
): void {
  // Handle Zod validation errors
  if (isZodError(error)) {
    sendValidationError(res, error);
    return;
  }

  // Handle known error types with custom codes
  const errorMessage = formatErrorMessage(error);

  res.status(defaultStatus).json({
    error: {
      code: defaultCode,
      message: errorMessage,
    },
  });
}

/**
 * Log and send error response
 */
export function logAndSendError(
  res: Response,
  error: unknown,
  context: string,
  defaultCode: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
  defaultStatus = 500
): void {
  const logger = new LoggerService();
  logger.error(context, {
    component: "ErrorHandling",
    operation: "logAndSendError",
    metadata: { context, defaultCode, defaultStatus },
  }, error instanceof Error ? error : undefined);
  sendErrorResponse(res, error, defaultCode, defaultStatus);
}

/**
 * Handle async route errors with consistent error handling
 */
export function asyncHandler(
  fn: (req: unknown, res: Response, next: unknown) => Promise<void>
) {
  return (req: unknown, res: Response, next: unknown): void => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      logAndSendError(res, error, "Async handler error");
    });
  };
}

/**
 * Create error response object without sending
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown
): ErrorResponse {
  const error: { code: string; message: string; details?: unknown } = {
    code,
    message,
  };
  if (details !== undefined) {
    error.details = details;
  }
  return { error };
}

/**
 * Send authentication error response (Requirement 16.1)
 * Returns generic error message to prevent username enumeration
 */
export function sendAuthenticationError(
  res: Response,
  message: string = "Invalid credentials"
): void {
  res.status(401).json({
    error: {
      code: ERROR_CODES.AUTHENTICATION_FAILED,
      message,
    },
  });
}

/**
 * Send authorization error response (Requirement 16.2)
 * Returns 403 with required permission information
 */
export function sendAuthorizationError(
  res: Response,
  resource: string,
  action: string,
  message: string = "Insufficient permissions to perform this action"
): void {
  res.status(403).json({
    error: {
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message,
      required: {
        resource,
        action,
      },
    },
  });
}

/**
 * Send input validation error response (Requirement 16.3)
 * Returns 400 with detailed validation errors
 */
export function sendInputValidationError(
  res: Response,
  message: string,
  details?: unknown
): void {
  res.status(400).json({
    error: {
      code: ERROR_CODES.INVALID_INPUT,
      message,
      details,
    },
  });
}

/**
 * Send duplicate resource error response (Requirement 16.4)
 * Returns 409 for duplicate username/email
 */
export function sendDuplicateError(
  res: Response,
  field: "username" | "email",
  value?: string
): void {
  const code = field === "username" ? ERROR_CODES.DUPLICATE_USERNAME : ERROR_CODES.DUPLICATE_EMAIL;
  const message = value
    ? `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`
    : `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;

  res.status(409).json({
    error: {
      code,
      message,
      field,
    },
  });
}

/**
 * Send database error response (Requirement 16.5, 16.6)
 * Returns 503 for database connection failures
 */
export function sendDatabaseError(
  res: Response,
  error: unknown,
  message: string = "Database service temporarily unavailable"
): void {
  const logger = new LoggerService();
  logger.error("Database error", {
    component: "ErrorHandling",
    operation: "sendDatabaseError",
  }, error instanceof Error ? error : undefined);

  res.status(503).json({
    error: {
      code: ERROR_CODES.DATABASE_CONNECTION_ERROR,
      message,
    },
  });
}

/**
 * Check if error is a database connection error
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Only treat as connection error if it's a genuine connection/file access issue
  return (
    message.includes("unable to open database") ||
    message.includes("database is locked") ||
    message.includes("disk i/o error") ||
    message.includes("database disk image is malformed") ||
    (message.includes("enoent") && message.includes("database")) ||
    message.includes("sqlite_cantopen")
  );
}

/**
 * Check if error is a duplicate constraint violation
 */
export function isDuplicateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint") ||
    message.includes("duplicate") ||
    message.includes("already exists")
  );
}

/**
 * Extract field name from duplicate error message
 */
export function extractDuplicateField(error: Error): "username" | "email" | null {
  const message = error.message.toLowerCase();

  if (message.includes("username")) return "username";
  if (message.includes("email")) return "email";

  return null;
}
