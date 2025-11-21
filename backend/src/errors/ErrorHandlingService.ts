import { randomUUID } from "crypto";

/**
 * Execution context for error tracking
 */
export interface ExecutionContext {
  requestId: string;
  timestamp: string;
  endpoint: string;
  method: string;
  userId?: string;
  nodeId?: string;
  boltCommand?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Detailed error response for expert mode
 */
export interface DetailedErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  stackTrace?: string;
  requestId?: string;
  timestamp?: string;
  rawResponse?: unknown;
  executionContext?: ExecutionContext;
  boltCommand?: string;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: DetailedErrorResponse;
}

/**
 * Service for formatting errors with expert mode support
 */
export class ErrorHandlingService {
  /**
   * Generate a unique request ID for error correlation
   */
  public generateRequestId(): string {
    return randomUUID();
  }

  /**
   * Capture stack trace from an error
   */
  public captureStackTrace(error: Error): string {
    return error.stack ?? "No stack trace available";
  }

  /**
   * Format error with expert mode support
   *
   * @param error - The error to format
   * @param expertMode - Whether expert mode is enabled
   * @param context - Optional execution context
   * @returns Formatted error response
   */
  public formatError(
    error: Error,
    expertMode: boolean,
    context?: ExecutionContext,
  ): ErrorResponse {
    // Extract error code from error name or use generic code
    const code = this.extractErrorCode(error);

    // Build basic error response
    const errorResponse: DetailedErrorResponse = {
      code,
      message: error.message || "An unexpected error occurred",
    };

    // Add details if available
    if ("details" in error) {
      errorResponse.details = (error as Error & { details?: unknown }).details;
    }

    // Add expert mode fields if enabled
    if (expertMode) {
      errorResponse.stackTrace = this.captureStackTrace(error);

      if (context) {
        errorResponse.requestId = context.requestId;
        errorResponse.timestamp = context.timestamp;
        errorResponse.executionContext = context;

        // Include Bolt command if available
        if (context.boltCommand) {
          errorResponse.boltCommand = context.boltCommand;
        }
      }

      // Include raw Bolt output if available
      if ("stdout" in error || "stderr" in error) {
        errorResponse.rawResponse = {
          stdout: (error as Error & { stdout?: string }).stdout,
          stderr: (error as Error & { stderr?: string }).stderr,
          exitCode: (error as Error & { exitCode?: number }).exitCode,
        };
      }
    }

    return { error: errorResponse };
  }

  /**
   * Extract error code from error object
   */
  private extractErrorCode(error: Error): string {
    // Check for custom error code property
    if (
      "code" in error &&
      typeof (error as Error & { code?: string }).code === "string"
    ) {
      return (error as Error & { code: string }).code;
    }

    // Map error names to codes
    const errorName = error.name;
    switch (errorName) {
      case "BoltExecutionError":
        return "BOLT_EXECUTION_FAILED";
      case "BoltTimeoutError":
        return "BOLT_TIMEOUT";
      case "BoltParseError":
        return "BOLT_PARSE_ERROR";
      case "BoltInventoryNotFoundError":
        return "BOLT_CONFIG_MISSING";
      case "BoltNodeUnreachableError":
        return "NODE_UNREACHABLE";
      case "BoltTaskNotFoundError":
        return "INVALID_TASK_NAME";
      case "BoltTaskParameterError":
        return "INVALID_REQUEST";
      case "ValidationError":
        return "VALIDATION_ERROR";
      case "ZodError":
        return "INVALID_REQUEST";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }

  /**
   * Log error with full context
   *
   * @param error - The error to log
   * @param context - Execution context
   */
  public logError(error: Error, context: ExecutionContext): void {
    const timestamp = new Date().toISOString();
    console.error(
      `[${timestamp}] Error in ${context.method} ${context.endpoint}`,
    );
    console.error(`Request ID: ${context.requestId}`);
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack ?? "No stack trace"}`);

    if (context.nodeId) {
      console.error(`Node ID: ${context.nodeId}`);
    }

    if (context.boltCommand) {
      console.error(`Bolt Command: ${context.boltCommand}`);
    }

    if (context.additionalData) {
      console.error(
        `Additional Data: ${JSON.stringify(context.additionalData)}`,
      );
    }
  }

  /**
   * Sanitize sensitive data from error responses
   * Even in expert mode, we should not expose credentials or secrets
   *
   * @param data - Data to sanitize
   * @returns Sanitized data
   */
  public sanitizeSensitiveData(data: unknown): unknown {
    if (typeof data === "string") {
      // Redact common sensitive patterns
      return data
        .replace(/password[=:]\s*\S+/gi, "password=***")
        .replace(/token[=:]\s*\S+/gi, "token=***")
        .replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=***")
        .replace(/secret[=:]\s*\S+/gi, "secret=***");
    }

    if (typeof data === "object" && data !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("token") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("key")
        ) {
          sanitized[key] = "***";
        } else {
          sanitized[key] = this.sanitizeSensitiveData(value);
        }
      }
      return sanitized;
    }

    return data;
  }
}
