/**
 * Debug Context Hook
 *
 * Provides per-widget/component debug context management with:
 * - Automatic correlation ID generation
 * - API request tracking scoped to the widget
 * - Lifecycle management (auto-cleanup on unmount)
 * - Debug data storage
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { useDebugContext } from '$lib/debug';
 *
 *   const debug = useDebugContext('MyWidget');
 *
 *   // Track API requests
 *   async function fetchData() {
 *     const requestId = debug.trackRequest('/api/data', 'GET');
 *     try {
 *       const response = await fetch('/api/data');
 *       debug.completeRequest(requestId, response.status);
 *       return response.json();
 *     } catch (error) {
 *       debug.failRequest(requestId, error.message);
 *       throw error;
 *     }
 *   }
 *
 *   // Add debug data
 *   debug.setData('lastFetch', new Date().toISOString());
 *
 *   // Get correlation ID for API headers
 *   const headers = { 'X-Correlation-ID': debug.correlationId };
 * </script>
 * ```
 */

import { onDestroy } from "svelte";
import {
  debugMode,
  type DebugContext,
  type TrackedRequest,
} from "./debugMode.svelte";

/**
 * Debug context interface for widget usage
 */
export interface WidgetDebugContext {
  /** Unique correlation ID for this context */
  readonly correlationId: string;

  /** Whether debug mode is currently enabled */
  readonly enabled: boolean;

  /** Get the underlying debug context */
  readonly context: DebugContext | undefined;

  /** Get all requests tracked in this context */
  readonly requests: TrackedRequest[];

  /** Get pending requests in this context */
  readonly pendingRequests: TrackedRequest[];

  /** Get custom debug data */
  readonly data: Record<string, unknown>;

  /**
   * Track the start of an API request
   * @param url - Request URL
   * @param method - HTTP method
   * @param metadata - Optional additional metadata
   * @returns Request ID for tracking completion
   */
  trackRequest(
    url: string,
    method: string,
    metadata?: Record<string, unknown>
  ): string;

  /**
   * Mark a request as completed successfully
   * @param requestId - Request ID returned by trackRequest
   * @param status - HTTP status code
   * @param responseSize - Optional response size in bytes
   */
  completeRequest(
    requestId: string,
    status: number,
    responseSize?: number
  ): void;

  /**
   * Mark a request as failed
   * @param requestId - Request ID returned by trackRequest
   * @param error - Error message
   * @param status - Optional HTTP status code
   */
  failRequest(requestId: string, error: string, status?: number): void;

  /**
   * Set custom debug data
   * @param key - Data key
   * @param value - Data value
   */
  setData(key: string, value: unknown): void;

  /**
   * Get custom debug data by key
   * @param key - Data key
   */
  getData(key: string): unknown;

  /**
   * Clear custom debug data
   */
  clearData(): void;

  /**
   * Create a child debug context (for nested widgets)
   * @param childId - Child context identifier
   * @returns Child debug context
   */
  createChild(childId: string): WidgetDebugContext;

  /**
   * Log a debug message (only when debug mode is enabled)
   * @param message - Message to log
   * @param data - Optional additional data
   */
  log(message: string, data?: Record<string, unknown>): void;

  /**
   * Log a warning message (only when debug mode is enabled)
   * @param message - Warning message
   * @param data - Optional additional data
   */
  warn(message: string, data?: Record<string, unknown>): void;

  /**
   * Log an error message (always logged, enhanced when debug mode enabled)
   * @param message - Error message
   * @param error - Optional error object
   * @param data - Optional additional data
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void;

  /**
   * Get HTTP headers to include for request tracking
   */
  getHeaders(): Record<string, string>;

  /**
   * Destroy the context and clean up resources
   */
  destroy(): void;
}

/**
 * Create a debug context for a widget or component
 *
 * The context is automatically cleaned up when the component is destroyed.
 *
 * @param widgetId - Unique identifier for the widget (e.g., 'CommandExecutor')
 * @param parentCorrelationId - Optional parent correlation ID for nested widgets
 * @returns Debug context interface
 */
