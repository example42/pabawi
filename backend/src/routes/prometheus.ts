/**
 * Prometheus API Routes
 *
 * Express routes for Prometheus metrics and alerts.
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from './asyncHandler';
import type { IntegrationManager } from '../integrations/IntegrationManager';
import type { PrometheusPlugin } from '../integrations/prometheus';

/**
 * Create Prometheus router
 */
export function createPrometheusRouter(
  integrationManager: IntegrationManager
): Router {
  const router = Router();

  /**
   * Get health status of Prometheus integration
   */
  router.get(
    '/health',
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      const health = await plugin.healthCheck();

      res.json({
        ...health,
        grafanaUrl: plugin.getGrafanaUrl(),
      });
    })
  );

  /**
   * Get metrics for a specific node
   * GET /api/prometheus/nodes/:name/metrics
   */
  router.get(
    '/nodes/:name/metrics',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      if (!plugin.isInitialized()) {
        res.status(503).json({
          error: 'Prometheus integration not initialized',
        });
        return;
      }

      const metrics = await plugin.getNodeMetrics(name);

      res.json(metrics);
    })
  );

  /**
   * Get alerts for a specific node
   * GET /api/prometheus/nodes/:name/alerts
   */
  router.get(
    '/nodes/:name/alerts',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      if (!plugin.isInitialized()) {
        res.status(503).json({
          error: 'Prometheus integration not initialized',
        });
        return;
      }

      const alerts = await plugin.getNodeAlerts(name);

      res.json(alerts);
    })
  );

  /**
   * Get all active alerts
   * GET /api/prometheus/alerts
   */
  router.get(
    '/alerts',
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      if (!plugin.isInitialized()) {
        res.status(503).json({
          error: 'Prometheus integration not initialized',
        });
        return;
      }

      const alerts = await plugin.getAllAlerts();

      res.json(alerts);
    })
  );

  /**
   * Execute a custom PromQL query
   * POST /api/prometheus/query
   * Body: { query: string }
   */
  router.post(
    '/query',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { query } = req.body;

      if (!query) {
        res.status(400).json({
          error: 'Query is required',
        });
        return;
      }

      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      if (!plugin.isInitialized()) {
        res.status(503).json({
          error: 'Prometheus integration not initialized',
        });
        return;
      }

      const result = await plugin.executeQuery(query);

      res.json(result);
    })
  );

  /**
   * Get Grafana dashboard URL for a node
   * GET /api/prometheus/nodes/:name/grafana
   */
  router.get(
    '/nodes/:name/grafana',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name } = req.params;

      const plugin = integrationManager.getInformationSource('prometheus') as PrometheusPlugin | null;

      if (!plugin) {
        res.status(404).json({
          error: 'Prometheus integration not found',
        });
        return;
      }

      const grafanaUrl = plugin.getGrafanaUrl();

      if (!grafanaUrl) {
        res.status(404).json({
          error: 'Grafana URL not configured',
        });
        return;
      }

      res.json({
        dashboardUrl: `${grafanaUrl}/d/node-exporter?var-instance=${name}`,
        explorerUrl: `${grafanaUrl}/explore?left=${encodeURIComponent(
          JSON.stringify({
            queries: [{ expr: `{instance=~"${name}.*"}`, refId: 'A' }],
            range: { from: 'now-1h', to: 'now' },
          })
        )}`,
      });
    })
  );

  return router;
}

export default createPrometheusRouter;

