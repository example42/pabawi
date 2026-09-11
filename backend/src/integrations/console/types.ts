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

/**
 * Connection material a provider produced for one session.
 *
 * Kept separate from {@link ConsoleSession} because this is a credential, not
 * session metadata: a Proxmox upstream URL embeds a live VNC ticket. It is
 * handed to the connection broker in memory and never persisted or logged.
 */
export interface ConsoleUpstream {
  /** Absolute WebSocket URL the broker dials, including any ticket. */
  url: string;
}

/**
 * What a provider returns when it has prepared a session upstream.
 *
 * Only the upstream: the session's identity, token and lifecycle belong to the
 * caller that reserved it, so a provider cannot mint a credential for a session
 * the database does not know about.
 */
export interface ConsoleSessionAdmission {
  upstream: ConsoleUpstream;
}

/** What a provider needs in order to prepare an upstream. */
export interface ConsoleSessionRequest {
  /** Provider-specific node identifier. */
  nodeId: string;

  /** Account the session belongs to. */
  userId: string;

  /** Identity assigned by the caller's capacity reservation. */
  sessionId: string;

  /** Transport the caller reserved and expects to be prepared. */
  transport: ConsoleTransport;
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
   * Prepare the upstream for a session that has already been reserved.
   *
   * Reserving session capacity has to happen before any provider resource is
   * created, so the identity, token and transport all come from the caller. A
   * provider that minted its own would be creating a session nobody reserved
   * and a credential nothing can validate.
   *
   * The returned upstream is connection material for the broker, not session
   * state; it must not be persisted.
   *
   * Rejects with a typed error if the node has no console capability
   * for this provider.
   */
  createSession(request: ConsoleSessionRequest): Promise<ConsoleSessionAdmission>;

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
