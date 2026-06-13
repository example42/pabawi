import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { URL } from "url";

import type { ConsoleConfig } from "../config/schema";
import type { ConsoleSession } from "../integrations/console/types";

import type { ConsoleSessionManager } from "./ConsoleSessionManager";
import type { LoggerService } from "./LoggerService";

/** WebSocket close codes for console proxy */
const CLOSE_CODES = {
  SESSION_DURATION_EXCEEDED: 4408,
  UPSTREAM_FAILURE: 4502,
  CONNECTION_TIMEOUT: 4504,
} as const;

/** Terminal control message types */
const CONTROL_MSG = { RESIZE: 0x01 } as const;

/** Expected frame length for resize: 1 type byte + 4 data bytes */
const RESIZE_FRAME_LENGTH = 5;

const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;
const UPSTREAM_CLOSE_TIMEOUT_MS = 5_000;
const COMPONENT = "ConsoleWebSocketProxy";

interface ProxyConfig {
  allowedOrigins: string[];
  console: ConsoleConfig;
}

/**
 * WebSocket proxy for console connections (VNC and terminal).
 * Attaches to the existing HTTP server with `noServer: true`.
 * Requirements: 4.1–4.8, 5.1–5.8, 8.5, 8.7
 */
export class ConsoleWebSocketProxy {
  private wss: WebSocketServer;

