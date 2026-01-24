/**
 * Expert Mode Service
 *
 * Service for managing expert mode debugging information.
 * Provides methods to attach debug info to API responses and check expert mode status.
 */

import type { Request } from 'express';

/**
 * Information about an API call made during request processing
 */
export interface ApiCallInfo {
  /** API endpoint called */
  endpoint: string;
  /** HTTP method used */
  method: string;
  /** Duration of the API call in milliseconds */
  duration: number;
  /** HTTP status code returned */
  status: number;
  /** Whether the response was served from cache */
  cached: boolean;
}

/**
 * Information about an error that occurred during request processing
 */
export interface ErrorInfo {
  /** Error message */
  message: string;
  /** Error stack trace (optional) */
  stack?: string;
  /** Error code (optional) */
  code?: string;
  /** Additional context (optional) */
  context?: string;
  /** Log level */
  level: 'error';
}

/**
 * Information about a warning that occurred during request processing
 */
export interface WarningInfo {
  /** Warning message */
  message: string;
  /** Additional context (optional) */
  context?: string;
  /** Log level */
  level: 'warn';
}

/**
 * Information about an informational message during request processing
 */
export interface InfoMessage {
  /** Info message */
  message: string;
  /** Additional context (optional) */
  context?: string;
  /** Log level */
  level: 'info';
}

/**
 * Information about a debug message during request processing
 */
export interface DebugMessage {
  /** Debug message */
  message: string;
  /** Additional context (optional) */
  context?: string;
  /** Log level */
  level: 'debug';
}

/**
 * Performance metrics for the system
 */
export interface PerformanceMetrics {
  /** Memory usage in bytes */
  memoryUsage: number;
  /** CPU usage percentage (0-100) */
  cpuUsage: number;
  /** Number of active connections */
  activeConnections: number;
  /** Cache statistics */
  cacheStats: {
    /** Number of cache hits */
    hits: number;
    /** Number of cache misses */
    misses: number;
    /** Current cache size */
    size: number;
    /** Cache hit rate (0-1) */
    hitRate: number;
  };
  /** Request statistics */
  requestStats: {
    /** Total number of requests */
    total: number;
    /** Average request duration in milliseconds */
    avgDuration: number;
    /** 95th percentile duration in milliseconds */
    p95Duration: number;
    /** 99th percentile duration in milliseconds */
    p99Duration: number;
  };
}

/**
 * Context information about the request
 */
export interface ContextInfo {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Query parameters */
  query: Record<string, string>;
  /** User agent string */
  userAgent: string;
  /** Client IP address */
  ip: string;
  /** Request timestamp */
  timestamp: string;
}

/**
 * Debug information attached to API responses when expert mode is enabled
 */
export interface DebugInfo {
  /** ISO timestamp when the request was processed */
  timestamp: string;
  /** Unique identifier for the request */
  requestId: string;
  /** Integration name (bolt, puppetdb, puppetserver, hiera) */
  integration?: string;
  /** Operation or endpoint being executed */
  operation: string;
  /** Total duration of the operation in milliseconds */
  duration: number;
  /** List of API calls made during request processing */
  apiCalls?: ApiCallInfo[];
  /** Whether the response was served from cache */
  cacheHit?: boolean;
  /** List of errors that occurred during request processing */
  errors?: ErrorInfo[];
  /** List of warnings that occurred during request processing */
  warnings?: WarningInfo[];
  /** List of informational messages during request processing */
  info?: InfoMessage[];
  /** List of debug messages during request processing */
  debug?: DebugMessage[];
  /** Performance metrics */
  performance?: PerformanceMetrics;
  /** Request context information */
  context?: ContextInfo;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Frontend logs associated with this request (via correlation ID) */
  frontendLogs?: FrontendLogEntry[];
}

/**
 * Frontend log entry from client-side logging
 */
export interface FrontendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  stackTrace?: string;
}

/**
 * Response type with optional debug information
 */
export type ResponseWithDebug<T> = T & { _debug?: DebugInfo };

/**
 * Expert Mode Service
 *
 * Manages expert mode debugging information for API responses.
 * When expert mode is enabled, attaches comprehensive debugging data
 * to help with troubleshooting and support.
 *
 * Features:
 * - Check if expert mode is enabled from request headers
 * - Attach debug information to API responses
 * - Implement size limits for debug data (1MB max)
 * - Collect timing, API call, and error information
 */
