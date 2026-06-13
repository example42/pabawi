/**
 * Proxmox Console Provider
 *
 * Implements the ConsolePlugin interface for Proxmox VMs and LXC containers,
 * providing VNC console access via WebSocket proxy.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 1.6, 1.7
 */

import { randomBytes } from "crypto";
import { randomUUID } from "crypto";

import type {
  ConsoleCapability,
  ConsolePlugin,
  ConsoleSession,
  ConsoleSessionStatus,
  ConsoleTransport,
} from "../console/types";
import type { IntegrationConfig } from "../types";

import type { LoggerService } from "../../services/LoggerService";
import type { ProxmoxClient } from "./ProxmoxClient";
import type { ProxmoxConfig, ProxmoxGuest } from "./types";
import { ProxmoxAuthenticationError, ProxmoxError } from "./types";

/** Response from Proxmox vncproxy endpoint */
interface VncProxyResponse {
  ticket: string;
  port: string;
  upid?: string;
}

/** Internal session store entry */
interface SessionEntry {
  session: ConsoleSession;
  upstreamUrl: string;
}

const COMPONENT = "ProxmoxConsoleProvider";

/**
 * ProxmoxConsoleProvider — ConsolePlugin implementation for Proxmox VE.
 *
 * Advertises `websocket-vnc` transport. Creates VNC proxy sessions by
 * requesting tickets from the Proxmox API and building upstream WS URLs.
 */
export class ProxmoxConsoleProvider implements ConsolePlugin {
  readonly name = "proxmox";
  readonly type = "both" as const;

  /** In-memory session store (keyed by sessionId) */
  private sessions = new Map<string, SessionEntry>();
  private config: IntegrationConfig = {
    enabled: true,
    name: "proxmox",
    type: "both",
    config: {},
  };

  constructor(
    private proxmoxClient: ProxmoxClient,
    private proxmoxConfig: ProxmoxConfig,
    private logger: LoggerService,
  ) {
    this.logger.debug("ProxmoxConsoleProvider created", {
      component: COMPONENT,
      operation: "constructor",
    });
  }

  // ========================================
  // IntegrationPlugin interface
  // ========================================

  initialize(config: IntegrationConfig): Promise<void> {
    this.config = config;
    return Promise.resolve();
  }

  healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    lastCheck: string;
  }> {
    return Promise.resolve({
      healthy: true,
      message: "Proxmox console provider healthy",
      lastCheck: new Date().toISOString(),
    });
  }

  getConfig(): IntegrationConfig {
    return this.config;
  }

  isInitialized(): boolean {
    return true;
  }

  // ========================================
  // ConsolePlugin interface
  // ========================================

  /**
   * Check console capabilities for a node.
   *
   * Returns `websocket-vnc` capability if the guest exists and is running.
   * Returns empty array if guest is not running or not found.
   *
   * Requirement 9.8
   */
  async getConsoleCapabilities(nodeId: string): Promise<ConsoleCapability[]> {
    try {
      const { node, vmid } = this.parseNodeId(nodeId);
      const guestType = await this.getGuestType(node, vmid);
      const status = await this.getGuestStatus(node, vmid, guestType);

      if (status !== "running") {
        return [];
      }

      return [
        {
          transport: "websocket-vnc",
          displayName: "VNC Console",
          connectionSchema: {},
        },
      ];
    } catch (error) {
      this.logger.debug("Cannot determine console capabilities", {
        component: COMPONENT,
        operation: "getConsoleCapabilities",
        metadata: {
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return [];
    }
  }

  /**
   * Create a console session for a Proxmox guest.
   *
   * 1. Parse nodeId → node, vmid
   * 2. Determine guest type (qemu/lxc)
   * 3. Verify running state (Req 9.6)
   * 4. Call vncproxy endpoint (Req 9.2, 9.4)
   * 5. Build upstream WS URL (Req 9.3)
   * 6. Generate session token and return ConsoleSession
   *
   * Error handling:
   * - Auth errors → session failure with auth message (Req 9.5)
   * - Not running → session failure with running message (Req 9.6)
   * - Timeout/not found → session failure with category message (Req 9.7)
   * - Node without console capability → typed error (Req 1.6)
   */
  async createSession(nodeId: string, userId: string): Promise<ConsoleSession> {
    const { node, vmid } = this.parseNodeId(nodeId);

    // Determine guest type
    let guestType: "qemu" | "lxc";
    try {
      guestType = await this.getGuestType(node, vmid);
    } catch (error) {
      if (error instanceof ProxmoxError && error.code === "HTTP_404") {
        throw new Error(
          `Resource not found: guest ${String(vmid)} on node ${node} does not exist`,
        );
      }
      throw this.wrapApiError(error, "determine guest type");
    }

    // Verify guest is running (Req 9.6)
    const status = await this.getGuestStatus(node, vmid, guestType);
    if (status !== "running") {
      throw new Error(
        "Guest must be running for console access",
      );
    }

    // Call vncproxy endpoint (Req 9.2, 9.4)
    const vncProxyEndpoint =
      `/api2/json/nodes/${node}/${guestType}/${String(vmid)}/vncproxy`;

    let vncResponse: VncProxyResponse;
    try {
      // ProxmoxClient.post() casts to string but actually returns the data object
      const raw = await this.proxmoxClient.post(vncProxyEndpoint, {
        websocket: 1,
      });
      vncResponse = raw as unknown as VncProxyResponse;
    } catch (error) {
      throw this.wrapApiError(error, "request VNC proxy ticket");
    }

    // Build upstream WebSocket URL (Req 9.3)
    const host = this.proxmoxConfig.host;
    const port = vncResponse.port;
    const ticket = encodeURIComponent(vncResponse.ticket);
    const upstreamUrl =
      `wss://${host}:${port}/api2/json/nodes/${node}/${guestType}/${String(vmid)}/vncwebsocket?port=${port}&vncticket=${ticket}`;

    // Generate session token and ID
    const sessionId = randomUUID();
    const token = randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    const session: ConsoleSession = {
      sessionId,
      token,
      wsUrl: `/ws/console/vnc?token=${token}`,
      transport: "websocket-vnc",
      state: "active",
      startedAt: now,
      nodeId,
      userId,
      provider: "proxmox",
    };

    // Store session locally for status/termination tracking
    this.sessions.set(sessionId, { session, upstreamUrl });

    this.logger.info("Proxmox console session created", {
      component: COMPONENT,
      operation: "createSession",
      metadata: { sessionId, nodeId, userId, guestType },
    });

    return session;
  }

  /**
   * Terminate a console session.
   *
   * Returns false without throwing for non-existent or already-terminated
   * sessions (Req 1.7).
   */
  terminateSession(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return Promise.resolve(false);
    }

    if (entry.session.state === "terminated") {
      return Promise.resolve(false);
    }

    entry.session.state = "terminated";
    this.sessions.delete(sessionId);

    this.logger.info("Proxmox console session terminated", {
      component: COMPONENT,
      operation: "terminateSession",
      metadata: { sessionId },
    });

    return Promise.resolve(true);
  }

  /**
   * Get current session status.
   */
  getSessionStatus(sessionId: string): Promise<ConsoleSessionStatus> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return Promise.resolve({
        state: "terminated" as const,
        startedAt: new Date().toISOString(),
      });
    }

    return Promise.resolve({
      state: entry.session.state,
      startedAt: entry.session.startedAt,
    });
  }

  /**
   * List supported transports.
   *
   * Requirement 9.8
   */
  getSupportedTransports(): ConsoleTransport[] {
    return ["websocket-vnc"];
  }

  // ========================================
  // Internal helpers
  // ========================================

  /**
   * Parse a node ID in format `proxmox:{node}:{vmid}`.
   */
  private parseNodeId(nodeId: string): { node: string; vmid: number } {
    const parts = nodeId.split(":");
    if (parts.length !== 3 || parts[0] !== "proxmox") {
      throw new Error(
        `Invalid nodeId format: ${nodeId}. Expected format: proxmox:{node}:{vmid}`,
      );
    }

    const vmid = parseInt(parts[2], 10);
    if (isNaN(vmid)) {
      throw new Error(`Invalid VMID in nodeId: ${nodeId}`);
    }

    return { node: parts[1], vmid };
  }

  /**
   * Determine guest type by querying cluster resources.
   */
  private async getGuestType(
    node: string,
    vmid: number,
  ): Promise<"qemu" | "lxc"> {
    const resources = await this.proxmoxClient.get(
      "/api2/json/cluster/resources?type=vm",
    );

    if (!Array.isArray(resources)) {
      throw new Error("Unexpected response format from Proxmox API");
    }

    const guest = (resources as ProxmoxGuest[]).find(
      (r) => r.node === node && r.vmid === vmid,
    );

    if (!guest) {
      throw new ProxmoxError(
        `Guest with VMID ${String(vmid)} not found on node ${node}`,
        "HTTP_404",
      );
    }

    return guest.type;
  }

  /**
   * Get guest status from the Proxmox API.
   */
  private async getGuestStatus(
    node: string,
    vmid: number,
    guestType: "qemu" | "lxc",
  ): Promise<string> {
    const endpoint =
      `/api2/json/nodes/${node}/${guestType}/${String(vmid)}/status/current`;

    const response = (await this.proxmoxClient.get(endpoint)) as {
      status: string;
    };

    return response.status;
  }

  /**
   * Wrap Proxmox API errors into descriptive messages for session failure.
   *
   * Handles: auth errors (Req 9.5), timeout (Req 9.7), not found (Req 9.7).
   */
  private wrapApiError(error: unknown, operation: string): Error {
    if (error instanceof ProxmoxAuthenticationError) {
      return new Error(
        `Authentication failed while attempting to ${operation}: ${error.message}`,
      );
    }

    if (error instanceof ProxmoxError) {
      if (error.code === "HTTP_404") {
        return new Error(
          `Resource not found while attempting to ${operation}: ${error.message}`,
        );
      }
      return new Error(
        `Proxmox API error while attempting to ${operation}: ${error.message}`,
      );
    }

    if (error instanceof Error) {
      if (
        error.message.includes("timed out") ||
        error.message.includes("ETIMEDOUT")
      ) {
        return new Error(
          `Connection timeout while attempting to ${operation}: ${error.message}`,
        );
      }
      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ENOTFOUND")
      ) {
        return new Error(
          `Connection failed while attempting to ${operation}: ${error.message}`,
        );
      }
      return new Error(
        `Failed to ${operation}: ${error.message}`,
      );
    }

    return new Error(`Failed to ${operation}: ${String(error)}`);
  }
}
