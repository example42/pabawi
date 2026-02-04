import { randomUUID } from "crypto";
import { LoggerService } from "../services/LoggerService";

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
  additionalData?: Record<string, unknown>;
}

/**
 * Error type categorization
 */
export type ErrorType = 'connection' | 'authentication' | 'timeout' | 'validation' | 'not_found' | 'permission' | 'execution' | 'configuration' | 'unknown';

/**
 * Troubleshooting guidance for errors
 */
export interface TroubleshootingGuidance {
  steps: string[];
  documentation?: string;
  relatedErrors?: string[];
}

/**
 * Detailed error response for expert mode
 */
export interface DetailedErrorResponse {
  code: string;
  message: string;
  type: ErrorType;
  actionableMessage: string;
  troubleshooting?: TroubleshootingGuidance;
  details?: unknown;
  stackTrace?: string;
  requestId?: string;
  timestamp?: string;
  rawResponse?: unknown;
  executionContext?: ExecutionContext;
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
  private logger: LoggerService;

  constructor() {
    this.logger = new LoggerService();
  }

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

    // Categorize error type
    const type = this.categorizeError(error);

    // Generate actionable message
    const actionableMessage = this.generateActionableMessage(error, type);

    // Generate troubleshooting guidance
    const troubleshooting = this.generateTroubleshooting(error, type);

    // Build basic error response
    const errorResponse: DetailedErrorResponse = {
      code,
      message: error.message || "An unexpected error occurred",
      type,
      actionableMessage,
      troubleshooting,
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
      case "PuppetserverConnectionError":
        return "PUPPETSERVER_CONNECTION_ERROR";
      case "PuppetserverAuthenticationError":
        return "PUPPETSERVER_AUTH_ERROR";
      case "PuppetserverTimeoutError":
        return "PUPPETSERVER_TIMEOUT_ERROR";
      case "CertificateOperationError":
        return "CERTIFICATE_OPERATION_ERROR";
      case "CatalogCompilationError":
        return "CATALOG_COMPILATION_ERROR";
      case "PuppetserverConfigurationError":
        return "PUPPETSERVER_CONFIGURATION_ERROR";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }

  /**
   * Categorize error by type
   */
  private categorizeError(error: Error): ErrorType {
    const errorName = error.name;
    const message = error.message.toLowerCase();

    // Connection errors
    if (
      errorName.includes("Connection") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("network") ||
      message.includes("fetch failed")
    ) {
      return "connection";
    }

    // Authentication errors
    if (
      errorName.includes("Authentication") ||
      errorName.includes("Auth") ||
      message.includes("unauthorized") ||
      message.includes("authentication") ||
      message.includes("401")
    ) {
      return "authentication";
    }

    // Timeout errors
    if (
      errorName.includes("Timeout") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("504")
    ) {
      return "timeout";
    }

    // Validation errors
    if (
      errorName.includes("Validation") ||
      errorName === "ZodError" ||
      message.includes("invalid") ||
      message.includes("validation")
    ) {
      return "validation";
    }

    // Not found errors
    if (
      errorName.includes("NotFound") ||
      message.includes("not found") ||
      message.includes("404")
    ) {
      return "not_found";
    }

    // Permission errors
    if (
      message.includes("forbidden") ||
      message.includes("permission") ||
      message.includes("403")
    ) {
      return "permission";
    }

    // Configuration errors
    if (
      errorName.includes("Configuration") ||
      message.includes("configuration") ||
      message.includes("config")
    ) {
      return "configuration";
    }

    // Execution errors
    if (
      errorName.includes("Execution") ||
      errorName.includes("Compilation") ||
      errorName.includes("Operation")
    ) {
      return "execution";
    }

    return "unknown";
  }

