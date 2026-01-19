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

  // Generic errors
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
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
  defaultStatus: number = 500
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
  defaultStatus: number = 500
): void {
  const logger = new LoggerService();
  logger.error(`${context}`, {
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