export function useDebugContext(
  widgetId: string,
  parentCorrelationId?: string
): WidgetDebugContext {
  // Create the underlying debug context
  const ctx = debugMode.createContext(widgetId, parentCorrelationId ?? null);

  // Track child contexts for cleanup
  const childContexts: WidgetDebugContext[] = [];

  // Create the widget debug context interface
  const widgetContext: WidgetDebugContext = {
    get correlationId() {
      return ctx.correlationId;
    },

    get enabled() {
      return debugMode.enabled;
    },

    get context() {
      return debugMode.getContext(ctx.correlationId);
    },

    get requests() {
      return debugMode.getRequestsByCorrelationId(ctx.correlationId);
    },

    get pendingRequests() {
      return this.requests.filter((r) => r.pending);
    },

    get data() {
      const context = debugMode.getContext(ctx.correlationId);
      return context?.data ?? {};
    },

    trackRequest(
      url: string,
      method: string,
      metadata: Record<string, unknown> = {}
    ): string {
      return debugMode.trackRequestStart(
        url,
        method,
        ctx.correlationId,
        widgetId,
        metadata
      );
    },

    completeRequest(
      requestId: string,
      status: number,
      responseSize?: number
    ): void {
      debugMode.trackRequestEnd(requestId, status, responseSize ?? null, null);
    },

    failRequest(requestId: string, error: string, status?: number): void {
      debugMode.trackRequestEnd(
        requestId,
        status ?? 0,
        null,
        error
      );
    },

    setData(key: string, value: unknown): void {
      const context = debugMode.getContext(ctx.correlationId);
      if (context) {
        context.data[key] = value;
      }
    },

    getData(key: string): unknown {
      const context = debugMode.getContext(ctx.correlationId);
      return context?.data[key];
    },

    clearData(): void {
      const context = debugMode.getContext(ctx.correlationId);
      if (context) {
        // Clear by reassigning to empty object
        Object.keys(context.data).forEach((key) => {
          context.data[key] = undefined;
        });
      }
    },

    createChild(childId: string): WidgetDebugContext {
      const child = useDebugContext(childId, ctx.correlationId);
      childContexts.push(child);
      return child;
    },

    log(message: string, data?: Record<string, unknown>): void {
      if (!debugMode.enabled) return;

      // eslint-disable-next-line no-console
      console.info(`[${widgetId}] ${message}`, {
        correlationId: ctx.correlationId,
        ...data,
      });
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (!debugMode.enabled) return;

      console.warn(`[${widgetId}] ${message}`, {
        correlationId: ctx.correlationId,
        ...data,
      });
    },

    error(
      message: string,
      error?: Error,
      data?: Record<string, unknown>
    ): void {
      // Always log errors, but enhance with context when debug mode enabled
      const logData = debugMode.enabled
        ? {
            correlationId: ctx.correlationId,
            stack: error?.stack,
            ...data,
          }
        : { error: error?.message, ...data };

      console.error(`[${widgetId}] ${message}`, logData);
    },

    getHeaders(): Record<string, string> {
      const headers: Record<string, string> = {
        "X-Correlation-ID": ctx.correlationId,
      };

      if (debugMode.enabled) {
        headers["X-Debug-Mode"] = "true";
      }

      return headers;
    },

    destroy(): void {
      // Destroy child contexts first
      for (const child of childContexts) {
        child.destroy();
      }
      childContexts.length = 0;

      // Destroy this context
      debugMode.destroyContext(ctx.correlationId);
    },
  };

  // Register cleanup on component destroy
  onDestroy(() => {
    widgetContext.destroy();
  });

  return widgetContext;
}

/**
 * Create a debug context without automatic cleanup
 *
 * Useful for non-Svelte code or when manual lifecycle management is needed.
 * Remember to call destroy() when done.
 *
 * @param contextId - Unique identifier for the context
 * @param parentCorrelationId - Optional parent correlation ID
 * @returns Debug context interface
 */