  /**
   * Generate actionable error message
   */
  private generateActionableMessage(error: Error, type: ErrorType): string {
    const errorName = error.name;

    switch (type) {
      case "connection":
        return "Unable to connect to the service. Check network connectivity and service availability.";

      case "authentication":
        if (errorName.includes("Puppetserver")) {
          return "Authentication with Puppetserver failed. Verify your token or certificate configuration.";
        }
        return "Authentication failed. Check your credentials and try again.";

      case "timeout":
        if (errorName.includes("Bolt")) {
          return "The Bolt operation timed out. The target node may be slow to respond or unreachable.";
        }
        if (errorName.includes("Puppetserver")) {
          return "Puppetserver request timed out. The server may be overloaded or the operation is too complex.";
        }
        return "The operation timed out. Try again or increase the timeout setting.";

      case "validation":
        return "Invalid input provided. Check the request parameters and try again.";

      case "not_found":
        if (errorName === "BoltTaskNotFoundError") {
          return "The specified Bolt task does not exist. Verify the task name and ensure it's installed.";
        }
        if (errorName === "BoltInventoryNotFoundError") {
          return "Bolt inventory file not found. Check your Bolt project configuration.";
        }
        return "The requested resource was not found. It may have been deleted or moved.";

      case "permission":
        return "You don't have permission to perform this action. Contact your administrator.";

      case "configuration":
        if (errorName.includes("Puppetserver")) {
          return "Puppetserver configuration is invalid. Check your server URL, port, and authentication settings.";
        }
        return "Configuration error detected. Review your settings and try again.";

      case "execution":
        if (errorName === "CertificateOperationError") {
          return "Certificate operation failed. The certificate may be in an invalid state or the operation is not allowed.";
        }
        if (errorName === "CatalogCompilationError") {
          return "Catalog compilation failed. Check your Puppet code for syntax errors or missing dependencies.";
        }
        if (errorName === "BoltExecutionError") {
          return "Bolt command execution failed. Check the command syntax and target node status.";
        }
        return "Operation failed during execution. Review the error details for more information.";

      default:
        return "An unexpected error occurred. Try again or contact support if the problem persists.";
    }
  }

