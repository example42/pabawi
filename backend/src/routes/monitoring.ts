import { Router } from 'express';
import { performanceMonitor } from '../services/PerformanceMonitor';

const router = Router();

/**
 * GET /api/monitoring/metrics
 * Get performance metrics summary
 *
 * Returns:
 * - Authentication timing statistics (p50, p95, p99, avg)
 * - Permission check timing statistics
 * - Cache hit rate
 * - Slow queries (>200ms)
 *
 * Requirements: 15.3, 15.4
 */
router.get('/metrics', (_req, res) => {
  try {
    const metrics = performanceMonitor.getMetricsSummary();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch performance metrics'
      }
    });
  }
});

/**
 * POST /api/monitoring/metrics/reset
 * Reset all performance metrics
 *
 * This endpoint allows administrators to clear accumulated metrics.
 * Useful for testing or after resolving performance issues.
 */
router.post('/metrics/reset', (_req, res) => {
  try {
    performanceMonitor.reset();
    res.json({ message: 'Performance metrics reset successfully' });
  } catch (error) {
    console.error('Error resetting performance metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reset performance metrics'
      }
    });
  }
});

export default router;