export function createDebugContext(
  contextId: string,
  parentCorrelationId?: string
): WidgetDebugContext {
  // Create the underlying debug context
  const ctx = debugMode.createContext(contextId, parentCorrelationId ?? null);

  // Track child contexts for cleanup
  const childContexts: WidgetDebugContext[] = [];

  // Create the context interface (same as useDebugContext but without onDestroy)
  const context: WidgetDebugContext = {
    get correlationId() {
      return ctx.correlationId;
    },

    get enabled() {
      return debugMode.enabled;
    },

    get context() {
      return debugMode.getContext(ctx.correlationId);
    },

    get requests() {
      return debugMode.getRequestsByCorrelationId(ctx.correlationId);
    },

    get pendingRequests() {
      return this.requests.filter((r) => r.pending);
    },

    get data() {
      const debugContext = debugMode.getContext(ctx.correlationId);
      return debugContext?.data ?? {};
    },

    trackRequest(
      url: string,
      method: string,
      metadata: Record<string, unknown> = {}
    ): string {
      return debugMode.trackRequestStart(
        url,
        method,
        ctx.correlationId,
        contextId,
        metadata
      );
    },

    completeRequest(
      requestId: string,
      status: number,
      responseSize?: number
    ): void {
      debugMode.trackRequestEnd(requestId, status, responseSize ?? null, null);
    },

    failRequest(requestId: string, error: string, status?: number): void {
      debugMode.trackRequestEnd(requestId, status ?? 0, null, error);
    },

    setData(key: string, value: unknown): void {
      const debugContext = debugMode.getContext(ctx.correlationId);
      if (debugContext) {
        debugContext.data[key] = value;
      }
    },

    getData(key: string): unknown {
      const debugContext = debugMode.getContext(ctx.correlationId);
      return debugContext?.data[key];
    },

    clearData(): void {
      const debugContext = debugMode.getContext(ctx.correlationId);
      if (debugContext) {
        // Clear by reassigning to empty object
        Object.keys(debugContext.data).forEach((key) => {
          debugContext.data[key] = undefined;
        });
      }
    },

    createChild(childId: string): WidgetDebugContext {
      const child = createDebugContext(childId, ctx.correlationId);
      childContexts.push(child);
      return child;
    },

    log(message: string, data?: Record<string, unknown>): void {
      if (!debugMode.enabled) return;

      // eslint-disable-next-line no-console
      console.info(`[${contextId}] ${message}`, {
        correlationId: ctx.correlationId,
        ...data,
      });
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (!debugMode.enabled) return;

      console.warn(`[${contextId}] ${message}`, {
        correlationId: ctx.correlationId,
        ...data,
      });
    },

    error(
      message: string,
      error?: Error,
      data?: Record<string, unknown>
    ): void {
      const logData = debugMode.enabled
        ? {
            correlationId: ctx.correlationId,
            stack: error?.stack,
            ...data,
          }
        : { error: error?.message, ...data };

      console.error(`[${contextId}] ${message}`, logData);
    },

    getHeaders(): Record<string, string> {
      const headers: Record<string, string> = {
        "X-Correlation-ID": ctx.correlationId,
      };

      if (debugMode.enabled) {
        headers["X-Debug-Mode"] = "true";
      }

      return headers;
    },

    destroy(): void {
      // Destroy child contexts first
      for (const child of childContexts) {
        child.destroy();
      }
      childContexts.length = 0;

      // Destroy this context
      debugMode.destroyContext(ctx.correlationId);
    },
  };

  return context;
}

/**
 * Wrap a fetch call with debug tracking
 *
 * Automatically tracks the request in the provided debug context.
 *
 * @param debugContext - Debug context to track the request in
 * @param url - Request URL
 * @param options - Fetch options
 * @returns Fetch promise
 */
export async function trackedFetch(
  debugContext: WidgetDebugContext,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method ?? "GET";

  // Add correlation headers
  const headers = new Headers(options.headers);
  const debugHeaders = debugContext.getHeaders();
  for (const [key, value] of Object.entries(debugHeaders)) {
    headers.set(key, value);
  }

  // Track request start
  const requestId = debugContext.trackRequest(url, method, {
    hasBody: !!options.body,
  });

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Get response size if available
    const contentLength = response.headers.get("content-length");
    const responseSize = contentLength ? parseInt(contentLength, 10) : undefined;

    // Track request completion
    debugContext.completeRequest(requestId, response.status, responseSize);

    return response;
  } catch (error) {
    // Track request failure
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    debugContext.failRequest(requestId, errorMessage);
    throw error;
  }
}