  constructor(
    httpServer: HTTPServer,
    private sessionManager: ConsoleSessionManager,
    private config: ProxyConfig,
    private logger: LoggerService,
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.handleUpgrade(req, socket, head);
    });
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = this.parseRequestUrl(req);
    if (!url) { socket.destroy(); return; }

    const { pathname } = url;
    if (pathname !== "/ws/console/vnc" && pathname !== "/ws/console/terminal") {
      return; // Not our path
    }

    if (!this.isOriginAllowed(req)) {
      this.logger.warn("WebSocket upgrade rejected: invalid origin", {
        component: COMPONENT, metadata: { origin: req.headers.origin ?? "none" },
      });
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      this.logger.warn("WebSocket upgrade rejected: missing token", { component: COMPONENT });
      socket.destroy();
      return;
    }

    void this.authenticateAndConnect(req, socket, head, token, pathname);
  }

  private async authenticateAndConnect(
    req: IncomingMessage, socket: Duplex, head: Buffer, token: string, pathname: string,
  ): Promise<void> {
    try {
      const session = await this.sessionManager.validateTokenForUpgrade(token);
      if (!session) {
        this.logger.warn("WebSocket upgrade rejected: invalid or expired token", { component: COMPONENT });
        socket.destroy();
        return;
      }

      await this.sessionManager.consumeToken(token);

      this.wss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
        this.wss.emit("connection", clientWs, req);
        void this.startRelay(clientWs, session, pathname);
      });
    } catch (err) {
      this.logger.error("Error during WebSocket authentication", {
        component: COMPONENT,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
      socket.destroy();
    }
  }

  private async startRelay(
    clientWs: WebSocket, session: ConsoleSession, pathname: string,
  ): Promise<void> {
    const upstreamUrl = await this.sessionManager.getUpstreamUrl(session.sessionId);
    if (!upstreamUrl) {
      clientWs.close(CLOSE_CODES.UPSTREAM_FAILURE, "No upstream URL configured");
      return;
    }

    const upstream = await this.connectUpstream(clientWs, session, upstreamUrl);
    if (!upstream) return;

    const durationTimer = this.startDurationTimer(clientWs, upstream, session);
    const label = pathname === "/ws/console/vnc" ? "VNC" : "Terminal";

    // Wire message relay based on transport type
    if (pathname === "/ws/console/vnc") {
      this.wireVncRelay(clientWs, upstream);
    } else {
      this.wireTerminalRelay(clientWs, upstream, session);
    }

    // Shared lifecycle handlers
    this.wireLifecycle(clientWs, upstream, session, durationTimer, label);
  }

  /** VNC: bidirectional binary relay, no modification. */
  private wireVncRelay(clientWs: WebSocket, upstream: WebSocket): void {
    upstream.on("message", (data: Buffer) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: true });
      }
    });
    clientWs.on("message", (data: Buffer) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: true });
      }
    });
  }

  /** Terminal: text frames for I/O, binary frames for control messages. */
  private wireTerminalRelay(
    clientWs: WebSocket, upstream: WebSocket, session: ConsoleSession,
  ): void {
    upstream.on("message", (data: Buffer, isBinary: boolean) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        clientWs.send(data, { binary: true });
      } else {
        clientWs.send(data.toString("utf-8"), { binary: false });
      }
    });

    clientWs.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        this.handleTerminalControlMessage(data, upstream, session);
      } else if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data.toString("utf-8"), { binary: false });
      }
    });
  }

  /** Shared close/error lifecycle wiring for both transport types. */
  private wireLifecycle(
    clientWs: WebSocket,
    upstream: WebSocket,
    session: ConsoleSession,
    durationTimer: ReturnType<typeof setTimeout>,
    label: string,
  ): void {
    upstream.on("close", () => {
      clearTimeout(durationTimer);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(CLOSE_CODES.UPSTREAM_FAILURE, "Upstream connection closed");
      }
      void this.sessionManager.terminateSession(session.sessionId, "upstream_closed");
    });

    upstream.on("error", (err: Error) => {
      this.logger.error(`${label} upstream error`, {
        component: COMPONENT,
        metadata: { sessionId: session.sessionId, error: err.message },
      });
    });

    clientWs.on("close", () => {
      clearTimeout(durationTimer);
      this.closeUpstreamGracefully(upstream);
      void this.sessionManager.terminateSession(session.sessionId, "client_disconnected");
    });

    clientWs.on("error", (err: Error) => {
      this.logger.error(`${label} client error`, {
        component: COMPONENT,
        metadata: { sessionId: session.sessionId, error: err.message },
      });
    });
  }

  /**
   * Handle binary control messages on terminal connections.
   * Type 0x01 = resize: next 4 bytes = columns (uint16 BE) + rows (uint16 BE).
   * Unrecognized types or frames shorter than expected → discard.
   */
  private handleTerminalControlMessage(
    data: Buffer, upstream: WebSocket, session: ConsoleSession,
  ): void {
    if (data.length < 1) return;
    const msgType = data[0];

    if (msgType !== CONTROL_MSG.RESIZE) {
      this.logger.debug("Discarding unrecognized control message type", {
        component: COMPONENT, metadata: { sessionId: session.sessionId, msgType },
      });
      return;
    }

    if (data.length < RESIZE_FRAME_LENGTH) {
      this.logger.debug("Discarding truncated resize control message", {
        component: COMPONENT, metadata: { sessionId: session.sessionId, length: data.length },
      });
      return;
    }

    const columns = data.readUInt16BE(1);
    const rows = data.readUInt16BE(3);
    if (columns < 1 || columns > 500 || rows < 1 || rows > 200) {
      this.logger.debug("Discarding resize with invalid dimensions", {
        component: COMPONENT, metadata: { sessionId: session.sessionId, columns, rows },
      });
      return;
    }

    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: true });
    }
  }

  /** Connect upstream with 10s timeout. Returns null on failure. */
  private connectUpstream(
    clientWs: WebSocket, session: ConsoleSession, upstreamUrl: string,
  ): Promise<WebSocket | null> {
    return new Promise((resolve) => {
      const upstream = new WebSocket(upstreamUrl, { rejectUnauthorized: false });

      const timeout = setTimeout(() => {
        upstream.terminate();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(CLOSE_CODES.CONNECTION_TIMEOUT, "Upstream connection timeout");
        }
        void this.sessionManager.terminateSession(session.sessionId, "upstream_timeout");
        resolve(null);
      }, UPSTREAM_CONNECT_TIMEOUT_MS);

      upstream.on("open", () => {
        clearTimeout(timeout);
        this.logger.info("Upstream connection established", {
          component: COMPONENT, metadata: { sessionId: session.sessionId },
        });
        resolve(upstream);
      });

      upstream.on("error", (err: Error) => {
        clearTimeout(timeout);
        this.logger.error("Upstream connection failed", {
          component: COMPONENT, metadata: { sessionId: session.sessionId, error: err.message },
        });
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(CLOSE_CODES.CONNECTION_TIMEOUT, "Upstream connection failed");
        }
        void this.sessionManager.terminateSession(session.sessionId, "upstream_error");
        resolve(null);
      });
    });
  }

  private startDurationTimer(
    clientWs: WebSocket, upstream: WebSocket, session: ConsoleSession,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.logger.info("Session duration limit reached", {
        component: COMPONENT, metadata: { sessionId: session.sessionId },
      });
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(CLOSE_CODES.SESSION_DURATION_EXCEEDED, "Session duration exceeded");
      }
      this.closeUpstreamGracefully(upstream);
      void this.sessionManager.terminateSession(session.sessionId, "max_duration_exceeded");
    }, this.config.console.maxSessionDuration);
  }

  private closeUpstreamGracefully(upstream: WebSocket): void {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close();
      const forceTimer = setTimeout(() => { upstream.terminate(); }, UPSTREAM_CLOSE_TIMEOUT_MS);
      upstream.on("close", () => { clearTimeout(forceTimer); });
    }
  }

  private isOriginAllowed(req: IncomingMessage): boolean {
    const { allowedOrigins } = this.config;
    if (allowedOrigins.length === 0) return true; // Dev mode: no restriction
    const origin = req.headers.origin;
    if (!origin) return false;
    return allowedOrigins.includes(origin);
  }

  private parseRequestUrl(req: IncomingMessage): URL | null {
    try {
      return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    } catch {
      return null;
    }
  }
}