  /**
   * Generate troubleshooting guidance
   */
  private generateTroubleshooting(error: Error, type: ErrorType): TroubleshootingGuidance {
    const errorName = error.name;

    switch (type) {
      case "connection":
        if (errorName.includes("Puppetserver")) {
          return {
            steps: [
              "Verify Puppetserver is running and accessible",
              "Check the server URL and port in configuration",
              "Ensure network connectivity between Pabawi and Puppetserver",
              "Check firewall rules and security groups",
              "Verify SSL/TLS certificates if using HTTPS",
            ],
            documentation: "/docs/puppetserver-integration-setup.md",
            relatedErrors: ["PUPPETSERVER_TIMEOUT_ERROR", "PUPPETSERVER_AUTH_ERROR"],
          };
        }
        return {
          steps: [
            "Check your internet connection",
            "Verify the service is running",
            "Check firewall and network settings",
            "Try again in a few moments",
          ],
        };

      case "authentication":
        if (errorName.includes("Puppetserver")) {
          return {
            steps: [
              "Verify your Puppetserver token is correct and not expired",
              "Check certificate-based authentication if using SSL client certs",
              "Ensure the token/certificate has appropriate permissions",
              "Review Puppetserver's auth.conf configuration",
              "Check Puppetserver logs for authentication errors",
            ],
            documentation: "/docs/puppetserver-integration-setup.md",
            relatedErrors: ["PUPPETSERVER_CONNECTION_ERROR", "PUPPETSERVER_CONFIGURATION_ERROR"],
          };
        }
        return {
          steps: [
            "Verify your credentials are correct",
            "Check if your session has expired",
            "Try logging out and logging back in",
            "Contact your administrator if the problem persists",
          ],
        };

      case "timeout":
        if (errorName.includes("Bolt")) {
          return {
            steps: [
              "Check if the target node is online and reachable",
              "Verify SSH connectivity to the target node",
              "Increase the timeout setting in Bolt configuration",
              "Check network latency between Pabawi and target nodes",
              "Review Bolt inventory for correct connection settings",
            ],
            documentation: "/docs/configuration.md",
            relatedErrors: ["NODE_UNREACHABLE", "BOLT_EXECUTION_FAILED"],
          };
        }
        if (errorName.includes("Puppetserver")) {
          return {
            steps: [
              "Check Puppetserver resource usage (CPU, memory)",
              "Verify catalog compilation isn't too complex",
              "Increase timeout settings in Pabawi configuration",
              "Review Puppetserver logs for performance issues",
              "Consider optimizing Puppet code if compilation is slow",
            ],
            documentation: "/docs/troubleshooting.md",
            relatedErrors: ["CATALOG_COMPILATION_ERROR", "PUPPETSERVER_CONNECTION_ERROR"],
          };
        }
        return {
          steps: [
            "Try the operation again",
            "Check if the service is experiencing high load",
            "Increase timeout settings if available",
            "Contact support if timeouts persist",
          ],
        };

      case "validation":
        return {
          steps: [
            "Review the error message for specific validation failures",
            "Check that all required fields are provided",
            "Verify data types and formats match requirements",
            "Consult API documentation for parameter specifications",
          ],
          documentation: "/docs/api.md",
        };

      case "not_found":
        if (errorName === "BoltTaskNotFoundError") {
          return {
            steps: [
              "Verify the task name is spelled correctly",
              "Check that the task is installed in your Bolt project",
              "Run 'bolt task show' to list available tasks",
              "Ensure the task module is in your Puppetfile",
              "Check Bolt project directory structure",
            ],
            documentation: "/docs/user-guide.md",
            relatedErrors: ["BOLT_CONFIG_MISSING"],
          };
        }
        if (errorName === "BoltInventoryNotFoundError") {
          return {
            steps: [
              "Verify inventory.yaml exists in your Bolt project",
              "Check the Bolt project path configuration",
              "Ensure proper file permissions on inventory file",
              "Review Bolt project structure",
            ],
            documentation: "/docs/configuration.md",
          };
        }
        return {
          steps: [
            "Verify the resource identifier is correct",
            "Check if the resource was recently deleted",
            "Refresh the page and try again",
            "Contact support if the resource should exist",
          ],
        };

      case "permission":
        return {
          steps: [
            "Verify you have the necessary permissions",
            "Contact your administrator to request access",
            "Check role-based access control settings",
            "Review audit logs if available",
          ],
        };

      case "configuration":
        if (errorName.includes("Puppetserver")) {
          return {
            steps: [
              "Review Puppetserver configuration in Pabawi settings",
              "Verify server URL format (http:// or https://)",
              "Check port number (default: 8140)",
              "Validate authentication method (token or certificate)",
              "Test Puppetserver connectivity manually",
              "Review Puppetserver setup documentation",
            ],
            documentation: "/docs/puppetserver-integration-setup.md",
            relatedErrors: ["PUPPETSERVER_CONNECTION_ERROR", "PUPPETSERVER_AUTH_ERROR"],
          };
        }
        return {
          steps: [
            "Review configuration settings",
            "Check for typos or invalid values",
            "Consult configuration documentation",
            "Restore default settings if needed",
          ],
          documentation: "/docs/configuration.md",
        };

      case "execution":
        if (errorName === "CertificateOperationError") {
          return {
            steps: [
              "Check the current certificate status",
              "Verify the operation is valid for this certificate state",
              "Review Puppetserver CA logs",
              "Ensure you have CA admin permissions",
              "Check for certificate conflicts or duplicates",
            ],
            documentation: "/docs/puppetserver-integration-setup.md",
            relatedErrors: ["PUPPETSERVER_AUTH_ERROR"],
          };
        }
        if (errorName === "CatalogCompilationError") {
          return {
            steps: [
              "Review compilation error messages for syntax issues",
              "Check Puppet code in the specified environment",
              "Verify all required modules are installed",
              "Check for missing or incorrect Hiera data",
              "Review Puppetserver logs for detailed errors",
              "Test catalog compilation manually with 'puppet catalog compile'",
            ],
            documentation: "/docs/troubleshooting.md",
            relatedErrors: ["PUPPETSERVER_TIMEOUT_ERROR"],
          };
        }
        if (errorName === "BoltExecutionError") {
          return {
            steps: [
              "Review the Bolt command output for specific errors",
              "Verify target node is reachable",
              "Check SSH credentials and connectivity",
              "Ensure required software is installed on target",
              "Review Bolt debug logs",
              "Test the command manually with Bolt CLI",
            ],
            documentation: "/docs/user-guide.md",
            relatedErrors: ["NODE_UNREACHABLE", "BOLT_TIMEOUT"],
          };
        }
        return {
          steps: [
            "Review error details for specific failure information",
            "Check system logs for additional context",
            "Verify all prerequisites are met",
            "Try the operation again",
            "Contact support if the problem persists",
          ],
        };

      default:
        return {
          steps: [
            "Review the error message for details",
            "Check system logs for additional information",
            "Try the operation again",
            "Contact support if the problem persists",
          ],
          documentation: "/docs/troubleshooting.md",
        };
    }
  }

  /**
   * Log error with full context
   *
   * @param error - The error to log
   * @param context - Execution context
   */
  public logError(error: Error, context: ExecutionContext): void {
    this.logger.error(`Error in ${context.method} ${context.endpoint}`, {
      component: "ErrorHandlingService",
      operation: "logError",
      metadata: {
        requestId: context.requestId,
        nodeId: context.nodeId,
        additionalData: context.additionalData,
      },
    }, error);
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
        if (this.shouldObfuscateKey(key)) {
          sanitized[key] = "***";
        } else if (this.isSafeObject(value)) {
          sanitized[key] = this.sanitizeSensitiveData(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return data;
  }

  private shouldObfuscateKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    const sensitivePatterns = [
      "password",
      "token",
      "secret",
      "apikey",
      "api_key",
      "privatekey",
      "private_key",
      "auth",
      "credential",
      "session",
      "cookie",
      "authorization",
      "bearer",
    ];
    return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
  }

  private isSafeObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
      return false;
    }
    const proto = Object.getPrototypeOf(value) as object | null;
    return proto === Object.prototype || proto === null;
  }
}
