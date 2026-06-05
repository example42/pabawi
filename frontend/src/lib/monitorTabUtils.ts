/**
 * Utility functions for the MonitorTab component.
 * Extracted for testability (Property 9: Service grouping order).
 */

import type { ServiceStatus } from './checkmkApi';

/** Valid Checkmk service state values */
export type ServiceState = 0 | 1 | 2 | 3;

/** Numeric state values in display order: CRIT → WARN → UNKNOWN → OK */
export const STATE_ORDER: readonly ServiceState[] = [2, 1, 3, 0];

/** Human-readable state names keyed by numeric state */
export const STATE_NAMES: Record<ServiceState, string> = {
  0: 'OK',
  1: 'WARN',
  2: 'CRIT',
  3: 'UNKNOWN',
};

/** TailwindCSS classes for semantic state colors (not integration purple) */
export const STATE_COLORS: Record<ServiceState, string> = {
  0: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  1: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400',
  2: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  3: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

/** Map state name string to numeric value */
export const STATE_NAME_TO_NUM: Record<string, ServiceState> = {
  OK: 0,
  WARN: 1,
  CRIT: 2,
  UNKNOWN: 3,
};

export type ServiceSortMode = 'status' | 'lastStateChange';

export interface ServiceGroup {
  state: ServiceState;
  name: string;
  services: ServiceStatus[];
}

function resolveServiceState(state: ServiceStatus['state'] | string): ServiceState {
  if (typeof state === 'number') {
    return state;
  }

  return STATE_NAME_TO_NUM[state] ?? 3;
}

/**
 * Group services by state in severity order: CRIT → WARN → UNKNOWN → OK.
 * Empty groups are omitted.
 *
 * Validates: Requirements 9.3
 */
export function groupServicesByState(services: ServiceStatus[]): ServiceGroup[] {
  const groups: ServiceGroup[] = [];
  for (const stateNum of STATE_ORDER) {
    const stateName = STATE_NAMES[stateNum];
    const matching = services.filter(s => resolveServiceState(s.state) === stateNum);
    if (matching.length > 0) {
      groups.push({ state: stateNum, name: stateName, services: matching });
    }
  }
  return groups;
}

/**
 * Sort services by lastStateChange (most recent first), returning a flat list.
 */
export function sortServicesByLastStateChange(services: ServiceStatus[]): ServiceStatus[] {
  return [...services].sort((a, b) => b.lastStateChange - a.lastStateChange);
}
