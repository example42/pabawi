/**
 * API Logger
 *
 * Comprehensive logging utility for API requests and responses across all integrations.
 * Implements requirements 12.1, 12.2:
 * - Logs all API requests (method, endpoint, parameters)
 * - Logs all API responses (status, headers, body)
 * - Logs authentication details (without sensitive data)
 * - Adds request/response correlation IDs
 */

import { randomUUID } from "crypto";

/**
 * Log level for API logging
 */
export type ApiLogLevel = "debug" | "info" | "warn" | "error";

/**
 * API request log entry
 */
export interface ApiRequestLog {
  correlationId: string;
  timestamp: string;
  integration: string;
  method: string;
  endpoint: string;
  url: string;
  headers: Record<string, string>;
  queryParams?: Record<string, unknown>;
  body?: unknown;
  authentication: {
    type: "token" | "certificate" | "none";
    hasToken?: boolean;
    tokenLength?: number;
    hasCertificate?: boolean;
  };
}

/**
 * API response log entry
 */
export interface ApiResponseLog {
  correlationId: string;
  timestamp: string;
  integration: string;
  method: string;
  endpoint: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: unknown;
  bodyPreview?: string;
  duration: number;
  success: boolean;
}

/**
 * API error log entry
 */
export interface ApiErrorLog {
  correlationId: string;
  timestamp: string;
  integration: string;
  method: string;
  endpoint: string;
  url: string;
  error: {
    message: string;
    type: string;
    category?: string;
    statusCode?: number;
    details?: unknown;
  };
  duration: number;
}

/**
 * API Logger class for comprehensive request/response logging
 */
export class ApiLogger {
  private integration: string;
  private logLevel: ApiLogLevel;

  constructor(integration: string, logLevel: ApiLogLevel = "info") {
    this.integration = integration;
    this.logLevel = logLevel;
  }

