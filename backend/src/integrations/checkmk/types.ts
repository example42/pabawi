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
}

export const SERVICE_STATE_NAMES: Record<number, string> = {
  0: "OK",
  1: "WARN",
  2: "CRIT",
  3: "UNKNOWN",
};