export class ExpertModeService {
  /** Maximum size for debug data in bytes (1MB) */
  private readonly MAX_DEBUG_SIZE = 1024 * 1024; // 1MB

  /** Header name for expert mode flag */
  private readonly EXPERT_MODE_HEADER = 'x-expert-mode';

  /**
   * Check if expert mode is enabled for the current request
   *
   * @param req - Express request object
   * @returns true if expert mode is enabled
   */
  public isExpertModeEnabled(req: Request): boolean {
    const headerValue = req.headers[this.EXPERT_MODE_HEADER];

    if (!headerValue) {
      return false;
    }

    // Accept 'true', '1', or 'yes' as truthy values
    const normalizedValue = String(headerValue).toLowerCase();
    return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
  }

  /**
   * Attach debug information to a response object
   *
   * @param data - The response data
   * @param debugInfo - Debug information to attach
   * @returns Response data with debug info attached (if within size limits)
   */
  public attachDebugInfo<T>(data: T, debugInfo: DebugInfo): ResponseWithDebug<T> {
    // Calculate the size of the debug info
    const debugSize = this.calculateDebugSize(debugInfo);

    // If debug info exceeds size limit, truncate or omit it
    if (debugSize > this.MAX_DEBUG_SIZE) {
      const truncatedDebugInfo: DebugInfo = {
        ...debugInfo,
        metadata: {
          ...debugInfo.metadata,
          _truncated: true,
          _originalSize: debugSize,
          _maxSize: this.MAX_DEBUG_SIZE,
          _message: 'Debug information exceeded size limit and was truncated',
        },
      };

      // Remove large fields to reduce size
      delete truncatedDebugInfo.apiCalls;
      delete truncatedDebugInfo.errors;

      return {
        ...data,
        _debug: truncatedDebugInfo,
      };
    }

    return {
      ...data,
      _debug: debugInfo,
    };
  }

  /**
   * Calculate the approximate size of debug information in bytes
   *
   * @param debugInfo - Debug information to measure
   * @returns Approximate size in bytes
   */
  private calculateDebugSize(debugInfo: DebugInfo): number {
    try {
      const jsonString = JSON.stringify(debugInfo);
      // Use Buffer.byteLength for accurate byte count (handles UTF-8)
      return Buffer.byteLength(jsonString, 'utf8');
    } catch {
      // If serialization fails, return a large number to trigger truncation
      return this.MAX_DEBUG_SIZE + 1;
    }
  }

  /**
   * Create a debug info object with basic information
   *
   * @param operation - Operation or endpoint being executed
   * @param requestId - Unique identifier for the request
   * @param duration - Duration of the operation in milliseconds
   * @returns Basic debug info object
   */
  public createDebugInfo(
    operation: string,
    requestId: string,
    duration: number
  ): DebugInfo {
    return {
      timestamp: new Date().toISOString(),
      requestId,
      operation,
      duration,
    };
  }

  /**
   * Add API call information to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param apiCall - API call information to add
   */
  public addApiCall(debugInfo: DebugInfo, apiCall: ApiCallInfo): void {
    debugInfo.apiCalls ??= [];
    debugInfo.apiCalls.push(apiCall);
  }

  /**
   * Add error information to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param error - Error information to add
   */
  public addError(debugInfo: DebugInfo, error: ErrorInfo): void {
    debugInfo.errors ??= [];
    debugInfo.errors.push(error);
  }

  /**
   * Add warning information to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param warning - Warning information to add
   */
  public addWarning(debugInfo: DebugInfo, warning: WarningInfo): void {
    debugInfo.warnings ??= [];
    debugInfo.warnings.push(warning);
  }

  /**
   * Add informational message to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param info - Info message to add
   */
  public addInfo(debugInfo: DebugInfo, info: InfoMessage): void {
    debugInfo.info ??= [];
    debugInfo.info.push(info);
  }

  /**
   * Add debug message to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param debug - Debug message to add
   */
  public addDebug(debugInfo: DebugInfo, debug: DebugMessage): void {
    debugInfo.debug ??= [];
    debugInfo.debug.push(debug);
  }