  /**
   * Generate a unique correlation ID for request/response tracking
   *
   * @returns Unique correlation ID
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Log an API request
   *
   * Implements requirement 12.1: Log all API requests (method, endpoint, parameters)
   * Implements requirement 12.2: Log authentication details (without sensitive data)
   *
   * @param correlationId - Unique correlation ID for this request
   * @param method - HTTP method
   * @param endpoint - API endpoint path
   * @param url - Full URL
   * @param options - Request options
   */
  logRequest(
    correlationId: string,
    method: string,
    endpoint: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      queryParams?: Record<string, unknown>;
      body?: unknown;
      authentication?: {
        type: "token" | "certificate" | "none";
        hasToken?: boolean;
        tokenLength?: number;
        hasCertificate?: boolean;
      };
    } = {},
  ): void {
    const requestLog: ApiRequestLog = {
      correlationId,
      timestamp: new Date().toISOString(),
      integration: this.integration,
      method,
      endpoint,
      url,
      headers: this.sanitizeHeaders(options.headers ?? {}),
      queryParams: options.queryParams,
      body: this.shouldLogBody() ? this.sanitizeBody(options.body) : undefined,
      authentication: options.authentication ?? { type: "none" },
    };

    // Log at appropriate level
    if (this.shouldLog("debug")) {
      console.log(
        `[${this.integration}] API Request [${correlationId}]:`,
        JSON.stringify(requestLog, null, 2),
      );
    } else if (this.shouldLog("info")) {
      console.log(
        `[${this.integration}] API Request [${correlationId}]: ${method} ${endpoint}`,
        {
          url,
          hasBody: !!options.body,
          hasAuth: options.authentication?.type !== "none",
          queryParams: options.queryParams,
        },
      );
    }
  }

  /**
   * Log an API response
   *
   * Implements requirement 12.1: Log all API responses (status, headers, body)
   *
   * @param correlationId - Correlation ID from the request
   * @param method - HTTP method
   * @param endpoint - API endpoint path
   * @param url - Full URL
   * @param response - Response details
   * @param duration - Request duration in milliseconds
   */
  logResponse(
    correlationId: string,
    method: string,
    endpoint: string,
    url: string,
    response: {
      status: number;
      statusText: string;
      headers?: Record<string, string>;
      body?: unknown;
    },
    duration: number,
  ): void {
    const responseLog: ApiResponseLog = {
      correlationId,
      timestamp: new Date().toISOString(),
      integration: this.integration,
      method,
      endpoint,
      url,
      status: response.status,
      statusText: response.statusText,
      headers: this.sanitizeHeaders(response.headers ?? {}),
      body: this.shouldLogBody() ? response.body : undefined,
      bodyPreview: this.createBodyPreview(response.body),
      duration,
      success: response.status >= 200 && response.status < 300,
    };

    // Log at appropriate level based on response status
    if (response.status >= 500) {
      console.error(
        `[${this.integration}] API Response [${correlationId}]: ${method} ${endpoint} - ${String(response.status)} ${response.statusText}`,
        {
          status: response.status,
          duration: `${String(duration)}ms`,
          bodyPreview: responseLog.bodyPreview,
        },
      );
    } else if (response.status >= 400) {
      console.warn(
        `[${this.integration}] API Response [${correlationId}]: ${method} ${endpoint} - ${String(response.status)} ${response.statusText}`,
        {
          status: response.status,
          duration: `${String(duration)}ms`,
          bodyPreview: responseLog.bodyPreview,
        },
      );
    } else if (this.shouldLog("debug")) {
      console.log(
        `[${this.integration}] API Response [${correlationId}]:`,
        JSON.stringify(responseLog, null, 2),
      );
    } else if (this.shouldLog("info")) {
      console.log(
        `[${this.integration}] API Response [${correlationId}]: ${method} ${endpoint} - ${String(response.status)} ${response.statusText}`,
        {
          status: response.status,
          duration: `${String(duration)}ms`,
          bodyPreview: responseLog.bodyPreview,
        },
      );
    }
  }

  /**
   * Log an API error
   *
   * Implements requirement 12.1: Log all API errors with detailed information
   *
   * @param correlationId - Correlation ID from the request
   * @param method - HTTP method
   * @param endpoint - API endpoint path
   * @param url - Full URL
   * @param error - Error details
   * @param duration - Request duration in milliseconds
   */
  logError(
    correlationId: string,
    method: string,
    endpoint: string,
    url: string,
    error: {
      message: string;
      type: string;
      category?: string;
      statusCode?: number;
      details?: unknown;
    },
    duration: number,
  ): void {
    const errorLog: ApiErrorLog = {
      correlationId,
      timestamp: new Date().toISOString(),
      integration: this.integration,
      method,
      endpoint,
      url,
      error: {
        message: error.message,
        type: error.type,
        category: error.category,
        statusCode: error.statusCode,
        details: this.shouldLogBody() ? error.details : undefined,
      },
      duration,
    };

    console.error(
      `[${this.integration}] API Error [${correlationId}]: ${method} ${endpoint} - ${error.message}`,
      {
        errorType: error.type,
        category: error.category,
        statusCode: error.statusCode,
        duration: `${String(duration)}ms`,
        detailsPreview: this.createBodyPreview(error.details),
      },
    );

    if (this.shouldLog("debug")) {
      console.error(
        `[${this.integration}] API Error Details [${correlationId}]:`,
        JSON.stringify(errorLog, null, 2),
      );
    }
  }

  /**
   * Sanitize headers to remove sensitive information
   *
   * Implements requirement 12.2: Log authentication details (without sensitive data)
   *
   * @param headers - Raw headers
   * @returns Sanitized headers
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = [
      "authorization",
      "x-authentication",
      "x-auth-token",
      "cookie",
      "set-cookie",
    ];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        // Mask sensitive headers but show length
        sanitized[key] = `[REDACTED - length: ${String(value.length)}]`;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize request/response body to remove sensitive information
   *
   * @param body - Raw body
   * @returns Sanitized body
   */
  private sanitizeBody(body: unknown): unknown {
    if (!body) {
      return body;
    }

    // If body is a string, return as-is (already serialized)
    if (typeof body === "string") {
      return body;
    }

    // If body is an object, sanitize sensitive fields
    if (typeof body === "object" && body !== null) {
      const sanitized: Record<string, unknown> = {};
      const sensitiveFields = [
        "password",
        "token",
        "secret",
        "api_key",
        "apiKey",
        "private_key",
        "privateKey",
      ];

      for (const [key, value] of Object.entries(body)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some((field) => lowerKey.includes(field))) {
          sanitized[key] = "[REDACTED]";
        } else {
          sanitized[key] = value;
        }
      }

      return sanitized;
    }

    return body;
  }

  /**
   * Create a preview of the body for logging
   *
   * @param body - Body to preview
   * @returns Preview string
   */
  private createBodyPreview(body: unknown): string | undefined {
    if (!body) {
      return undefined;
    }

    try {
      const bodyStr =
        typeof body === "string" ? body : JSON.stringify(body);

      // Return first 200 characters
      if (bodyStr.length > 200) {
        return `${bodyStr.substring(0, 200)}... [truncated, total length: ${String(bodyStr.length)}]`;
      }

      return bodyStr;
    } catch {
      return "[Unable to preview body]";
    }
  }

  /**
   * Check if logging should occur at the specified level
   *
   * @param level - Log level to check
   * @returns true if logging should occur
   */
  private shouldLog(level: ApiLogLevel): boolean {
    const levels: ApiLogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const checkLevelIndex = levels.indexOf(level);

    return checkLevelIndex >= currentLevelIndex;
  }

  /**
   * Check if body should be logged based on log level
   *
   * @returns true if body should be logged
   */
  private shouldLogBody(): boolean {
    return this.logLevel === "debug";
  }

  /**
   * Set the log level
   *
   * @param level - New log level
   */
  setLogLevel(level: ApiLogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get the current log level
   *
   * @returns Current log level
   */
  getLogLevel(): ApiLogLevel {
    return this.logLevel;
  }

  /**
   * Get the integration name
   *
   * @returns Integration name
   */
  getIntegration(): string {
    return this.integration;
  }
}

/**
 * Create an API logger for a specific integration
 *
 * @param integration - Integration name (e.g., 'puppetserver', 'puppetdb', 'bolt')
 * @param logLevel - Log level (default: 'info')
 * @returns Configured API logger
 */
export function createApiLogger(
  integration: string,
  logLevel: ApiLogLevel = "info",
): ApiLogger {
  return new ApiLogger(integration, logLevel);
}
