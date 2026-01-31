/**
 * Debug Mode State Management
 *
 * Provides centralized debug mode state with:
 * - localStorage persistence
 * - Correlation ID tracking per request/widget
 * - Debug context management
 * - API request tracking
 *
 * @module debug
 */

// Storage keys
const DEBUG_MODE_STORAGE_KEY = "pabawi_debug_mode";
const DEBUG_CONFIG_STORAGE_KEY = "pabawi_debug_config";

/**
 * Debug configuration options
 */
export interface DebugConfig {
  /** Log API requests to console */
  logApiRequests: boolean;
  /** Include performance metrics in debug info */
  includePerformance: boolean;
  /** Send frontend logs to backend */
  syncLogsToBackend: boolean;
  /** Maximum number of tracked requests */
  maxTrackedRequests: number;
  /** Auto-expand debug panels */
  autoExpandPanels: boolean;
  /** Show timeline view by default */
  showTimelineByDefault: boolean;
}

/**
 * Tracked API request information
 */
export interface TrackedRequest {
  /** Unique request ID */
  id: string;
  /** Correlation ID for linking related operations */
  correlationId: string;
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request start timestamp */
  startTime: number;
  /** Request end timestamp (null if pending) */
  endTime: number | null;
  /** HTTP status code (null if pending or failed) */
  status: number | null;
  /** Response size in bytes */
  responseSize: number | null;
  /** Whether request is still in progress */
  pending: boolean;
  /** Error message if request failed */
  error: string | null;
  /** Widget or component that initiated the request */
  source: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Debug context for a specific widget or component
 */
export interface DebugContext {
  /** Context ID (usually widget or component name) */
  id: string;
  /** Correlation ID for linking related operations */
  correlationId: string;
  /** Context creation timestamp */
  createdAt: number;
  /** Associated API requests */
  requests: TrackedRequest[];
  /** Custom debug data */
  data: Record<string, unknown>;
  /** Child contexts (for nested widgets) */
  children: Map<string, DebugContext>;
  /** Parent context ID */
  parentId: string | null;
}

// Default debug configuration
const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  logApiRequests: true,
  includePerformance: true,
  syncLogsToBackend: false,
  maxTrackedRequests: 100,
  autoExpandPanels: false,
  showTimelineByDefault: true,
};

/**
 * Debug Mode Store
 *
 * Manages debug mode state, configuration, and request tracking
 */
class DebugModeStore {
  /** Whether debug mode is enabled */
  enabled = $state(false);

  /** Debug configuration */
  config = $state<DebugConfig>({ ...DEFAULT_DEBUG_CONFIG });

  /** Tracked API requests */
  requests = $state<TrackedRequest[]>([]);

  /** Active debug contexts */
  private contexts = new Map<string, DebugContext>();

  /** Global correlation ID counter */
  private correlationCounter = 0;

  constructor() {
    // Load state from localStorage on initialization
    if (typeof window !== "undefined") {
      // Load enabled state
      const stored = localStorage.getItem(DEBUG_MODE_STORAGE_KEY);
      this.enabled = stored === "true";

      // Load configuration
      const configStored = localStorage.getItem(DEBUG_CONFIG_STORAGE_KEY);
      if (configStored) {
        try {
          const parsedConfig = JSON.parse(configStored) as Partial<DebugConfig>;
          this.config = { ...DEFAULT_DEBUG_CONFIG, ...parsedConfig };
        } catch {
          // Invalid config, use defaults
          this.config = { ...DEFAULT_DEBUG_CONFIG };
        }
      }
    }
  }

  /**
   * Toggle debug mode on/off
   */
  toggle(): void {
    this.enabled = !this.enabled;
    this.persistEnabled();
  }

  /**
   * Set debug mode state
   */
  setEnabled(value: boolean): void {
    this.enabled = value;
    this.persistEnabled();
  }