  /**
   * Add frontend logs to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param frontendLogs - Frontend log entries to add
   */
  public addFrontendLogs(debugInfo: DebugInfo, frontendLogs: FrontendLogEntry[]): void {
    debugInfo.frontendLogs = frontendLogs;
  }

  /**
   * Set cache hit status in debug info
   *
   * @param debugInfo - Debug info object to update
   * @param cacheHit - Whether the response was served from cache
   */
  public setCacheHit(debugInfo: DebugInfo, cacheHit: boolean): void {
    debugInfo.cacheHit = cacheHit;
  }

  /**
   * Set integration name in debug info
   *
   * @param debugInfo - Debug info object to update
   * @param integration - Integration name
   */
  public setIntegration(debugInfo: DebugInfo, integration: string): void {
    debugInfo.integration = integration;
  }

  /**
   * Add metadata to debug info
   *
   * @param debugInfo - Debug info object to update
   * @param key - Metadata key
   * @param value - Metadata value
   */
  public addMetadata(debugInfo: DebugInfo, key: string, value: unknown): void {
    debugInfo.metadata ??= {};
    debugInfo.metadata[key] = value;
  }

  /**
   * Generate a unique request ID
   *
   * @returns Unique request ID
   */
  public generateRequestId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 11);
    return `req_${timestamp}_${random}`;
  }

  /**
   * Collect performance metrics from the system
   *
   * @param cacheStats - Optional cache statistics from deduplication middleware
   * @param requestStats - Optional request statistics from performance monitor
   * @returns Performance metrics object
   */
  public collectPerformanceMetrics(
    cacheStats?: { size: number; maxSize: number; hitRate: number },
    requestStats?: { total: number; avgDuration: number; p95Duration: number; p99Duration: number }
  ): PerformanceMetrics {
    // Collect memory usage
    const memoryUsage = process.memoryUsage();

    // Collect CPU usage (approximation based on process.cpuUsage())
    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) % 100; // Convert to percentage

    // Get active connections (approximation)
    const activeConnections = this.getActiveConnections();

    // Default cache stats if not provided
    const defaultCacheStats = {
      hits: 0,
      misses: 0,
      size: cacheStats?.size ?? 0,
      hitRate: cacheStats?.hitRate ?? 0,
    };

    // Calculate hits and misses from hit rate if available
    if (cacheStats && cacheStats.hitRate > 0) {
      const totalRequests = cacheStats.size / (1 - cacheStats.hitRate);
      defaultCacheStats.hits = Math.floor(totalRequests * cacheStats.hitRate);
      defaultCacheStats.misses = Math.floor(totalRequests * (1 - cacheStats.hitRate));
    }

    // Default request stats if not provided
    const defaultRequestStats = requestStats ?? {
      total: 0,
      avgDuration: 0,
      p95Duration: 0,
      p99Duration: 0,
    };

    return {
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: cpuPercent,
      activeConnections,
      cacheStats: defaultCacheStats,
      requestStats: defaultRequestStats,
    };
  }

  /**
   * Collect request context information
   *
   * @param req - Express request object
   * @returns Context information object
   */
  public collectRequestContext(req: Request): ContextInfo {
    // Extract headers as a plain object
    const headers: Record<string, string> = {};
    Object.keys(req.headers).forEach((key) => {
      const value = req.headers[key];
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.map(String).join(', ');
      }
    });

    // Extract query parameters
    const query: Record<string, string> = {};
    Object.keys(req.query).forEach((key) => {
      const value = req.query[key];
      if (typeof value === 'string') {
        query[key] = value;
      } else if (Array.isArray(value)) {
        query[key] = value.filter(v => typeof v === 'string').join(', ');
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        query[key] = String(value);
      } else if (value !== undefined) {
        // For ParsedQs objects or other complex types, serialize to JSON
        query[key] = JSON.stringify(value);
      }
    });

    return {
      url: req.originalUrl || req.url,
      method: req.method,
      headers,
      query,
      userAgent: req.headers['user-agent'] ?? 'unknown',
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get approximate number of active connections
   * This is a simplified implementation
   *
   * @returns Number of active connections
   */
  private getActiveConnections(): number {
    // In a real implementation, this would track actual connections
    // For now, return 0 as a placeholder
    // This can be enhanced by tracking connections in middleware
    return 0;
  }
}
