/**
 * Performance monitoring service for tracking authentication and authorization metrics
 *
 * Tracks:
 * - Authentication timing metrics
 * - Permission check timing metrics
 * - Cache hit rates
 * - Slow queries (>200ms)
 *
 * Requirements: 15.3, 15.4
 */
export class PerformanceMonitor {
  private metrics: {
    authenticationTimes: number[];
    permissionCheckTimes: number[];
    cacheHits: number;
    cacheMisses: number;
    slowQueries: Array<{ query: string; duration: number; timestamp: string }>;
  };

  private readonly SLOW_QUERY_THRESHOLD_MS = 200;
  private readonly MAX_METRICS_HISTORY = 1000;

  constructor() {
    this.metrics = {
      authenticationTimes: [],
      permissionCheckTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: []
    };
  }

  /**
   * Record authentication timing
   *
   * @param durationMs - Duration in milliseconds
   */
  public recordAuthentication(durationMs: number): void {
    this.metrics.authenticationTimes.push(durationMs);

    // Keep only recent metrics
    if (this.metrics.authenticationTimes.length > this.MAX_METRICS_HISTORY) {
      this.metrics.authenticationTimes.shift();
    }

    // Log slow authentication (>200ms)
    if (durationMs > this.SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`[PERFORMANCE] Slow authentication: ${durationMs.toFixed(2)}ms`);
      this.recordSlowQuery('authentication', durationMs);
    }
  }

  /**
   * Record permission check timing
   *
   * @param durationMs - Duration in milliseconds
   * @param cacheHit - Whether the result was from cache
   */
  public recordPermissionCheck(durationMs: number, cacheHit: boolean): void {
    this.metrics.permissionCheckTimes.push(durationMs);

    // Keep only recent metrics
    if (this.metrics.permissionCheckTimes.length > this.MAX_METRICS_HISTORY) {
      this.metrics.permissionCheckTimes.shift();
    }

    // Track cache hit/miss
    if (cacheHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    // Log slow permission check (>200ms)
    if (durationMs > this.SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`[PERFORMANCE] Slow permission check: ${durationMs.toFixed(2)}ms (cache ${cacheHit ? 'hit' : 'miss'})`);
      this.recordSlowQuery('permission_check', durationMs);
    }
  }

  /**
   * Record a slow query
   *
   * @param query - Query identifier
   * @param durationMs - Duration in milliseconds
   */
  private recordSlowQuery(query: string, durationMs: number): void {
    this.metrics.slowQueries.push({
      query,
      duration: durationMs,
      timestamp: new Date().toISOString()
    });

    // Keep only recent slow queries
    if (this.metrics.slowQueries.length > 100) {
      this.metrics.slowQueries.shift();
    }
  }

  /**
   * Get cache hit rate
   *
   * @returns Cache hit rate as percentage (0-100)
   */
  public getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;
    return (this.metrics.cacheHits / total) * 100;
  }

  /**
   * Get authentication statistics
   *
   * @returns Authentication timing statistics
   */
  public getAuthenticationStats(): {
    count: number;
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    return this.calculateStats(this.metrics.authenticationTimes);
  }

  /**
   * Get permission check statistics
   *
   * @returns Permission check timing statistics
   */
  public getPermissionCheckStats(): {
    count: number;
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    return this.calculateStats(this.metrics.permissionCheckTimes);
  }

  /**
   * Get slow queries
   *
   * @returns Array of slow queries
   */
  public getSlowQueries(): Array<{ query: string; duration: number; timestamp: string }> {
    return [...this.metrics.slowQueries];
  }

  /**
   * Get all metrics summary
   *
   * @returns Complete metrics summary
   */
  public getMetricsSummary(): {
    authentication: {
      count: number;
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
    permissionChecks: {
      count: number;
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
    cache: {
      hits: number;
      misses: number;
      hitRate: number;
    };
    slowQueries: Array<{ query: string; duration: number; timestamp: string }>;
  } {
    return {
      authentication: this.getAuthenticationStats(),
      permissionChecks: this.getPermissionCheckStats(),
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: this.getCacheHitRate()
      },
      slowQueries: this.getSlowQueries()
    };
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.metrics = {
      authenticationTimes: [],
      permissionCheckTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      slowQueries: []
    };
  }

  /**
   * Calculate statistics for a set of timing measurements
   *
   * @param times - Array of timing measurements in milliseconds
   * @returns Statistics object
   */
  private calculateStats(times: number[]): {
    count: number;
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    if (times.length === 0) {
      return { count: 0, p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const count = sorted.length;

    const p50 = PerformanceMonitor.percentile(sorted, 50);
    const p95 = PerformanceMonitor.percentile(sorted, 95);
    const p99 = PerformanceMonitor.percentile(sorted, 99);
    const avg = sorted.reduce((sum, val) => sum + val, 0) / count;

    return { count, p50, p95, p99, avg };
  }

  /**
   * Calculate percentile value
   *
   * @param sortedArray - Sorted array of numbers
   * @param percentile - Percentile to calculate (0-100)
   * @returns Percentile value
   */
  private static percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedArray[lower];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