  /**
   * Update debug configuration
   */
  updateConfig(updates: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...updates };
    this.persistConfig();
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_DEBUG_CONFIG };
    this.persistConfig();
  }

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId(prefix = "debug"): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.correlationCounter).toString(36).padStart(4, "0");
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }

  /**
   * Create a new debug context for a widget or component
   */
  createContext(id: string, parentId: string | null = null): DebugContext {
    const correlationId = this.generateCorrelationId(id);
    const context: DebugContext = {
      id,
      correlationId,
      createdAt: Date.now(),
      requests: [],
      data: {},
      children: new Map(),
      parentId,
    };

    this.contexts.set(correlationId, context);

    // Link to parent if exists
    if (parentId) {
      const parent = this.contexts.get(parentId);
      if (parent) {
        parent.children.set(correlationId, context);
      }
    }

    return context;
  }

  /**
   * Get a debug context by correlation ID
   */
  getContext(correlationId: string): DebugContext | undefined {
    return this.contexts.get(correlationId);
  }

  /**
   * Destroy a debug context and clean up
   */
  destroyContext(correlationId: string): void {
    const context = this.contexts.get(correlationId);
    if (!context) return;

    // Remove from parent
    if (context.parentId) {
      const parent = this.contexts.get(context.parentId);
      if (parent) {
        parent.children.delete(correlationId);
      }
    }

    // Destroy children recursively
    for (const childId of context.children.keys()) {
      this.destroyContext(childId);
    }

    this.contexts.delete(correlationId);
  }

  /**
   * Track the start of an API request
   */
  trackRequestStart(
    url: string,
    method: string,
    correlationId: string,
    source: string | null = null,
    metadata: Record<string, unknown> = {}
  ): string {
    const requestId = this.generateCorrelationId("req");

    const request: TrackedRequest = {
      id: requestId,
      correlationId,
      url,
      method,
      startTime: Date.now(),
      endTime: null,
      status: null,
      responseSize: null,
      pending: true,
      error: null,
      source,
      metadata,
    };

    // Add to tracked requests
    this.requests = [request, ...this.requests].slice(
      0,
      this.config.maxTrackedRequests
    );

    // Add to context if exists
    const context = this.contexts.get(correlationId);
    if (context) {
      context.requests.push(request);
    }

    // Log if enabled (using warn since debug is not allowed by linting rules)
    if (this.enabled && this.config.logApiRequests) {
      // eslint-disable-next-line no-console
      console.info(
        "[Debug] API Request Start:",
        method,
        url,
        { requestId, correlationId, source, metadata }
      );
    }

    return requestId;
  }

  /**
   * Track the completion of an API request
   */
  trackRequestEnd(
    requestId: string,
    status: number,
    responseSize: number | null = null,
    error: string | null = null
  ): void {
    const requestIndex = this.requests.findIndex((r) => r.id === requestId);
    if (requestIndex === -1) return;

    const request = this.requests[requestIndex];
    const updatedRequest: TrackedRequest = {
      ...request,
      endTime: Date.now(),
      status,
      responseSize,
      pending: false,
      error,
    };

    // Update in tracked requests
    this.requests = [
      ...this.requests.slice(0, requestIndex),
      updatedRequest,
      ...this.requests.slice(requestIndex + 1),
    ];

    // Update in context if exists
    const context = this.contexts.get(request.correlationId);
    if (context) {
      const contextRequestIndex = context.requests.findIndex(
        (r) => r.id === requestId
      );
      if (contextRequestIndex !== -1) {
        context.requests[contextRequestIndex] = updatedRequest;
      }
    }

    // Log if enabled (using warn/info since debug is not allowed by linting rules)
    if (this.enabled && this.config.logApiRequests) {
      const endTime = updatedRequest.endTime ?? Date.now();
      const duration = endTime - request.startTime;
      if (error) {

        console.warn(
          "[Debug] API Request Failed:",
          request.method,
          request.url,
          { requestId, status, error, duration: `${String(duration)}ms` }
        );
      } else {
        // eslint-disable-next-line no-console
        console.info(
          "[Debug] API Request Complete:",
          request.method,
          request.url,
          {
            requestId,
            status,
            duration: `${String(duration)}ms`,
            responseSize: responseSize !== null ? `${String(responseSize)}B` : "unknown",
          }
        );
      }
    }
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): TrackedRequest[] {
    return this.requests.filter((r) => r.pending);
  }

  /**
   * Get requests by correlation ID
   */
  getRequestsByCorrelationId(correlationId: string): TrackedRequest[] {
    return this.requests.filter((r) => r.correlationId === correlationId);
  }

  /**
   * Clear all tracked requests
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Clear requests older than specified age (in milliseconds)
   */
  clearOldRequests(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    this.requests = this.requests.filter((r) => r.startTime > cutoff);
  }

  /**
   * Get request statistics
   */
  getRequestStats(): {
    total: number;
    pending: number;
    successful: number;
    failed: number;
    avgDuration: number;
  } {
    const completed = this.requests.filter((r) => !r.pending);
    const successful = completed.filter(
      (r) => r.status !== null && r.status >= 200 && r.status < 400
    );
    const failed = completed.filter(
      (r) => r.status === null || r.status >= 400 || r.error !== null
    );

    const durations = completed
      .filter((r): r is TrackedRequest & { endTime: number } => r.endTime !== null)
      .map((r) => r.endTime - r.startTime);

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    return {
      total: this.requests.length,
      pending: this.requests.filter((r) => r.pending).length,
      successful: successful.length,
      failed: failed.length,
      avgDuration,
    };
  }

  /**
   * Get all active contexts
   */
  getActiveContexts(): DebugContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Persist enabled state to localStorage
   */
  private persistEnabled(): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(DEBUG_MODE_STORAGE_KEY, String(this.enabled));
    }
  }

  /**
   * Persist configuration to localStorage
   */
  private persistConfig(): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(DEBUG_CONFIG_STORAGE_KEY, JSON.stringify(this.config));
    }
  }
}

// Export singleton instance
export const debugMode = new DebugModeStore();

// Re-export types for convenience
export type { DebugModeStore };
