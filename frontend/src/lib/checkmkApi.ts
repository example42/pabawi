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
  state: 0 | 1 | 2 | 3;
  stateType: 0 | 1;
  pluginOutput: string;
  lastCheck: number; // Unix epoch seconds from Checkmk
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

function extractArrayPayload<T>(
  payload: unknown,
  key: 'services' | 'events',
): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const keyed = record[key];
    if (Array.isArray(keyed)) {
      return keyed as T[];
    }

    // Backward-compat for expert-mode responses that spread arrays into
    // numeric object keys plus _debug metadata.
    const numericEntries = Object.entries(record)
      .filter(([entryKey]) => /^\d+$/.test(entryKey))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => value);

    if (numericEntries.length > 0) {
      return numericEntries as T[];
    }
  }

  return [];
}

/**
 * Get live service status for a node from Checkmk.
 * Validates Requirements: 9.2, 11.1
 */
export async function getNodeServices(nodeId: string): Promise<ServiceStatus[]> {
  const data = await get<unknown>(`/api/nodes/${encodeURIComponent(nodeId)}/services`, {
    maxRetries: 1,
    retryDelay: 1000,
  });
  return extractArrayPayload(data, 'services');
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
  const data = await get<unknown>(
    `/api/nodes/${encodeURIComponent(nodeId)}/monitoring-events${params}`,
    { maxRetries: 1, retryDelay: 1000 },
  );
  return extractArrayPayload(data, 'events');
}
