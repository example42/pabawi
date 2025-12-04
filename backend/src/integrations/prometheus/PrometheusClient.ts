/**
 * Prometheus Client
 *
 * Client for interacting with Prometheus monitoring system.
 * Provides methods for querying metrics and alerts.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  PrometheusConfig,
  NodeMetrics,
  PrometheusAlert,
  PrometheusApiResponse,
  PrometheusQueryData,
  PrometheusAlertsData,
} from './types';

// Type declarations for Node.js globals
declare const require: any;
declare const Buffer: any;

interface HttpResponse {
  statusCode: number;
  body: string;
}

/**
 * Client for Prometheus API
 */
export class PrometheusClient {
  private baseUrl: string;
  private timeout: number;
  private username?: string;
  private password?: string;

  constructor(config: PrometheusConfig) {
    this.baseUrl = config.serverUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout ?? 30000;
    this.username = config.username;
    this.password = config.password;
  }

  /**
   * Check if Prometheus server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request(`${this.baseUrl}/-/healthy`);
      return response.statusCode === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute a PromQL query
   */
  async query(promql: string, time?: Date): Promise<PrometheusQueryData> {
    const params: Record<string, string> = { query: promql };
    if (time) {
      params.time = (time.getTime() / 1000).toString();
    }

    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await this.request(
      `${this.baseUrl}/api/v1/query?${queryString}`
    );

    if (response.statusCode !== 200) {
      throw new Error(`Prometheus query failed: HTTP ${response.statusCode}`);
    }

    const data: PrometheusApiResponse<PrometheusQueryData> = JSON.parse(response.body);

    if (data.status !== 'success' || !data.data) {
      throw new Error(`Prometheus query failed: ${data.error ?? 'Unknown error'}`);
    }

    return data.data;
  }

  /**
   * Execute a range PromQL query
   */
  async queryRange(
    promql: string,
    start: Date,
    end: Date,
    step: string
  ): Promise<PrometheusQueryData> {
    const params: Record<string, string> = {
      query: promql,
      start: (start.getTime() / 1000).toString(),
      end: (end.getTime() / 1000).toString(),
      step,
    };

    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await this.request(
      `${this.baseUrl}/api/v1/query_range?${queryString}`
    );

    if (response.statusCode !== 200) {
      throw new Error(`Prometheus range query failed: HTTP ${response.statusCode}`);
    }

    const data: PrometheusApiResponse<PrometheusQueryData> = JSON.parse(response.body);

    if (data.status !== 'success' || !data.data) {
      throw new Error(`Prometheus range query failed: ${data.error ?? 'Unknown error'}`);
    }

    return data.data;
  }

  /**
   * Get node metrics
   */
  async getNodeMetrics(nodeName: string): Promise<NodeMetrics> {
    const metrics: NodeMetrics = {};

    // Define metric queries
    const queries: Record<string, string> = {
      cpu: `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~"${nodeName}.*"}[5m])) * 100)`,
      memory: `(1 - (node_memory_MemAvailable_bytes{instance=~"${nodeName}.*"} / node_memory_MemTotal_bytes{instance=~"${nodeName}.*"})) * 100`,
      disk: `100 - ((node_filesystem_avail_bytes{instance=~"${nodeName}.*",mountpoint="/"} * 100) / node_filesystem_size_bytes{instance=~"${nodeName}.*",mountpoint="/"})`,
      load1: `node_load1{instance=~"${nodeName}.*"}`,
      load5: `node_load5{instance=~"${nodeName}.*"}`,
      load15: `node_load15{instance=~"${nodeName}.*"}`,
      uptime: `node_time_seconds{instance=~"${nodeName}.*"} - node_boot_time_seconds{instance=~"${nodeName}.*"}`,
    };

    // Execute queries in parallel
    const results = await Promise.allSettled(
      Object.entries(queries).map(async ([key, queryStr]) => {
        const result = await this.query(queryStr);
        return { key, result };
      })
    );

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.result.result.length > 0) {
        const { key, result: queryResult } = result.value;
        const value = parseFloat(queryResult.result[0].value?.[1] ?? '0');

        switch (key) {
          case 'cpu':
            metrics.cpu = value;
            break;
          case 'memory':
            metrics.memory = value;
            break;
          case 'disk':
            metrics.disk = value;
            break;
          case 'load1':
            if (!metrics.load) metrics.load = { load1: 0, load5: 0, load15: 0 };
            metrics.load.load1 = value;
            break;
          case 'load5':
            if (!metrics.load) metrics.load = { load1: 0, load5: 0, load15: 0 };
            metrics.load.load5 = value;
            break;
          case 'load15':
            if (!metrics.load) metrics.load = { load1: 0, load5: 0, load15: 0 };
            metrics.load.load15 = value;
            break;
          case 'uptime':
            metrics.uptime = value;
            break;
        }
      }
    }

    return metrics;
  }

  /**
   * Get active alerts
   */
  async getAlerts(nodeName?: string): Promise<PrometheusAlert[]> {
    const response = await this.request(`${this.baseUrl}/api/v1/alerts`);

    if (response.statusCode !== 200) {
      throw new Error(`Failed to get alerts: HTTP ${response.statusCode}`);
    }

    const data: PrometheusApiResponse<PrometheusAlertsData> = JSON.parse(response.body);

    if (data.status !== 'success' || !data.data) {
      throw new Error(`Failed to get alerts: ${data.error ?? 'Unknown error'}`);
    }

    let alerts = data.data.alerts;

    // Filter by node name if provided
    if (nodeName) {
      alerts = alerts.filter(
        (alert) =>
          alert.labels.instance?.includes(nodeName) ||
          alert.labels.node?.includes(nodeName) ||
          alert.labels.hostname?.includes(nodeName)
      );
    }

    return alerts;
  }

  /**
   * Get metric series labels
   */
  async getSeries(match: string[]): Promise<Array<Record<string, string>>> {
    const matchParams = match
      .map((m) => `match[]=${encodeURIComponent(m)}`)
      .join('&');

    const response = await this.request(
      `${this.baseUrl}/api/v1/series?${matchParams}`
    );

    if (response.statusCode !== 200) {
      throw new Error(`Failed to get series: HTTP ${response.statusCode}`);
    }

    const data: PrometheusApiResponse<Array<Record<string, string>>> = JSON.parse(response.body);

    if (data.status !== 'success' || !data.data) {
      throw new Error(`Failed to get series: ${data.error ?? 'Unknown error'}`);
    }

    return data.data;
  }

  /**
   * Make HTTP request to Prometheus API
   */
  private async request(url: string): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      // Dynamically import to avoid TypeScript module issues
      const urlModule = require('url');
      const parsedUrl = urlModule.parse(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'GET',
        headers: {} as Record<string, string>,
        timeout: this.timeout,
      };

      // Add basic auth if configured
      if (this.username && this.password) {
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        options.headers['Authorization'] = `Basic ${auth}`;
      }

      const req = httpModule.request(options, (res: any) => {
        let body = '';

        res.on('data', (chunk: any) => {
          body += chunk.toString();
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body,
          });
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }
}
