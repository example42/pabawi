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
export declare class PerformanceMonitorService {
    /** In-memory storage for performance metrics */
    private metrics;
    /** Maximum number of metrics to store (prevent memory leaks) */
    private readonly MAX_METRICS;
    /**
     * Start a timer for an operation
     *
     * @param operation - Name or identifier for the operation
     * @returns Completion function that records the metric when called
     */
    startTimer(operation: string): (metadata?: Record<string, unknown>) => PerformanceMetrics;
    /**
     * Record a performance metric
     *
     * @param metric - Performance metric to record
     */
    recordMetric(metric: PerformanceMetrics): void;
    /**
     * Get all recorded metrics, optionally filtered by operation
     *
     * @param operation - Optional operation name to filter by
     * @returns Array of performance metrics
     */
    getMetrics(operation?: string): PerformanceMetrics[];
    /**
     * Get summary statistics for an operation
     *
     * @param operation - Operation name to get statistics for
     * @returns Summary statistics or null if no metrics found
     */
    getStatistics(operation: string): {
        count: number;
        avgDuration: number;
        minDuration: number;
        maxDuration: number;
        totalDuration: number;
    } | null;
    /**
     * Clear all recorded metrics
     */
    clearMetrics(): void;
    /**
     * Clear metrics for a specific operation
     *
     * @param operation - Operation name to clear metrics for
     */
    clearMetricsForOperation(operation: string): void;
    /**
     * Get the total number of recorded metrics
     *
     * @returns Total number of metrics
     */
    getMetricsCount(): number;
    /**
     * Get all unique operation names
     *
     * @returns Array of unique operation names
     */
    getOperations(): string[];
}
//# sourceMappingURL=PerformanceMonitorService.d.ts.map
