export interface CheckmkConfig {
  enabled: boolean;
  serverUrl: string;
  site?: string;
  username: string;
  password: string; // pragma: allowlist secret
  sslVerify: boolean;
  healthCheckIntervalMs: number;
  livestatus?: CheckmkLivestatusConfig;
}

export interface CheckmkLivestatusConfig {
  host: string;
  port: number;
  tls: boolean;
  timeoutMs: number;
}

export interface CheckmkHost {
  hostname: string;
  attributes: {
    ipaddress?: string;
    folder?: string;
    labels?: Record<string, string>;
    [key: string]: unknown;
  };
}

export interface CheckmkServiceStatus {
  description: string;
  state: 0 | 1 | 2 | 3;
  stateType: 0 | 1;
  pluginOutput: string;
  lastCheck: number;
  lastState: 0 | 1 | 2 | 3;
  lastStateChange: number;
}

export interface CheckmkEvent {
  timestamp: string;
  serviceDescription: string;
  previousState: 0 | 1 | 2 | 3;
  currentState: 0 | 1 | 2 | 3;
  output: string;
}

export interface CheckmkHostEvent extends CheckmkEvent {
  hostname: string;
}

export interface CheckmkFailingService {
  hostname: string;
  serviceDescription: string;
  state: 0 | 1 | 2 | 3;
  lastState: 0 | 1 | 2 | 3;
  lastStateChange: number;
  output: string;
  acknowledged: boolean;
  /**
   * True when the service is currently suppressed by a scheduled downtime —
   * either a downtime on the service itself or an inherited downtime from its
   * host. Derived from `scheduled_downtime_depth` and
   * `host_scheduled_downtime_depth` being greater than zero.
   */
  inDowntime: boolean;
}

/**
 * Options for acknowledging a service problem via the Checkmk REST API.
 * Mirrors the fields of the `acknowledge/collections/service` endpoint.
 */
export interface CheckmkAcknowledgeOptions {
  hostname: string;
  serviceDescription: string;
  comment: string;
  /** Acknowledgement persists across state recoveries until removed (default true). */
  sticky: boolean;
  /** Comment survives a Checkmk restart (default false). */
  persistent: boolean;
  /** Send notifications about the acknowledgement (default true). */
  notify: boolean;
}

/**
 * Options for scheduling a service downtime via the Checkmk REST API.
 * Mirrors the fields of the `downtime/collections/service` endpoint.
 */
export interface CheckmkDowntimeOptions {
  hostname: string;
  serviceDescription: string;
  comment: string;
  /** ISO-8601 start timestamp. */
  startTime: string;
  /** ISO-8601 end timestamp. */
  endTime: string;
}

/** Result of a Checkmk write action (acknowledge / downtime). */
export interface CheckmkActionResult {
  success: boolean;
  error?: string;
}

export interface CheckmkHostSummary {
  hostname: string;
  total: number;
  ok: number;
  warn: number;
  crit: number;
  unknown: number;
}

export interface CheckmkHostStateSummary {
  up: number;
  down: number;
  unreachable: number;
  inDowntime: number;
  total: number;
}

export const SERVICE_STATE_NAMES: Record<number, string> = {
  0: "OK",
  1: "WARN",
  2: "CRIT",
  3: "UNKNOWN",
};
