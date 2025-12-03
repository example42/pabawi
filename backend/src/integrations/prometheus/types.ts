/**
 * Prometheus Integration Types
 *
 * Type definitions for Prometheus monitoring integration.
 */

/**
 * Configuration for Prometheus integration
 */
export interface PrometheusConfig {
  enabled: boolean;
  serverUrl: string;
  timeout?: number;
  username?: string;
  password?: string;
  grafanaUrl?: string;
}

/**
 * Node metrics from Prometheus
 */
export interface NodeMetrics {
  cpu?: number;
  memory?: number;
  disk?: number;
  network?: {
    rxBytes: number;
    txBytes: number;
  };
  load?: {
    load1: number;
    load5: number;
    load15: number;
  };
  uptime?: number;
}

/**
 * Prometheus alert
 */
export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'inactive' | 'pending' | 'firing';
  activeAt: string;
  value: string;
}

/**
 * Prometheus query result
 */
export interface PrometheusQueryResult {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
}

/**
 * Prometheus API response
 */
export interface PrometheusApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
  errorType?: string;
  warnings?: string[];
}

/**
 * Prometheus query response data
 */
export interface PrometheusQueryData {
  resultType: 'matrix' | 'vector' | 'scalar' | 'string';
  result: PrometheusQueryResult[];
}

/**
 * Prometheus alerts response data
 */
export interface PrometheusAlertsData {
  alerts: PrometheusAlert[];
}
