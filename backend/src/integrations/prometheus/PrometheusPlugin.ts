/**
 * Prometheus Integration Plugin
 *
 * Information source plugin for Prometheus monitoring system.
 * Provides node metrics and alerts through Pabawi's plugin architecture.
 */

import { BasePlugin } from '../BasePlugin';
import { PrometheusClient } from './PrometheusClient';
import type { InformationSourcePlugin, HealthStatus } from '../types';
import type { Node, Facts } from '../../bolt/types';
import type { PrometheusConfig, NodeMetrics, PrometheusAlert } from './types';

/**
 * Prometheus integration plugin
 */
export class PrometheusPlugin extends BasePlugin implements InformationSourcePlugin {
  type: 'information' = 'information';
  private client?: PrometheusClient;
  private prometheusConfig?: PrometheusConfig;
  private grafanaUrl?: string;

  constructor() {
    super('prometheus', 'information');
  }

  /**
   * Initialize the plugin with configuration
   */
  protected async performInitialization(): Promise<void> {
    const config = this.config.config as unknown as PrometheusConfig;

    if (!config.serverUrl) {
      throw new Error('Prometheus server URL is required');
    }

    this.prometheusConfig = config;
    this.grafanaUrl = config.grafanaUrl;
    this.client = new PrometheusClient(config);

    // Test connection
    const healthy = await this.client.healthCheck();
    if (!healthy) {
      throw new Error('Failed to connect to Prometheus server');
    }

    this.log('Successfully connected to Prometheus server');
  }

  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<Omit<HealthStatus, 'lastCheck'>> {
    if (!this.client) {
      return {
        healthy: false,
        message: 'Client not initialized',
      };
    }

    try {
      const healthy = await this.client.healthCheck();

      if (healthy) {
        return {
          healthy: true,
          message: 'Prometheus server is healthy',
          details: {
            serverUrl: this.prometheusConfig?.serverUrl,
            grafanaUrl: this.grafanaUrl,
          },
        };
      }

      return {
        healthy: false,
        message: 'Prometheus server is not responding',
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * Get inventory - Prometheus doesn't provide inventory, returns empty array
   */
  async getInventory(): Promise<Node[]> {
    // Prometheus doesn't provide node inventory
    // Nodes are discovered through other sources (Bolt, PuppetDB, etc.)
    return [];
  }

  /**
   * Get node facts - returns metrics as facts
   */
  async getNodeFacts(nodeId: string): Promise<Facts> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const metrics = await this.client.getNodeMetrics(nodeId);
      const alerts = await this.client.getAlerts(nodeId);

      // Convert metrics to facts format
      // Note: Prometheus doesn't provide standard OS facts, so we return a minimal Facts object
      // with Prometheus-specific data in the extended facts
      const facts: Facts = {
        nodeId,
        gatheredAt: new Date().toISOString(),
        source: 'prometheus',
        facts: {
          os: {
            family: 'unknown',
            name: 'unknown',
            release: {
              full: 'unknown',
              major: 'unknown',
            },
          },
          processors: {
            count: 0,
            models: [],
          },
          memory: {
            system: {
              total: 'unknown',
              available: 'unknown',
            },
          },
          networking: {
            hostname: nodeId,
            interfaces: {},
          },
        },
        // Add Prometheus-specific data as extended facts
        ...({
          prometheus_metrics: {
            cpu_usage_percent: metrics.cpu,
            memory_usage_percent: metrics.memory,
            disk_usage_percent: metrics.disk,
            load_average: metrics.load,
            uptime_seconds: metrics.uptime,
          },
          prometheus_alerts: alerts.map((alert) => ({
            name: alert.labels.alertname,
            severity: alert.labels.severity,
            state: alert.state,
            active_since: alert.activeAt,
            description: alert.annotations.description || alert.annotations.summary,
          })),
          prometheus_server: this.prometheusConfig?.serverUrl,
        } as any),
      };

      return facts;
    } catch (error) {
      this.logError('Failed to get node metrics', error);
      throw error;
    }
  }

  /**
   * Get node data - supports 'metrics' and 'alerts' data types
   */
  async getNodeData(nodeId: string, dataType: string): Promise<unknown> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      switch (dataType) {
        case 'metrics':
          return await this.client.getNodeMetrics(nodeId);

        case 'alerts':
          return await this.client.getAlerts(nodeId);

        case 'grafana_url':
          if (this.grafanaUrl) {
            return {
              dashboardUrl: `${this.grafanaUrl}/d/node-exporter?var-instance=${nodeId}`,
              explorerUrl: `${this.grafanaUrl}/explore?left=${encodeURIComponent(
                JSON.stringify({
                  queries: [{ expr: `{instance=~"${nodeId}.*"}`, refId: 'A' }],
                  range: { from: 'now-1h', to: 'now' },
                })
              )}`,
            };
          }
          return null;

        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }
    } catch (error) {
      this.logError(`Failed to get ${dataType} for node`, error);
      throw error;
    }
  }

  /**
   * Get metrics for a node
   */
  async getNodeMetrics(nodeId: string): Promise<NodeMetrics> {
    return (await this.getNodeData(nodeId, 'metrics')) as NodeMetrics;
  }

  /**
   * Get alerts for a node
   */
  async getNodeAlerts(nodeId: string): Promise<PrometheusAlert[]> {
    return (await this.getNodeData(nodeId, 'alerts')) as PrometheusAlert[];
  }

  /**
   * Get all active alerts
   */
  async getAllAlerts(): Promise<PrometheusAlert[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      return await this.client.getAlerts();
    } catch (error) {
      this.logError('Failed to get all alerts', error);
      throw error;
    }
  }

  /**
   * Execute a custom PromQL query
   */
  async executeQuery(promql: string): Promise<any> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      return await this.client.query(promql);
    } catch (error) {
      this.logError('Failed to execute query', error);
      throw error;
    }
  }

  /**
   * Get Grafana URL if configured
   */
  getGrafanaUrl(): string | undefined {
    return this.grafanaUrl;
  }
}
