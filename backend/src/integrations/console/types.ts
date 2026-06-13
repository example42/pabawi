import type { IntegrationPlugin } from "../types";

/** Supported transport protocols */
export type ConsoleTransport = "websocket-vnc" | "websocket-terminal";

/** Describes a console capability for a node */
export interface ConsoleCapability {
  transport: ConsoleTransport;
  /** Display label for the console option (max 100 chars) */
  displayName: string;
  /** Provider-specific connection parameters schema */
  connectionSchema: Record<string, unknown>;
}

/** Session state machine */
export type ConsoleSessionState =
  | "creating"
  | "active"
  | "terminated"
  | "failed";

/** Session status returned by getSessionStatus */
export interface ConsoleSessionStatus {
  state: ConsoleSessionState;
  /** ISO 8601 timestamp */
  startedAt: string;
  /** Present when state is "failed" */
  error?: string;
}

/** Full session object returned by createSession */
export interface ConsoleSession {
  sessionId: string;
  /** Short-lived session token for WebSocket auth */
  token: string;
  /** Relative WebSocket URL for the client to connect */
  wsUrl: string;
  transport: ConsoleTransport;
  state: ConsoleSessionState;
  /** ISO 8601 timestamp */
  startedAt: string;
  nodeId: string;
  userId: string;
  provider: string;
}

/**
 * Console plugin interface — third plugin type alongside execution/information.
 *
 * Detected via duck-typing (type guard in IntegrationManager) rather than
 * narrowing the `type` field, since a single plugin (e.g. Proxmox) may
 * implement both InformationSourcePlugin and ConsolePlugin simultaneously.
 */
export interface ConsolePlugin extends IntegrationPlugin {
  /** List console capabilities available for a given node */
  getConsoleCapabilities(nodeId: string): Promise<ConsoleCapability[]>;

  /**
   * Create a new console session.
   * Rejects with a typed error if the node has no console capability
   * for this provider.
   */
  createSession(nodeId: string, userId: string): Promise<ConsoleSession>;

  /**
   * Terminate an active session.
   * Returns false without throwing for non-existent or already-terminated sessions.
   */
  terminateSession(sessionId: string): Promise<boolean>;

  /** Get current status of a session */
  getSessionStatus(sessionId: string): Promise<ConsoleSessionStatus>;

  /**
   * List transport protocols this provider supports.
   * Must return between 1 and 10 entries.
   */
  getSupportedTransports(): ConsoleTransport[];
}
