/**
 * Checkmk API functions
 *
 * Domain-specific API functions for the Checkmk monitoring integration,
 * providing service status and monitoring event data for nodes.
 */

import { get } from './api';

/**
 * Service status as returned by the monitoring API.
 * Validates Requirements: 9.2, 11.1
 */
export interface ServiceStatus {
  description: string;
  state: 'OK' | 'WARN' | 'CRIT' | 'UNKNOWN';
  stateType: 'soft' | 'hard';
  pluginOutput: string;
  lastCheck: string; // ISO 8601 timestamp
}

/**
 * A state-change monitoring event for a node's service.
 * Validates Requirements: 9.2, 11.2
 */
export interface MonitoringEvent {
  timestamp: string;
  serviceDescription: string;
  previousState: string;
  currentState: string;
  output: string;
}

/**
 * Get live service status for a node from Checkmk.
 * Validates Requirements: 9.2, 11.1
 */
export async function getNodeServices(nodeId: string): Promise<ServiceStatus[]> {
  return get<ServiceStatus[]>(`/api/nodes/${encodeURIComponent(nodeId)}/services`, {
    maxRetries: 1,
    retryDelay: 1000,
  });
}

/**
 * Get monitoring state-change events for a node from Checkmk.
 * Validates Requirements: 9.2, 11.2
 */
export async function getNodeMonitoringEvents(
  nodeId: string,
  limit?: number,
): Promise<MonitoringEvent[]> {
  const params = limit ? `?limit=${String(limit)}` : '';
  return get<MonitoringEvent[]>(
    `/api/nodes/${encodeURIComponent(nodeId)}/monitoring-events${params}`,
    { maxRetries: 1, retryDelay: 1000 },
  );
}
