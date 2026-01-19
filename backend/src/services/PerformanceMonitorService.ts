/**
 * Performance Monitor Service
 *
 * Service for tracking operation timing and performance metrics.
 * Provides methods to start timers, record metrics, and retrieve performance data.
 */

/**
 * Performance metrics for a single operation
 */
export interface PerformanceMetrics {
  /** Operation name or identifier */
  operation: string;
  /** Duration of the operation in milliseconds */
  duration: number;
  /** ISO timestamp when the operation completed */
  timestamp: string;
  /** Additional metadata about the operation */
  metadata?: Record<string, unknown>;
}

/**
 * Performance Monitor Service
 *
 * Tracks operation timing and performance metrics across the application.
 * Useful for identifying performance bottlenecks and monitoring system health.
 *
 * Features:
 * - Start timer and return completion function
 * - Record metrics with metadata
 * - Retrieve metrics by operation or all metrics
 * - Automatic timestamp generation
 *
 * Example usage:
 * ```typescript
 * const monitor = new PerformanceMonitorService();
 * const complete = monitor.startTimer('fetchData');
 * // ... perform operation ...
 * const metrics = complete({ source: 'api' });
 * console.log(`Operation took ${metrics.duration}ms`);
 * ```
 */
export class PerformanceMonitorService {
  /** In-memory storage for performance metrics */
  private metrics: PerformanceMetrics[] = [];

  /** Maximum number of metrics to store (prevent memory leaks) */
  private readonly MAX_METRICS = 10000;

  /**
   * Start a timer for an operation
   *
   * @param operation - Name or identifier for the operation
   * @returns Completion function that records the metric when called
   */
  public startTimer(
    operation: string
  ): (metadata?: Record<string, unknown>) => PerformanceMetrics {
    const startTime = Date.now();

    // Return a completion function that calculates duration and records metric
    return (metadata?: Record<string, unknown>): PerformanceMetrics => {
      const duration = Date.now() - startTime;
      const metric: PerformanceMetrics = {
        operation,
        duration,
        timestamp: new Date().toISOString(),
        metadata,
      };

      this.recordMetric(metric);
      return metric;
    };
  }

  /**
   * Record a performance metric
   *
   * @param metric - Performance metric to record
   */
  public recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Prevent unbounded growth by removing oldest metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }
  }

  /**
   * Get all recorded metrics, optionally filtered by operation
   *
   * @param operation - Optional operation name to filter by
   * @returns Array of performance metrics
   */
  public getMetrics(operation?: string): PerformanceMetrics[] {
    if (operation) {
      return this.metrics.filter((m) => m.operation === operation);
    }
    return [...this.metrics];
  }

  /**
   * Get summary statistics for an operation
   *
   * @param operation - Operation name to get statistics for
   * @returns Summary statistics or null if no metrics found
   */
  public getStatistics(operation: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  } | null {
    const operationMetrics = this.getMetrics(operation);

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map((m) => m.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: operationMetrics.length,
      avgDuration: totalDuration / operationMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration,
    };
  }

  /**
   * Clear all recorded metrics
   */
  public clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Clear metrics for a specific operation
   *
   * @param operation - Operation name to clear metrics for
   */
  public clearMetricsForOperation(operation: string): void {
    this.metrics = this.metrics.filter((m) => m.operation !== operation);
  }

  /**
   * Get the total number of recorded metrics
   *
   * @returns Total number of metrics
   */
  public getMetricsCount(): number {
    return this.metrics.length;
  }

  /**
   * Get all unique operation names
   *
   * @returns Array of unique operation names
   */
  public getOperations(): string[] {
    const operations = new Set(this.metrics.map((m) => m.operation));
    return Array.from(operations);
  }
}
